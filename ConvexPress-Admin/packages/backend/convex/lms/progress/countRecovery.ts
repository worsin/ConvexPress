import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { readCurriculumCounts } from "../curriculumCounts";
import { discoverProgressCounts } from "./counts";

type DbCtx = Pick<MutationCtx, "db">;

/** Four full lesson source reads fit below the transaction byte ceiling even for
 * maximum-size legacy lesson bodies. Cursors continue across duplicate groups. */
export async function rebuildLearnerCount(ctx: DbCtx, id: Id<"lms_progress_counts">) {
  const row = await ctx.db.get("lms_progress_counts", id);
  if (!row) return { processed: 0, done: true };
  const curriculum = await readCurriculumCounts(ctx, row.courseId);
  if (curriculum.state !== "ready") return { processed: 0, done: false };
  if (row.state === "ready" && row.curriculumRevision === curriculum.revision) return { processed: 0, done: true };
  const restart = row.scanRevision !== row.sourceRevision || row.curriculumRevision !== curriculum.revision;
  const page = await ctx.db.query("lms_progress")
    .withIndex("by_user_course_node_completed", q => q.eq("userId", row.userId).eq("courseId", row.courseId))
    .paginate({ numItems: 4, cursor: restart ? null : row.cursor ?? null });
  let completed = restart ? 0 : row.completed;
  let lastNodeId = restart ? undefined : row.lastNodeId;
  let lastNodeCompleted = restart ? false : row.lastNodeCompleted ?? false;
  for (const source of page.page) {
    if (source.nodeId !== lastNodeId) { lastNodeId = source.nodeId; lastNodeCompleted = false; }
    if (source.completed && !lastNodeCompleted) {
      const node = await ctx.db.get("lms_nodes", source.nodeId);
      if (node?.kind === "lesson" && node.courseId === row.courseId) completed++;
      lastNodeCompleted = true;
    }
  }
  if (completed > curriculum.lessons) throw new Error("Learner completion count exceeds the current curriculum");
  await ctx.db.patch("lms_progress_counts", row._id, {
    completed, curriculumRevision: curriculum.revision, scanRevision: row.sourceRevision,
    cursor: page.isDone ? undefined : page.continueCursor,
    lastNodeId: page.isDone ? undefined : lastNodeId,
    lastNodeCompleted: page.isDone ? undefined : lastNodeCompleted,
    state: page.isDone ? "ready" : "pending",
  });
  return { processed: page.page.length || 1, done: page.isDone };
}

/** Course revisions invalidate all old learner totals at read time immediately.
 * A bounded sweep queues their refresh without a fan-out in the authoring write. */
export async function recoverProgressCounts(ctx: DbCtx) {
  const discovery = await discoverProgressCounts(ctx);
  let processed = discovery.processed;
  const dirty = await ctx.db.query("lms_curriculum_counts").withIndex("by_progress_pending", q => q.eq("progressRefreshPending", true)).take(2);
  for (const course of dirty) {
    const current = await readCurriculumCounts(ctx, course.courseId);
    if (current.state !== "ready") continue;
    const stale = await ctx.db.query("lms_progress_counts").withIndex("by_course_revision", q => q.eq("courseId", course.courseId).lt("curriculumRevision", course.revision)).take(5);
    for (const row of stale) {
      await ctx.db.patch("lms_progress_counts", row._id, { state: "pending", curriculumRevision: course.revision, scanRevision: undefined, cursor: undefined });
      processed++;
    }
    if (!stale.length) { await ctx.db.patch("lms_curriculum_counts", course._id, { progressRefreshPending: false }); processed++; }
  }
  const pending = await ctx.db.query("lms_progress_counts").withIndex("by_state", q => q.eq("state", "pending")).first();
  if (pending) processed += (await rebuildLearnerCount(ctx, pending._id)).processed;
  return { processed, done: discovery.done && !dirty.length && !pending };
}
