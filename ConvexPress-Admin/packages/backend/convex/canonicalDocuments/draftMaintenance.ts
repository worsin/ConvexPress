import { makeFunctionReference, type RegisteredMutation } from "convex/server";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { deleteWithMediaReferences } from "../media/attachmentGuard";

type CleanupArgs = { postId: Id<"posts"> };
// Name-only scheduler reference avoids a generated API inference cycle. The
// target below is registered exclusively as an internal mutation.
const cleanupRef = makeFunctionReference<"mutation", CleanupArgs, null>("canonicalDocuments/draftMaintenance:cleanup");
/** All permanent post/page deletion paths already call revision cleanup. Keep
 * private drafts and their media edges in that same lifecycle, with bounded
 * follow-up batches for documents edited by many operators. */
export async function removeDraftsForPost(ctx: MutationCtx, postId: Id<"posts">) {
  const page = await ctx.db.query("canonicalDocumentDrafts").withIndex("by_postId_userId", q => q.eq("postId", postId))
    .paginate({ cursor: null, numItems: 32, maximumRowsRead: 32, maximumBytesRead: 2 * 1024 * 1024 });
  for (const row of page.page) await deleteWithMediaReferences<"canonicalDocumentDrafts">(ctx, "canonicalDocumentDrafts", row._id);
  if (!page.isDone) await ctx.scheduler.runAfter(0, cleanupRef, { postId });
}
export const cleanup: RegisteredMutation<"internal", CleanupArgs, Promise<null>> = internalMutation({
  args: { postId: v.id("posts") }, returns: v.null(),
  handler: async (ctx, args) => { await removeDraftsForPost(ctx, args.postId); return null; },
});
