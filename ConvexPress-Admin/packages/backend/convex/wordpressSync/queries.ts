/**
 * WordPress Sync System - Queries
 *
 * Public queries for listing and viewing WordPress sites and sync jobs.
 * All queries require Administrator capability (manage_options).
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireCan } from "../helpers/permissions";
import type { Doc } from "../_generated/dataModel";

// ─── Site Queries ──────────────────────────────────────────────────────────

/**
 * List all WordPress sites.
 * Returns sites without the encrypted application password.
 * Includes activeJob flag for each site.
 */
export const listSites = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 50 }) => {
    await requireCan(ctx, "manage_options");

    // Use take() with a reasonable limit to prevent unbounded queries
    const sites = await ctx.db
      .query("wordpressSites")
      .order("desc")
      .take(Math.min(limit, 100)); // Cap at 100 max

    // Get active jobs for all sites (bounded)
    const activeJobs = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(100);

    const pausedJobs = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_status", (q) => q.eq("status", "paused"))
      .take(100);

    const activeJobSiteIds = new Set([
      ...activeJobs.map((j) => j.siteId),
      ...pausedJobs.map((j) => j.siteId),
    ]);

    // Strip sensitive fields and add activeJob flag
    return sites.map((site) => ({
      _id: site._id,
      name: site.name,
      siteUrl: site.siteUrl,
      username: site.username,
      status: site.status,
      lastConnectionTest: site.lastConnectionTest,
      lastSyncAt: site.lastSyncAt,
      connectionError: site.connectionError,
      wpVersion: site.wpVersion,
      siteName: site.siteName,
      siteDescription: site.siteDescription,
      capabilities: site.capabilities,
      hasWooCredentials: Boolean(site.wooConsumerKey),
      wooAuthMode: site.wooAuthMode,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
      activeJob: activeJobSiteIds.has(site._id),
      // Don't include applicationPassword, wooConsumerKey, or wooConsumerSecret
    }));
  },
});

/**
 * Get a single WordPress site by ID.
 */
export const getSite = query({
  args: {
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { siteId }) => {
    await requireCan(ctx, "manage_options");

    const site = await ctx.db.get(siteId);
    if (!site) return null;

    // Strip sensitive fields
    return {
      _id: site._id,
      name: site.name,
      siteUrl: site.siteUrl,
      username: site.username,
      status: site.status,
      lastConnectionTest: site.lastConnectionTest,
      lastSyncAt: site.lastSyncAt,
      connectionError: site.connectionError,
      wpVersion: site.wpVersion,
      siteName: site.siteName,
      siteDescription: site.siteDescription,
      capabilities: site.capabilities,
      hasWooCredentials: Boolean(site.wooConsumerKey),
      wooAuthMode: site.wooAuthMode,
      createdBy: site.createdBy,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
    };
  },
});

// ─── Job Queries ───────────────────────────────────────────────────────────

/**
 * List sync jobs for a site.
 */
