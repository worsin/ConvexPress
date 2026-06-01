/**
 * WordPress Sync System - Mutations
 *
 * Public mutations for managing WordPress sites and sync jobs.
 * All mutations require Administrator capability (manage_options).
 */

import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import { requireCan } from "../helpers/permissions";
import { encryptSecret } from "../api/crypto_helpers";
import {
  siteStatusValidator,
  createInitialProgress,
  normalizeImportConfig,
  normalizeSiteUrl,
  validateSiteUrl,
} from "./validators";

// Environment variable for encrypting application passwords
const WP_ENCRYPTION_KEY = process.env.WP_SYNC_ENCRYPTION_KEY;
const ARTIFACT_DELETE_BATCH_SIZE = 500;
const ACTIVE_JOB_STATUSES = ["pending", "running", "paused"] as const;

async function findActiveJobForSite(ctx: any, siteId: any) {
  for (const status of ACTIVE_JOB_STATUSES) {
    const job = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site", (q: any) => q.eq("siteId", siteId).eq("status", status))
      .first();

    if (job) return job;
  }

  return null;
}

async function deleteImportArtifactsForJob(ctx: any, jobId: any) {
  let reportsDeleted = 0;
  let findingsDeleted = 0;
  let reportBatch;
  let findingBatch;

  do {
    reportBatch = await ctx.db
      .query("wordpressSyncReports")
      .withIndex("by_job", (q: any) => q.eq("jobId", jobId))
      .take(ARTIFACT_DELETE_BATCH_SIZE);

    for (const report of reportBatch) {
      await ctx.db.delete(report._id);
      reportsDeleted++;
    }
  } while (reportBatch.length === ARTIFACT_DELETE_BATCH_SIZE);

  do {
    findingBatch = await ctx.db
      .query("wordpressSyncReconciliationFindings")
      .withIndex("by_job_created", (q: any) => q.eq("jobId", jobId))
      .take(ARTIFACT_DELETE_BATCH_SIZE);

    for (const finding of findingBatch) {
      await ctx.db.delete(finding._id);
      findingsDeleted++;
    }
  } while (findingBatch.length === ARTIFACT_DELETE_BATCH_SIZE);

  return { reportsDeleted, findingsDeleted };
}

async function deleteImportArtifactsForSite(ctx: any, siteId: any) {
  let reportsDeleted = 0;
  let findingsDeleted = 0;
  let reportBatch;
  let findingBatch;

  do {
    reportBatch = await ctx.db
      .query("wordpressSyncReports")
      .withIndex("by_site_created", (q: any) => q.eq("siteId", siteId))
      .take(ARTIFACT_DELETE_BATCH_SIZE);

    for (const report of reportBatch) {
      await ctx.db.delete(report._id);
      reportsDeleted++;
    }
  } while (reportBatch.length === ARTIFACT_DELETE_BATCH_SIZE);

  do {
    findingBatch = await ctx.db
      .query("wordpressSyncReconciliationFindings")
      .withIndex("by_site_created", (q: any) => q.eq("siteId", siteId))
      .take(ARTIFACT_DELETE_BATCH_SIZE);

    for (const finding of findingBatch) {
      await ctx.db.delete(finding._id);
      findingsDeleted++;
    }
  } while (findingBatch.length === ARTIFACT_DELETE_BATCH_SIZE);

  return { reportsDeleted, findingsDeleted };
}

async function encryptWpSyncSecret(secret: string): Promise<string> {
  if (!WP_ENCRYPTION_KEY) {
    throw new ConvexError("WP_SYNC_ENCRYPTION_KEY must be configured before storing WordPress or WooCommerce credentials");
  }

  return await encryptSecret(secret.trim(), WP_ENCRYPTION_KEY);
}

// ─── Site Mutations ────────────────────────────────────────────────────────

