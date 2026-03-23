import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * WordPress Sync System Schema
 *
 * Tables for managing WordPress site connections, sync jobs, and ID mappings
 * to enable full content migration from WordPress sites.
 */

// ─── Sync Phase Types ───────────────────────────────────────────────────────
const syncPhaseValidator = v.union(
  v.literal("users"),
  v.literal("taxonomies"),
  v.literal("media"),
  v.literal("posts"),
  v.literal("pages"),
  v.literal("comments"),
  v.literal("menus"),
  v.literal("cleanup")
);

// ─── Job Status Types ───────────────────────────────────────────────────────
const jobStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("paused"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled")
);

// ─── Site Status Types ──────────────────────────────────────────────────────
const siteStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("error")
);

// ─── Object Type for ID Mappings ────────────────────────────────────────────
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

// ─── Phase Progress Shape ───────────────────────────────────────────────────
const phaseProgressValidator = v.object({
  total: v.number(),
  imported: v.number(),
  failed: v.number(),
  cursor: v.optional(v.number()),
});

// ─── Sync Error Shape ───────────────────────────────────────────────────────
const syncErrorValidator = v.object({
  phase: v.string(),
  wpId: v.number(),
  message: v.string(),
  timestamp: v.number(),
});

// ─── Tables ─────────────────────────────────────────────────────────────────

export const wordpressSyncTables = {
  /**
   * WordPress site connections
   *
   * Stores credentials (encrypted) and metadata for connected WordPress sites.
   * Each site can have multiple sync jobs over time.
   */
  wordpressSites: defineTable({
    // Display name for the site
    name: v.string(),
    // WordPress site URL (e.g., "https://example.com")
    siteUrl: v.string(),
    // WordPress username for API authentication
    username: v.string(),
    // Application password - AES-256-GCM encrypted
    applicationPassword: v.string(),
    // Connection status
    status: siteStatusValidator,
    // Last successful connection test timestamp
    lastConnectionTest: v.optional(v.number()),
    // Last sync completion timestamp
    lastSyncAt: v.optional(v.number()),
    // Error message if status is "error"
    connectionError: v.optional(v.string()),
    // Site metadata (fetched during connection test)
    wpVersion: v.optional(v.string()),
    siteName: v.optional(v.string()),
    siteDescription: v.optional(v.string()),
    // Who created this connection
    createdBy: v.id("users"),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_url", ["siteUrl"])
    .index("by_status", ["status"])
    .index("by_createdBy", ["createdBy"]),

  /**
   * WordPress sync jobs
   *
   * Tracks individual sync operations. Each job imports content in phases:
   * users -> taxonomies -> media -> posts -> pages -> comments -> menus -> cleanup
   */
  wordpressSyncJobs: defineTable({
    // Reference to the WordPress site
    siteId: v.id("wordpressSites"),
    // Job status
    status: jobStatusValidator,
    // Current import phase
    currentPhase: syncPhaseValidator,
    // Progress tracking per phase
    progress: v.object({
      users: phaseProgressValidator,
      categories: phaseProgressValidator,
      tags: phaseProgressValidator,
      media: phaseProgressValidator,
      posts: phaseProgressValidator,
      pages: phaseProgressValidator,
      comments: phaseProgressValidator,
      menus: phaseProgressValidator,
    }),
    // Accumulated errors during import
    errors: v.array(syncErrorValidator),
    // Job timing
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    pausedAt: v.optional(v.number()),
    // Who started this job
    createdBy: v.id("users"),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_site", ["siteId", "status"])
    .index("by_status", ["status"])
    .index("by_site_created", ["siteId", "createdAt"]),

  /**
   * WordPress ID to Convex ID mappings
   *
   * Preserves the relationship between WordPress object IDs and
   * SmithHarper Convex IDs for reference resolution during import.
   */
  wpIdMappings: defineTable({
    // Reference to the WordPress site
    siteId: v.id("wordpressSites"),
    // Type of object being mapped
    objectType: objectTypeValidator,
    // Original WordPress ID
    wpId: v.number(),
    // SmithHarper Convex ID (stored as string for flexibility)
    convexId: v.string(),
    // When this mapping was created
    createdAt: v.number(),
  })
    .index("by_wp_id", ["siteId", "objectType", "wpId"])
    .index("by_convex_id", ["siteId", "objectType", "convexId"])
    .index("by_site", ["siteId"]),
};
