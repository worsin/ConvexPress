/**
 * Knowledge Base System - Visibility Transitions
 *
 * When an article becomes internal, the mutation that changes it also removes
 * every derived public copy outside the article row:
 *   - its RAG chunks (kb_ragChunks), in scheduled batches when there are many;
 *   - its external search (Meilisearch) document, through a durable removal job.
 * Public counts move with applyKbPublicCounts. Convex search and every public
 * listing exclude the article through the visibility index key, and the
 * public gate refuses it everywhere else.
 *
 * Becoming public again only marks the article unsynced, as any content edit
 * does; operators re-sync it to external search and RAG.
 */

import { makeFunctionReference, type RegisteredMutation } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { enqueueVisibilityRemoval } from "./searchJobs";

const RAG_PURGE_BATCH = 100;
const purgeRef = makeFunctionReference<"mutation", { articleId: Id<"kb_articles"> }, null>("kb/visibilityTransitions:purgeRagChunks");

/** Delete one batch of an article's RAG chunks and schedule the rest. */
export async function purgeKbRagChunks(ctx: MutationCtx, articleId: Id<"kb_articles">): Promise<void> {
  const chunks = await ctx.db.query("kb_ragChunks").withIndex("by_article", q => q.eq("articleId", articleId)).take(RAG_PURGE_BATCH + 1);
  for (const chunk of chunks.slice(0, RAG_PURGE_BATCH)) await ctx.db.delete("kb_ragChunks", chunk._id);
  if (chunks.length > RAG_PURGE_BATCH) await ctx.scheduler.runAfter(0, purgeRef, { articleId });
}

export const purgeRagChunks: RegisteredMutation<"internal", { articleId: Id<"kb_articles"> }, null> = internalMutation({
  args: { articleId: v.id("kb_articles") },
  returns: v.null(),
  handler: async (ctx, { articleId }) => {
    await purgeKbRagChunks(ctx, articleId);
    return null;
  },
});

/** Remove every derived public copy of an article that just became internal. */
export async function withdrawInternalKbArticle(
  ctx: MutationCtx, article: Pick<Doc<"kb_articles">, "_id" | "meilisearchSyncedAt">, actor: Doc<"kb_search_jobs">["actor"],
): Promise<void> {
  await purgeKbRagChunks(ctx, article._id);
  await enqueueVisibilityRemoval(ctx, article, actor);
}
