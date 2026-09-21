import { makeFunctionReference, type RegisteredMutation, type RegisteredQuery } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "../_generated/server";
import { currentUserCan, requireCan } from "../helpers/permissions";
import { canonicalJson, sha256Hex } from "../canonicalDocuments/foundation/shared/fingerprints";

const entryValidator = v.object({ categorySlug: v.string(), articleSlug: v.string(), wasPublished: v.boolean() });
type Review = { entries: { categorySlug: string; articleSlug: string; wasPublished: boolean }[]; digest: string; hasMore: boolean; canRelease: boolean };
async function inspect(ctx: QueryCtx, articleId: Id<"kb_articles">) {
  const article = await ctx.db.get("kb_articles", articleId);
  if (!article) throw new ConvexError({ code: "NOT_FOUND", message: "Article not found." });
  const rows = await ctx.db.query("kb_article_category_guards").withIndex("by_article", q => q.eq("articleId", articleId)).take(21);
  const selected = rows.slice(0, 20);
  return { article, selected, hasMore: rows.length > 20, digest: sha256Hex(canonicalJson({ articleId, selected })) };
}
export const review: RegisteredQuery<"public", { articleId: Id<"kb_articles"> }, Review> = query({
  args: { articleId: v.id("kb_articles") },
  returns: v.object({ entries: v.array(entryValidator), digest: v.string(), hasMore: v.boolean(), canRelease: v.boolean() }),
  handler: async (ctx, { articleId }) => {
    const user = await requireCan(ctx, "kb.view");
    const { article, selected, digest, hasMore } = await inspect(ctx, articleId);
    return { entries: selected.map(({ categorySlug, articleSlug, wasPublished }) => ({ categorySlug, articleSlug, wasPublished })), digest, hasMore,
      canRelease: await currentUserCan(ctx, "kb.publish") && await currentUserCan(ctx, article.authorId === user._id ? "kb.editOwn" : "kb.edit") };
  },
});
export const release: RegisteredMutation<"public", { articleId: Id<"kb_articles">; expectedDigest: string; confirm: boolean }, number> = mutation({
  args: { articleId: v.id("kb_articles"), expectedDigest: v.string(), confirm: v.boolean() }, returns: v.number(),
  handler: async (ctx, { articleId, expectedDigest, confirm }) => {
    const user = await requireCan(ctx, "kb.publish");
    const { article, selected, digest } = await inspect(ctx, articleId);
    await requireCan(ctx, article.authorId === user._id ? "kb.editOwn" : "kb.edit");
    if (!confirm || expectedDigest !== digest) throw new ConvexError({ code: "ACCESS_REVIEW_CHANGED", message: "Review the current inherited restrictions before releasing them." });
    for (const row of selected) await ctx.db.delete("kb_article_category_guards", row._id);
    // No content/status mutation: publication and remaining access policies are
    // still authoritative. Repeated reviews can release longer histories safely.
    return selected.length;
  },
});

export const cleanupDeletedArticle: RegisteredMutation<"internal", { articleId: Id<"kb_articles"> }, null> = internalMutation({
  args: { articleId: v.id("kb_articles") }, returns: v.null(),
  handler: async (ctx, { articleId }) => {
    // A restored article must retain its guards. This task is only cleanup for
    // an article whose authorized permanent deletion has already committed.
    if (await ctx.db.get("kb_articles", articleId)) return null;
    const rows = await ctx.db.query("kb_article_category_guards").withIndex("by_article", q => q.eq("articleId", articleId)).take(50);
    for (const row of rows) await ctx.db.delete("kb_article_category_guards", row._id);
    if (rows.length === 50) await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation", { articleId: Id<"kb_articles"> }, null>("kb/categoryAccess:cleanupDeletedArticle"), { articleId });
    return null;
  },
});
