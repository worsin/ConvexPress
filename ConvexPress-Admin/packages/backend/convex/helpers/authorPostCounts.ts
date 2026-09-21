import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { RequestReadLedger } from "./requestReadLedger";

type Context = Pick<MutationCtx, "db">;
type Contribution = Record<string, unknown>;
export type AuthorCountUpdate = { authorId: Id<"users">; count: number | undefined; ready: boolean };
export type AuthorCountTask = { authorId: Id<"users">; generation: number; cursor: string | null };
export type AuthorCountResult = { update?: AuthorCountUpdate; next?: AuthorCountTask };

export const AUTHOR_COUNT_PAGE_SIZE = 32;
export const AUTHOR_COUNT_PAGE_BYTES = 1024 * 1024;

function owner(value: Contribution | null): Id<"users"> | null {
  return value?.type === "post" && value.status === "publish" && typeof value.authorId === "string"
    ? value.authorId as Id<"users"> : null;
}

async function stateFor(ctx: Context, authorId: Id<"users">, budget?: RequestReadLedger) {
  budget?.beforeRead();
  const state = await ctx.db.query("authorPostCounts").withIndex("by_author", q => q.eq("authorId", authorId)).unique();
  budget?.record(state);
  return state;
}

function baseline(authorId: Id<"users">, revision = 0) {
  return { authorId, revision, phase: "pending" as const, count: 0, generation: 0,
    scanRevision: revision, cursor: null, subtotal: 0, updatedAt: Date.now() };
}

/** Called only after insertion of a brand-new user: no post can yet reference that ID. */
export async function initializeAuthorPostCount(ctx: Context, authorId: Id<"users">): Promise<AuthorCountUpdate> {
  await ctx.db.insert("authorPostCounts", { ...baseline(authorId), phase: "ready" });
  return { authorId, count: 0, ready: true };
}

export async function removeAuthorPostCount(ctx: Context, authorId: Id<"users">) {
  const state = await stateFor(ctx, authorId);
  if (state) await ctx.db.delete("authorPostCounts", state._id);
}

/** Same-transaction deltas cover every source write, including imports and deletions. */
export async function adjustAuthorPostCounts(
  ctx: Context, previous: Contribution | null, next: Contribution | null, budget?: RequestReadLedger,
): Promise<AuthorCountUpdate[]> {
  const oldAuthor = owner(previous), newAuthor = owner(next);
  if (oldAuthor === newAuthor) return [];
  const changes = new Map<Id<"users">, number>();
  if (oldAuthor) changes.set(oldAuthor, -1);
  if (newAuthor) changes.set(newAuthor, 1);
  const updates: AuthorCountUpdate[] = [];
  for (const [authorId, delta] of changes) {
    budget?.beforeRead();
    const user = await ctx.db.get("users", authorId);
    budget?.record(user);
    if (!user) continue;
    const state = await stateFor(ctx, authorId, budget);
    if (!state) {
      await ctx.db.insert("authorPostCounts", baseline(authorId, 1));
      updates.push({ authorId, count: undefined, ready: false });
      continue;
    }
    const count = state.count + delta;
    const ready = state.phase === "ready" && Number.isSafeInteger(count) && count >= 0;
    await ctx.db.patch("authorPostCounts", state._id, {
      revision: state.revision + 1,
      ...(ready ? { count } : state.phase === "ready" ? { phase: "pending" as const } : {}),
      updatedAt: state.phase === "scanning" ? state.updatedAt : Date.now(),
    });
    updates.push({ authorId, count: ready ? count : undefined, ready });
  }
  return updates;
}

/** Creates a fresh generation; callers schedule the returned bounded page transaction. */
export async function beginAuthorPostCountRepair(ctx: Context, authorId: Id<"users">, force = false): Promise<AuthorCountResult> {
  const user = await ctx.db.get("users", authorId);
  const state = await stateFor(ctx, authorId);
  if (!user) {
    if (state) await ctx.db.delete("authorPostCounts", state._id);
    return {};
  }
  if (state?.phase === "ready" && !force) {
    return { update: { authorId, count: state.count, ready: true } };
  }
  if (state?.phase === "scanning" && !force) {
    return { update: { authorId, count: undefined, ready: false }, next: { authorId, generation: state.generation, cursor: state.cursor } };
  }
  const base = state ?? baseline(authorId);
  const scan = { phase: "scanning" as const, generation: base.generation + 1,
    scanRevision: base.revision, cursor: null, subtotal: 0, updatedAt: Date.now() };
  if (state) await ctx.db.patch("authorPostCounts", state._id, scan);
  else await ctx.db.insert("authorPostCounts", { ...base, ...scan });
  return { update: { authorId, count: undefined, ready: false }, next: { authorId, generation: scan.generation, cursor: null } };
}

/** Duplicate/stale continuations are inert. Source mutations invalidate the whole scan. */
export async function advanceAuthorPostCountRepair(ctx: Context, task: AuthorCountTask): Promise<AuthorCountResult> {
  const state = await stateFor(ctx, task.authorId);
  if (!state || state.phase !== "scanning" || state.generation !== task.generation || state.cursor !== task.cursor) return {};
  const user = await ctx.db.get("users", task.authorId);
  if (!user) { await ctx.db.delete("authorPostCounts", state._id); return {}; }
  if (state.revision !== state.scanRevision) return beginAuthorPostCountRepair(ctx, task.authorId, true);
  const page = await ctx.db.query("posts")
    .withIndex("by_author", q => q.eq("authorId", task.authorId).eq("type", "post").eq("status", "publish"))
    .paginate({ cursor: task.cursor, numItems: AUTHOR_COUNT_PAGE_SIZE,
      maximumRowsRead: AUTHOR_COUNT_PAGE_SIZE, maximumBytesRead: AUTHOR_COUNT_PAGE_BYTES });
  const subtotal = state.subtotal + page.page.length;
  if (!Number.isSafeInteger(subtotal)) throw new Error("Author post count exceeds the supported integer range");
  if (page.isDone) {
    await ctx.db.patch("authorPostCounts", state._id, { phase: "ready", count: subtotal,
      subtotal, cursor: null, updatedAt: Date.now() });
    return { update: { authorId: task.authorId, count: subtotal, ready: true } };
  }
  if (page.continueCursor === task.cursor) throw new Error("Author count pagination did not advance");
  await ctx.db.patch("authorPostCounts", state._id, { subtotal, cursor: page.continueCursor, updatedAt: Date.now() });
  return { next: { ...task, cursor: page.continueCursor } };
}
