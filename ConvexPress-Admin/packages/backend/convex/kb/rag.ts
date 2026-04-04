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
 *   - Anthropic: not currently supported for embeddings; falls back to OpenAI
 *     (Anthropic does not offer a public embeddings endpoint as of 2025)
 */

import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";

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
  const apiKey = (settings?.ragApiKey as string) ?? "";
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
 * Anthropic does not offer a public embeddings endpoint (as of 2025), so when
 * the configured provider is "anthropic" we still call the OpenAI API. Callers
 * should note this and ensure an OpenAI key is stored as the ragApiKey when
 * using the Anthropic embedding path.
 */
async function generateEmbedding(
  text: string,
  apiKey: string,
  model: string,
): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
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
    const errorText = await response.text();
    throw new ConvexError({
      code: "EMBEDDING_ERROR",
      message: `OpenAI embeddings API error (${response.status}): ${errorText}`,
    });
  }

  const data = (await response.json()) as {
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
export const ingestArticle = action({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

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
export const searchRag = action({
  args: {
    query: v.string(),
    topK: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required for search" });
    }

    if (!args.query.trim()) {
      return { results: [] };
    }

    const { apiKey, model } = await resolveRagConfig(ctx);
    const topK = args.topK ?? DEFAULT_RAG_TOP_K;

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

      results.push({
        articleId: item.articleId,
        articleSlug: item.articleSlug,
        title: item.metadata.title,
        excerpt: item.metadata.excerpt,
        categorySlug: item.metadata.categorySlug,
        matchedChunk: item.chunkContent,
        score: item.score,
      });

      if (results.length >= topK) break;
    }

    return { results };
  },
});
