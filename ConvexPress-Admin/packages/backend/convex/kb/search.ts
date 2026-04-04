/**
 * Knowledge Base System - Search Functions
 *
 * Convex-native full-text search:
 *   search - Search published articles via Convex searchIndex
 *
 * For search analytics logging, use trackSearch in kb/analytics.ts.
 */

import { query } from "../_generated/server";
import { searchArticlesArgs } from "./validators";

// ─── Search ─────────────────────────────────────────────────────────────────

export const search = query({
  args: searchArticlesArgs,
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 100);

    if (!args.query.trim()) return { results: [], total: 0 };

    const results = await ctx.db
      .query("kb_articles")
      .withSearchIndex("search_articles", (q) => {
        let sq = q.search("contentPlainText", args.query);
        sq = sq.eq("status", "published");
        if (args.categoryId) {
          sq = sq.eq("categoryId", args.categoryId);
        }
        return sq;
      })
      .take(limit);

    const enriched = await Promise.all(
      results.map(async (article) => {
        const category = article.categoryId ? await ctx.db.get("kb_categories", article.categoryId) : null;
        return {
          _id: article._id,
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          categoryId: article.categoryId,
          categoryName: category?.name ?? null,
          categorySlug: category?.slug ?? null,
          viewCount: article.viewCount,
          readingTimeMinutes: article.readingTimeMinutes,
          publishedAt: article.publishedAt,
        };
      }),
    );

    return { results: enriched, total: enriched.length };
  },
});

