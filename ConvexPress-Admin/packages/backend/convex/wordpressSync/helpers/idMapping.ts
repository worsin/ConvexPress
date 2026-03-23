/**
 * WordPress ID Mapping Helpers
 *
 * Internal functions for managing the mapping between WordPress IDs
 * and SmithHarper Convex IDs during import.
 *
 * These are used by the import phases to:
 *   - Check if an object has already been imported (deduplication)
 *   - Resolve WordPress IDs to Convex IDs for relationship linking
 *   - Create new mappings after successful imports
 */

import { internalMutation, internalQuery } from "../../_generated/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";

// ─── Object Type Validator ─────────────────────────────────────────────────

const objectTypeValidator = v.union(
  v.literal("user"),
  v.literal("post"),
  v.literal("page"),
  v.literal("category"),
  v.literal("tag"),
  v.literal("media"),
  v.literal("comment"),
  v.literal("menu"),
  v.literal("menuItem")
);

export type WPObjectType =
  | "user"
  | "post"
  | "page"
  | "category"
  | "tag"
  | "media"
  | "comment"
  | "menu"
  | "menuItem";

// ─── Query Functions ───────────────────────────────────────────────────────

/**
 * Get a Convex ID from a WordPress ID.
 * Returns null if no mapping exists.
 */
export const getByWpId = internalQuery({
  args: {
    siteId: v.id("wordpressSites"),
    objectType: objectTypeValidator,
    wpId: v.number(),
  },
  handler: async (ctx, { siteId, objectType, wpId }) => {
    const mapping = await ctx.db
      .query("wpIdMappings")
      .withIndex("by_wp_id", (q) =>
        q.eq("siteId", siteId).eq("objectType", objectType).eq("wpId", wpId)
      )
      .first();

    return mapping?.convexId ?? null;
  },
});

/**
 * Get a WordPress ID from a Convex ID.
 * Returns null if no mapping exists.
 */
export const getByConvexId = internalQuery({
  args: {
    siteId: v.id("wordpressSites"),
    objectType: objectTypeValidator,
    convexId: v.string(),
  },
  handler: async (ctx, { siteId, objectType, convexId }) => {
    const mapping = await ctx.db
      .query("wpIdMappings")
      .withIndex("by_convex_id", (q) =>
        q.eq("siteId", siteId).eq("objectType", objectType).eq("convexId", convexId)
      )
      .first();

    return mapping?.wpId ?? null;
  },
});

/**
 * Get multiple Convex IDs from WordPress IDs in a single query.
 * Returns a map of wpId -> convexId.
 */
export const getBatchByWpIds = internalQuery({
  args: {
    siteId: v.id("wordpressSites"),
    objectType: objectTypeValidator,
    wpIds: v.array(v.number()),
  },
  handler: async (ctx, { siteId, objectType, wpIds }) => {
    const result = new Map<number, string>();

    // Query in batches to avoid hitting limits
    const BATCH_SIZE = 100;
    for (let i = 0; i < wpIds.length; i += BATCH_SIZE) {
      const batch = wpIds.slice(i, i + BATCH_SIZE);

      for (const wpId of batch) {
        const mapping = await ctx.db
          .query("wpIdMappings")
          .withIndex("by_wp_id", (q) =>
            q.eq("siteId", siteId).eq("objectType", objectType).eq("wpId", wpId)
          )
          .first();

        if (mapping) {
          result.set(wpId, mapping.convexId);
        }
      }
    }

    // Convert Map to array of tuples for serialization
    return Array.from(result.entries());
  },
});

/**
 * Check if a WordPress object has been imported.
 */
export const exists = internalQuery({
  args: {
    siteId: v.id("wordpressSites"),
    objectType: objectTypeValidator,
    wpId: v.number(),
  },
  handler: async (ctx, { siteId, objectType, wpId }) => {
    const mapping = await ctx.db
      .query("wpIdMappings")
      .withIndex("by_wp_id", (q) =>
        q.eq("siteId", siteId).eq("objectType", objectType).eq("wpId", wpId)
      )
      .first();

    return mapping !== null;
  },
});

/**
 * Get all mappings for a site.
 * Useful for building URL rewrite maps.
 */
