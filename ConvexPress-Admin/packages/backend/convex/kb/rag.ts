"use node";

/**
 * Knowledge Base System - RAG (Retrieval-Augmented Generation) Integration
 *
 * Opt-in embedding pipeline. Only runs when RAG is configured in
 * Settings > KB > Search (ragEnabled = true, ragProvider, ragApiKey, ragModel).
 *
 *   ingestArticle       - Chunk article content, generate embeddings, store in kb_ragChunks
 *   searchRag           - Embed a query, compute cosine similarity, return top matches
 *
 * NOTE: removeArticleChunks (internalMutation) lives in internals.ts because
 * mutations cannot be defined in "use node" files.
 *
 * Chunking strategy: 1000-character chunks with 200-character overlap.
 * Embedding models:
 *   - OpenAI: "text-embedding-3-small" (default) or configured ragModel
 *   - Other configured providers fail explicitly before any outbound request.
 */

import { action } from "../_generated/server";
import { makeFunctionReference, type RegisteredAction } from "convex/server";
import type { SearchCandidate, ReadableCandidate } from "./searchCandidates";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import { requirePluginEnabled } from "../helpers/plugins";
import { decryptSettingSecret } from "../helpers/settingsSecret";
import { fetchSearchProvider, readSearchProviderJson } from "./searchProviderHttp";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Characters per chunk (not tokens). */
const CHUNK_SIZE = 1000;

/** Overlap in characters between consecutive chunks. */
const CHUNK_OVERLAP = 200;

/** Default OpenAI embedding model. */
const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

/** Number of top RAG results to return. */
const DEFAULT_RAG_TOP_K = 10;

// ─── Cosine Similarity ───────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two embedding vectors.
 * Both vectors must have the same dimensionality.
 *
 * Returns a value in [-1, 1] where 1 = identical direction.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve RAG settings from the kb.search settings section.
 * Throws CONFIGURATION_ERROR if RAG is not enabled or misconfigured.
 */
async function resolveRagConfig(
  ctx: Pick<ActionCtx, "runQuery">,
): Promise<{ provider: "openai" | "anthropic"; apiKey: string; model: string }> {
  const settings = (await ctx.runQuery(
    internal.settings.internals.getInternal,
    { section: "kb.search" },
  )) as Record<string, unknown> | null;

  const enabled = settings?.ragEnabled === true;
  if (!enabled) {
    throw new ConvexError({
      code: "CONFIGURATION_ERROR",
      message: "RAG is not enabled. Enable it in Settings > KB > Search.",
    });
  }

  const provider = ((settings?.ragProvider as string) ?? "openai") as "openai" | "anthropic";
  if (provider !== "openai") throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Choose the supported OpenAI embedding provider. A different provider's key cannot be sent to OpenAI." });
  const apiKey = await decryptSettingSecret(typeof settings?.ragApiKey === "string" ? settings.ragApiKey : "");
  const model =
    (settings?.ragModel as string) ||
    DEFAULT_OPENAI_EMBEDDING_MODEL;

  if (!apiKey) {
    throw new ConvexError({
      code: "CONFIGURATION_ERROR",
      message: "RAG API key is required. Configure it in Settings > KB > Search.",
    });
  }

  return { provider, apiKey, model };
}

/**
 * Split text into overlapping chunks.
 *
 * @param text - The plain text to chunk
 * @param chunkSize - Maximum characters per chunk
 * @param overlap - Characters of overlap between consecutive chunks
 * @returns Array of chunk strings
 */
function chunkText(
  text: string,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
): string[] {
  if (!text.trim()) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end === text.length) break;
    start = end - overlap;
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Generate an embedding vector for a single text string using OpenAI's
 * embeddings API.
 *
 * A key is sent only after the configuration selects the OpenAI provider.
 */
