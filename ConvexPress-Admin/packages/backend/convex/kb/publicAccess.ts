import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isPluginEnabled } from "../helpers/plugins";
import { CANONICAL_READ_LIMITS, RequestReadLedger, type RequestReadLimits } from "../helpers/requestReadLedger";
import { createMembershipAccessEvaluator } from "../membership/access";
import { isInternalKbArticle } from "./helpers/visibility";

/** Read limits for public endpoints that gate up to 500 articles in one query
 * (one category-guard read per article; route policy is read once). */
export const PUBLIC_KB_LIST_READS: Readonly<RequestReadLimits> = Object.freeze({ ...CANONICAL_READ_LIMITS, queries: 1200, documents: 4096 });

/** Query-local policy and category cache. Never reuse across viewers or writes. */
export function createPublicKbAccess(ctx: QueryCtx, budget = new RequestReadLedger()) {
  const evaluate = createMembershipAccessEvaluator(ctx, budget);
  const categories = new Map<Id<"kb_categories">, Promise<Doc<"kb_categories"> | null>>();
  const retainedGuards = new Map<Id<"kb_articles">, Promise<Doc<"kb_article_category_guards">[]>>();
  let enabled: Promise<boolean> | undefined;
  const allowedRoute = async (path: string) => (await evaluate({ resourceType: "route", resourceIdOrKey: path })).allowed;
  async function category(id: Id<"kb_categories">): Promise<Doc<"kb_categories"> | null> {
    let pending = categories.get(id);
    if (!pending) {
      budget.beforeRead();
      pending = ctx.db.get("kb_categories", id).then(row => budget.record(row));
      categories.set(id, pending);
    }
    return pending;
  }
  async function available() {
    enabled ??= isPluginEnabled(ctx, "knowledgeBase", budget);
    return await enabled && await allowedRoute("/help");
  }
  return {
    available,
    allowedRoute,
    category,
    /** The single public gate for one article. Internal articles never pass,
     * whatever their status, category or membership policy. */
    async article(article: Doc<"kb_articles">) {
      if (isInternalKbArticle(article)) return null;
      if (article.status !== "published" || !await available()) return null;
      let guards = retainedGuards.get(article._id);
      if (!guards) {
        budget.beforeRead();
        guards = ctx.db.query("kb_article_category_guards").withIndex("by_article", q => q.eq("articleId", article._id)).take(65)
          .then(rows => rows.map(row => budget.record(row)));
        retainedGuards.set(article._id, guards);
      }
      const origins = await guards;
      // Keep access fail-closed if an unusually long history exceeds one read's
      // budget. No deletion batch discards older origins to fit this bound.
      if (origins.length > 64) return null;
      for (const origin of origins) {
        const path = `/help/${encodeURIComponent(origin.categorySlug)}`;
        if (!origin.wasPublished || !await allowedRoute(path) || !await allowedRoute(`${path}/${encodeURIComponent(origin.articleSlug)}`)) return null;
      }
      const group = article.categoryId ? await category(article.categoryId) : null;
      // A deleted/unpublished category is not an uncategorized article.
      if (article.categoryId && !group?.isPublished) return null;
      const categoryPath = `/help/${encodeURIComponent(group?.slug ?? "uncategorized")}`;
      const href = `${categoryPath}/${encodeURIComponent(article.slug)}`;
      if (!await allowedRoute(categoryPath) || !await allowedRoute(href)) return null;
      return { category: group, href };
    },
  };
}

/**
 * Public interaction endpoints (comments, feedback, page views, bookmarks,
 * reading progress) accept an article ID. A hidden article (internal,
 * unpublished, in an unpublished category, or restricted by policy) must be
 * indistinguishable from a missing one.
 */
export async function readPublicKbArticle(ctx: QueryCtx, articleId: Id<"kb_articles">): Promise<Doc<"kb_articles"> | null> {
  const article = await ctx.db.get("kb_articles", articleId);
  if (!article || !await createPublicKbAccess(ctx).article(article)) return null;
  return article;
}

export async function requirePublicKbArticle(ctx: QueryCtx, articleId: Id<"kb_articles">): Promise<Doc<"kb_articles">> {
  const article = await readPublicKbArticle(ctx, articleId);
  if (!article) throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
  return article;
}
