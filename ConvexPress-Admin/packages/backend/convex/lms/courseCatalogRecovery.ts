import type { MutationCtx } from "../_generated/server";
import { patchWithMediaReferences } from "../media/attachmentGuard";

/** Select only unindexed sources. The guarded marker patch rebuilds coordinates
 * and stamps its source atomically; completed batches are not rescanned. */
export async function rebuildCourseCatalog(ctx: Pick<MutationCtx, "db">): Promise<{ processed: number; done: boolean }> {
  const pending = await ctx.db.query("lms_courses").withIndex("by_catalog_index_version", q => q.eq("catalogIndexVersion", undefined)).take(11);
  for (const course of pending.slice(0, 10)) await patchWithMediaReferences(ctx, "lms_courses", course._id, { catalogIndexVersion: 1 });
  return { processed: Math.min(10, pending.length), done: pending.length <= 10 };
}
