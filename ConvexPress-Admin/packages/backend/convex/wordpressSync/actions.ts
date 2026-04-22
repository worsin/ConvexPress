/**
 * WordPress Sync System - Actions
 *
 * Public actions for triggering sync operations.
 * Actions can make external HTTP calls (to WordPress API).
 */

import { action } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { internal, api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { testConnection, getContentCounts } from "./helpers/wpClient";
import { decryptSecret } from "../api/crypto_helpers";
import { WPAdapter } from "./helpers/adapters/wpAdapter";
import { WooAdapter } from "./helpers/adapters/wooAdapter";

// Environment variable for decrypting application passwords
const WP_ENCRYPTION_KEY = process.env.WP_SYNC_ENCRYPTION_KEY;

/**
 * Helper to decrypt application password if encrypted.
 */
async function decryptStoredSecret(secret: string | undefined): Promise<string | undefined> {
  if (!secret) return undefined;
  if (WP_ENCRYPTION_KEY && secret.includes(":")) {
    // Encrypted format is "iv:authTag:ciphertext"
    try {
      return await decryptSecret(secret, WP_ENCRYPTION_KEY);
    } catch (error) {
      console.warn("[WP Sync] Failed to decrypt stored secret, using as-is");
      return secret;
    }
  }
  return secret;
}

async function decryptPassword(encryptedPassword: string): Promise<string> {
  return (await decryptStoredSecret(encryptedPassword)) ?? encryptedPassword;
}

// ─── Site Actions ──────────────────────────────────────────────────────────

/**
 * Test connection to a WordPress site.
 * Makes an HTTP request to the WordPress REST API.
 * Can be called with siteId (to test an existing site) or with credentials directly.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const testSiteConnection = action({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    siteId: v.optional(v.id("wordpressSites")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    siteUrl: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    username: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    applicationPassword: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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

    // Build full capabilities object with defaults for fields not yet probed
    let fullCapabilities = result.success
      ? {
          wpRest: true,
          wpAuthValid: true, // We got here, so auth is valid
          wooAuthValid: false, // Will be probed separately later
          menusApi: false, // Will be detected during first meta fetch
          woocommerceApi: false, // Will be detected during first meta fetch
          customMetaEndpointConfigured: false,
          customMetaEndpointDetected: false,
          elementorDetected: false, // Will be detected during first meta fetch
          mediaAccessible: true, // Assume true if we can reach the API
        }
      : undefined;

    // If testing an existing site with a successful connection, do a deeper capability probe
    if (args.siteId && result.success && fullCapabilities) {
      try {
        // Fetch the site record to get metaEndpointPath
        const site = await ctx.runQuery(
          internal.wordpressSync.internals.getSiteWithCredentials,
          { siteId: args.siteId },
        );

        const metaEndpointPath = site?.metaEndpointPath;
        const wooKey = await decryptStoredSecret(site?.wooConsumerKey);
        const wooSecret = await decryptStoredSecret(site?.wooConsumerSecret);
        const wooAuthMode = (site?.wooAuthMode ?? "shared") as "shared" | "separate";

        const adapterConfig = {
          siteUrl: credentials.siteUrl,
          username: credentials.username,
          password: credentials.applicationPassword,
          wooAuthMode,
          wooKey,
          wooSecret,
          metaEndpointPath: metaEndpointPath,
        };

        const wpAdapter = new WPAdapter(adapterConfig);
        const fullCaps = await wpAdapter.detectCapabilitiesFull(result.siteInfo);

        // If WooCommerce is detected, probe its authentication
        if (fullCaps.woocommerceApi) {
          try {
            const wooAdapter = new WooAdapter(adapterConfig);
            const wooProbe = await wooAdapter.probe();
            fullCaps.wooAuthValid = wooProbe.authenticated;
          } catch {
            /* non-critical — WooCommerce auth probe is best-effort */
          }
        }

        // Use the deep probe results instead of defaults
        fullCapabilities = fullCaps;
      } catch {
        // Fall back to basic capabilities on any failure
      }
    }

    // Update the site with test results if we have a siteId
    if (args.siteId) {
      await ctx.runMutation(api.wordpressSync.mutations.updateConnectionTest, {
        siteId: args.siteId,
        success: result.success,
        wpVersion: result.success ? extractWPVersion(result.siteInfo) : undefined,
        siteName: result.success ? result.siteInfo.name : undefined,
        siteDescription: result.success ? result.siteInfo.description : undefined,
        error: result.success ? undefined : result.error,
        capabilities: fullCapabilities,
      });
    }

    return {
      ...result,
      capabilities: fullCapabilities,
    };
  },
});

/**
 * Get content counts from a WordPress site.
 * Useful for showing what will be imported before starting.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getWPContentCounts = action({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    siteId: v.id("wordpressSites"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const startSync = action({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    siteId: v.id("wordpressSites"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    importConfig: v.optional(v.any()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, { siteId, importConfig }) => {
    // Check if there's already an active job
    const activeJob = await ctx.runQuery(api.wordpressSync.queries.getActiveJob, {
      siteId,
    });

    let jobId: Id<"wordpressSyncJobs">;

    if (activeJob) {
      if (activeJob.status === "running") {
        throw new ConvexError("An import is already running for this site");
      }
      if (activeJob.status === "paused") {
        throw new ConvexError("A paused import already exists. Resume or cancel it before starting a new import.");
      }
      if (activeJob.status === "pending") {
        throw new ConvexError("A pending import already exists. Cancel it before starting a new import.");
      }
    }

    // Create a new job so the submitted importConfig is snapshotted for this run.
    jobId = await ctx.runMutation(api.wordpressSync.mutations.createJob, {
      siteId,
      importConfig: importConfig ?? undefined,
    });

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

    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return jobId;
  },
});

/**
 * Resume a paused sync job.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const resumeSync = action({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    jobId: v.id("wordpressSyncJobs"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
