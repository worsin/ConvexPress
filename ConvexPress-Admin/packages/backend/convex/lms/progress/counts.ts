import { ConvexError } from "convex/values";
import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { RequestReadLedger } from "../../helpers/requestReadLedger";
import { readCurriculumCounts } from "../curriculumCounts";
import { completionPercent } from "./summary";

type DbCtx = Pick<MutationCtx, "db">;
type Source = WithoutSystemFields<Doc<"lms_progress">>;
type Pair = { userId: Id<"users">; courseId: Id<"lms_courses">; nodeId: Id<"lms_nodes"> };
const key = (p: Pair) => JSON.stringify([p.userId, p.courseId, p.nodeId]);

async function completedNode(ctx: DbCtx, pair: Pair) {
  const completed = await ctx.db.query("lms_progress")
    .withIndex("by_user_course_node_completed", q => q.eq("userId", pair.userId).eq("courseId", pair.courseId).eq("nodeId", pair.nodeId).eq("completed", true)).first();
  if (!completed) return false;
  const node = await ctx.db.get("lms_nodes", pair.nodeId);
  return node?.kind === "lesson" && node.courseId === pair.courseId;
}

async function prepare(ctx: DbCtx, sources: (Source | null)[]) {
  const pairs = new Map<string, Pair>();
  for (const source of sources) if (source) pairs.set(key(source), source);
  const entries = [];
  for (const pair of pairs.values()) {
    let counter = await ctx.db.query("lms_progress_counts").withIndex("by_user_course", q => q.eq("userId", pair.userId).eq("courseId", pair.courseId)).unique();
    if (!counter) {
      const existing = await ctx.db.query("lms_progress").withIndex("by_user_course", q => q.eq("userId", pair.userId).eq("courseId", pair.courseId)).first();
      const curriculum = await readCurriculumCounts(ctx, pair.courseId);
      const id = await ctx.db.insert("lms_progress_counts", {
        userId: pair.userId, courseId: pair.courseId, completed: 0, sourceRevision: 0,
        curriculumRevision: curriculum.state === "ready" ? curriculum.revision : -1,
        state: !existing && curriculum.state === "ready" ? "ready" : "pending",
      });
      counter = await ctx.db.get("lms_progress_counts", id);
    }
    const untracked = await ctx.db.query("lms_progress")
      .withIndex("by_user_course_count_version", q => q.eq("userId", pair.userId).eq("courseId", pair.courseId).eq("progressCountVersion", undefined)).first();
    if (untracked && counter!.state === "ready")
      await ctx.db.patch("lms_progress_counts", counter!._id, {state: "pending", sourceRevision: counter!.sourceRevision + 1});
    entries.push({ pair, counterId: counter!._id, before: counter!.state === "ready" && !untracked ? await completedNode(ctx, pair) : false });
  }
  return entries;
}

async function finish(ctx: DbCtx, entries: Awaited<ReturnType<typeof prepare>>) {
  // A source can change node within the same course. Apply both deltas against
  // the latest transactional counter, never two patches derived from one snapshot.
  for (const entry of entries) {
    const counter = await ctx.db.get("lms_progress_counts", entry.counterId);
    if (!counter) throw new Error("Missing learner progress counter");
    const curriculum = await readCurriculumCounts(ctx, entry.pair.courseId);
    const ready = counter.state === "ready" && curriculum.state === "ready" && counter.curriculumRevision === curriculum.revision;
    const after = ready ? await completedNode(ctx, entry.pair) : false;
    const completed = counter.completed + Number(after) - Number(entry.before);
    if (ready && (!Number.isSafeInteger(completed) || completed < 0 || completed > curriculum.lessons))
      throw new ConvexError({ code: "LMS_PROGRESS_COUNTS_INVALID", message: "Learner progress requires repair before this change." });
    await ctx.db.patch("lms_progress_counts", counter._id, {
      sourceRevision: counter.sourceRevision + 1,
      ...(ready ? { completed } : { state: "pending" as const }),
    });
  }
}

