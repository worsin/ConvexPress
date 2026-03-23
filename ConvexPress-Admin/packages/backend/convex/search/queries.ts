/**
 * Search System - Public Queries
 *
 * All read operations for the search system:
 *   search         - Public full-text search across published content (website)
 *   adminSearch    - Admin search across all content (auth required)
 *   suggest        - Autocomplete suggestions (public)
 *   getAnalytics   - Search analytics dashboard data (admin only)
 *   listSynonyms   - List all synonym groups (admin only)
 *
 * Authorization:
 *   - search / suggest: Public (no auth required), only published content
 *   - adminSearch: Auth required, role-based status filtering
 *   - getAnalytics / listSynonyms: search.reindex capability (Administrator)
 *
 * Search Strategy:
 *   The search system uses a dual-index approach: parallel queries on both
 *   the title search index (2x weight) and content search index (1x weight).
 *   Results are merged with deduplication and sorted by composite relevance score.
 */

import { ConvexError } from "convex/values";
import { query } from "../_generated/server";
import {
  getCurrentUser,
  requireCan,
  currentUserCan,
  getCurrentRoleLevel,
, getUserIdentifier } from "../helpers/permissions";
import {
  searchQueryArgs,
  adminSearchQueryArgs,
  suggestArgs,
  analyticsArgs,
  DEFAULT_PER_PAGE,
  MAX_PER_PAGE,
  MIN_QUERY_LENGTH,
  MIN_SUGGEST_LENGTH,
  MAX_SUGGEST_LIMIT,
  DEFAULT_SUGGEST_LIMIT,
  DEFAULT_ANALYTICS_RANGE_MS,
  DEFAULT_ANALYTICS_LIMIT,
  DEFAULT_WEIGHTS,
} from "./validators";
import {
  sanitizeQuery,
  removeStopWords,
  generateHighlightedExcerpt,
  expandWithSynonyms,
} from "./helpers";

// ─── search (Public / Website) ──────────────────────────────────────────────

/**
 * Public full-text search across all published content.
 *
 * This is the website's primary search endpoint. No authentication required.
 * Only searches content with `status = "publish"`.
 *
 * Flow:
 *   1. Sanitize query
 *   2. Remove stop words for normalized query
 *   3. Expand with synonyms
 *   4. Execute dual search (title + content) in parallel
 *   5. Merge with weighted relevance scoring
 *   6. Apply post-query filters (category, tag, author, date range)
 *   7. Sort and paginate
 *   8. Generate highlighted excerpts
 *   9. Return paginated results
 *
 * NOTE ON ANALYTICS LOGGING:
 *   Convex queries are read-only and cannot call mutations. Therefore,
 *   analytics logging (logSearchQuery) cannot be invoked from within this
 *   query handler. Instead, the client should call the public `logSearch`
 *   mutation (in mutations.ts) after receiving search results. This is the
 *   recommended pattern for logging from queries in Convex.
 */
