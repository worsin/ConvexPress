/**
 * Search System - Shared Argument Validators
 *
 * Reusable Convex argument validators for search mutations and queries.
 * Centralizes validation logic so mutations and queries stay clean.
 *
 * Convention: each exported object is an args shape (Record<string, Validator>)
 * ready to spread into a Convex function's `args` field.
 */

import { v } from "convex/values";
import {
  searchableContentTypeValidator,
  searchSourceValidator,
} from "../schema/search";

// ─── Re-exports for convenience ──────────────────────────────────────────────

export { searchableContentTypeValidator, searchSourceValidator };

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum search query length in characters. */
export const MAX_QUERY_LENGTH = 500;

/** Minimum search query length in characters. */
export const MIN_QUERY_LENGTH = 1;

/** Minimum characters for suggestion autocomplete. */
export const MIN_SUGGEST_LENGTH = 2;

/** Default results per page for search. */
export const DEFAULT_PER_PAGE = 10;

/** Maximum results per page for search. */
export const MAX_PER_PAGE = 100;

/** Default number of suggestions returned. */
export const DEFAULT_SUGGEST_LIMIT = 5;

/** Maximum number of suggestions returned. */
export const MAX_SUGGEST_LIMIT = 10;

/** Maximum synonym terms per group. */
export const MAX_SYNONYMS_PER_GROUP = 20;

/** Maximum synonym term length. */
export const MAX_SYNONYM_TERM_LENGTH = 100;

/** Maximum content length stored in search index. */
export const MAX_INDEXED_CONTENT_LENGTH = 100000;

/** Excerpt length for highlighted results. */
export const DEFAULT_EXCERPT_LENGTH = 200;

/** Maximum title length stored in search index. */
export const MAX_INDEXED_TITLE_LENGTH = 500;

/** Default analytics date range (30 days in ms). */
export const DEFAULT_ANALYTICS_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Default analytics top queries limit. */
export const DEFAULT_ANALYTICS_LIMIT = 50;

/** Batch size for full reindex operations. */
export const REINDEX_BATCH_SIZE = 100;

// ─── Default Stop Words ─────────────────────────────────────────────────────

/**
 * Default English stop words. These are common words stripped from search
 * queries before indexing/searching. Configurable via Settings System.
 */
export const DEFAULT_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "if",
  "in",
  "into",
  "is",
  "it",
  "no",
  "not",
  "of",
  "on",
  "or",
  "such",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "was",
  "will",
  "with",
]);

// ─── Default Search Relevance Weights ───────────────────────────────────────

export const DEFAULT_WEIGHTS = {
  titleWeight: 2.0,
  contentWeight: 1.0,
  excerptWeight: 1.5,
  taxonomyWeight: 1.2,
} as const;

// ─── Sort Validators ────────────────────────────────────────────────────────

export const searchOrderByValidator = v.union(
  v.literal("relevance"),
  v.literal("date"),
  v.literal("title"),
);

export const searchOrderDirValidator = v.union(
  v.literal("asc"),
  v.literal("desc"),
);

// ─── Query Args ─────────────────────────────────────────────────────────────

/**
 * Arguments for public website search (search.query).
 */
export const searchQueryArgs = {
  q: v.string(),
  contentType: v.optional(searchableContentTypeValidator),
  category: v.optional(v.string()),
  tag: v.optional(v.string()),
  author: v.optional(v.string()),
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
  orderBy: v.optional(searchOrderByValidator),
  orderDir: v.optional(searchOrderDirValidator),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
};

/**
 * Arguments for admin search (search.adminQuery).
 */
export const adminSearchQueryArgs = {
  q: v.string(),
  contentType: v.optional(searchableContentTypeValidator),
  status: v.optional(v.string()),
  authorId: v.optional(v.string()),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
};

/**
 * Arguments for search suggestions / autocomplete.
 */
export const suggestArgs = {
  q: v.string(),
  limit: v.optional(v.number()),
};

/**
 * Arguments for search analytics.
 */
export const analyticsArgs = {
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
  limit: v.optional(v.number()),
};

// ─── Mutation Args ──────────────────────────────────────────────────────────

/**
 * Arguments for logging a search result click.
 */
export const logClickArgs = {
  searchQueryId: v.id("searchQueries"),
  contentType: searchableContentTypeValidator,
  contentId: v.string(),
  position: v.number(),
};

/**
 * Arguments for creating a synonym group.
 */
export const createSynonymArgs = {
  term: v.string(),
  synonyms: v.array(v.string()),
};

/**
 * Arguments for updating a synonym group.
 */
export const updateSynonymArgs = {
  synonymId: v.id("searchSynonyms"),
  term: v.optional(v.string()),
  synonyms: v.optional(v.array(v.string())),
  isActive: v.optional(v.boolean()),
};

/**
 * Arguments for deleting a synonym group.
 */
export const deleteSynonymArgs = {
  synonymId: v.id("searchSynonyms"),
};

// ─── Internal / Reindex Args ────────────────────────────────────────────────

/**
 * Arguments for reindex operations (both full and incremental).
 */
export const reindexArgs = {
  contentType: v.optional(searchableContentTypeValidator),
  contentId: v.optional(v.string()),
  force: v.optional(v.boolean()),
};

/**
 * Arguments for the internal content changed handler.
 */
export const onContentChangedArgs = {
  contentType: searchableContentTypeValidator,
  contentId: v.string(),
  action: v.union(v.literal("upsert"), v.literal("delete")),
};

/**
 * Arguments for the public logSearch mutation (client-side analytics logging).
 *
 * Since Convex queries are read-only and cannot call mutations, the client
 * must call this public mutation after receiving search results to log analytics.
 */
export const logSearchArgs = {
  query: v.string(),
  normalizedQuery: v.string(),
  resultCount: v.number(),
  source: searchSourceValidator,
  contentTypeFilter: v.optional(searchableContentTypeValidator),
  categoryFilter: v.optional(v.string()),
  tagFilter: v.optional(v.string()),
};

/**
 * Arguments for logging a search query (internal, async).
 */
export const logSearchQueryArgs = {
  query: v.string(),
  normalizedQuery: v.string(),
  resultCount: v.number(),
  userId: v.optional(v.string()),
  source: searchSourceValidator,
  contentTypeFilter: v.optional(searchableContentTypeValidator),
  categoryFilter: v.optional(v.string()),
  tagFilter: v.optional(v.string()),
};