/** All source writes, including dynamic imports, pass through these transactional
 * helpers. No duplicate scan: exact indexed existence before/after determines one
 * lesson's contribution regardless of the number of legacy duplicates. */
export async function insertCountedProgress(ctx: DbCtx, value: Source) {
  const entries = await prepare(ctx, [value]);
  const id = await ctx.db.insert("lms_progress", { ...value, progressCountVersion: 1 });
  await finish(ctx, entries);
  return id;
}
export async function patchCountedProgress(ctx: DbCtx, id: Id<"lms_progress">, value: Partial<Source>) {
  const previous = await ctx.db.get("lms_progress", id);
  if (!previous) throw new ConvexError({ code: "NOT_FOUND", message: "Progress record not found." });
  const relevant = previous.progressCountVersion !== 1 || ["userId", "courseId", "nodeId", "completed"].some(k => Object.prototype.hasOwnProperty.call(value, k));
  const entries = relevant ? await prepare(ctx, [previous, { ...previous, ...value }]) : [];
  await ctx.db.patch("lms_progress", id, { ...value, progressCountVersion: 1 });
  await finish(ctx, entries);
}
export async function deleteCountedProgress(ctx: DbCtx, id: Id<"lms_progress">) {
  const previous = await ctx.db.get("lms_progress", id);
  if (!previous) return;
  const entries = await prepare(ctx, [previous]);
  await ctx.db.delete("lms_progress", id);
  await finish(ctx, entries);
}

/** Service-only summary. Callers must authorize the learner and course first.
 * Unknown/rebuilding state is explicit and cannot authorize course completion. */
export async function readLearnerCounts(ctx: Pick<QueryCtx, "db">, userId: Id<"users">, courseId: Id<"lms_courses">, ledger?: RequestReadLedger) {
  const curriculum = await readCurriculumCounts(ctx, courseId, ledger);
  if (curriculum.state !== "ready") return { state: "preparing" as const };
  ledger?.beforeRead();
  const pending = await ctx.db.query("lms_progress").withIndex("by_user_course_count_version", q => q.eq("userId", userId).eq("courseId", courseId).eq("progressCountVersion", undefined)).first();
  ledger?.record(pending);
  if (pending) return { state: "preparing" as const };
  ledger?.beforeRead();
  const counter = await ctx.db.query("lms_progress_counts").withIndex("by_user_course", q => q.eq("userId", userId).eq("courseId", courseId)).unique();
  ledger?.record(counter);
  if (!counter || counter.state !== "ready" || counter.curriculumRevision !== curriculum.revision)
    return { state: "preparing" as const };
  return { state: "ready" as const, completed: counter.completed, total: curriculum.lessons, percent: completionPercent(counter.completed, curriculum.lessons) };
}

/** Discover legacy sources without trusting imported markers as a local count.
 * The owner row is queued once; markers only acknowledge discovery, not accuracy. */
export async function discoverProgressCounts(ctx: DbCtx) {
  const rows = await ctx.db.query("lms_progress").withIndex("by_count_version", q => q.eq("progressCountVersion", undefined)).take(11);
  for (const row of rows.slice(0, 10)) {
    const counter = await ctx.db.query("lms_progress_counts").withIndex("by_user_course", q => q.eq("userId", row.userId).eq("courseId", row.courseId)).unique();
    if (counter) await ctx.db.patch("lms_progress_counts", counter._id, {state: "pending", sourceRevision: counter.sourceRevision + 1});
    else await ctx.db.insert("lms_progress_counts", {userId: row.userId, courseId: row.courseId, completed: 0, curriculumRevision: -1, sourceRevision: 1, state: "pending"});
    await ctx.db.patch("lms_progress", row._id, { progressCountVersion: 1 });
  }
  return { processed: Math.min(10, rows.length), done: rows.length <= 10 };
}
