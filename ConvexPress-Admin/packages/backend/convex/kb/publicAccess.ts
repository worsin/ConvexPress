import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isPluginEnabled } from "../helpers/plugins";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { createMembershipAccessEvaluator } from "../membership/access";

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
    async article(article: Doc<"kb_articles">) {
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
