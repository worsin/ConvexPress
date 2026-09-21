import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { deleteTermRelationship } from "../helpers/postDiscovery";
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
  args: {}, returns: v.id("terms"),
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
  returns: v.null(),
  args: {
    termId: v.id("terms"),
  },
  handler: async (ctx, args) => {
    await updateTermCountHelper(ctx, args.termId);
    return null;
  },
});

/**
 * Recalculate published post counts for ALL terms.
 *
 * Used for bulk correction after data migrations, imports, or
 * if count drift is suspected. Iterates all terms and recalculates.
 */
export const recalculateAllCounts = internalMutation({
  args: {}, returns: v.object({ scheduled: v.boolean() }),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("taxonomies/counts:all"), {});
    return { scheduled: true };
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
  returns: v.object({ termsUpdated: v.number() }),
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    // Get all term relationships for this post
    const relationships = await ctx.db
      .query("termRelationships")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(257);

    if (relationships.length > 256) throw new ConvexError("A post supports at most 256 taxonomy assignments.");
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
  args: {}, returns: v.union(v.id("terms"), v.null()),
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
  returns: v.object({ deleted: v.number() }),
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const relationships = await ctx.db
      .query("termRelationships")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(257);

    if (relationships.length > 256) throw new ConvexError("A post supports at most 256 taxonomy assignments.");
    const affectedTermIds: Set<string> = new Set();

    for (const rel of relationships) {
      affectedTermIds.add(rel.termId);
      await deleteTermRelationship(ctx, rel._id);
    }

    // Recalculate counts for affected terms
    for (const termId of affectedTermIds) {
      await updateTermCountHelper(ctx, termId as Id<"terms">);
    }

    return { deleted: relationships.length };
  },
});
