import type { MutationCtx } from "../_generated/server";
import { patchWithMediaReferences } from "../media/attachmentGuard";

/** Select pending source markers instead of restarting a table scan. Each node
 * is counted and marked in the same transaction, including concurrent edits. */
export async function rebuildCurriculumCounts(ctx: Pick<MutationCtx, "db">): Promise<{ processed: number; done: boolean }> {
  const nodes = await ctx.db.query("lms_nodes").withIndex("by_count_version", q => q.eq("curriculumCountVersion", undefined)).take(11);
  for (const node of nodes.slice(0, 10))
    await patchWithMediaReferences(ctx, "lms_nodes", node._id, { curriculumCountVersion: 1 });
  return { processed: Math.min(10, nodes.length), done: nodes.length <= 10 };
}