/**
 * Create a new WordPress site connection.
 *
 * The application password is encrypted with AES-256-GCM before storage.
 * Requires the WP_SYNC_ENCRYPTION_KEY environment variable to be set.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createSite = mutation({
  args: {
    name: v.string(),
    siteUrl: v.string(),
    username: v.string(),
    applicationPassword: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    wooConsumerKey: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    wooConsumerSecret: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    wooAuthMode: v.optional(v.union(v.literal("shared"), v.literal("separate"))),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    userPasswordExportPath: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    userPasswordExportSecret: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, { name, siteUrl, username, applicationPassword, wooConsumerKey, wooConsumerSecret, wooAuthMode, userPasswordExportPath, userPasswordExportSecret }) => {
    const user = await requireCan(ctx, "manage_options");

    // Validate inputs
    if (!name.trim()) {
      throw new ConvexError("Site name is required");
    }

    const urlValidation = validateSiteUrl(siteUrl);
    if (!urlValidation.valid) {
      throw new ConvexError(urlValidation.error || "Invalid site URL");
    }

    if (!username.trim()) {
      throw new ConvexError("Username is required");
    }

    if (!applicationPassword.trim()) {
      throw new ConvexError("Application password is required");
    }

    // Normalize the URL
    const normalizedUrl = normalizeSiteUrl(siteUrl);

    // Check for existing site with same URL
    const existing = await ctx.db
      .query("wordpressSites")
      .withIndex("by_url", (q: ConvexQueryBuilder) => q.eq("siteUrl", normalizedUrl))
      .first();

    if (existing) {
      throw new ConvexError("A site with this URL already exists");
    }

    // Encrypt the application password
    const encryptedPassword = await encryptWpSyncSecret(applicationPassword);

    // Encrypt WooCommerce credentials if provided
    let encryptedWooKey: string | undefined;
    let encryptedWooSecret: string | undefined;
    if (wooConsumerKey?.trim()) {
      encryptedWooKey = await encryptWpSyncSecret(wooConsumerKey);
    }
    if (wooConsumerSecret?.trim()) {
      encryptedWooSecret = await encryptWpSyncSecret(wooConsumerSecret);
    }
    const normalizedUserPasswordExportPath = userPasswordExportPath?.trim() || undefined;
    const encryptedUserPasswordExportSecret = userPasswordExportSecret?.trim()
      ? await encryptWpSyncSecret(userPasswordExportSecret)
      : undefined;

    const now = Date.now();

    // Create the site record
    const siteId = await ctx.db.insert("wordpressSites", {
      name: name.trim(),
      siteUrl: normalizedUrl,
      username: username.trim(),
      applicationPassword: encryptedPassword,
      wooConsumerKey: encryptedWooKey,
      wooConsumerSecret: encryptedWooSecret,
      wooAuthMode: wooAuthMode ?? "shared",
      userPasswordExportPath: normalizedUserPasswordExportPath,
      userPasswordExportSecret: encryptedUserPasswordExportSecret,
      status: "inactive", // Will be set to active after successful connection test
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return siteId;
  },
});

/**
 * Update a WordPress site connection.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateSite = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    siteId: v.id("wordpressSites"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    name: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    username: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    applicationPassword: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    status: v.optional(siteStatusValidator),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    wooConsumerKey: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    wooConsumerSecret: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    wooAuthMode: v.optional(v.union(v.literal("shared"), v.literal("separate"))),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    userPasswordExportPath: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    userPasswordExportSecret: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, { siteId, name, username, applicationPassword, status, wooConsumerKey, wooConsumerSecret, wooAuthMode, userPasswordExportPath, userPasswordExportSecret }) => {
    await requireCan(ctx, "manage_options");

    const site = await ctx.db.get(siteId);
    if (!site) {
      throw new ConvexError("Site not found");
    }

    const updates: Partial<typeof site> = {
      updatedAt: Date.now(),
    };

    if (name !== undefined) {
      if (!name.trim()) {
        throw new ConvexError("Site name cannot be empty");
      }
      updates.name = name.trim();
    }

    if (username !== undefined) {
      if (!username.trim()) {
        throw new ConvexError("Username cannot be empty");
      }
      updates.username = username.trim();
    }

    if (applicationPassword !== undefined) {
      if (!applicationPassword.trim()) {
        throw new ConvexError("Application password cannot be empty");
      }
      updates.applicationPassword = await encryptWpSyncSecret(applicationPassword);
    }

    if (status !== undefined) {
      updates.status = status;
    }

    if (wooConsumerKey !== undefined) {
      if (wooConsumerKey.trim()) {
        updates.wooConsumerKey = await encryptWpSyncSecret(wooConsumerKey);
      } else {
        // Allow clearing the key by passing empty string
        updates.wooConsumerKey = undefined;
      }
    }

    if (wooConsumerSecret !== undefined) {
      if (wooConsumerSecret.trim()) {
        updates.wooConsumerSecret = await encryptWpSyncSecret(wooConsumerSecret);
      } else {
        updates.wooConsumerSecret = undefined;
      }
    }

    if (wooAuthMode !== undefined) {
      updates.wooAuthMode = wooAuthMode;
    }

    if (userPasswordExportPath !== undefined) {
      const trimmedPath = userPasswordExportPath.trim();
      updates.userPasswordExportPath = trimmedPath || undefined;
      if (!trimmedPath) {
        updates.userPasswordExportSecret = undefined;
      }
    }

    if (userPasswordExportSecret !== undefined) {
      const trimmedSecret = userPasswordExportSecret.trim();
      updates.userPasswordExportSecret = trimmedSecret
        ? await encryptWpSyncSecret(trimmedSecret)
        : undefined;
    }

    await ctx.db.patch(siteId, updates);
    return siteId;
  },
});

/**
 * Delete a WordPress site connection.
 * Also deletes all associated jobs and mappings.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deleteSite = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    siteId: v.id("wordpressSites"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, { siteId }) => {
    await requireCan(ctx, "manage_options");

    const site = await ctx.db.get(siteId);
    if (!site) {
      throw new ConvexError("Site not found");
    }

    const activeJob = await findActiveJobForSite(ctx, siteId);
    if (activeJob) {
      throw new ConvexError("Cannot delete site with an active sync job. Cancel the job first.");
    }

    const artifactsDeleted = await deleteImportArtifactsForSite(ctx, siteId);

    // Delete all jobs for this site (batched to avoid memory issues)
    const DELETE_BATCH_SIZE = 500;
    let jobsDeleted = 0;
    let jobBatch;

    do {
      jobBatch = await ctx.db
        .query("wordpressSyncJobs")
        .withIndex("by_site_created", (q: ConvexQueryBuilder) => q.eq("siteId", siteId))
        .take(DELETE_BATCH_SIZE);

      for (const job of jobBatch) {
        await ctx.db.delete(job._id);
        jobsDeleted++;
      }
    } while (jobBatch.length === DELETE_BATCH_SIZE);

    // Delete all mappings for this site (batched to avoid memory issues)
    let mappingsDeleted = 0;
    let mappingBatch;

    do {
      mappingBatch = await ctx.db
        .query("wpIdMappings")
        .withIndex("by_site", (q: ConvexQueryBuilder) => q.eq("siteId", siteId))
        .take(DELETE_BATCH_SIZE);

      for (const mapping of mappingBatch) {
        await ctx.db.delete(mapping._id);
        mappingsDeleted++;
      }
    } while (mappingBatch.length === DELETE_BATCH_SIZE);

    // Delete the site
    await ctx.db.delete(siteId);

    return { deleted: true, jobsDeleted, mappingsDeleted, ...artifactsDeleted };
  },
});

/**
 * Update site connection test result.
 * Called after testing the connection to update metadata.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateConnectionTest = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    siteId: v.id("wordpressSites"),
    success: v.boolean(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    wpVersion: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    siteName: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    siteDescription: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    error: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    capabilities: v.optional(v.any()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, { siteId, success, wpVersion, siteName, siteDescription, error, capabilities }) => {
    await requireCan(ctx, "manage_options");

    const site = await ctx.db.get(siteId);
    if (!site) {
      throw new ConvexError("Site not found");
    }

    const updates: Partial<typeof site> = {
      lastConnectionTest: Date.now(),
      updatedAt: Date.now(),
    };

    if (success) {
      updates.status = "active";
      updates.connectionError = undefined;
      if (wpVersion) updates.wpVersion = wpVersion;
      if (siteName) updates.siteName = siteName;
      if (siteDescription) updates.siteDescription = siteDescription;
      if (capabilities) updates.capabilities = capabilities;
    } else {
      updates.status = "error";
      updates.connectionError = error || "Connection failed";
    }

    await ctx.db.patch(siteId, updates);
    return siteId;
  },
});

// ─── Job Mutations ─────────────────────────────────────────────────────────

/**
 * Create a new sync job for a site.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createJob = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    siteId: v.id("wordpressSites"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    importConfig: v.optional(v.any()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, { siteId, importConfig }) => {
    const user = await requireCan(ctx, "manage_options");

    const site = await ctx.db.get(siteId);
    if (!site) {
      throw new ConvexError("Site not found");
    }

    // Check for existing active jobs
    const existingJob = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site", (q: ConvexQueryBuilder) => q.eq("siteId", siteId).eq("status", "running"))
      .first();

    if (existingJob) {
      throw new ConvexError("A sync job is already running for this site");
    }

    const pendingJob = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site", (q: ConvexQueryBuilder) => q.eq("siteId", siteId).eq("status", "pending"))
      .first();

    if (pendingJob) {
      throw new ConvexError("A sync job is already pending for this site");
    }

    const pausedJob = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site", (q: ConvexQueryBuilder) => q.eq("siteId", siteId).eq("status", "paused"))
      .first();

    if (pausedJob) {
      throw new ConvexError("A sync job is paused for this site. Resume or cancel it first.");
    }

    const now = Date.now();
    const normalizedImportConfig = normalizeImportConfig(importConfig);

    // Create the job
    const jobId = await ctx.db.insert("wordpressSyncJobs", {
      siteId,
      status: "pending",
      currentPhase: "users",
      progress: createInitialProgress(),
      importConfig: normalizedImportConfig,
      errors: [],
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return jobId;
  },
});

/**
 * Start a pending sync job.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const startJob = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    jobId: v.id("wordpressSyncJobs"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, { jobId }) => {
    await requireCan(ctx, "manage_options");

    const job = await ctx.db.get(jobId);
    if (!job) {
      throw new ConvexError("Job not found");
    }

    if (job.status !== "pending" && job.status !== "paused") {
      throw new ConvexError(`Cannot start job in ${job.status} status`);
    }

    await ctx.db.patch(jobId, {
      status: "running",
      startedAt: job.startedAt || Date.now(),
      pausedAt: undefined,
      updatedAt: Date.now(),
    });

    return jobId;
  },
});

/**
 * Pause a running sync job.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const pauseJob = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    jobId: v.id("wordpressSyncJobs"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, { jobId }) => {
    await requireCan(ctx, "manage_options");

    const job = await ctx.db.get(jobId);
    if (!job) {
      throw new ConvexError("Job not found");
    }

    if (job.status !== "running") {
      throw new ConvexError(`Cannot pause job in ${job.status} status`);
    }

    await ctx.db.patch(jobId, {
      status: "paused",
      pausedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return jobId;
  },
});

/**
 * Cancel a sync job.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const cancelJob = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    jobId: v.id("wordpressSyncJobs"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, { jobId }) => {
    await requireCan(ctx, "manage_options");

    const job = await ctx.db.get(jobId);
    if (!job) {
      throw new ConvexError("Job not found");
    }

    if (job.status === "completed" || job.status === "cancelled") {
      throw new ConvexError(`Cannot cancel job in ${job.status} status`);
    }

    const now = Date.now();

    await ctx.db.patch(jobId, {
      status: "cancelled",
      completedAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.generateFinalReport, { jobId });

    return jobId;
  },
});

/**
 * Delete a sync job.
 * Only allowed for completed, failed, or cancelled jobs.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deleteJob = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    jobId: v.id("wordpressSyncJobs"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, { jobId }) => {
    await requireCan(ctx, "manage_options");

    const job = await ctx.db.get(jobId);
    if (!job) {
      throw new ConvexError("Job not found");
    }

    if (job.status === "running" || job.status === "pending" || job.status === "paused") {
      throw new ConvexError("Cannot delete an active job. Cancel it first.");
    }

    const artifactsDeleted = await deleteImportArtifactsForJob(ctx, jobId);

    await ctx.db.delete(jobId);
    return { deleted: true, ...artifactsDeleted };
  },
});

// ─── Mapping Mutations ─────────────────────────────────────────────────────

/**
 * Clear all import mappings for a site.
 * Use this before re-importing to start fresh.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const clearMappings = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    siteId: v.id("wordpressSites"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, { siteId }) => {
    await requireCan(ctx, "manage_options");

    const site = await ctx.db.get(siteId);
    if (!site) {
      throw new ConvexError("Site not found");
    }

    const activeJob = await findActiveJobForSite(ctx, siteId);
    if (activeJob) {
      throw new ConvexError("Cannot clear mappings while a sync job is active");
    }

    // Delete all mappings (batched to avoid memory issues)
    const DELETE_BATCH_SIZE = 500;
    let cleared = 0;
    let batch;

    do {
      batch = await ctx.db
        .query("wpIdMappings")
        .withIndex("by_site", (q: ConvexQueryBuilder) => q.eq("siteId", siteId))
        .take(DELETE_BATCH_SIZE);

      for (const mapping of batch) {
        await ctx.db.delete(mapping._id);
        cleared++;
      }
    } while (batch.length === DELETE_BATCH_SIZE);

    return { cleared };
  },
});
