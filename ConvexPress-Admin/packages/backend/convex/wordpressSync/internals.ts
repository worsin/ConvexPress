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
  PHASE_ORDER,
  getNextPhase,
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