async function generateEmbedding(
  text: string,
  apiKey: string,
  model: string,
): Promise<number[]> {
  const response = await fetchSearchProvider("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model,
    }),
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new ConvexError({
      code: "EMBEDDING_ERROR",
      message: `OpenAI embeddings API error (${response.status}).`,
    });
  }

  const data = (await readSearchProviderJson(response)) as {
    data?: Array<{ embedding: number[] }>;
    error?: { message: string };
  };

  if (data.error) {
    throw new ConvexError({
      code: "EMBEDDING_ERROR",
      message: `OpenAI embeddings error: ${data.error.message}`,
    });
  }

  const embedding = data.data?.[0]?.embedding;
  if (!embedding) {
    throw new ConvexError({
      code: "EMBEDDING_ERROR",
      message: "Empty embedding returned by OpenAI API",
    });
  }

  return embedding;
}

// ─── ingestArticle ───────────────────────────────────────────────────────────

/**
 * Chunk an article's content, generate embeddings via OpenAI, and store the
 * resulting chunks in kb_ragChunks.
 *
 * Existing chunks for this article are removed before the new ones are written
 * (full re-ingestion). Marks the article as ragSynced = true when complete.
 *
 * @throws CONFIGURATION_ERROR if RAG is not configured
 * @throws NOT_FOUND if the article does not exist
 * @throws EMBEDDING_ERROR if the embedding API call fails
 */
export const ingestArticle: RegisteredAction<"public", { articleId: Id<"kb_articles"> }, { success: boolean; chunksCreated: number }> = action({
  args: { articleId: v.id("kb_articles") },
  returns: v.object({ success: v.boolean(), chunksCreated: v.number() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    await ctx.runQuery(makeFunctionReference<"query", Record<string, never>, null>("kb/searchSecurity:authorizeWrite"), {});

    const { apiKey, model } = await resolveRagConfig(ctx);

    // Load article with enriched metadata (category slug, tag slugs)
    const article = await ctx.runQuery(internal.kb.internals.getArticleForSync, {
      articleId: args.articleId,
    });

    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    const plainText = article.contentPlainText ?? "";
    if (!plainText.trim()) {
      // Nothing to embed — mark synced and return
      await ctx.runMutation(internal.kb.internals.markRagSynced, {
        articleId: args.articleId,
      });
      return { success: true, chunksCreated: 0 };
    }

    // Remove existing chunks for this article before reinserting
    // (removeArticleChunks lives in internals.ts because mutations
    //  cannot be defined in "use node" files)
    await ctx.runMutation(internal.kb.internals.removeArticleChunks, {
      articleId: args.articleId,
    });

    const chunks = chunkText(plainText);
    const now = Date.now();
    let chunksCreated = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await generateEmbedding(chunk, apiKey, model);

      await ctx.runMutation(internal.kb.internals.insertRagChunk, {
        articleId: args.articleId,
        articleSlug: article.slug,
        content: chunk,
        chunkIndex: i,
        embedding,
        metadata: {
          title: article.title,
          categorySlug: article.categorySlug ?? undefined,
          excerpt: article.excerpt ?? undefined,
        },
        now,
      });

      chunksCreated++;
    }

    // Mark article as RAG-synced
    await ctx.runMutation(internal.kb.internals.markRagSynced, {
      articleId: args.articleId,
    });

    return { success: true, chunksCreated };
  },
});

// ─── searchRag ───────────────────────────────────────────────────────────────

/**
 * Embed a search query and rank all stored RAG chunks by cosine similarity.
 *
 * Returns the top-K unique articles ordered by their best matching chunk score.
 * The caller is responsible for loading full article data from Convex using
 * the returned article IDs.
 *
 * @throws CONFIGURATION_ERROR if RAG is not configured
 * @throws EMBEDDING_ERROR if the embedding API call fails
 */
