/**
 * WordPress ID Mapping Helpers
 *
 * Internal functions for managing the mapping between WordPress IDs
 * and ConvexPress Convex IDs during import.
 *
 * These are used by the import phases to:
 *   - Check if an object has already been imported (deduplication)
 *   - Resolve WordPress IDs to Convex IDs for relationship linking
 *   - Create new mappings after successful imports
 *   - Detect collisions and create structured findings
 */

import { internalMutation, internalQuery } from "../../_generated/server";
import { internal } from "../../_generated/api";
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
  v.literal("menuItem"),
  v.literal("commerceCategory"),
  v.literal("commerceProduct"),
  v.literal("commerceProductVariant"),
  v.literal("commerceCustomer"),
  v.literal("commerceOrder"),
  v.literal("commerceOrderItem"),
  v.literal("commercePaymentTransaction"),
  v.literal("commerceDiscount"),
  v.literal("commerceReview"),
  v.literal("commerceRefund")
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
  | "menuItem"
  | "commerceCategory"
  | "commerceProduct"
  | "commerceProductVariant"
  | "commerceCustomer"
  | "commerceOrder"
  | "commerceOrderItem"
  | "commercePaymentTransaction"
  | "commerceDiscount"
  | "commerceReview"
  | "commerceRefund";

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
      return await ctx.db
        .query("wpIdMappings")
        .withIndex("by_wp_id", (q) =>
          q.eq("siteId", siteId).eq("objectType", objectType)
        )
        .collect();
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
    sourceUrl: v.optional(v.string()),
    sourceUrls: v.optional(v.array(v.string())),
    sourceHash: v.optional(v.string()),
    jobId: v.optional(v.id("wordpressSyncJobs")),
  },
  handler: async (ctx, { siteId, objectType, wpId, convexId, sourceUrl, sourceUrls, sourceHash, jobId }) => {
    const now = Date.now();

    // Check for existing mapping to prevent duplicates
    const existing = await ctx.db
      .query("wpIdMappings")
      .withIndex("by_wp_id", (q) =>
        q.eq("siteId", siteId).eq("objectType", objectType).eq("wpId", wpId)
      )
      .first();

    if (existing) {
      // Update existing mapping if convexId changed
      const patch: Record<string, unknown> = {};
      if (existing.convexId !== convexId) {
        patch.convexId = convexId;
      }
      if (sourceUrl && existing.sourceUrl !== sourceUrl) {
        patch.sourceUrl = sourceUrl;
      }
      if (sourceUrls && JSON.stringify(existing.sourceUrls ?? []) !== JSON.stringify(sourceUrls)) {
        patch.sourceUrls = sourceUrls;
      }
      if (sourceHash && existing.sourceHash !== sourceHash) {
        patch.sourceHash = sourceHash;
      }
      if (jobId) {
        patch.lastSeenJobId = jobId;
        patch.lastSeenAt = now;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(existing._id, patch);
      }
      return existing._id;
    }

    // Create new mapping
    return await ctx.db.insert("wpIdMappings", {
      siteId,
      objectType,
      wpId,
      convexId,
      sourceUrl,
      sourceUrls,
      sourceHash,
      lastSeenJobId: jobId,
      lastSeenAt: jobId ? now : undefined,
      createdAt: now,
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
        sourceUrl: v.optional(v.string()),
        sourceUrls: v.optional(v.array(v.string())),
      })
    ),
    jobId: v.optional(v.id("wordpressSyncJobs")),
  },
  handler: async (ctx, { siteId, mappings, jobId }) => {
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
        const patch: Record<string, unknown> = {};
        if (existing.convexId !== mapping.convexId) {
          patch.convexId = mapping.convexId;
        }
        if (mapping.sourceUrl && existing.sourceUrl !== mapping.sourceUrl) {
          patch.sourceUrl = mapping.sourceUrl;
        }
        if (mapping.sourceUrls && JSON.stringify(existing.sourceUrls ?? []) !== JSON.stringify(mapping.sourceUrls)) {
          patch.sourceUrls = mapping.sourceUrls;
        }
        if (jobId) {
          patch.lastSeenJobId = jobId;
          patch.lastSeenAt = now;
        }
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(existing._id, patch);
        }
        createdIds.push(existing._id);
      } else {
        const id = await ctx.db.insert("wpIdMappings", {
          siteId,
          objectType: mapping.objectType,
          wpId: mapping.wpId,
          convexId: mapping.convexId,
          sourceUrl: mapping.sourceUrl,
          sourceUrls: mapping.sourceUrls,
          lastSeenJobId: jobId,
          lastSeenAt: jobId ? now : undefined,
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

/**
 * Mark a mapping as observed by the current import job without changing its
 * source hash. This keeps dry-run-free tombstone detection scoped to what the
 * job actually fetched.
 */
export const touch = internalMutation({
  args: {
    siteId: v.id("wordpressSites"),
    objectType: objectTypeValidator,
    wpId: v.number(),
    jobId: v.id("wordpressSyncJobs"),
  },
  handler: async (ctx, { siteId, objectType, wpId, jobId }) => {
    const mapping = await ctx.db
      .query("wpIdMappings")
      .withIndex("by_wp_id", (q) =>
        q.eq("siteId", siteId).eq("objectType", objectType).eq("wpId", wpId)
      )
      .first();

    if (!mapping) return null;

    await ctx.db.patch(mapping._id, {
      lastSeenJobId: jobId,
      lastSeenAt: Date.now(),
    });

    return mapping._id;
  },
});

// ─── Full Mapping Retrieval ──────────────────────────────────────────────

/**
 * Get the full mapping document (including sourceHash) by WordPress ID.
 * Returns null if no mapping exists.
 */
export const getFullMappingByWpId = internalQuery({
  args: {
    siteId: v.id("wordpressSites"),
    objectType: objectTypeValidator,
    wpId: v.number(),
  },
  handler: async (ctx, { siteId, objectType, wpId }) => {
    return await ctx.db
      .query("wpIdMappings")
      .withIndex("by_wp_id", (q) =>
        q.eq("siteId", siteId).eq("objectType", objectType).eq("wpId", wpId)
      )
      .first();
  },
});

// ─── Source Hash Update ──────────────────────────────────────────────────

/**
 * Update sourceHash on an existing mapping.
 */
export const updateSourceHash = internalMutation({
  args: {
    siteId: v.id("wordpressSites"),
    objectType: objectTypeValidator,
    wpId: v.number(),
    sourceHash: v.string(),
  },
  handler: async (ctx, { siteId, objectType, wpId, sourceHash }) => {
    const mapping = await ctx.db
      .query("wpIdMappings")
      .withIndex("by_wp_id", (q) =>
        q.eq("siteId", siteId).eq("objectType", objectType).eq("wpId", wpId)
      )
      .first();

    if (mapping) {
      await ctx.db.patch(mapping._id, { sourceHash });
    }
  },
});

// ─── Finding Creation Helper ─────────────────────────────────────────────

/**
 * Create a structured finding record via the insertFinding internal mutation.
 * This is a helper for use in internalAction handlers.
 */
export async function createFinding(
  ctx: {
    runMutation: (ref: any, args: any) => Promise<any>;
  },
  args: {
    siteId: any;
    jobId: any;
    severity: "error" | "warning" | "info";
    phase: string;
    code: string;
    message: string;
    sourceType?: string;
    sourceId?: string;
    destinationTable?: string;
    wpId?: number;
    objectType?: string;
    convexId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await ctx.runMutation(internal.wordpressSync.internals.insertFinding, {
    siteId: args.siteId,
    jobId: args.jobId,
    severity: args.severity,
    phase: args.phase,
    code: args.code,
    message: args.message,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    destinationTable: args.destinationTable,
    wpId: args.wpId,
    objectType: args.objectType,
    convexId: args.convexId,
    metadata: args.metadata ? JSON.stringify(args.metadata) : undefined,
    createdAt: Date.now(),
  });
}
