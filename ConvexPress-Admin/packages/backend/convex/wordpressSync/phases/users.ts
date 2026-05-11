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
import { WP_BATCH_SIZE, normalizeImportConfig, FINDING_CODES, siteCredentialsValidator } from "../validators";
import { createFinding } from "../helpers/idMapping";


// ─── Source Hash Helper ───────────────────────────────────────────────────

function computeSourceHash(fields: Record<string, unknown>): string {
  const str = JSON.stringify(fields); let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; } return h.toString(36);
}

// ─── User Import Action ────────────────────────────────────────────────────

export const importBatch = internalAction({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
    credentials: siteCredentialsValidator,
  },
  handler: async (ctx, { jobId, siteId, credentials }): Promise<PhaseResult> => {
    const errors: SyncError[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Get job and site
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, { siteId });

    // Get import config
    const importConfig = normalizeImportConfig(job?.importConfig);
    const isDryRun = importConfig.behavior.dryRun;

    if (!job || !site) {
      return {
        progress: { total: 0, imported: 0, failed: 0 },
        errors: [{ phase: "users", wpId: 0, message: "Job or site not found", timestamp: Date.now() }],
        hasMore: false,
      };
    }

    const progress: PhaseProgress = { ...job.progress.users };
    const cursor = progress.cursor || 0;
    const entityLimit =
      typeof importConfig.filters.entityLimit === "number"
        ? importConfig.filters.entityLimit
        : undefined;
    if (entityLimit !== undefined && cursor >= entityLimit) {
      progress.total = Math.min(progress.total || entityLimit, entityLimit);
      return { progress, errors, hasMore: false };
    }
    const page = Math.floor(cursor / WP_BATCH_SIZE) + 1;

    // Fetch users from WordPress
    const { data: fetchedUsers, total } = await fetchWPUsers(credentials, page, WP_BATCH_SIZE);
    const wpUsers =
      entityLimit !== undefined
        ? fetchedUsers.slice(0, Math.max(0, entityLimit - cursor))
        : fetchedUsers;
    const effectiveTotal = entityLimit !== undefined ? Math.min(total, entityLimit) : total;

    // Update total if not set
    if (progress.total === 0 && effectiveTotal > 0) {
      progress.total = effectiveTotal;
    }

    // Process each user
    for (const wpUser of wpUsers) {
      try {
        // Compute source hash for change detection
        const sourceHash = computeSourceHash({
          email: wpUser.email,
          name: wpUser.name,
          username: wpUser.username,
          slug: wpUser.slug,
        });

        // Check if already imported (full mapping for sourceHash)
        const existingMapping = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getFullMappingByWpId,
          { siteId, objectType: "user", wpId: wpUser.id }
        );

        if (existingMapping) {
          if (!isDryRun) {
            await ctx.runMutation(internal.wordpressSync.helpers.idMapping.touch, {
              siteId,
              objectType: "user",
              wpId: wpUser.id,
              jobId,
            });
          }

          // Source hash comparison - skip if unchanged
          if (existingMapping.sourceHash === sourceHash) {
            skipped++;
            progress.imported++;
            continue;
          }

          // Update sourceHash on existing mapping
          if (!isDryRun) {
            await ctx.runMutation(
              internal.wordpressSync.helpers.idMapping.updateSourceHash,
              { siteId, objectType: "user", wpId: wpUser.id, sourceHash }
            );
          }

          if (!importConfig.behavior.updateExisting) {
            skipped++;
            progress.imported++;
            continue;
          }

          updated++;
          progress.imported++;
          continue;
        }

        // No existing mapping - check for email collision
        if (wpUser.email) {
          const existingByEmail = await ctx.runQuery(
            internal.wordpressSync.internals.findUserByEmail,
            { email: wpUser.email }
          );

          if (existingByEmail) {
            await createFinding(ctx, {
              siteId, jobId, severity: "warning", phase: "users",
              code: FINDING_CODES.EMAIL_COLLISION,
              message: `User with email "${wpUser.email}" already exists locally (ID: ${existingByEmail._id})`,
              sourceType: "user", sourceId: String(wpUser.id),
              destinationTable: "users", wpId: wpUser.id,
              convexId: existingByEmail._id,
            });
            // Users with matching email are merged, not skipped — the
            // usersCreate mutation already handles this by linking
            // rather than duplicating. No need to skip.
          }
        }

        if (!isDryRun) {
          // Create user
          const userId = await ctx.runMutation(internal.wordpressSync.phases.users.usersCreate, {
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

          // Create ID mapping with sourceHash
          await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
            siteId,
            objectType: "user",
            wpId: wpUser.id,
            convexId: userId,
            sourceHash,
            jobId,
          });
        }

        created++;
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
      progress: {
        ...progress,
        created,
        updated,
        skipped,
        conflicted: 0,
      },
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
