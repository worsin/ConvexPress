/**
 * WordPress Sync - Users Import Phase
 *
 * Imports users from WordPress. Users are imported first because
 * posts, pages, and comments reference authors.
 *
 * WordPress users map to ConvexPress users with:
 *   - wpUserId preserved for reference
 *   - Email as unique identifier
 *   - Basic profile info (name, avatar)
 *   - Default Subscriber role (can be upgraded later)
 */

import { internalAction, internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { fetchWPUsers, type WPUser } from "../helpers/wpClient";
import type { PhaseResult } from "../internals";
import type { SyncError, PhaseProgress } from "../validators";
import { WP_BATCH_SIZE } from "../validators";

// ─── User Import Action ────────────────────────────────────────────────────

export const importBatch = internalAction({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { jobId, siteId }): Promise<PhaseResult> => {
    const errors: SyncError[] = [];

    // Get job and site
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, { siteId });

    if (!job || !site) {
      return {
        progress: { total: 0, imported: 0, failed: 0 },
        errors: [{ phase: "users", wpId: 0, message: "Job or site not found", timestamp: Date.now() }],
        hasMore: false,
      };
    }

    const progress: PhaseProgress = { ...job.progress.users };
    const cursor = progress.cursor || 0;
    const page = Math.floor(cursor / WP_BATCH_SIZE) + 1;

    // Fetch users from WordPress
    const { data: wpUsers, total } = await fetchWPUsers(
      {
        siteUrl: site.siteUrl,
        username: site.username,
        applicationPassword: site.applicationPassword,
      },
      page,
      WP_BATCH_SIZE
    );

    // Update total if not set
    if (progress.total === 0 && total > 0) {
      progress.total = total;
    }

    // Process each user
    for (const wpUser of wpUsers) {
      try {
        // Check if already imported
        const existingMapping = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getByWpId,
          { siteId, objectType: "user", wpId: wpUser.id }
        );

        if (existingMapping) {
          progress.imported++;
          continue;
        }

        // Create user
        const userId = await ctx.runMutation(internal.wordpressSync.phases.usersCreate, {
          wpUser: {
            id: wpUser.id,
            username: wpUser.username,
            name: wpUser.name,
            firstName: wpUser.first_name,
            lastName: wpUser.last_name,
            email: wpUser.email,
            url: wpUser.url,
            description: wpUser.description,
            slug: wpUser.slug,
            avatarUrl: wpUser.avatar_urls?.["96"] || wpUser.avatar_urls?.["48"],
            roles: wpUser.roles,
          },
          siteId,
        });

        // Create ID mapping
        await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
          siteId,
          objectType: "user",
          wpId: wpUser.id,
          convexId: userId,
        });

        progress.imported++;
      } catch (error) {
        errors.push({
          phase: "users",
          wpId: wpUser.id,
          message: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        });
        progress.failed++;
      }
    }

    // Update cursor
    progress.cursor = cursor + wpUsers.length;

    return {
      progress,
      errors,
      hasMore: progress.imported + progress.failed < progress.total,
    };
  },
});

// ─── User Creation Mutation ────────────────────────────────────────────────

export const usersCreate = internalMutation({
  args: {
    wpUser: v.object({
      id: v.number(),
      username: v.string(),
      name: v.string(),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      email: v.optional(v.string()),
      url: v.optional(v.string()),
      description: v.optional(v.string()),
      slug: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      roles: v.optional(v.array(v.string())),
    }),
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { wpUser, siteId }) => {
    const now = Date.now();

    // Check if user already exists by email
    if (wpUser.email) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", wpUser.email!))
        .first();

      if (existing) {
        // User exists - just update with WP reference if not set
        if (!existing.wpUserId) {
          await ctx.db.patch(existing._id, {
            wpUserId: wpUser.id,
            wpSourceSiteId: siteId,
            updatedAt: now,
          });
        }
        return existing._id;
      }
    }

    // Get default Subscriber role
    const subscriberRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "subscriber"))
      .first();

    // Map WordPress roles to ConvexPress roles
    let roleId = subscriberRole?._id;
    if (wpUser.roles && wpUser.roles.length > 0) {
      const wpRole = wpUser.roles[0];
      const mappedRole = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", wpRole))
        .first();
      if (mappedRole) {
        roleId = mappedRole._id;
      }
    }

    // Create the user
    const userId = await ctx.db.insert("users", {
      // Auth source - imported users don't have external auth
      authSource: "local",
      email: wpUser.email || `wp-user-${wpUser.id}@imported.local`,
      emailVerified: false,

      // Profile fields
      firstName: wpUser.firstName || undefined,
      lastName: wpUser.lastName || undefined,
      username: wpUser.username,
      displayName: wpUser.name || wpUser.username,
      slug: wpUser.slug || wpUser.username,
      bio: wpUser.description || undefined,
      url: wpUser.url || undefined,
      avatarUrl: wpUser.avatarUrl || undefined,

      // Role
      roleId,

      // Status
      status: "active",

      // Registration
      registrationMethod: "import",

      // WordPress import fields
      wpUserId: wpUser.id,
      wpSourceSiteId: siteId,

      // Timestamps
      createdAt: now,
      updatedAt: now,
    });

    return userId;
  },
});
