/**
 * Search System - Relevance Scoring & Result Merging
 *
 * STATUS: ORPHANED - This utility is currently unused by Convex functions.
 * The equivalent merging logic is implemented inline in `convex/search/queries.ts`.
 * This standalone version provides cleaner typed abstractions (SearchIndexDoc,
 * MergedResult, applyPostQueryFilters) that could be imported if the query
 * code is refactored. The types and functions here match the Convex inline
 * implementation but are more modular.
 *
 * Implements the dual-index merging strategy for search results.
 *
 * Strategy:
 *   1. Execute two parallel Convex search index queries:
 *      - Title search (search_title index)
 *      - Content search (search_all index)
 *   2. Merge results with deduplication
 *   3. Apply position-based relevance scoring as a proxy (Convex doesn't expose raw scores)
 *   4. Title matches get configurable weight multiplier (default 2.0x)
 *   5. Content matches get base weight (default 1.0x)
 *   6. Items in both result sets get additive scores
 *   7. Manual boostScore from searchIndex is applied on top
 *   8. Final sort by composite relevance score (descending)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RelevanceWeights {
  titleWeight: number;
  contentWeight: number;
  excerptWeight: number;
  taxonomyWeight: number;
}

export interface SearchIndexDoc {
  _id: string;
  contentType: string;
  contentId: string;
  title: string;
  content: string;
  excerpt: string;
  authorId: string;
  authorName: string;
  status: string;
  categoryNames?: string[];
  tagNames?: string[];
  url: string;
  boostScore?: number;
  publishedAt?: number;
  mimeType?: string;
  indexedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface MergedResult {
  doc: SearchIndexDoc;
  relevanceScore: number;
}

// ─── Default Weights ────────────────────────────────────────────────────────

export const DEFAULT_WEIGHTS: RelevanceWeights = {
  titleWeight: 2.0,
  contentWeight: 1.0,
  excerptWeight: 1.5,
  taxonomyWeight: 1.2,
};

// ─── Merge Function ─────────────────────────────────────────────────────────

/**
 * Merge title and content search results with weighted relevance scoring.
 *
 * Uses position in the result set as a proxy for relevance (Convex returns
 * search results ordered by relevance but doesn't expose the raw score).
 *
 * Items that appear in both title and content results get additive scores,
 * making them rank higher than items appearing in only one.
 *
 * @param titleResults - Results from the title search index query
 * @param contentResults - Results from the content search index query
 * @param weights - Relevance weight multipliers
 * @param maxFetch - Total items fetched per query (for position normalization)
 * @returns Merged, deduplicated results sorted by relevance (descending)
 */
export function mergeSearchResults(
  titleResults: SearchIndexDoc[],
  contentResults: SearchIndexDoc[],
  weights: RelevanceWeights = DEFAULT_WEIGHTS,
  maxFetch: number = 100,
): MergedResult[] {
  const resultMap = new Map<string, MergedResult>();

  // Title results: higher weight, position-based scoring
  for (let i = 0; i < titleResults.length; i++) {
    const doc = titleResults[i];
    const key = `${doc.contentType}:${doc.contentId}`;
    const positionScore = (maxFetch - i) / maxFetch; // 1.0 for first, ~0 for last
    const titleScore = positionScore * weights.titleWeight;
    const boostScore = doc.boostScore ?? 0;

    resultMap.set(key, {
      doc,
      relevanceScore: titleScore + boostScore,
    });
  }

  // Content results: base weight, additive if already in title results
  for (let i = 0; i < contentResults.length; i++) {
    const doc = contentResults[i];
    const key = `${doc.contentType}:${doc.contentId}`;
    const positionScore = (maxFetch - i) / maxFetch;
    const contentScore = positionScore * weights.contentWeight;
    const boostScore = doc.boostScore ?? 0;

    const existing = resultMap.get(key);
    if (existing) {
      // Additive: item matched both title and content
      existing.relevanceScore += contentScore;
    } else {
      resultMap.set(key, {
        doc,
        relevanceScore: contentScore + boostScore,
      });
    }
  }

  // Convert to array and sort by relevance (descending)
  return Array.from(resultMap.values()).sort(
    (a, b) => b.relevanceScore - a.relevanceScore,
  );
}

/**
 * Apply post-query filters that cannot be handled by Convex search index filterFields.
 *
 * Convex search index filterFields only support `eq` comparisons. Category, tag,
 * author name, and date range filtering must be done in application code.
 *
 * @param results - Merged search results
 * @param filters - Filter criteria
 * @returns Filtered results
 */
export function applyPostQueryFilters(
  results: MergedResult[],
  filters: {
    category?: string;
    tag?: string;
    author?: string;
    dateFrom?: number;
    dateTo?: number;
  },
): MergedResult[] {
  let filtered = results;

  if (filters.category) {
    const categoryLower = filters.category.toLowerCase();
    filtered = filtered.filter((r) =>
      r.doc.categoryNames?.some(
        (c) => c.toLowerCase() === categoryLower,
      ),
    );
  }

  if (filters.tag) {
    const tagLower = filters.tag.toLowerCase();
    filtered = filtered.filter((r) =>
      r.doc.tagNames?.some((t) => t.toLowerCase() === tagLower),
    );
  }

  if (filters.author) {
    const authorLower = filters.author.toLowerCase();
    filtered = filtered.filter(
      (r) => r.doc.authorName.toLowerCase() === authorLower,
    );
  }

  if (filters.dateFrom) {
    const dateFrom = filters.dateFrom;
    filtered = filtered.filter(
      (r) => r.doc.publishedAt != null && r.doc.publishedAt >= dateFrom,
    );
  }

  if (filters.dateTo) {
    const dateTo = filters.dateTo;
    filtered = filtered.filter(
      (r) => r.doc.publishedAt != null && r.doc.publishedAt <= dateTo,
    );
  }

  return filtered;
}
