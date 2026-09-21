import type { RegisteredQuery } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { createPublicKbAccess } from "./publicAccess";

export type SearchCandidate = { id: string; chunk?: string };
export type ReadableCandidate = { articleId: string; slug: string; title: string; excerpt: string; categorySlug: string; matchedChunk?: string };
/** External search indexes select candidates, never determine visibility or the
 * public metadata. Evaluate current site data and the caller's current access. */
export const readable: RegisteredQuery<"internal", { candidates: SearchCandidate[] }, ReadableCandidate[]> = internalQuery({
  args: { candidates: v.array(v.object({ id: v.string(), chunk: v.optional(v.string()) })) },
  returns: v.array(v.object({ articleId: v.string(), slug: v.string(), title: v.string(), excerpt: v.string(), categorySlug: v.string(), matchedChunk: v.optional(v.string()) })),
  handler: async (ctx, { candidates }) => {
    if (candidates.length > 50 || candidates.some(candidate => candidate.id.length > 100 || (candidate.chunk?.length ?? 0) > 4096)) throw new ConvexError({ code: "INVALID_SEARCH", message: "Search candidates exceed the safe limit." });
    const budget = new RequestReadLedger(), access = createPublicKbAccess(ctx, budget), results: ReadableCandidate[] = [];
    if (!await access.available() || !await access.allowedRoute("/help/search")) return results;
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (seen.has(candidate.id)) continue; seen.add(candidate.id);
      const id = ctx.db.normalizeId("kb_articles", candidate.id); if (!id) continue;
      budget.beforeRead(); const article = budget.record(await ctx.db.get("kb_articles", id)); if (!article) continue;
      const visible = await access.article(article); if (!visible) continue;
      // Old embeddings can retain content removed from an otherwise public
      // article. Only return a chunk still present in its current plain text.
      if (candidate.chunk !== undefined && (!candidate.chunk || !article.contentPlainText.includes(candidate.chunk))) continue;
      results.push({ articleId: id, slug: article.slug, title: article.title, excerpt: article.excerpt, categorySlug: visible.category?.slug ?? "uncategorized", ...(candidate.chunk === undefined ? {} : { matchedChunk: candidate.chunk }) });
    }
    return results;
  },
});
