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
  v.literal("commerceCatalog"),
  v.literal("commerceTransactions"),
  v.literal("reconciliation"),
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

const siteCapabilitiesValidator = v.object({
  wpRest: v.boolean(),
  wpAuthValid: v.boolean(),
  wooAuthValid: v.boolean(),
  menusApi: v.boolean(),
  woocommerceApi: v.boolean(),
  customMetaEndpointConfigured: v.boolean(),
  customMetaEndpointDetected: v.boolean(),
  userPasswordExportEndpointConfigured: v.optional(v.boolean()),
  userPasswordExportEndpointDetected: v.optional(v.boolean()),
  elementorDetected: v.boolean(),
  mediaAccessible: v.boolean(),
});

// ─── Import Config Validators ──────────────────────────────────────────────

const importScopeValidator = v.object({
  wpContent: v.boolean(),
  elementor: v.boolean(),
  media: v.boolean(),
  menus: v.boolean(),
  comments: v.boolean(),
  wooCatalog: v.boolean(),
  wooCustomers: v.boolean(),
  wooOrders: v.boolean(),
  wooCoupons: v.boolean(),
  wooReviews: v.boolean(),
  cleanup: v.boolean(),
});

const importBehaviorValidator = v.object({
  dryRun: v.boolean(),
  updateExisting: v.boolean(),
  preserveLocalEdits: v.boolean(),
  importDrafts: v.boolean(),
  importHistoricalOrders: v.boolean(),
  importRefunds: v.boolean(),
  importReviews: v.boolean(),
  importCoupons: v.boolean(),
  tombstoneMode: v.optional(v.union(
    v.literal("never"),
    v.literal("mark_stale"),
    v.literal("soft_delete"),
    v.literal("hard_delete"),
  )),
  destructiveDelete: v.optional(v.boolean()),
});

const importFiltersValidator = v.object({
  dateRangeStart: v.optional(v.number()),
  dateRangeEnd: v.optional(v.number()),
  entityLimit: v.optional(v.number()),
});

const importConfigValidator = v.object({
  scope: importScopeValidator,
  behavior: importBehaviorValidator,
  filters: importFiltersValidator,
});

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

// ─── Phase Progress Shape ───────────────────────────────────────────────────
const phaseProgressValidator = v.object({
  total: v.number(),
  imported: v.number(),
  failed: v.number(),
  cursor: v.optional(v.number()),
  // Per-phase counters used by some phases — kept optional so phases that
  // don't track these don't have to fill them in.
  created: v.optional(v.number()),
  updated: v.optional(v.number()),
  skipped: v.optional(v.number()),
  conflicted: v.optional(v.number()),
});

// ─── Sync Error Shape ───────────────────────────────────────────────────────
const syncErrorValidator = v.object({
  phase: v.string(),
  wpId: v.number(),
  message: v.string(),
  timestamp: v.number(),
});

