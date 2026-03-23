/**
 * WordPress Sync System - Actions
 *
 * Public actions for triggering sync operations.
 * Actions can make external HTTP calls (to WordPress API).
 */

import { action } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { internal, api } from "../_generated/api";
import { testConnection, getContentCounts } from "./helpers/wpClient";
import { decryptSecret } from "../api/crypto_helpers";

// Environment variable for decrypting application passwords
const WP_ENCRYPTION_KEY = process.env.WP_SYNC_ENCRYPTION_KEY;

/**
 * Helper to decrypt application password if encrypted.
 */
async function decryptPassword(encryptedPassword: string): Promise<string> {
  if (WP_ENCRYPTION_KEY && encryptedPassword.includes(":")) {
    // Encrypted format is "iv:authTag:ciphertext"
    try {
      return await decryptSecret(encryptedPassword, WP_ENCRYPTION_KEY);
    } catch (error) {
      console.warn("[WP Sync] Failed to decrypt password, using as-is");
      return encryptedPassword;
    }
  }
  return encryptedPassword;
}

// ─── Site Actions ──────────────────────────────────────────────────────────

/**
 * Test connection to a WordPress site.
 * Makes an HTTP request to the WordPress REST API.
 * Can be called with siteId (to test an existing site) or with credentials directly.
 */
export const testSiteConnection = action({
  args: {
    siteId: v.optional(v.id("wordpressSites")),
    siteUrl: v.optional(v.string()),
    username: v.optional(v.string()),
    applicationPassword: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let credentials: { siteUrl: string; username: string; applicationPassword: string };

    if (args.siteId) {
      // Test existing site
      const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, {
        siteId: args.siteId,
      });

      if (!site) {
        throw new ConvexError("Site not found");
      }

      // Decrypt the password if it's encrypted
      const decryptedPassword = await decryptPassword(site.applicationPassword);

      credentials = {
        siteUrl: site.siteUrl,
        username: site.username,
        applicationPassword: decryptedPassword,
      };
    } else if (args.siteUrl && args.username && args.applicationPassword) {
      // Test new credentials directly
      credentials = {
        siteUrl: args.siteUrl,
        username: args.username,
        applicationPassword: args.applicationPassword,
      };
    } else {
      throw new ConvexError("Either siteId or siteUrl/username/applicationPassword required");
    }

    // Test the connection
    const result = await testConnection(credentials);

    // Update the site with test results if we have a siteId
    if (args.siteId) {
      await ctx.runMutation(api.wordpressSync.mutations.updateConnectionTest, {
        siteId: args.siteId,
        success: result.success,
        wpVersion: result.success ? extractWPVersion(result.siteInfo) : undefined,
        siteName: result.success ? result.siteInfo.name : undefined,
        siteDescription: result.success ? result.siteInfo.description : undefined,
        error: result.success ? undefined : result.error,
      });
    }

    return result;
  },
});

/**
 * Get content counts from a WordPress site.
 * Useful for showing what will be imported before starting.
 */
export const getWPContentCounts = action({
  args: {
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { siteId }) => {
    // Get site credentials
    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, {
      siteId,
    });

    if (!site) {
      throw new ConvexError("Site not found");
    }

    // Decrypt the password if encrypted
    const decryptedPassword = await decryptPassword(site.applicationPassword);

    // Get counts from WordPress
    const counts = await getContentCounts({
      siteUrl: site.siteUrl,
      username: site.username,
      applicationPassword: decryptedPassword,
    });

    return counts;
  },
});

/**
 * Start a sync job and begin processing.
 * Creates a job if none exists, then starts phase execution.
 */
export const startSync = action({
  args: {
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { siteId }) => {
    // Check if there's already an active job
    const activeJob = await ctx.runQuery(api.wordpressSync.queries.getActiveJob, {
      siteId,
    });

    let jobId: typeof activeJob._id;

    if (activeJob) {
      if (activeJob.status === "running") {
        throw new ConvexError("A sync job is already running");
      }
      jobId = activeJob._id;
    } else {
      // Create a new job
      jobId = await ctx.runMutation(api.wordpressSync.mutations.createJob, {
        siteId,
      });
    }

    // Start the job
    await ctx.runMutation(api.wordpressSync.mutations.startJob, {
      jobId,
    });

    // Initialize progress with content counts
    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, {
      siteId,
    });

    if (site) {
      try {
        // Decrypt the password if encrypted
        const decryptedPassword = await decryptPassword(site.applicationPassword);

        const counts = await getContentCounts({
          siteUrl: site.siteUrl,
          username: site.username,
          applicationPassword: decryptedPassword,
        });

        await ctx.runMutation(internal.wordpressSync.internals.initializeProgress, {
          jobId,
          counts,
        });
      } catch {
        // Continue even if counts fail - we'll get them during sync
      }
    }

    // Schedule the first phase
    await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.runSyncPhase, {
      jobId,
    });

    return jobId;
  },
});

/**
 * Resume a paused sync job.
 */
export const resumeSync = action({
  args: {
    jobId: v.id("wordpressSyncJobs"),
  },
  handler: async (ctx, { jobId }) => {
    // Get job to verify it's paused
    const job = await ctx.runQuery(api.wordpressSync.queries.getJob, { jobId });

    if (!job) {
      throw new ConvexError("Job not found");
    }

    if (job.status !== "paused") {
      throw new ConvexError(`Cannot resume job in ${job.status} status`);
    }

    // Resume the job
    await ctx.runMutation(api.wordpressSync.mutations.startJob, { jobId });

    // Continue processing
    await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.runSyncPhase, {
      jobId,
    });

    return jobId;
  },
});

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Extract WordPress version from site info.
 */
function extractWPVersion(siteInfo: {
  namespaces?: string[];
  authentication?: Record<string, unknown>;
}): string | undefined {
  // WordPress version is often embedded in the response
  // but not always directly accessible. Check namespaces for hints.
  if (siteInfo.namespaces?.includes("wp/v2")) {
    // WP 4.7+
    return "4.7+";
  }
  return undefined;
}
