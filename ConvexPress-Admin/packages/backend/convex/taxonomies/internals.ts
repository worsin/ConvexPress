/**
 * Taxonomy System - Internal Functions
 *
 * Functions that are NOT callable from the client. Used for system-to-system
 * communication, scheduled jobs, and seeding.
 *
 * Internal functions:
 *   - seedDefaultCategory - Create "Uncategorized" if it doesn't exist (idempotent)
 *   - updateTermCount - Recalculate published post count for a term
 *   - recalculateAllCounts - Batch recalculate all term counts
 *   - getDefaultCategoryId - Get the ID of the default category
 */

import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import {
  ensureDefaultCategory,
  updateTermCount as updateTermCountHelper,
} from "../helpers/taxonomy";

// ─── Seed Functions ─────────────────────────────────────────────────────────

/**
 * Seed the default "Uncategorized" category.
 *
 * Idempotent: safe to call multiple times. If the default category
 * already exists, this is a no-op.
 *
 * Should be called during initial deployment or after schema migrations.
 */
export const seedDefaultCategory = internalMutation({
  args: {},
  handler: async (ctx) => {
    const id = await ensureDefaultCategory(ctx);
    return id;
  },
});

// ─── Count Maintenance ──────────────────────────────────────────────────────

/**
 * Recalculate the published post count for a specific term.
 *
 * Called by other systems (e.g., Post System) when a post's status changes.
 * Counts termRelationships where the linked post has status = "publish".
 */
export const updateTermCount = internalMutation({
  args: {
    termId: v.id("terms"),
  },
  handler: async (ctx, args) => {
    await updateTermCountHelper(ctx, args.termId);
  },
});

/**
 * Recalculate published post counts for ALL terms.
 *
 * Used for bulk correction after data migrations, imports, or
 * if count drift is suspected. Iterates all terms and recalculates.
 */
export const recalculateAllCounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allTerms = await ctx.db.query("terms").collect();

    let updated = 0;
    for (const term of allTerms) {
      await updateTermCountHelper(ctx, term._id);
      updated++;
    }

    return { updated };
  },
});

/**
 * Update counts for all terms assigned to a specific post.
 *
 * Called by the Post System when a post's status changes (publish, unpublish,
 * trash, restore, delete). Finds all terms assigned to the post and
 * recalculates each one's count.
 */
export const updateCountsForPost = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    // Get all term relationships for this post
    const relationships = await ctx.db
      .query("termRelationships")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    // Recalculate count for each term
    for (const rel of relationships) {
      await updateTermCountHelper(ctx, rel.termId);
    }

    return { termsUpdated: relationships.length };
  },
});

// ─── Lookup Helpers ─────────────────────────────────────────────────────────

/**
 * Get the ID of the default category.
 *
 * Used by other systems that need the default category ID
 * (e.g., Post System for auto-assigning on new post creation).
 */
export const getDefaultCategoryId = internalQuery({
  args: {},
  handler: async (ctx) => {
    const defaultCategory = await ctx.db
      .query("terms")
      .withIndex("by_isDefault", (q) => q.eq("isDefault", true))
      .first();

    if (defaultCategory && defaultCategory.taxonomy === "category") {
      return defaultCategory._id;
    }

    // Fallback: look up by slug
    const bySlug = await ctx.db
      .query("terms")
      .withIndex("by_slug_taxonomy", (q) =>
        q.eq("slug", "uncategorized").eq("taxonomy", "category"),
      )
      .unique();

    return bySlug?._id ?? null;
  },
});

/**
 * Delete all term relationships for a post.
 *
 * Called by the Post System when a post is permanently deleted.
 * After deleting relationships, recalculates counts for affected terms.
 */
export const deleteRelationshipsForPost = internalMutation({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const relationships = await ctx.db
      .query("termRelationships")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    const affectedTermIds: Set<string> = new Set();

    for (const rel of relationships) {
      affectedTermIds.add(rel.termId);
      await ctx.db.delete("termRelationships", rel._id);
    }

    // Recalculate counts for affected terms
    for (const termId of affectedTermIds) {
      await updateTermCountHelper(ctx, termId as Id<"terms">);
    }

    return { deleted: relationships.length };
  },
});