export const listJobs = query({
  args: {
    siteId: v.id("wordpressSites"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { siteId, limit = 10 }) => {
    await requireCan(ctx, "manage_options");

    const jobs = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site_created", (q) => q.eq("siteId", siteId))
      .order("desc")
      .take(limit);

    return jobs;
  },
});

/**
 * Get a single sync job by ID.
 */
export const getJob = query({
  args: {
    jobId: v.id("wordpressSyncJobs"),
  },
  handler: async (ctx, { jobId }) => {
    await requireCan(ctx, "manage_options");

    return await ctx.db.get(jobId);
  },
});

/**
 * Get the currently active job for a site (running, paused, or pending).
 */
export const getActiveJob = query({
  args: {
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { siteId }) => {
    await requireCan(ctx, "manage_options");

    // Check for running jobs first
    const runningJob = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site", (q) => q.eq("siteId", siteId).eq("status", "running"))
      .first();

    if (runningJob) return runningJob;

    // Check for paused jobs
    const pausedJob = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site", (q) => q.eq("siteId", siteId).eq("status", "paused"))
      .first();

    if (pausedJob) return pausedJob;

    // Check for pending jobs
    return await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site", (q) => q.eq("siteId", siteId).eq("status", "pending"))
      .first();
  },
});

/**
 * Get the most recent job for a site.
 */
export const getLatestJob = query({
  args: {
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { siteId }) => {
    await requireCan(ctx, "manage_options");

    return await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site_created", (q) => q.eq("siteId", siteId))
      .order("desc")
      .first();
  },
});

// ─── Mapping Queries ───────────────────────────────────────────────────────

/**
 * Get import statistics for a site.
 */
export const getImportStats = query({
  args: {
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { siteId }) => {
    await requireCan(ctx, "manage_options");

    // Get stats from the latest completed job instead of counting mappings
    // This avoids loading potentially 100k+ mapping records
    const latestJob = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site_created", (q) => q.eq("siteId", siteId))
      .order("desc")
      .first();

    if (latestJob && latestJob.status === "completed") {
      const progress = latestJob.progress;
      return {
        total:
          progress.posts.imported +
          progress.pages.imported +
          progress.media.imported +
          progress.users.imported +
          progress.categories.imported +
          progress.tags.imported +
          progress.comments.imported +
          progress.menus.imported,
        posts: progress.posts.imported,
        pages: progress.pages.imported,
        media: progress.media.imported,
        users: progress.users.imported,
        categories: progress.categories.imported,
        tags: progress.tags.imported,
        comments: progress.comments.imported,
        menus: progress.menus.imported,
        fromJob: true,
        jobId: latestJob._id,
      };
    }

    // Fallback: sample mappings if no completed job exists
    // This handles cases where imports were done before job tracking
    const SAMPLE_LIMIT = 10000;
    const mappings = await ctx.db
      .query("wpIdMappings")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .take(SAMPLE_LIMIT + 1);

    const counts: Record<string, number> = {};
    for (const mapping of mappings.slice(0, SAMPLE_LIMIT)) {
      counts[mapping.objectType] = (counts[mapping.objectType] || 0) + 1;
    }

    const isApproximate = mappings.length > SAMPLE_LIMIT;

    return {
      total: isApproximate ? SAMPLE_LIMIT : mappings.length,
      posts: counts.post || 0,
      pages: counts.page || 0,
      media: counts.media || 0,
      users: counts.user || 0,
      categories: counts.category || 0,
      tags: counts.tag || 0,
      comments: counts.comment || 0,
      menus: (counts.menu || 0) + (counts.menuItem || 0),
      isApproximate,
      fromJob: false,
    };
  },
});

// ─── Dashboard Queries ─────────────────────────────────────────────────────

/**
 * Get an overview of all WordPress sync activity.
 */
export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");

    // Sites are typically few, but still use a reasonable limit
    const sites = await ctx.db.query("wordpressSites").take(100);

    // Count sites by status
    let activeSites = 0;
    let lastSyncAt: number | undefined;
    let lastSyncSite: string | undefined;

    for (const site of sites) {
      if (site.status === "active") activeSites++;
      if (site.lastSyncAt && (!lastSyncAt || site.lastSyncAt > lastSyncAt)) {
        lastSyncAt = site.lastSyncAt;
        lastSyncSite = site.name;
      }
    }

    // Get active jobs (running or paused) - bounded queries
    const runningJobs = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(100);

    const pausedJobs = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_status", (q) => q.eq("status", "paused"))
      .take(100);

    const activeJobs = runningJobs.length + pausedJobs.length;

    // Count total imported items (bounded to avoid memory issues)
    // We sample up to 10,000 records - for exact counts on large datasets,
    // use getImportStats per site instead
    const SAMPLE_LIMIT = 10000;
    const mappingSample = await ctx.db
      .query("wpIdMappings")
      .take(SAMPLE_LIMIT + 1);

    const totalImported = mappingSample.length;
    const totalImportedIsApproximate = mappingSample.length > SAMPLE_LIMIT;

    return {
      totalSites: sites.length,
      activeSites,
      activeJobs,
      totalImported: totalImportedIsApproximate ? SAMPLE_LIMIT : totalImported,
      totalImportedIsApproximate,
      lastSyncAt,
      lastSyncSite,
    };
  },
});

// ─── Error Queries ─────────────────────────────────────────────────────────

/**
 * Get errors from a sync job.
 */
export const getJobErrors = query({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, { jobId, limit = 50, offset = 0 }) => {
    await requireCan(ctx, "manage_options");

    const job = await ctx.db.get(jobId);
    if (!job) return { errors: [], total: 0 };

    const allErrors = job.errors || [];
    const paginatedErrors = allErrors.slice(offset, offset + limit);

    return {
      errors: paginatedErrors,
      total: allErrors.length,
    };
  },
});

// ─── Report Queries ──────────────────────────────────────────────────────

/**
 * Get the latest sync report for a site.
 */
export const getLatestReport = query({
  args: { siteId: v.id("wordpressSites") },
  handler: async (ctx, { siteId }) => {
    await requireCan(ctx, "manage_options");
    return await ctx.db
      .query("wordpressSyncReports")
      .withIndex("by_site_created", (q) => q.eq("siteId", siteId))
      .order("desc")
      .first();
  },
});

/**
 * Get the report for a specific sync job.
 */
export const getJobReport = query({
  args: { jobId: v.id("wordpressSyncJobs") },
  handler: async (ctx, { jobId }) => {
    await requireCan(ctx, "manage_options");
    return await ctx.db
      .query("wordpressSyncReports")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .first();
  },
});

/**
 * List sync reports for a site, most recent first.
 */
export const listReports = query({
  args: {
    siteId: v.id("wordpressSites"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { siteId, limit = 20 }) => {
    await requireCan(ctx, "manage_options");
    return await ctx.db
      .query("wordpressSyncReports")
      .withIndex("by_site_created", (q) => q.eq("siteId", siteId))
      .order("desc")
      .take(Math.min(limit, 50));
  },
});

// ─── Findings Queries ────────────────────────────────────────────────────

/**
 * List reconciliation findings for a job, with optional filtering
 * by severity or finding code.
 */
export const listFindings = query({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    severity: v.optional(v.union(v.literal("error"), v.literal("warning"), v.literal("info"))),
    code: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { jobId, severity, code, limit = 50 }) => {
    await requireCan(ctx, "manage_options");

    let q;
    if (severity) {
      q = ctx.db
        .query("wordpressSyncReconciliationFindings")
        .withIndex("by_job_severity", (q) => q.eq("jobId", jobId).eq("severity", severity));
    } else if (code) {
      q = ctx.db
        .query("wordpressSyncReconciliationFindings")
        .withIndex("by_job_code", (q) => q.eq("jobId", jobId).eq("code", code));
    } else {
      q = ctx.db
        .query("wordpressSyncReconciliationFindings")
        .withIndex("by_job_created", (q) => q.eq("jobId", jobId));
    }

    return await q.take(Math.min(limit, 100));
  },
});
