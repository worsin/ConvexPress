/**
 * WordPress Sync System - Internals
 *
 * Internal functions for sync job orchestration.
 * Not callable from clients - only from other Convex functions.
 */

import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Id, Doc } from "../_generated/dataModel";
import { decryptSecret } from "../api/crypto_helpers";
import {
  type SyncPhase,
  type SyncError,
  type PhaseProgress,
  type ImportConfig,
  PHASE_ORDER,
  getNextPhase,
  shouldRunPhase,
  createDefaultImportConfig,
  BATCH_DELAY_MS,
  MAX_PHASE_ERRORS,
  syncPhaseValidator,
  phaseProgressValidator,
  syncErrorValidator,
} from "./validators";
import type { WPClientConfig } from "./helpers/wpClient";

// Environment variable for decrypting application passwords
const WP_ENCRYPTION_KEY = process.env.WP_SYNC_ENCRYPTION_KEY;

// ─── Internal Queries ──────────────────────────────────────────────────────

/**
 * Get site with credentials (internal only).
 */
export const getSiteWithCredentials = internalQuery({
  args: {
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { siteId }) => {
    return await ctx.db.get(siteId);
  },
});

/**
 * Get job details (internal only).
 */
export const getJobInternal = internalQuery({
  args: {
    jobId: v.id("wordpressSyncJobs"),
  },
  handler: async (ctx, { jobId }) => {
    return await ctx.db.get(jobId);
  },
});

/**
 * Count/fetch reconciliation findings for a job (up to limit).
 */
export const countFindings = internalQuery({
  args: { jobId: v.id("wordpressSyncJobs"), limit: v.number() },
  handler: async (ctx, { jobId, limit }) => {
    return await ctx.db
      .query("wordpressSyncReconciliationFindings")
      .withIndex("by_job_created", (q) => q.eq("jobId", jobId))
      .take(limit);
  },
});

/**
 * Get a batch of ID mappings for a site, paginated by wpId.
 */
export const getMappingsBatch = internalQuery({
  args: {
    siteId: v.id("wordpressSites"),
    objectType: v.string(),
    afterWpId: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, { siteId, objectType, afterWpId, limit }) => {
    return await ctx.db
      .query("wpIdMappings")
      .withIndex("by_wp_id", (q) =>
        q.eq("siteId", siteId).eq("objectType", objectType as any).gt("wpId", afterWpId)
      )
      .take(limit);
  },
});

// ─── Collision Detection Queries ──────────────────────────────────────────

/**
 * Find a post by slug (for slug collision detection).
 */
export const findPostBySlug = internalQuery({
  args: { slug: v.string(), type: v.optional(v.string()) },
  handler: async (ctx, { slug, type }) => {
    const result = await ctx.db
      .query("posts")
      .filter((q) =>
        type
          ? q.and(q.eq(q.field("slug"), slug), q.eq(q.field("type"), type))
          : q.eq(q.field("slug"), slug)
      )
      .first();
    return result;
  },
});

/**
 * Find a user by email (for email collision detection).
 */
export const findUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
  },
});

/**
 * Find a term by slug and taxonomy (for taxonomy collision detection).
 */
export const findTermBySlug = internalQuery({
  args: { slug: v.string(), taxonomy: v.string() },
  handler: async (ctx, { slug, taxonomy }) => {
    return await ctx.db
      .query("terms")
      .withIndex("by_slug_taxonomy", (q) => q.eq("slug", slug).eq("taxonomy", taxonomy))
      .first();
  },
});

/**
 * Find a menu by slug (for menu collision detection).
 */
export const findMenuBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("menus")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  },
});

/**
 * Find a product by SKU (for SKU collision detection).
 */
export const findProductBySku = internalQuery({
  args: { sku: v.string() },
  handler: async (ctx, { sku }) => {
    // commerce_products may have a by_sku index, otherwise filter
    const result = await ctx.db
      .query("commerce_products")
      .filter((q) => q.eq(q.field("sku"), sku))
      .first();
    return result;
  },
});

/**
 * Find a customer by email (for email collision detection).
 */
export const findCustomerByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("commerce_customer_profiles")
      .filter((q) => q.eq(q.field("email"), email))
      .first();
  },
});

/**
 * Find an order by orderNumber (for order number collision detection).
 */
export const findOrderByNumber = internalQuery({
  args: { orderNumber: v.string() },
  handler: async (ctx, { orderNumber }) => {
    return await ctx.db
      .query("commerce_orders")
      .filter((q) => q.eq(q.field("orderNumber"), orderNumber))
      .first();
  },
});