type RagSearchHit = { articleId: string; articleSlug: string; title: string; excerpt?: string; categorySlug?: string; matchedChunk: string; score: number };
export const searchRag: RegisteredAction<"public", { query: string; topK?: number }, { results: RagSearchHit[] }> = action({
  args: {
    query: v.string(),
    topK: v.optional(v.number()),
  },
  returns: v.object({ results: v.array(v.object({ articleId: v.string(), articleSlug: v.string(), title: v.string(), excerpt: v.optional(v.string()), categorySlug: v.optional(v.string()), matchedChunk: v.string(), score: v.number() })) }),
  handler: async (ctx, args) => {
    const topK = args.topK ?? DEFAULT_RAG_TOP_K;
    if (!Number.isInteger(topK) || topK < 1 || topK > 50 || args.query.length > 500) throw new ConvexError({ code: "INVALID_SEARCH", message: "Search requires a query up to 500 characters and a result limit from 1 to 50." });
    await requirePluginEnabled(ctx, "knowledgeBase");
    const allowed = await ctx.runQuery(makeFunctionReference<"query", { requiresIdentity: boolean }, boolean>("kb/searchSecurity:authorizeSearch"), { requiresIdentity: true });
    if (!allowed) return { results: [] };

    if (!args.query.trim()) {
      return { results: [] };
    }

    const { apiKey, model } = await resolveRagConfig(ctx);


    // Embed the query
    const queryEmbedding = await generateEmbedding(args.query.trim(), apiKey, model);

    // Load all stored chunks -- cast once at the call site since runQuery
    // inside actions returns a loosely typed result.
    type RagChunk = {
      articleId: string;
      articleSlug: string;
      content: string;
      chunkIndex: number;
      embedding: number[];
      metadata: { title: string; categorySlug?: string; excerpt?: string };
    };
    const allChunks = (await ctx.runQuery(
      internal.kb.internals.getAllRagChunks,
      {},
    )) as RagChunk[];

    if (!allChunks.length) {
      return { results: [] };
    }

    // Score each chunk against the query embedding
    type ScoredChunk = {
      articleId: string;
      articleSlug: string;
      chunkContent: string;
      chunkIndex: number;
      metadata: { title: string; categorySlug?: string; excerpt?: string };
      score: number;
    };

    const scored: ScoredChunk[] = allChunks.map((chunk) => ({
      articleId: chunk.articleId,
      articleSlug: chunk.articleSlug,
      chunkContent: chunk.content,
      chunkIndex: chunk.chunkIndex,
      metadata: chunk.metadata,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    // Sort by descending score
    scored.sort((a, b) => b.score - a.score);

    const candidateIds = new Set<string>();
    const candidates: SearchCandidate[] = [];
    for (const item of scored) {
      if (candidateIds.has(item.articleId)) continue;
      candidateIds.add(item.articleId); candidates.push({ id: item.articleId, chunk: item.chunkContent });
      if (candidates.length === 50) break;
    }
    const readable: ReadableCandidate[] = await ctx.runQuery(makeFunctionReference<"query", { candidates: SearchCandidate[] }, ReadableCandidate[]>("kb/searchCandidates:readable"), { candidates });
    const byId = new Map(readable.map(article => [article.articleId, article]));

    // Deduplicate to one result per article (best-scoring chunk wins)
    const seen = new Set<string>();
    const results: Array<{
      articleId: string;
      articleSlug: string;
      title: string;
      excerpt?: string;
      categorySlug?: string;
      matchedChunk: string;
      score: number;
    }> = [];

    for (const item of scored) {
      if (seen.has(item.articleId)) continue;
      seen.add(item.articleId);
      const current = byId.get(item.articleId);
      if (!current || current.matchedChunk !== item.chunkContent) continue;

      results.push({
        articleId: item.articleId,
        articleSlug: current.slug,
        title: current.title,
        excerpt: current.excerpt,
        categorySlug: current.categorySlug,
        matchedChunk: current.matchedChunk,
        score: item.score,
      });

      if (results.length >= topK) break;
    }

    return { results };
  },
});
