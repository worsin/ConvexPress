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
 * Index name: derived from the registered site, environment and runtime backend.
 * Document shape: { id, title, excerpt, contentPlainText, categorySlug, tags, status }
 */

import { makeFunctionReference, type RegisteredAction } from "convex/server";
import type { SearchCandidate, ReadableCandidate } from "./searchCandidates";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import { requirePluginEnabled } from "../helpers/plugins";
import { decryptSettingSecret } from "../helpers/settingsSecret";
import { meilisearchConfigFingerprint } from "./searchDocument";
import { searchJobStatusValidator, type SearchJobStatus } from "./searchJobs";
import { fetchSearchProvider, readSearchProviderJson } from "./searchProviderHttp";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve Meilisearch URL and API key from the kb.search settings section.
 * Throws CONFIGURATION_ERROR if Meilisearch is not enabled or misconfigured.
 */
async function resolveMeilisearchConfig(
  ctx: Pick<ActionCtx, "runQuery">,
): Promise<{ url: string; apiKey: string; indexName: string; configFingerprint: string }> {
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
  const apiKey = await decryptSettingSecret(typeof settings?.meilisearchApiKey === "string" ? settings.meilisearchApiKey : "");

  if (!url || !apiKey) {
    throw new ConvexError({
      code: "CONFIGURATION_ERROR",
      message:
        "Meilisearch URL and API key are required. Configure them in Settings > KB > Search.",
    });
  }

  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Meilisearch requires a valid HTTP or HTTPS URL." }); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Meilisearch URL cannot contain credentials, a query, or a fragment." });
  const indexName = await ctx.runQuery(makeFunctionReference<"query", Record<string, never>, string>("kb/searchSecurity:meilisearchIndex"), {});
  return { url: parsed.toString(), apiKey, indexName, configFingerprint: meilisearchConfigFingerprint(settings) };
}

/** Build the base Meilisearch index URL (no trailing slash). */
function indexUrl(baseUrl: string, indexName: string): string {
  return `${baseUrl.replace(/\/$/, "")}/indexes/${indexName}`;
}

/** Durable jobs replace synchronous provider writes. Callers observe searchJobs.status
 * and can resume a paused job without submitting a second external operation. */
export const syncArticle: RegisteredAction<"public", { articleId: Id<"kb_articles"> }, SearchJobStatus> = action({
  args: { articleId: v.id("kb_articles") }, returns: searchJobStatusValidator,
  handler: async (ctx, args) => ctx.runMutation(makeFunctionReference<"mutation", { articleId: Id<"kb_articles">; operation: "sync" | "remove" }, SearchJobStatus>("kb/searchJobs:begin"), { ...args, operation: "sync" }),
});
export const removeArticle: RegisteredAction<"public", { articleId: Id<"kb_articles"> }, SearchJobStatus> = action({
  args: { articleId: v.id("kb_articles") }, returns: searchJobStatusValidator,
  handler: async (ctx, args) => ctx.runMutation(makeFunctionReference<"mutation", { articleId: Id<"kb_articles">; operation: "sync" | "remove" }, SearchJobStatus>("kb/searchJobs:begin"), { ...args, operation: "remove" }),
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
type MeiliHit = { articleId: string; title: string; slug: string; excerpt: string; categorySlug: string; score: number };
export const searchMeilisearch: RegisteredAction<"public", { query: string; categorySlug?: string; limit?: number }, { hits: MeiliHit[]; totalHits: number; processingTimeMs: number }> = action({
  args: {
    query: v.string(),
    categorySlug: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({ hits: v.array(v.object({ articleId: v.string(), title: v.string(), slug: v.string(), excerpt: v.string(), categorySlug: v.string(), score: v.number() })), totalHits: v.number(), processingTimeMs: v.number() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const limit = args.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || args.query.length > 500) throw new ConvexError({ code: "INVALID_SEARCH", message: "Search requires a query up to 500 characters and a limit from 1 to 50." });

    if (args.categorySlug !== undefined && args.categorySlug.length > 256) throw new ConvexError({ code: "INVALID_SEARCH", message: "Category filter is too long." });
    const allowed = await ctx.runQuery(makeFunctionReference<"query", { requiresIdentity: boolean }, boolean>("kb/searchSecurity:authorizeSearch"), { requiresIdentity: false });
    if (!allowed) return { hits: [], totalHits: 0, processingTimeMs: 0 };
    const { url, apiKey, indexName } = await resolveMeilisearchConfig(ctx);

    const searchBody: Record<string, unknown> = {
      q: args.query,
      limit,
      attributesToRetrieve: ["id"],
      filter: ["status = published"],
    };

    // Optionally filter by category — sanitize to prevent Meilisearch filter injection
    if (args.categorySlug) {
      (searchBody.filter as string[]).push(`categorySlug = ${JSON.stringify(args.categorySlug)}`);
    }

    const response = await fetchSearchProvider(`${indexUrl(url, indexName)}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(searchBody),
    });

    if (!response.ok) {
      await response.body?.cancel();
      throw new ConvexError({
        code: "SEARCH_ERROR",
        message: `Meilisearch search failed (${response.status}).`,
      });
    }

    const raw = await readSearchProviderJson(response);
    if (!raw || typeof raw !== "object" || !("hits" in raw) || !Array.isArray(raw.hits)) throw new ConvexError({ code: "INVALID_SEARCH_PROVIDER_RESPONSE", message: "The search provider returned invalid results." });
    const hitsRaw: unknown[] = raw.hits.slice(0, limit);
    if (hitsRaw.some(hit => !hit || typeof hit !== "object" || !("id" in hit) || typeof hit.id !== "string" || hit.id.length > 100)) throw new ConvexError({ code: "INVALID_SEARCH_PROVIDER_RESPONSE", message: "The search provider returned invalid article identifiers." });
    const data = { hits: hitsRaw as { id: string }[], processingTimeMs: "processingTimeMs" in raw ? raw.processingTimeMs : 0 };
    if (typeof data.processingTimeMs !== "number" || !Number.isFinite(data.processingTimeMs) || data.processingTimeMs < 0) throw new ConvexError({ code: "INVALID_SEARCH_PROVIDER_RESPONSE", message: "The search provider returned invalid timing information." });

    const candidates: SearchCandidate[] = [...new Set(data.hits.map(hit => hit.id))].map(id => ({ id }));
    const readable: ReadableCandidate[] = await ctx.runQuery(makeFunctionReference<"query", { candidates: SearchCandidate[] }, ReadableCandidate[]>("kb/searchCandidates:readable"), { candidates });
    const byId = new Map(readable.map(article => [article.articleId, article]));
    const hits = candidates.flatMap((candidate, index) => {
      const article = byId.get(candidate.id);
      if (!article || args.categorySlug && article.categorySlug !== args.categorySlug) return [];
      return [{ articleId: article.articleId, title: article.title, slug: article.slug, excerpt: article.excerpt, categorySlug: article.categorySlug, score: 1 - index / Math.max(candidates.length, 1) }];
    });

    return {
      hits,
      totalHits: hits.length,
      processingTimeMs: data.processingTimeMs ?? 0,
    };
  },
});