const reconciliationSeverityValidator = v.union(
  v.literal("error"),
  v.literal("warning"),
  v.literal("info")
);

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
    capabilities: v.optional(siteCapabilitiesValidator),
    // Optional custom REST endpoint path for hidden post meta such as Elementor/ACF/Yoast.
    // Supports `:postType` and `:id` placeholders, for example:
    // `/convexpress/v1/postmeta/:postType/:id`
    metaEndpointPath: v.optional(v.string()),
    // WooCommerce API credentials
    wooConsumerKey: v.optional(v.string()),
    wooConsumerSecret: v.optional(v.string()),
    wooAuthMode: v.optional(v.union(v.literal("shared"), v.literal("separate"))),
    // Optional temporary migration endpoint for wp_users.user_pass digests.
    // The secret is encrypted with the same WP_SYNC_ENCRYPTION_KEY envelope.
    userPasswordExportPath: v.optional(v.string()),
    userPasswordExportSecret: v.optional(v.string()),
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
   * users -> taxonomies -> media -> posts -> pages -> comments -> menus -> commerceCatalog -> commerceTransactions -> cleanup
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
      // Taxonomies phase writes here (categories + tags batched together).
      // The legacy `categories` and `tags` slots are kept optional because
      // existing job rows may reference them.
      taxonomies: v.optional(phaseProgressValidator),
      categories: v.optional(phaseProgressValidator),
      tags: v.optional(phaseProgressValidator),
      media: phaseProgressValidator,
      posts: phaseProgressValidator,
      pages: phaseProgressValidator,
      comments: phaseProgressValidator,
      menus: phaseProgressValidator,
      commerceCatalog: phaseProgressValidator,
      commerceTransactions: phaseProgressValidator,
      reconciliation: phaseProgressValidator,
      cleanup: phaseProgressValidator,
    }),
    // Accumulated errors during import
    errors: v.array(syncErrorValidator),
    // Job timing
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    pausedAt: v.optional(v.number()),
    // Who started this job
    createdBy: v.id("users"),
    // Import configuration for this job
    importConfig: v.optional(importConfigValidator),
    // Resume from a specific phase (for retries)
    resumeFromPhase: v.optional(syncPhaseValidator),
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
   * ConvexPress Convex IDs for reference resolution during import.
   */
  wpIdMappings: defineTable({
    // Reference to the WordPress site
    siteId: v.id("wordpressSites"),
    // Type of object being mapped
    objectType: objectTypeValidator,
    // Original WordPress ID
    wpId: v.number(),
    // ConvexPress Convex ID (stored as string for flexibility)
    convexId: v.string(),
    // Source URL for media/content reference tracking
    sourceUrl: v.optional(v.string()),
    // All source URLs that should rewrite to this mapping. Media imports use
    // this for WordPress image size variants in addition to the original URL.
    sourceUrls: v.optional(v.array(v.string())),
    // Hash of the source content for change detection
    sourceHash: v.optional(v.string()),
    // Last import job that fetched this source object. Used by tombstone
    // detection to distinguish deleted source objects from out-of-scope ones.
    lastSeenJobId: v.optional(v.id("wordpressSyncJobs")),
    lastSeenAt: v.optional(v.number()),
    // When this mapping was created
    createdAt: v.number(),
  })
    .index("by_wp_id", ["siteId", "objectType", "wpId"])
    .index("by_convex_id", ["siteId", "objectType", "convexId"])
    .index("by_site", ["siteId"])
    .index("by_source_url", ["siteId", "sourceUrl"]),

  wordpressSyncReconciliationFindings: defineTable({
    siteId: v.id("wordpressSites"),
    jobId: v.id("wordpressSyncJobs"),
    severity: reconciliationSeverityValidator,
    phase: v.string(),
    wpId: v.optional(v.number()),
    objectType: v.optional(v.string()),
    convexId: v.optional(v.string()),
    message: v.string(),
    sourceType: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    destinationTable: v.optional(v.string()),
    code: v.optional(v.string()),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_job_created", ["jobId", "createdAt"])
    .index("by_job_severity", ["jobId", "severity"])
    .index("by_job_phase", ["jobId", "phase"])
    .index("by_job_code", ["jobId", "code"])
    .index("by_site_created", ["siteId", "createdAt"])
    .index("by_site_severity", ["siteId", "severity"]),

  /**
   * WordPress sync reports
   *
   * Post-sync summary reports capturing capabilities, config, phase counts,
   * finding summaries, and operator-friendly summaries for each completed job.
   */
  wordpressSyncReports: defineTable({
    jobId: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    finalStatus: v.string(),
    detectedCapabilities: v.object({
      wpRest: v.boolean(),
      wpAuthValid: v.boolean(),
      wooRest: v.boolean(),
      wooAuthValid: v.boolean(),
      menusApi: v.boolean(),
      customMetaEndpoint: v.boolean(),
      elementorDetected: v.boolean(),
      mediaAccessible: v.boolean(),
    }),
    importConfig: v.string(),
    phaseCounts: v.string(),
    totalCounts: v.object({
      created: v.number(),
      updated: v.number(),
      skipped: v.number(),
      conflicted: v.number(),
      failed: v.number(),
    }),
    findingSummary: v.string(),
    operatorSummary: v.string(),
    createdAt: v.number(),
  })
    .index("by_site_created", ["siteId", "createdAt"])
    .index("by_job", ["jobId"]),
};
