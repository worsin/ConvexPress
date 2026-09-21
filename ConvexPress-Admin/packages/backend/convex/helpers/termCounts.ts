import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { RequestReadLedger } from "./requestReadLedger";

type Context = Pick<MutationCtx, "db">;
export type TermCountTask = { termId: Id<"terms">; generation: string; cursor: string | null };
// Each source post may approach Convex's document limit; eight reads leave room
// for relationship/state overhead within the transaction byte budget.
export const TERM_COUNT_PAGE_SIZE = 8;
export function termCountEligible(post: Record<string, unknown> | null): boolean {
  return post?.type === "post" && post.status === "publish";
}
function baseline() {
  return { phase: "pending" as const, revision: 0, generation: "", scanRevision: 0,
    cursor: null, subtotal: 0, lastPostId: null, updatedAt: Date.now() };
}
/** Null delta invalidates an unknown baseline, e.g. imported or replaced assignments. */
export async function adjustTermCount(ctx: Context, termId: Id<"terms">, delta: number | null, ledger?: RequestReadLedger) {
  if (delta === 0) return;
  ledger?.beforeRead();
  const term = await ctx.db.get("terms", termId); ledger?.record(term);
  if (!term) return;
  const state = term.countState ?? baseline();
  const count = term.count + (delta ?? 0);
  const ready = delta !== null && term.countReady === true && state.phase === "ready" && Number.isSafeInteger(count) && count >= 0;
  await ctx.db.patch("terms", termId, {
    ...(ready ? { count } : {}), countReady: ready,
    countState: { ...state, revision: state.revision + 1,
      phase: ready ? "ready" : state.phase === "scanning" ? "scanning" : "pending",
      updatedAt: state.phase === "scanning" ? state.updatedAt : Date.now() },
  });
}
export async function beginTermCountRepair(ctx: Context, termId: Id<"terms">, force = false): Promise<TermCountTask | undefined> {
  const term = await ctx.db.get("terms", termId);
  if (!term) return;
  const state = term.countState ?? baseline();
  if (!force && term.countReady && state.phase === "ready") return;
  if (!force && state.phase === "scanning") return { termId, generation: state.generation, cursor: state.cursor };
  // A fresh token also makes pre-restore continuations inert after a new scan starts.
  const generation = `${Date.now()}:${Math.random()}`;
  await ctx.db.patch("terms", termId, { countReady: false, countState: {
    ...state, phase: "scanning", generation, scanRevision: state.revision,
    cursor: null, subtotal: 0, lastPostId: null, updatedAt: Date.now(),
  } });
  return { termId, generation, cursor: null };
}
/** Sorted post IDs deduplicate legacy relationships even across page boundaries. */
export async function advanceTermCountRepair(ctx: Context, task: TermCountTask): Promise<TermCountTask | undefined> {
  const term = await ctx.db.get("terms", task.termId);
  const state = term?.countState;
  if (!term || !state || state.phase !== "scanning" || state.generation !== task.generation || state.cursor !== task.cursor) return;
  if (state.revision !== state.scanRevision) return beginTermCountRepair(ctx, task.termId, true);
  const page = await ctx.db.query("termRelationships")
    .withIndex("by_term_post", q => q.eq("termId", task.termId))
    .paginate({ cursor: task.cursor, numItems: TERM_COUNT_PAGE_SIZE,
      maximumRowsRead: TERM_COUNT_PAGE_SIZE, maximumBytesRead: 64 * 1024 });
  let subtotal = state.subtotal, lastPostId = state.lastPostId;
  for (const relation of page.page) {
    if (relation.postId !== lastPostId && termCountEligible(await ctx.db.get("posts", relation.postId))) subtotal++;
    lastPostId = relation.postId;
  }
  if (!Number.isSafeInteger(subtotal)) throw new Error("Term count exceeds the supported integer range");
  if (!page.isDone && page.continueCursor === task.cursor) throw new Error("Term count pagination did not advance");
  await ctx.db.patch("terms", task.termId, {
    ...(page.isDone ? { count: subtotal, countReady: true } : {}),
    countState: { ...state, phase: page.isDone ? "ready" : "scanning", subtotal, lastPostId,
      cursor: page.isDone ? null : page.continueCursor, updatedAt: Date.now() },
  });
  if (!page.isDone) return { ...task, cursor: page.continueCursor };
}
