"use node";

/**
 * Knowledge Base System - Meilisearch Integration
 *
 * Opt-in external search sync. Only runs when Meilisearch is configured in
 * Settings > KB > Search (meilisearchEnabled = true, meilisearchUrl, meilisearchApiKey).
 *
 *   syncArticle      - Push a published article to the Meilisearch index
 *   removeArticle    - Delete an article document from the Meilisearch index
 *   searchMeilisearch - Proxy a search query to Meilisearch; returns hits with
 *                      article IDs and relevance scores
 *
 * Index name: "kb_articles"
 * Document shape: { id, title, excerpt, contentPlainText, categorySlug, tags, status }
 */

import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve Meilisearch URL and API key from the kb.search settings section.
 * Throws CONFIGURATION_ERROR if Meilisearch is not enabled or misconfigured.
 */
async function resolveMeilisearchConfig(
  ctx: Pick<ActionCtx, "runQuery">,
): Promise<{ url: string; apiKey: string }> {
  const settings = (await ctx.runQuery(
    internal.settings.internals.getInternal,
    { section: "kb.search" },
  )) as Record<string, unknown> | null;

  const enabled = settings?.meilisearchEnabled === true;
  if (!enabled) {
    throw new ConvexError({
      code: "CONFIGURATION_ERROR",
      message:
        "Meilisearch is not enabled. Enable it in Settings > KB > Search.",
    });
  }

  const url = (settings?.meilisearchUrl as string) ?? "";
  const apiKey = (settings?.meilisearchApiKey as string) ?? "";

  if (!url || !apiKey) {
    throw new ConvexError({
      code: "CONFIGURATION_ERROR",
      message:
        "Meilisearch URL and API key are required. Configure them in Settings > KB > Search.",
    });
  }

  return { url, apiKey };
}

/** Build the base Meilisearch index URL (no trailing slash). */
function indexUrl(baseUrl: string, indexName = "kb_articles"): string {
  return `${baseUrl.replace(/\/$/, "")}/indexes/${indexName}`;
}

// ─── syncArticle ─────────────────────────────────────────────────────────────

/**
 * Push an article to the Meilisearch index.
 *
 * Reads the article and its category from Convex, formats the document, and
 * adds/updates it via the Meilisearch documents API.
 *
 * Also marks kb_articles.meilisearchSynced = true and records the sync timestamp.
 *
 * @throws CONFIGURATION_ERROR if Meilisearch is not configured
 * @throws NOT_FOUND if the article does not exist
 */
export const syncArticle = action({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const { url, apiKey } = await resolveMeilisearchConfig(ctx);

    // Load article + category via internal query
    const article = await ctx.runQuery(internal.kb.internals.getArticleForSync, {
      articleId: args.articleId,
    });

    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    // Build the Meilisearch document
    const document = {
      id: article._id,
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt ?? "",
      contentPlainText: article.contentPlainText ?? "",
      categorySlug: article.categorySlug ?? null,
      tags: article.tags ?? [],
      status: article.status,
      publishedAt: article.publishedAt ?? null,
      viewCount: article.viewCount ?? 0,
    };

    // Upsert into Meilisearch
    const response = await fetch(`${indexUrl(url)}/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([document]),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ConvexError({
        code: "SYNC_ERROR",
        message: `Meilisearch sync failed (${response.status}): ${errorText}`,
      });
    }

    // Mark article as synced
    await ctx.runMutation(internal.kb.internals.markMeilisearchSynced, {
      articleId: args.articleId,
    });

    return { success: true, documentId: article._id };
  },
});

// ─── removeArticle ───────────────────────────────────────────────────────────

/**
 * Delete an article document from the Meilisearch index by its Convex ID.
 *
 * Safe to call even if the document does not exist in Meilisearch.
 *
 * @throws CONFIGURATION_ERROR if Meilisearch is not configured
 */
export const removeArticle = action({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const { url, apiKey } = await resolveMeilisearchConfig(ctx);

    const response = await fetch(
      `${indexUrl(url)}/documents/${encodeURIComponent(args.articleId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    // 404 is acceptable — document may not exist in the index
    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new ConvexError({
        code: "SYNC_ERROR",
        message: `Meilisearch remove failed (${response.status}): ${errorText}`,
      });
    }

    return { success: true };
  },
});

// ─── searchMeilisearch ───────────────────────────────────────────────────────

/**
 * Proxy a search query to Meilisearch and return ranked article hits.
 *
 * Returns an array of hits, each containing the article ID and relevance score.
 * The caller is responsible for loading full article data from Convex using
 * the returned IDs.
 *
 * @throws CONFIGURATION_ERROR if Meilisearch is not configured
 */
export const searchMeilisearch = action({
  args: {
    query: v.string(),
    categorySlug: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { url, apiKey } = await resolveMeilisearchConfig(ctx);

    const limit = args.limit ?? 20;

    const searchBody: Record<string, unknown> = {
      q: args.query,
      limit,
      attributesToRetrieve: ["id", "title", "slug", "excerpt", "categorySlug"],
      attributesToHighlight: ["title", "excerpt", "contentPlainText"],
      highlightPreTag: "<mark>",
      highlightPostTag: "</mark>",
      filter: ["status = published"],
    };

    // Optionally filter by category — sanitize to prevent Meilisearch filter injection
    if (args.categorySlug) {
      const safeCategorySlug = args.categorySlug.replace(/[\\"]/g, "");
      (searchBody.filter as string[]).push(`categorySlug = "${safeCategorySlug}"`);
    }

    const response = await fetch(`${indexUrl(url)}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(searchBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ConvexError({
        code: "SEARCH_ERROR",
        message: `Meilisearch search failed (${response.status}): ${errorText}`,
      });
    }

    const data = (await response.json()) as {
      hits: Array<Record<string, unknown>>;
      estimatedTotalHits?: number;
      processingTimeMs?: number;
    };

    const hits = (data.hits ?? []).map((hit, index) => ({
      articleId: hit["id"] as string,
      title: hit["title"] as string,
      slug: hit["slug"] as string,
      excerpt: (hit["excerpt"] as string) ?? "",
      categorySlug: (hit["categorySlug"] as string | null) ?? null,
      // Meilisearch doesn't return a raw score — approximate with rank position
      score: 1 - index / Math.max(data.hits.length, 1),
      formatted: hit["_formatted"] as Record<string, string> | undefined,
    }));

    return {
      hits,
      totalHits: data.estimatedTotalHits ?? hits.length,
      processingTimeMs: data.processingTimeMs ?? 0,
    };
  },
});