export const search = query({
  args: searchQueryArgs,
  handler: async (ctx, args) => {
    // ── Validate query ──────────────────────────────────────────────────
    const rawQuery = sanitizeQuery(args.q);
    if (rawQuery.length < MIN_QUERY_LENGTH) {
      return {
        results: [],
        query: args.q.trim(),
        total: 0,
        page: 1,
        perPage: args.perPage ?? DEFAULT_PER_PAGE,
        totalPages: 0,
        filters: {},
      };
    }

    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, args.perPage ?? DEFAULT_PER_PAGE));

    // ── Normalize query (remove stop words) ─────────────────────────────
    const normalizedQuery = removeStopWords(rawQuery);

    // ── Expand with synonyms (#54 FIX: use shared helper, no duplication) ──
    const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);
    const expandedTerms = await expandWithSynonyms(ctx, queryTerms);

    // ── Execute dual search ─────────────────────────────────────────────
    // Use the normalized query for search (not expanded - Convex search handles
    // relevance internally; we use expanded terms only for excerpt highlighting)
    const searchQuery = normalizedQuery;

    // Title search (higher weight)
    let titleQuery = ctx.db
      .query("searchIndex")
      .withSearchIndex("search_title", (q) => {
        let sq = q.search("title", searchQuery).eq("status", "publish");
        if (args.contentType) {
          sq = sq.eq("contentType", args.contentType);
        }
        return sq;
      });

    // Content search
    let contentQuery = ctx.db
      .query("searchIndex")
      .withSearchIndex("search_all", (q) => {
        let sq = q.search("content", searchQuery).eq("status", "publish");
        if (args.contentType) {
          sq = sq.eq("contentType", args.contentType);
        }
        return sq;
      });

    // Fetch results (take more than needed for post-query filtering)
    const maxFetch = perPage * 10; // Overfetch for filtering
    const [titleResults, contentResults] = await Promise.all([
      titleQuery.take(maxFetch),
      contentQuery.take(maxFetch),
    ]);

    // ── Merge and deduplicate with relevance scoring ────────────────────
    const resultMap = new Map<
      string,
      {
        doc: (typeof titleResults)[0];
        relevanceScore: number;
      }
    >();

    // Title results get higher weight (position-based scoring)
    for (let i = 0; i < titleResults.length; i++) {
      const doc = titleResults[i];
      const key = `${doc.contentType}:${doc.contentId}`;
      const positionScore = (maxFetch - i) / maxFetch; // Higher position = higher score
      const titleScore = positionScore * DEFAULT_WEIGHTS.titleWeight;
      const boostScore = doc.boostScore ?? 0;
      resultMap.set(key, {
        doc,
        relevanceScore: titleScore + boostScore,
      });
    }

    // Content results get base weight, additive if already in title results
    for (let i = 0; i < contentResults.length; i++) {
      const doc = contentResults[i];
      const key = `${doc.contentType}:${doc.contentId}`;
      const positionScore = (maxFetch - i) / maxFetch;
      const contentScore = positionScore * DEFAULT_WEIGHTS.contentWeight;
      const boostScore = doc.boostScore ?? 0;

      const existing = resultMap.get(key);
      if (existing) {
        existing.relevanceScore += contentScore;
      } else {
        resultMap.set(key, {
          doc,
          relevanceScore: contentScore + boostScore,
        });
      }
    }

    // ── Apply post-query filters ────────────────────────────────────────
    let results = Array.from(resultMap.values());

    if (args.category) {
      const categoryLower = args.category.toLowerCase();
      results = results.filter((r) =>
        r.doc.categoryNames?.some(
          (c) => c.toLowerCase() === categoryLower,
        ),
      );
    }

    if (args.tag) {
      const tagLower = args.tag.toLowerCase();
      results = results.filter((r) =>
        r.doc.tagNames?.some((t) => t.toLowerCase() === tagLower),
      );
    }

    if (args.author) {
      const authorLower = args.author.toLowerCase();
      results = results.filter(
        (r) => r.doc.authorName.toLowerCase() === authorLower,
      );
    }

    if (args.dateFrom) {
      results = results.filter(
        (r) => r.doc.publishedAt && r.doc.publishedAt >= args.dateFrom!,
      );
    }

    if (args.dateTo) {
      results = results.filter(
        (r) => r.doc.publishedAt && r.doc.publishedAt <= args.dateTo!,
      );
    }

    // ── Sort ────────────────────────────────────────────────────────────
    const orderBy = args.orderBy ?? "relevance";
    const orderDir = args.orderDir ?? "desc";

    results.sort((a, b) => {
      let comparison = 0;
      switch (orderBy) {
        case "relevance":
          comparison = a.relevanceScore - b.relevanceScore;
          break;
        case "date":
          comparison = (a.doc.publishedAt ?? 0) - (b.doc.publishedAt ?? 0);
          break;
        case "title":
          comparison = a.doc.title.localeCompare(b.doc.title);
          break;
      }
      return orderDir === "desc" ? -comparison : comparison;
    });

    // ── Paginate ────────────────────────────────────────────────────────
    const total = results.length;
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const paginatedResults = results.slice(offset, offset + perPage);

    // ── Generate highlighted excerpts ───────────────────────────────────
    const allTerms = Array.from(expandedTerms);
    const formattedResults = paginatedResults.map((r) => ({
      contentType: r.doc.contentType,
      contentId: r.doc.contentId,
      title: r.doc.title,
      excerpt: generateHighlightedExcerpt(
        r.doc.excerpt || r.doc.content,
        allTerms,
      ),
      url: r.doc.url,
      authorName: r.doc.authorName,
      publishedAt: r.doc.publishedAt ?? null,
      categoryNames: r.doc.categoryNames,
      tagNames: r.doc.tagNames,
      mimeType: r.doc.mimeType,
    }));

    return {
      results: formattedResults,
      query: args.q.trim(),
      total,
      page,
      perPage,
      totalPages,
      filters: {
        contentType: args.contentType,
        category: args.category,
        tag: args.tag,
        author: args.author,
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
      },
    };
  },
});

