/**
 * Search System - Public Mutations
 *
 * All write operations for the search system:
 *   logSearch       - Log a search query for analytics (client-side call)
 *   logClick        - Log a search result click for analytics
 *   createSynonym   - Create a new synonym group (admin only)
 *   updateSynonym   - Update a synonym group (admin only)
 *   deleteSynonym   - Delete a synonym group (admin only)
 *
 * Authorization:
 *   - logSearch: Public (no auth required) - logs search analytics
 *   - logClick: Public (no auth required) - tracks click-through for analytics
 *   - Synonym CRUD: search.reindex capability (Administrator only)
 *
 * The Search System does not emit events. Analytics are handled via the
 * `searchQueries` table rather than through the Event Dispatcher System.
 */

import { ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { requireCan, getCurrentUser , getUserIdentifier } from "../helpers/permissions";
import {
  logClickArgs,
  logSearchArgs,
  createSynonymArgs,
  updateSynonymArgs,
  deleteSynonymArgs,
  MAX_SYNONYMS_PER_GROUP,
  MAX_SYNONYM_TERM_LENGTH,
} from "./validators";

// ─── logSearch ──────────────────────────────────────────────────────────────

/**
 * Log a search query to analytics.
 *
 * Public mutation - no authentication required (anonymous searches are logged too).
 *
 * This mutation exists because Convex queries are read-only and cannot call
 * mutations internally. The client should call this after receiving search
 * results from `search.query` or `adminSearch` to populate the analytics
 * table (searchQueries). Without calling this, the analytics dashboard,
 * popular suggestions, and zero-result detection will have no data.
 *
 * Returns the searchQueryId which can be used for subsequent click tracking
 * via the `logClick` mutation.
 */
export const logSearch = mutation({
  args: logSearchArgs,
  handler: async (ctx, args) => {
    // Get the current user's identifier if authenticated
    const user = await getCurrentUser(ctx);
    const userId = user ? getUserIdentifier(user) : undefined;

    // #61 FIX: Basic rate limiting -- prevent flooding the analytics table.
    // Check if this exact normalized query was logged in the last 2 seconds.
    // This prevents rapid-fire duplicate logs from the same search.
    const recentDuplicate = await ctx.db
      .query("searchQueries")
      .withIndex("by_query", (q) =>
        q.eq("normalizedQuery", args.normalizedQuery),
      )
      .order("desc")
      .take(1);

    if (
      recentDuplicate.length > 0 &&
      Date.now() - recentDuplicate[0].createdAt < 2000
    ) {
      // Return the existing record ID instead of creating a duplicate
      return recentDuplicate[0]._id;
    }

    const searchQueryId = await ctx.db.insert("searchQueries", {
      query: args.query,
      normalizedQuery: args.normalizedQuery,
      resultCount: args.resultCount,
      userId,
      source: args.source,
      contentTypeFilter: args.contentTypeFilter,
      categoryFilter: args.categoryFilter,
      tagFilter: args.tagFilter,
      createdAt: Date.now(),
    });

    return searchQueryId;
  },
});

// ─── logClick ───────────────────────────────────────────────────────────────

/**
 * Log a search result click for click-through analytics.
 *
 * Public mutation - no authentication required.
 * Appends the clicked result to the `clickedResults` array on the
 * search query record.
 */
export const logClick = mutation({
  args: logClickArgs,
  handler: async (ctx, args) => {
    const queryRecord = await ctx.db.get("searchQueries", args.searchQueryId);
    if (!queryRecord) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Search query record not found",
      });
    }

    // Validate position
    if (args.position < 1) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Position must be >= 1",
      });
    }

    // Append click to clickedResults array
    const existingClicks = queryRecord.clickedResults ?? [];
    const updatedClicks = [
      ...existingClicks,
      {
        contentType: args.contentType,
        contentId: args.contentId,
        position: args.position,
        clickedAt: Date.now(),
      },
    ];

    await ctx.db.patch("searchQueries", args.searchQueryId, {
      clickedResults: updatedClicks,
    });
  },
});

// ─── createSynonym ──────────────────────────────────────────────────────────

/**
 * Create a new synonym group.
 *
 * Requires `search.reindex` capability (Administrator only).
 *
 * Validates:
 *   - Term not empty, max 100 chars
 *   - Synonyms array not empty, max 20 entries
 *   - Each synonym max 100 chars
 *   - No duplicate term (existing group with same term)
 *   - No empty strings in synonyms
 *
 * All terms are normalized to lowercase.
 */
