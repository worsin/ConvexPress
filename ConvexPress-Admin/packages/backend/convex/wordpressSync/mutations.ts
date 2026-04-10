/**
 * WordPress Sync System - Mutations
 *
 * Public mutations for managing WordPress sites and sync jobs.
 * All mutations require Administrator capability (manage_options).
 */

import { mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { requireCan } from "../helpers/permissions";
import { encryptSecret } from "../api/crypto_helpers";
import {
  siteStatusValidator,
  createInitialProgress,
  normalizeSiteUrl,
  validateSiteUrl,
} from "./validators";

// Environment variable for encrypting application passwords
const WP_ENCRYPTION_KEY = process.env.WP_SYNC_ENCRYPTION_KEY;

// ─── Site Mutations ────────────────────────────────────────────────────────

/**
 * Create a new WordPress site connection.
 *
 * The application password is encrypted with AES-256-GCM before storage.
 * Requires the WP_SYNC_ENCRYPTION_KEY environment variable to be set.
 */
export const createSite = mutation({
  args: {
    name: v.string(),
    siteUrl: v.string(),
    username: v.string(),
    applicationPassword: v.string(),
    wooConsumerKey: v.optional(v.string()),
    wooConsumerSecret: v.optional(v.string()),
    wooAuthMode: v.optional(v.union(v.literal("shared"), v.literal("separate"))),
  },
  handler: async (ctx, { name, siteUrl, username, applicationPassword, wooConsumerKey, wooConsumerSecret, wooAuthMode }) => {
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
      .withIndex("by_url", (q) => q.eq("siteUrl", normalizedUrl))
      .first();

    if (existing) {
      throw new ConvexError("A site with this URL already exists");
    }

    // Encrypt the application password
    let encryptedPassword: string;
    if (WP_ENCRYPTION_KEY) {
      encryptedPassword = await encryptSecret(applicationPassword.trim(), WP_ENCRYPTION_KEY);
    } else {
      // Fallback: store as-is if encryption key not configured (dev mode)
      // In production, this should throw an error
      console.warn("[WP Sync] WP_SYNC_ENCRYPTION_KEY not set - storing password unencrypted");
      encryptedPassword = applicationPassword.trim();
    }

    // Encrypt WooCommerce credentials if provided
    let encryptedWooKey: string | undefined;
    let encryptedWooSecret: string | undefined;
    if (wooConsumerKey?.trim()) {
      if (WP_ENCRYPTION_KEY) {
        encryptedWooKey = await encryptSecret(wooConsumerKey.trim(), WP_ENCRYPTION_KEY);
      } else {
        console.warn("[WP Sync] WP_SYNC_ENCRYPTION_KEY not set - storing Woo key unencrypted");
        encryptedWooKey = wooConsumerKey.trim();
      }
    }
    if (wooConsumerSecret?.trim()) {
      if (WP_ENCRYPTION_KEY) {
        encryptedWooSecret = await encryptSecret(wooConsumerSecret.trim(), WP_ENCRYPTION_KEY);
      } else {
        console.warn("[WP Sync] WP_SYNC_ENCRYPTION_KEY not set - storing Woo secret unencrypted");
        encryptedWooSecret = wooConsumerSecret.trim();
      }
    }

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
export const updateSite = mutation({
  args: {
    siteId: v.id("wordpressSites"),
    name: v.optional(v.string()),
    username: v.optional(v.string()),
    applicationPassword: v.optional(v.string()),
    status: v.optional(siteStatusValidator),
    wooConsumerKey: v.optional(v.string()),
    wooConsumerSecret: v.optional(v.string()),
    wooAuthMode: v.optional(v.union(v.literal("shared"), v.literal("separate"))),
  },
  handler: async (ctx, { siteId, name, username, applicationPassword, status, wooConsumerKey, wooConsumerSecret, wooAuthMode }) => {
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
      // Encrypt the new password
      if (WP_ENCRYPTION_KEY) {
        updates.applicationPassword = await encryptSecret(applicationPassword.trim(), WP_ENCRYPTION_KEY);
      } else {
        console.warn("[WP Sync] WP_SYNC_ENCRYPTION_KEY not set - storing password unencrypted");
        updates.applicationPassword = applicationPassword.trim();
      }
    }

    if (status !== undefined) {
      updates.status = status;
    }

    if (wooConsumerKey !== undefined) {
      if (wooConsumerKey.trim()) {
        if (WP_ENCRYPTION_KEY) {
          updates.wooConsumerKey = await encryptSecret(wooConsumerKey.trim(), WP_ENCRYPTION_KEY);
        } else {
          console.warn("[WP Sync] WP_SYNC_ENCRYPTION_KEY not set - storing Woo key unencrypted");
          updates.wooConsumerKey = wooConsumerKey.trim();
        }
      } else {
        // Allow clearing the key by passing empty string
        updates.wooConsumerKey = undefined;
      }
    }

    if (wooConsumerSecret !== undefined) {
      if (wooConsumerSecret.trim()) {
        if (WP_ENCRYPTION_KEY) {
          updates.wooConsumerSecret = await encryptSecret(wooConsumerSecret.trim(), WP_ENCRYPTION_KEY);
        } else {
          console.warn("[WP Sync] WP_SYNC_ENCRYPTION_KEY not set - storing Woo secret unencrypted");
          updates.wooConsumerSecret = wooConsumerSecret.trim();
        }
      } else {
        updates.wooConsumerSecret = undefined;
      }
    }

    if (wooAuthMode !== undefined) {
      updates.wooAuthMode = wooAuthMode;
    }

    await ctx.db.patch(siteId, updates);
    return siteId;
  },
});

/**
 * Delete a WordPress site connection.
 * Also deletes all associated jobs and mappings.
 */
export const deleteSite = mutation({
  args: {
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { siteId }) => {
    await requireCan(ctx, "manage_options");

    const site = await ctx.db.get(siteId);
    if (!site) {
      throw new ConvexError("Site not found");
    }

    // Check for running jobs
    const runningJob = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site", (q) => q.eq("siteId", siteId).eq("status", "running"))
      .first();

    if (runningJob) {
      throw new ConvexError("Cannot delete site with a running sync job. Cancel the job first.");
    }

    // Delete all jobs for this site (batched to avoid memory issues)
    const DELETE_BATCH_SIZE = 500;
    let jobsDeleted = 0;
    let jobBatch;

    do {
      jobBatch = await ctx.db
        .query("wordpressSyncJobs")
        .withIndex("by_site_created", (q) => q.eq("siteId", siteId))
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
        .withIndex("by_site", (q) => q.eq("siteId", siteId))
        .take(DELETE_BATCH_SIZE);

      for (const mapping of mappingBatch) {
        await ctx.db.delete(mapping._id);
        mappingsDeleted++;
      }
    } while (mappingBatch.length === DELETE_BATCH_SIZE);

    // Delete the site
    await ctx.db.delete(siteId);

    return { deleted: true, jobsDeleted, mappingsDeleted };
  },
});

/**
 * Update site connection test result.
 * Called after testing the connection to update metadata.
 */
export const updateConnectionTest = mutation({
  args: {
    siteId: v.id("wordpressSites"),
    success: v.boolean(),
    wpVersion: v.optional(v.string()),
    siteName: v.optional(v.string()),
    siteDescription: v.optional(v.string()),
    error: v.optional(v.string()),
    capabilities: v.optional(v.any()),
  },
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
export const createJob = mutation({
  args: {
    siteId: v.id("wordpressSites"),
    importConfig: v.optional(v.any()),
  },
  handler: async (ctx, { siteId, importConfig }) => {
    const user = await requireCan(ctx, "manage_options");

    const site = await ctx.db.get(siteId);
    if (!site) {
      throw new ConvexError("Site not found");
    }

    // Check for existing running or pending jobs
    const existingJob = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site", (q) => q.eq("siteId", siteId).eq("status", "running"))
      .first();

    if (existingJob) {
      throw new ConvexError("A sync job is already running for this site");
    }

    const pendingJob = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site", (q) => q.eq("siteId", siteId).eq("status", "pending"))
      .first();

    if (pendingJob) {
      throw new ConvexError("A sync job is already pending for this site");
    }

    const now = Date.now();

    // Create the job
    const jobId = await ctx.db.insert("wordpressSyncJobs", {
      siteId,
      status: "pending",
      currentPhase: "users",
      progress: createInitialProgress(),
      importConfig: importConfig,
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
export const startJob = mutation({
  args: {
    jobId: v.id("wordpressSyncJobs"),
  },
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
export const pauseJob = mutation({
  args: {
    jobId: v.id("wordpressSyncJobs"),
  },
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
export const cancelJob = mutation({
  args: {
    jobId: v.id("wordpressSyncJobs"),
  },
  handler: async (ctx, { jobId }) => {
    await requireCan(ctx, "manage_options");

    const job = await ctx.db.get(jobId);
    if (!job) {
      throw new ConvexError("Job not found");
    }

    if (job.status === "completed" || job.status === "cancelled") {
      throw new ConvexError(`Cannot cancel job in ${job.status} status`);
    }

    await ctx.db.patch(jobId, {
      status: "cancelled",
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return jobId;
  },
});

/**
 * Delete a sync job.
 * Only allowed for completed, failed, or cancelled jobs.
 */
export const deleteJob = mutation({
  args: {
    jobId: v.id("wordpressSyncJobs"),
  },
  handler: async (ctx, { jobId }) => {
    await requireCan(ctx, "manage_options");

    const job = await ctx.db.get(jobId);
    if (!job) {
      throw new ConvexError("Job not found");
    }

    if (job.status === "running" || job.status === "pending") {
      throw new ConvexError("Cannot delete an active job. Cancel it first.");
    }

    await ctx.db.delete(jobId);
    return { deleted: true };
  },
});

// ─── Mapping Mutations ─────────────────────────────────────────────────────

/**
 * Clear all import mappings for a site.
 * Use this before re-importing to start fresh.
 */
export const clearMappings = mutation({
  args: {
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { siteId }) => {
    await requireCan(ctx, "manage_options");

    const site = await ctx.db.get(siteId);
    if (!site) {
      throw new ConvexError("Site not found");
    }

    // Check for running jobs
    const runningJob = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site", (q) => q.eq("siteId", siteId).eq("status", "running"))
      .first();

    if (runningJob) {
      throw new ConvexError("Cannot clear mappings while a sync job is running");
    }

    // Delete all mappings (batched to avoid memory issues)
    const DELETE_BATCH_SIZE = 500;
    let cleared = 0;
    let batch;

    do {
      batch = await ctx.db
        .query("wpIdMappings")
        .withIndex("by_site", (q) => q.eq("siteId", siteId))
        .take(DELETE_BATCH_SIZE);

      for (const mapping of batch) {
        await ctx.db.delete(mapping._id);
        cleared++;
      }
    } while (batch.length === DELETE_BATCH_SIZE);

    return { cleared };
  },
});