// ─── adminSearch (Admin) ────────────────────────────────────────────────────

/**
 * Admin search across all content types and statuses.
 *
 * Requires authentication. Role-based visibility:
 *   - Administrator/Editor: see all content in all statuses
 *   - Author/Contributor: see published content + own drafts/pending
 *   - Subscriber: no access
 *
 * Results include `relevanceScore` for admin debugging/tuning.
 *
 * NOTE ON ANALYTICS LOGGING:
 *   Same constraint as public search -- Convex queries cannot call mutations.
 *   The client should call `logSearch` mutation after receiving results with
 *   source="admin" for analytics tracking.
 */
export const adminSearch = query({
  args: adminSearchQueryArgs,
  handler: async (ctx, args) => {
    // ── Auth check ──────────────────────────────────────────────────────
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const canSearch = await currentUserCan(ctx, "search.query");
    if (!canSearch) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Insufficient permissions for admin search",
      });
    }

    // ── Validate query ──────────────────────────────────────────────────
    const rawQuery = sanitizeQuery(args.q);
    if (rawQuery.length < MIN_QUERY_LENGTH) {
      return {
        results: [],
        query: args.q.trim(),
        total: 0,
        page: 1,
        perPage: args.perPage ?? DEFAULT_PER_PAGE,
        totalPages: 0,
        filters: {},
      };
    }

    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, args.perPage ?? DEFAULT_PER_PAGE));
    const normalizedQuery = removeStopWords(rawQuery);

    // ── Determine role-based visibility ─────────────────────────────────
    const roleLevel = await getCurrentRoleLevel(ctx);
    const canSeeAllStatuses = roleLevel >= 80; // Editor+

    // ── Execute dual search (no status filter for admin) ────────────────
    const maxFetch = perPage * 10;

    // Title search - admin doesn't filter by status in the search index
    let titleQuery = ctx.db
      .query("searchIndex")
      .withSearchIndex("search_title", (q) => {
        let sq = q.search("title", normalizedQuery);
        if (args.contentType) {
          sq = sq.eq("contentType", args.contentType);
        }
        if (args.status) {
          sq = sq.eq("status", args.status);
        }
        return sq;
      });

    // Content search
    let contentQuery = ctx.db
      .query("searchIndex")
      .withSearchIndex("search_all", (q) => {
        let sq = q.search("content", normalizedQuery);
        if (args.contentType) {
          sq = sq.eq("contentType", args.contentType);
        }
        if (args.status) {
          sq = sq.eq("status", args.status);
        }
        if (args.authorId) {
          sq = sq.eq("authorId", args.authorId);
        }
        return sq;
      });

    const [titleResults, contentResults] = await Promise.all([
      titleQuery.take(maxFetch),
      contentQuery.take(maxFetch),
    ]);

    // ── Merge with relevance scoring ────────────────────────────────────
    const resultMap = new Map<
      string,
      { doc: (typeof titleResults)[0]; relevanceScore: number }
    >();

    for (let i = 0; i < titleResults.length; i++) {
      const doc = titleResults[i];
      const key = `${doc.contentType}:${doc.contentId}`;
      const positionScore = (maxFetch - i) / maxFetch;
      const titleScore = positionScore * DEFAULT_WEIGHTS.titleWeight;
      resultMap.set(key, {
        doc,
        relevanceScore: titleScore + (doc.boostScore ?? 0),
      });
    }

    for (let i = 0; i < contentResults.length; i++) {
      const doc = contentResults[i];
      const key = `${doc.contentType}:${doc.contentId}`;
      const positionScore = (maxFetch - i) / maxFetch;
      const contentScore = positionScore * DEFAULT_WEIGHTS.contentWeight;

      const existing = resultMap.get(key);
      if (existing) {
        existing.relevanceScore += contentScore;
      } else {
        resultMap.set(key, {
          doc,
          relevanceScore: contentScore + (doc.boostScore ?? 0),
        });
      }
    }

    // ── Role-based filtering ────────────────────────────────────────────
    let results = Array.from(resultMap.values());

    if (!canSeeAllStatuses) {
      // Authors/Contributors: see published + own non-published
      results = results.filter(
        (r) =>
          r.doc.status === "publish" ||
          r.doc.authorId === getUserIdentifier(user),
      );
    }

    // ── Sort by relevance (admin always sorts by relevance) ─────────────
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // ── Paginate ────────────────────────────────────────────────────────
    const total = results.length;
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const paginatedResults = results.slice(offset, offset + perPage);

    // ── Format results with relevance scores and grouping ───────────────
    const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);
    const formattedResults = paginatedResults.map((r) => ({
      contentType: r.doc.contentType,
      contentId: r.doc.contentId,
      title: r.doc.title,
      excerpt: generateHighlightedExcerpt(
        r.doc.excerpt || r.doc.content,
        queryTerms,
      ),
      url: r.doc.url,
      authorName: r.doc.authorName,
      authorId: r.doc.authorId,
      status: r.doc.status,
      publishedAt: r.doc.publishedAt ?? null,
      categoryNames: r.doc.categoryNames,
      tagNames: r.doc.tagNames,
      mimeType: r.doc.mimeType,
      relevanceScore: Math.round(r.relevanceScore * 1000) / 1000,
    }));

    return {
      results: formattedResults,
      query: args.q.trim(),
      total,
      page,
      perPage,
      totalPages,
      filters: {
        contentType: args.contentType,
        status: args.status,
        authorId: args.authorId,
      },
    };
  },
});