export const getAllForSite = internalQuery({
  args: {
    siteId: v.id("wordpressSites"),
    objectType: v.optional(objectTypeValidator),
  },
  handler: async (ctx, { siteId, objectType }) => {
    if (objectType) {
      const mappings = await ctx.db
        .query("wpIdMappings")
        .withIndex("by_site", (q) => q.eq("siteId", siteId))
        .filter((q) => q.eq(q.field("objectType"), objectType))
        .collect();

      return mappings;
    }

    return await ctx.db
      .query("wpIdMappings")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();
  },
});

/**
 * Get mapping counts per object type for a site.
 */
export const getCounts = internalQuery({
  args: {
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { siteId }) => {
    const mappings = await ctx.db
      .query("wpIdMappings")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();

    const counts: Record<string, number> = {};
    for (const mapping of mappings) {
      counts[mapping.objectType] = (counts[mapping.objectType] || 0) + 1;
    }

    return counts;
  },
});

// ─── Mutation Functions ────────────────────────────────────────────────────

/**
 * Create a new ID mapping.
 */
export const create = internalMutation({
  args: {
    siteId: v.id("wordpressSites"),
    objectType: objectTypeValidator,
    wpId: v.number(),
    convexId: v.string(),
  },
  handler: async (ctx, { siteId, objectType, wpId, convexId }) => {
    // Check for existing mapping to prevent duplicates
    const existing = await ctx.db
      .query("wpIdMappings")
      .withIndex("by_wp_id", (q) =>
        q.eq("siteId", siteId).eq("objectType", objectType).eq("wpId", wpId)
      )
      .first();

    if (existing) {
      // Update existing mapping if convexId changed
      if (existing.convexId !== convexId) {
        await ctx.db.patch(existing._id, { convexId });
      }
      return existing._id;
    }

    // Create new mapping
    return await ctx.db.insert("wpIdMappings", {
      siteId,
      objectType,
      wpId,
      convexId,
      createdAt: Date.now(),
    });
  },
});

/**
 * Create multiple ID mappings in batch.
 */
export const createBatch = internalMutation({
  args: {
    siteId: v.id("wordpressSites"),
    mappings: v.array(
      v.object({
        objectType: objectTypeValidator,
        wpId: v.number(),
        convexId: v.string(),
      })
    ),
  },
  handler: async (ctx, { siteId, mappings }) => {
    const createdIds: Id<"wpIdMappings">[] = [];
    const now = Date.now();

    for (const mapping of mappings) {
      // Check for existing
      const existing = await ctx.db
        .query("wpIdMappings")
        .withIndex("by_wp_id", (q) =>
          q
            .eq("siteId", siteId)
            .eq("objectType", mapping.objectType)
            .eq("wpId", mapping.wpId)
        )
        .first();

      if (existing) {
        if (existing.convexId !== mapping.convexId) {
          await ctx.db.patch(existing._id, { convexId: mapping.convexId });
        }
        createdIds.push(existing._id);
      } else {
        const id = await ctx.db.insert("wpIdMappings", {
          siteId,
          objectType: mapping.objectType,
          wpId: mapping.wpId,
          convexId: mapping.convexId,
          createdAt: now,
        });
        createdIds.push(id);
      }
    }

    return createdIds;
  },
});

/**
 * Delete all mappings for a site.
 * Used when removing a site connection or starting a fresh import.
 */
export const deleteAllForSite = internalMutation({
  args: {
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { siteId }) => {
    const mappings = await ctx.db
      .query("wpIdMappings")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();

    let deleted = 0;
    for (const mapping of mappings) {
      await ctx.db.delete(mapping._id);
      deleted++;
    }

    return deleted;
  },
});

/**
 * Delete mappings for a specific object type.
 */
export const deleteByType = internalMutation({
  args: {
    siteId: v.id("wordpressSites"),
    objectType: objectTypeValidator,
  },
  handler: async (ctx, { siteId, objectType }) => {
    const mappings = await ctx.db
      .query("wpIdMappings")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .filter((q) => q.eq(q.field("objectType"), objectType))
      .collect();

    let deleted = 0;
    for (const mapping of mappings) {
      await ctx.db.delete(mapping._id);
      deleted++;
    }

    return deleted;
  },
});