/**
 * Find a discount code by code (for coupon code collision detection).
 */
export const findDiscountByCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    return await ctx.db
      .query("commerce_discount_codes")
      .filter((q) => q.eq(q.field("code"), code))
      .first();
  },
});

/**
 * Generic entity lookup by table + ID string.
 * Used for local edit detection — fetches the local entity to compare updatedAt.
 */
export const getEntityById = internalQuery({
  args: { table: v.string(), id: v.string() },
  handler: async (ctx, { table, id }) => {
    try {
      return await ctx.db.get(id as any);
    } catch {
      return null;
    }
  },
});

// ─── Internal Mutations ────────────────────────────────────────────────────

/**
 * Initialize job progress with content counts.
 */
export const initializeProgress = internalMutation({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    counts: v.object({
      users: v.number(),
      posts: v.number(),
      pages: v.number(),
      categories: v.number(),
      tags: v.number(),
      media: v.number(),
      comments: v.number(),
    }),
  },
  handler: async (ctx, { jobId, counts }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;

    const progress = { ...job.progress };
    progress.users.total = counts.users;
    progress.posts.total = counts.posts;
    progress.pages.total = counts.pages;
    progress.categories.total = counts.categories;
    progress.tags.total = counts.tags;
    progress.media.total = counts.media;
    progress.comments.total = counts.comments;
    // Menus count will be fetched during menus phase

    await ctx.db.patch(jobId, {
      progress,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update progress for a specific phase.
 */
export const updatePhaseProgress = internalMutation({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    phase: v.string(),
    progress: phaseProgressValidator,
  },
  handler: async (ctx, { jobId, phase, progress }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;

    const updatedProgress = { ...job.progress };
    (updatedProgress as Record<string, PhaseProgress>)[phase] = progress;

    await ctx.db.patch(jobId, {
      progress: updatedProgress,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Add errors to a job.
 */
export const addErrors = internalMutation({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    errors: v.array(syncErrorValidator),
  },
  handler: async (ctx, { jobId, errors }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;

    await ctx.db.patch(jobId, {
      errors: [...job.errors, ...errors],
      updatedAt: Date.now(),
    });
  },
});

/**
 * Advance to the next phase.
 */
export const advancePhase = internalMutation({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    phase: syncPhaseValidator,
  },
  handler: async (ctx, { jobId, phase }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;

    await ctx.db.patch(jobId, {
      currentPhase: phase,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Mark job as completed.
 */
export const completeJob = internalMutation({
  args: {
    jobId: v.id("wordpressSyncJobs"),
  },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;

    const now = Date.now();

    await ctx.db.patch(jobId, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
    });

    // Update site's lastSyncAt
    await ctx.db.patch(job.siteId, {
      lastSyncAt: now,
      updatedAt: now,
    });

    // Schedule report generation
    await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.generateFinalReport, { jobId });
  },
});

/**
 * Upsert a sync report for a completed job.
 * Creates on first call, patches on subsequent calls.
 */
export const upsertReport = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("wordpressSyncReports")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        completedAt: args.completedAt,
        finalStatus: args.finalStatus,
        phaseCounts: args.phaseCounts,
        totalCounts: args.totalCounts,
        findingSummary: args.findingSummary,
        operatorSummary: args.operatorSummary,
      });
      return existing._id;
    }

    return await ctx.db.insert("wordpressSyncReports", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/**
 * Insert a single reconciliation finding.
 */
export const insertFinding = internalMutation({
  args: {
    siteId: v.id("wordpressSites"),
    jobId: v.id("wordpressSyncJobs"),
    severity: v.union(v.literal("error"), v.literal("warning"), v.literal("info")),
    phase: v.string(),
    code: v.optional(v.string()),
    message: v.string(),
    sourceType: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    destinationTable: v.optional(v.string()),
    wpId: v.optional(v.number()),
    objectType: v.optional(v.string()),
    convexId: v.optional(v.string()),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("wordpressSyncReconciliationFindings", args);
  },
});

/**
 * Mark job as failed.
 */
export const failJob = internalMutation({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    error: v.string(),
  },
  handler: async (ctx, { jobId, error }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;

    const now = Date.now();

    // Add the fatal error
    const fatalError: SyncError = {
      phase: job.currentPhase,
      wpId: 0,
      message: error,
      timestamp: now,
    };

    await ctx.db.patch(jobId, {
      status: "failed",
      errors: [...job.errors, fatalError],
      completedAt: now,
      updatedAt: now,
    });
  },
});

// ─── Phase Orchestration ───────────────────────────────────────────────────

/**
 * Main sync phase executor.
 * Runs the current phase, then schedules the next iteration or advances.
 */
export const runSyncPhase = internalAction({
  args: {
    jobId: v.id("wordpressSyncJobs"),
  },
  handler: async (ctx, { jobId }) => {
    // Get current job state
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });

    if (!job) {
      console.error(`[WP Sync] Job ${jobId} not found`);
      return;
    }

    // Check if job should continue
    if (job.status !== "running") {
      console.log(`[WP Sync] Job ${jobId} is ${job.status}, stopping`);
      return;
    }

    // Get site credentials
    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, {
      siteId: job.siteId,
    });

    if (!site) {
      await ctx.runMutation(internal.wordpressSync.internals.failJob, {
        jobId,
        error: "Site not found",
      });
      return;
    }

    // Decrypt the application password if encryption is enabled
    let decryptedPassword = site.applicationPassword;
    if (WP_ENCRYPTION_KEY && site.applicationPassword.includes(":")) {
      // Encrypted format is "iv:authTag:ciphertext"
      try {
        decryptedPassword = await decryptSecret(site.applicationPassword, WP_ENCRYPTION_KEY);
      } catch (error) {
        console.warn("[WP Sync] Failed to decrypt password, using as-is:", error);
      }
    }

    const credentials: WPClientConfig = {
      siteUrl: site.siteUrl,
      username: site.username,
      applicationPassword: decryptedPassword,
    };

    const phase = job.currentPhase;
    console.log(`[WP Sync] Running phase: ${phase} for job ${jobId}`);

    // Get import config (default to all-enabled if not set)
    const importConfig = job.importConfig ?? createDefaultImportConfig();

    // Skip phases not in scope
    if (!shouldRunPhase(phase, importConfig.scope)) {
      console.log(`[WP Sync] Skipping phase ${phase} (not in scope) for job ${jobId}`);
      const nextPhase = getNextPhase(phase);
      if (nextPhase) {
        await ctx.runMutation(internal.wordpressSync.internals.advancePhase, { jobId, phase: nextPhase });
        await ctx.scheduler.runAfter(BATCH_DELAY_MS, internal.wordpressSync.internals.runSyncPhase, { jobId });
      } else {
        await ctx.runMutation(internal.wordpressSync.internals.completeJob, { jobId });
      }
      return;
    }

    try {
      // Run the appropriate phase handler
      let result: PhaseResult;

      switch (phase) {
        case "users":
          result = await ctx.runAction(internal.wordpressSync.phases.users.importBatch, {
            jobId,
            siteId: job.siteId,
          });
          break;

        case "taxonomies":
          result = await ctx.runAction(internal.wordpressSync.phases.taxonomies.importBatch, {
            jobId,
            siteId: job.siteId,
          });
          break;

        case "media":
          result = await ctx.runAction(internal.wordpressSync.phases.media.importBatch, {
            jobId,
            siteId: job.siteId,
          });
          break;

        case "posts":
          result = await ctx.runAction(internal.wordpressSync.phases.posts.importBatch, {
            jobId,
            siteId: job.siteId,
          });
          break;

        case "pages":
          result = await ctx.runAction(internal.wordpressSync.phases.pages.importBatch, {
            jobId,
            siteId: job.siteId,
          });
          break;

        case "comments":
          result = await ctx.runAction(internal.wordpressSync.phases.comments.importBatch, {
            jobId,
            siteId: job.siteId,
          });
          break;

        case "menus":
          result = await ctx.runAction(internal.wordpressSync.phases.menus.importBatch, {
            jobId,
            siteId: job.siteId,
          });
          break;

        case "reconciliation":
          result = await ctx.runAction(
            internal.wordpressSync.phases.reconciliation.runBatch,
            { jobId, siteId: job.siteId, credentials }
          );
          break;

        case "cleanup":
          result = await runCleanup(ctx, job);
          break;

        default:
          throw new Error(`Unknown phase: ${phase}`);
      }

      // Update progress
      await ctx.runMutation(internal.wordpressSync.internals.updatePhaseProgress, {
        jobId,
        phase: getProgressKey(phase),
        progress: result.progress,
      });

      // Add any errors
      if (result.errors.length > 0) {
        await ctx.runMutation(internal.wordpressSync.internals.addErrors, {
          jobId,
          errors: result.errors,
        });
      }

      // Check if we should stop due to too many errors
      const updatedJob = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
      if (updatedJob && updatedJob.errors.length >= MAX_PHASE_ERRORS * PHASE_ORDER.length) {
        await ctx.runMutation(internal.wordpressSync.internals.failJob, {
          jobId,
          error: "Too many errors, stopping sync",
        });
        return;
      }

      // Decide next action
      if (result.hasMore) {
        // Continue current phase after a brief delay
        await ctx.scheduler.runAfter(BATCH_DELAY_MS, internal.wordpressSync.internals.runSyncPhase, {
          jobId,
        });
      } else {
        // Advance to next phase
        const nextPhase = getNextPhase(phase);

        if (nextPhase) {
          await ctx.runMutation(internal.wordpressSync.internals.advancePhase, {
            jobId,
            phase: nextPhase,
          });
          await ctx.scheduler.runAfter(BATCH_DELAY_MS, internal.wordpressSync.internals.runSyncPhase, {
            jobId,
          });
        } else {
          // All phases complete
          await ctx.runMutation(internal.wordpressSync.internals.completeJob, { jobId });
        }
      }
    } catch (error) {
      console.error(`[WP Sync] Phase ${phase} failed:`, error);
      await ctx.runMutation(internal.wordpressSync.internals.failJob, {
        jobId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

// ─── Phase Result Type ─────────────────────────────────────────────────────

export interface PhaseResult {
  progress: PhaseProgress;
  errors: SyncError[];
  hasMore: boolean;
}

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Map phase name to progress key (handles taxonomies split).
 */
function getProgressKey(phase: SyncPhase): string {
  // Most phases map directly
  return phase;
}

/**
 * Run cleanup phase (finalization).
 */
async function runCleanup(
  ctx: { runMutation: typeof internalAction.prototype.handler },
  job: Doc<"wordpressSyncJobs">
): Promise<PhaseResult> {
  // Cleanup phase is a no-op for now
  // Could be used for:
  // - Verifying all relationships are intact
  // - Updating post counts
  // - Clearing temporary data

  return {
    progress: { total: 1, imported: 1, failed: 0 },
    errors: [],
    hasMore: false,
  };
}

// ─── Report Generation ───────────────────────────────────────────────────────

/**
 * Generate final sync report after job completion.
 * Aggregates findings, computes totals, and stores an operator summary.
 */
export const generateFinalReport = internalAction({
  args: { jobId: v.id("wordpressSyncJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
    if (!job) return;

    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, { siteId: job.siteId });
    if (!site) return;

    // Count findings by severity and code
    const findingCounts: Record<string, number> = { error: 0, warning: 0, info: 0 };
    const codeCounts: Record<string, number> = {};
    const SCAN_LIMIT = 1000;

    const findings = await ctx.runQuery(internal.wordpressSync.internals.countFindings, {
      jobId, limit: SCAN_LIMIT,
    });

    for (const f of findings) {
      findingCounts[f.severity] = (findingCounts[f.severity] || 0) + 1;
      if (f.code) codeCounts[f.code] = (codeCounts[f.code] || 0) + 1;
    }

    // Compute total counts from progress
    const progress = job.progress;
    let totalCreated = 0, totalUpdated = 0, totalSkipped = 0, totalConflicted = 0, totalFailed = 0;
    for (const p of Object.values(progress)) {
      totalCreated += (p as PhaseProgress).created || 0;
      totalUpdated += (p as PhaseProgress).updated || 0;
      totalSkipped += (p as PhaseProgress).skipped || 0;
      totalConflicted += (p as PhaseProgress).conflicted || 0;
      totalFailed += (p as PhaseProgress).failed || 0;
    }

    const importConfig = job.importConfig ?? createDefaultImportConfig();
    const isDryRun = importConfig.behavior.dryRun;

    const summary = isDryRun
      ? `Dry run complete. Would create ${totalCreated}, update ${totalUpdated}, skip ${totalSkipped}. ${findingCounts.error} errors, ${findingCounts.warning} warnings.`
      : `Import complete. Created ${totalCreated}, updated ${totalUpdated}, skipped ${totalSkipped}, failed ${totalFailed}. ${findingCounts.error} errors, ${findingCounts.warning} warnings.`;

    const capabilities = site.capabilities ?? {
      wpRest: false, wpAuthValid: false, menusApi: false,
      woocommerceApi: false, wooAuthValid: false,
      customMetaEndpointConfigured: false, customMetaEndpointDetected: false,
      elementorDetected: false, mediaAccessible: false,
    };

    await ctx.runMutation(internal.wordpressSync.internals.upsertReport, {
      jobId,
      siteId: job.siteId,
      startedAt: job.startedAt || job.createdAt,
      completedAt: job.completedAt || Date.now(),
      finalStatus: job.status,
      detectedCapabilities: {
        wpRest: capabilities.wpRest ?? false,
        wpAuthValid: capabilities.wpAuthValid ?? false,
        wooRest: capabilities.woocommerceApi ?? false,
        wooAuthValid: capabilities.wooAuthValid ?? false,
        menusApi: capabilities.menusApi ?? false,
        customMetaEndpoint: capabilities.customMetaEndpointDetected ?? false,
        elementorDetected: capabilities.elementorDetected ?? false,
        mediaAccessible: capabilities.mediaAccessible ?? false,
      },
      importConfig: JSON.stringify(importConfig),
      phaseCounts: JSON.stringify(progress),
      totalCounts: { created: totalCreated, updated: totalUpdated, skipped: totalSkipped, conflicted: totalConflicted, failed: totalFailed },
      findingSummary: JSON.stringify({ bySeverity: findingCounts, byCode: codeCounts }),
      operatorSummary: summary,
    });
  },
});

// ─── Cron Cleanup Functions ─────────────────────────────────────────────────

/**
 * Clean up old completed/failed/cancelled jobs.
 * Jobs older than 30 days are deleted to prevent unbounded growth.
 * Runs daily.
 */
export const cleanupOldJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const RETENTION_DAYS = 30;
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const BATCH_SIZE = 100;
    let deleted = 0;

    // Find old completed jobs
    const oldJobs = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .take(BATCH_SIZE);

    for (const job of oldJobs) {
      if (job.completedAt && job.completedAt < cutoff) {
        await ctx.db.delete(job._id);
        deleted++;
      }
    }

    // Find old failed jobs
    const failedJobs = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .take(BATCH_SIZE);

    for (const job of failedJobs) {
      if (job.completedAt && job.completedAt < cutoff) {
        await ctx.db.delete(job._id);
        deleted++;
      }
    }

    // Find old cancelled jobs
    const cancelledJobs = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_status", (q) => q.eq("status", "cancelled"))
      .take(BATCH_SIZE);

    for (const job of cancelledJobs) {
      if (job.completedAt && job.completedAt < cutoff) {
        await ctx.db.delete(job._id);
        deleted++;
      }
    }

    console.log(`[WP Sync Cleanup] Deleted ${deleted} old jobs`);
    return { deleted };
  },
});

/**
 * Clean up orphaned mappings.
 * Mappings for deleted sites are removed.
 * Runs weekly.
 */
export const cleanupOrphanedMappings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const BATCH_SIZE = 500;
    let deleted = 0;

    // Get all site IDs
    const sites = await ctx.db.query("wordpressSites").take(1000);
    const siteIds = new Set(sites.map((s) => s._id));

    // Find mappings and check if their site still exists
    const mappings = await ctx.db.query("wpIdMappings").take(BATCH_SIZE);

    for (const mapping of mappings) {
      if (!siteIds.has(mapping.siteId)) {
        await ctx.db.delete(mapping._id);
        deleted++;
      }
    }

    console.log(`[WP Sync Cleanup] Deleted ${deleted} orphaned mappings`);
    return { deleted };
  },
});

/**
 * Check for stale running jobs.
 * Jobs stuck in "running" for more than 1 hour without updates are marked as failed.
 * Runs hourly.
 */
export const checkStaleJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
    const cutoff = Date.now() - STALE_THRESHOLD_MS;
    let marked = 0;

    const runningJobs = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(50);

    for (const job of runningJobs) {
      if (job.updatedAt < cutoff) {
        await ctx.db.patch(job._id, {
          status: "failed",
          errors: [
            ...job.errors,
            {
              phase: job.currentPhase,
              wpId: 0,
              message: "Job stalled - no progress for over 1 hour",
              timestamp: Date.now(),
            },
          ],
          completedAt: Date.now(),
          updatedAt: Date.now(),
        });
        marked++;
      }
    }

    console.log(`[WP Sync Cleanup] Marked ${marked} stale jobs as failed`);
    return { marked };
  },
});