// ─── suggest (Public) ───────────────────────────────────────────────────────

/**
 * Search suggestions / autocomplete.
 *
 * Public query - no auth required. Returns suggestions from two sources:
 *   1. Content titles matching the partial query (published only)
 *   2. Popular recent search queries matching the partial query
 *
 * Requires >= 2 characters after trimming.
 */
export const suggest = query({
  args: suggestArgs,
  handler: async (ctx, args) => {
    const trimmed = args.q.trim().toLowerCase();
    if (trimmed.length < MIN_SUGGEST_LENGTH) {
      return { suggestions: [] };
    }

    const limit = Math.min(
      MAX_SUGGEST_LIMIT,
      Math.max(1, args.limit ?? DEFAULT_SUGGEST_LIMIT),
    );

    // ── Content title suggestions ───────────────────────────────────────
    const titleMatches = await ctx.db
      .query("searchIndex")
      .withSearchIndex("search_title", (q) =>
        q.search("title", trimmed).eq("status", "publish"),
      )
      .take(limit);

    const titleSuggestions = titleMatches.map((doc) => ({
      text: doc.title,
      type: "content" as const,
      contentType: doc.contentType,
    }));

    // ── Popular search query suggestions (#58 FIX: reduced scan) ───────
    // Scan fewer recent queries (200 instead of 500) and only match prefixes.
    // Full substring matching on 500 records is expensive; prefix-only is the
    // common autocomplete pattern and reduces false positives.
    const recentQueries = await ctx.db
      .query("searchQueries")
      .withIndex("by_date")
      .order("desc")
      .take(200);

    // Aggregate by normalizedQuery, filter by prefix match only
    const queryFreq = new Map<string, { count: number; resultCount: number }>();
    for (const sq of recentQueries) {
      if (sq.normalizedQuery.startsWith(trimmed)) {
        const existing = queryFreq.get(sq.normalizedQuery);
        if (existing) {
          existing.count++;
          existing.resultCount = Math.max(existing.resultCount, sq.resultCount);
        } else {
          queryFreq.set(sq.normalizedQuery, {
            count: 1,
            resultCount: sq.resultCount,
          });
        }
      }
    }

    // Sort by frequency and take top results
    const popularSuggestions = Array.from(queryFreq.entries())
      .filter(([, v]) => v.resultCount > 0) // Only suggest queries that had results
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([q, v]) => ({
        text: q,
        type: "popular" as const,
        resultCount: v.resultCount,
      }));

    // ── Merge and deduplicate ───────────────────────────────────────────
    const seen = new Set<string>();
    const merged: Array<{
      text: string;
      type: "content" | "popular";
      contentType?: string;
      resultCount?: number;
    }> = [];

    // Title suggestions first
    for (const s of titleSuggestions) {
      const key = s.text.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(s);
      }
    }

    // Popular queries second
    for (const s of popularSuggestions) {
      const key = s.text.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(s);
      }
    }

    return { suggestions: merged.slice(0, limit) };
  },
});

// ─── getAnalytics (Admin) ───────────────────────────────────────────────────

/**
 * Search analytics dashboard data.
 *
 * Requires `search.reindex` capability (Administrator only).
 *
 * Returns summary stats, top queries, zero-result queries, daily volume,
 * and source breakdown for the specified date range.
 */