export const createSynonym = mutation({
  args: createSynonymArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "search.reindex");

    // ── Validate term ───────────────────────────────────────────────────
    const term = args.term.trim().toLowerCase();
    if (!term) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Term cannot be empty",
      });
    }
    if (term.length > MAX_SYNONYM_TERM_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Term must be ${MAX_SYNONYM_TERM_LENGTH} characters or fewer`,
      });
    }

    // ── Validate synonyms ───────────────────────────────────────────────
    if (!args.synonyms.length) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "At least one synonym is required",
      });
    }
    if (args.synonyms.length > MAX_SYNONYMS_PER_GROUP) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Maximum ${MAX_SYNONYMS_PER_GROUP} synonyms per group`,
      });
    }

    const normalizedSynonyms: string[] = [];
    const seenSynonyms = new Set<string>();

    for (const syn of args.synonyms) {
      const normalized = syn.trim().toLowerCase();
      if (!normalized) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Synonym entries cannot be empty",
        });
      }
      if (normalized.length > MAX_SYNONYM_TERM_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Each synonym must be ${MAX_SYNONYM_TERM_LENGTH} characters or fewer`,
        });
      }
      if (normalized === term) {
        // Skip if synonym is the same as the primary term
        continue;
      }
      if (seenSynonyms.has(normalized)) {
        // Skip duplicates
        continue;
      }
      seenSynonyms.add(normalized);
      normalizedSynonyms.push(normalized);
    }

    if (!normalizedSynonyms.length) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "At least one unique synonym (different from term) is required",
      });
    }

    // ── Check for duplicate term ────────────────────────────────────────
    const existing = await ctx.db
      .query("searchSynonyms")
      .withIndex("by_term", (q) => q.eq("term", term))
      .collect();

    if (existing.length > 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `A synonym group for "${term}" already exists`,
      });
    }

    // ── Insert ──────────────────────────────────────────────────────────
    const now = Date.now();
    const synonymId = await ctx.db.insert("searchSynonyms", {
      term,
      synonyms: normalizedSynonyms,
      isActive: true,
      createdBy: getUserIdentifier(user),
      createdAt: now,
      updatedAt: now,
    });

    return synonymId;
  },
});

// ─── updateSynonym ──────────────────────────────────────────────────────────

/**
 * Update a synonym group.
 *
 * Requires `search.reindex` capability (Administrator only).
 * Supports partial updates (term, synonyms, isActive).
 */
export const updateSynonym = mutation({
  args: updateSynonymArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "search.reindex");

    const existing = await ctx.db.get("searchSynonyms", args.synonymId);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Synonym group not found",
      });
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    // ── Update term ─────────────────────────────────────────────────────
    if (args.term !== undefined) {
      const term = args.term.trim().toLowerCase();
      if (!term) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Term cannot be empty",
        });
      }
      if (term.length > MAX_SYNONYM_TERM_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Term must be ${MAX_SYNONYM_TERM_LENGTH} characters or fewer`,
        });
      }

      // Check for duplicate (different record with same term)
      if (term !== existing.term) {
        const duplicate = await ctx.db
          .query("searchSynonyms")
          .withIndex("by_term", (q) => q.eq("term", term))
          .collect();

        const isDuplicate = duplicate.some(
          (d) => d._id.toString() !== args.synonymId.toString(),
        );

        if (isDuplicate) {
          throw new ConvexError({
            code: "VALIDATION_ERROR",
            message: `A synonym group for "${term}" already exists`,
          });
        }
      }

      patch.term = term;
    }

    // ── Update synonyms ─────────────────────────────────────────────────
    if (args.synonyms !== undefined) {
      if (!args.synonyms.length) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "At least one synonym is required",
        });
      }
      if (args.synonyms.length > MAX_SYNONYMS_PER_GROUP) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Maximum ${MAX_SYNONYMS_PER_GROUP} synonyms per group`,
        });
      }

      const currentTerm =
        (patch.term as string) ?? existing.term;
      const normalizedSynonyms: string[] = [];
      const seenSynonyms = new Set<string>();

      for (const syn of args.synonyms) {
        const normalized = syn.trim().toLowerCase();
        if (!normalized) continue;
        if (normalized.length > MAX_SYNONYM_TERM_LENGTH) {
          throw new ConvexError({
            code: "VALIDATION_ERROR",
            message: `Each synonym must be ${MAX_SYNONYM_TERM_LENGTH} characters or fewer`,
          });
        }
        if (normalized === currentTerm) continue;
        if (seenSynonyms.has(normalized)) continue;
        seenSynonyms.add(normalized);
        normalizedSynonyms.push(normalized);
      }

      if (!normalizedSynonyms.length) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "At least one unique synonym is required",
        });
      }

      patch.synonyms = normalizedSynonyms;
    }

    // ── Update isActive ─────────────────────────────────────────────────
    if (args.isActive !== undefined) {
      patch.isActive = args.isActive;
    }

    await ctx.db.patch("searchSynonyms", args.synonymId, patch);
  },
});

// ─── deleteSynonym ──────────────────────────────────────────────────────────

/**
 * Delete a synonym group.
 *
 * Requires `search.reindex` capability (Administrator only).
 * Hard delete - permanently removes the synonym group.
 */
export const deleteSynonym = mutation({
  args: deleteSynonymArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "search.reindex");

    const existing = await ctx.db.get("searchSynonyms", args.synonymId);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Synonym group not found",
      });
    }

    await ctx.db.delete("searchSynonyms", args.synonymId);
  },
});