export const getAnalytics = query({
  args: analyticsArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "search.reindex");

    const now = Date.now();
    const dateFrom = args.dateFrom ?? now - DEFAULT_ANALYTICS_RANGE_MS;
    const dateTo = args.dateTo ?? now;
    const limit = Math.max(1, args.limit ?? DEFAULT_ANALYTICS_LIMIT);

    // ── Fetch search queries in date range (bounded, not .collect()) ────
    // #24 FIX: Use .take() with a safety cap instead of .collect() which
    // loads every record in the table. We fetch recent records (desc order)
    // and stop once we pass the date range. For sites with high search volume,
    // a pre-aggregation cron job is the proper long-term solution.
    const MAX_ANALYTICS_FETCH = 5000; // Safety cap

    const recentQueries = await ctx.db
      .query("searchQueries")
      .withIndex("by_date")
      .order("desc")
      .take(MAX_ANALYTICS_FETCH);

    // Filter to date range in application code
    const inRange = recentQueries.filter(
      (q) => q.createdAt >= dateFrom && q.createdAt <= dateTo,
    );

    // ── Summary stats ───────────────────────────────────────────────────
    const totalSearches = inRange.length;
    const uniqueQueries = new Set(inRange.map((q) => q.normalizedQuery)).size;
    const totalResults = inRange.reduce((sum, q) => sum + q.resultCount, 0);
    const averageResultCount =
      totalSearches > 0 ? Math.round(totalResults / totalSearches) : 0;

    const zeroResultCount = inRange.filter((q) => q.resultCount === 0).length;
    const zeroResultRate =
      totalSearches > 0
        ? Math.round((zeroResultCount / totalSearches) * 10000) / 100
        : 0;

    const clickedCount = inRange.filter(
      (q) => q.clickedResults && q.clickedResults.length > 0,
    ).length;
    const clickThroughRate =
      totalSearches > 0
        ? Math.round((clickedCount / totalSearches) * 10000) / 100
        : 0;

    // ── Top queries ─────────────────────────────────────────────────────
    const queryMap = new Map<
      string,
      { count: number; totalResults: number; clicked: number }
    >();

    for (const q of inRange) {
      const existing = queryMap.get(q.normalizedQuery);
      if (existing) {
        existing.count++;
        existing.totalResults += q.resultCount;
        if (q.clickedResults && q.clickedResults.length > 0) {
          existing.clicked++;
        }
      } else {
        queryMap.set(q.normalizedQuery, {
          count: 1,
          totalResults: q.resultCount,
          clicked: q.clickedResults && q.clickedResults.length > 0 ? 1 : 0,
        });
      }
    }

    const topQueries = Array.from(queryMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([query, stats]) => ({
        query,
        count: stats.count,
        avgResults: Math.round(stats.totalResults / stats.count),
        clickRate:
          stats.count > 0
            ? Math.round((stats.clicked / stats.count) * 10000) / 100
            : 0,
      }));

    // ── Zero-result queries ─────────────────────────────────────────────
    const zeroMap = new Map<string, number>();
    for (const q of inRange) {
      if (q.resultCount === 0) {
        zeroMap.set(q.normalizedQuery, (zeroMap.get(q.normalizedQuery) ?? 0) + 1);
      }
    }

    const zeroResultQueries = Array.from(zeroMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([query, count]) => ({ query, count }));

    // ── Volume by day ───────────────────────────────────────────────────
    const dayMap = new Map<string, number>();
    for (const q of inRange) {
      const date = new Date(q.createdAt).toISOString().split("T")[0];
      dayMap.set(date, (dayMap.get(date) ?? 0) + 1);
    }

    const volumeByDay = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    // ── Source breakdown ────────────────────────────────────────────────
    const sourceBreakdown = { website: 0, admin: 0, api: 0 };
    for (const q of inRange) {
      sourceBreakdown[q.source]++;
    }

    return {
      summary: {
        totalSearches,
        uniqueQueries,
        averageResultCount,
        clickThroughRate,
        zeroResultRate,
      },
      topQueries,
      zeroResultQueries,
      volumeByDay,
      sourceBreakdown,
    };
  },
});

// ─── listSynonyms (Admin) ───────────────────────────────────────────────────

/**
 * List all synonym groups.
 *
 * Requires `search.reindex` capability (Administrator only).
 * Returns all synonym groups ordered alphabetically by term.
 */
export const listSynonyms = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCan(ctx, "search.reindex");

    const synonyms = await ctx.db.query("searchSynonyms").collect();

    // Sort alphabetically by term
    synonyms.sort((a, b) => a.term.localeCompare(b.term));

    return synonyms;
  },
});
