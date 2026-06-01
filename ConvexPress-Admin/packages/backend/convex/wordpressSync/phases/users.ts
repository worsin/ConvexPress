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

import { action, internalAction, internalMutation, internalQuery } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  fetchWPUserPasswordDigests,
  fetchWPUsers,
  type WPUser,
  type WPUserPasswordDigest,
} from "../helpers/wpClient";
import type { PhaseResult } from "../internals";
import type { SyncError, PhaseProgress } from "../validators";
import { WP_BATCH_SIZE, normalizeImportConfig, FINDING_CODES, siteCredentialsValidator } from "../validators";
import { createFinding } from "../helpers/idMapping";
import { decryptSecret } from "../../api/crypto_helpers";
import {
  detectClerkPasswordHasher,
  normalizeClerkEmail,
} from "../../auth/clerkManagementHelpers";


// ─── Source Hash Helper ───────────────────────────────────────────────────

function computeSourceHash(fields: Record<string, unknown>): string {
  const str = JSON.stringify(fields); let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; } return h.toString(36);
}

type CredentialMigrationStatus =
  | "provisioned"
  | "linked_existing"
  | "reset_required"
  | "unsupported_hash"
  | "skipped"
  | "failed";

type CredentialMigrationPatch = {
  status: CredentialMigrationStatus;
  reason?: string;
  passwordHasher?: string;
  clerkUserId?: string;
  error?: string;
  source?: "wordpress_import" | "wordpress_credential_backfill";
};

const WP_ENCRYPTION_KEY = process.env.WP_SYNC_ENCRYPTION_KEY;
const DEFAULT_USER_PASSWORD_EXPORT_PATH = "/convexpress/v1/user-password-digests";

async function decryptStoredSecret(secret: string | undefined): Promise<string | undefined> {
  if (!secret) return undefined;
  if (WP_ENCRYPTION_KEY && secret.includes(":")) {
    try {
      return await decryptSecret(secret, WP_ENCRYPTION_KEY);
    } catch {
      return secret;
    }
  }
  return secret;
}

function normalizeEmail(email: string | undefined): string | undefined {
  return normalizeClerkEmail(email);
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
    const credentialExportPath =
      credentials.userPasswordExportPath || DEFAULT_USER_PASSWORD_EXPORT_PATH;
    const credentialExportConfigured = Boolean(credentials.userPasswordExportSecret);
    const passwordDigestByWpId = new Map<number, WPUserPasswordDigest>();
    let credentialExportFailed = false;

    if (credentialExportConfigured && wpUsers.length > 0) {
      try {
        const digestResult = await fetchWPUserPasswordDigests(
          credentials,
          credentialExportPath,
          credentials.userPasswordExportSecret!,
          wpUsers.map((user) => user.id),
        );
        for (const row of digestResult.data) {
          passwordDigestByWpId.set(row.id, row);
        }
      } catch (error) {
        credentialExportFailed = true;
        await createFinding(ctx, {
          siteId,
          jobId,
          severity: "warning",
          phase: "users",
          code: FINDING_CODES.USER_PASSWORD_EXPORT_UNAVAILABLE,
          message:
            "WordPress user password digest endpoint could not be reached. Imported users will require password reset fallback.",
          sourceType: "user",
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

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

          await ctx.runAction(
            internal.wordpressSync.phases.users.provisionImportedUserCredentials,
            {
              userId,
              siteId,
              wpUserId: wpUser.id,
              email: wpUser.email,
              username: wpUser.username,
              firstName: wpUser.first_name,
              lastName: wpUser.last_name,
              displayName: wpUser.name,
              passwordDigest: passwordDigestByWpId.get(wpUser.id)?.user_pass,
              credentialExportConfigured,
              credentialExportFailed,
              jobId,
            },
          );

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
    const normalizedEmail = normalizeEmail(wpUser.email);

    // Check if user already exists by email
    if (normalizedEmail) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
        .first();

      if (existing) {
        // User exists - just update with WP reference if not set
        await ctx.db.patch(existing._id, {
          ...(!existing.wpUserId ? { wpUserId: wpUser.id } : {}),
          ...(!existing.wpSourceSiteId ? { wpSourceSiteId: siteId } : {}),
          updatedAt: now,
        });
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
      email: normalizedEmail || `wp-user-${wpUser.id}@imported.local`,
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
      clerkProvisioningStatus: "pending",
      clerkProvisioningSource: "wordpress_import",
      clerkProvisioningReason: "pending_clerk_provisioning",

      // WordPress import fields
      wpUserId: wpUser.id,
      wpSourceSiteId: siteId,
      wpCredentialMigrationStatus: "reset_required",
      wpCredentialMigrationReason: "pending_clerk_provisioning",

      // Timestamps
      createdAt: now,
      updatedAt: now,
    });

    return userId;
  },
});

// ─── Credential Migration State ───────────────────────────────────────────

export const markImportedUserCredentialMigration = internalMutation({
  args: {
    userId: v.id("users"),
    status: v.union(
      v.literal("provisioned"),
      v.literal("linked_existing"),
      v.literal("reset_required"),
      v.literal("unsupported_hash"),
      v.literal("skipped"),
      v.literal("failed"),
    ),
    reason: v.optional(v.string()),
    passwordHasher: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      wpCredentialMigrationStatus: args.status,
      wpCredentialMigrationReason: args.reason,
      wpCredentialPasswordHasher: args.passwordHasher,
      wpCredentialMigratedAt: Date.now(),
      wpCredentialMigrationError: args.error,
      updatedAt: Date.now(),
    };

    if (args.clerkUserId) {
      patch.clerkUserId = args.clerkUserId;
      patch.authSource = "clerk";
      patch.emailVerified = true;
    }

    await ctx.db.patch(args.userId, patch);
  },
});

async function markCredentialMigration(
  ctx: {
    runMutation: (ref: any, args: any) => Promise<any>;
  },
  userId: Id<"users">,
  patch: CredentialMigrationPatch,
) {
  const source = patch.source ?? "wordpress_import";
  const clerkStatus =
    patch.status === "unsupported_hash" ? "reset_required" : patch.status;

  await ctx.runMutation(internal.auth.clerkManagement.markClerkProvisioning, {
    userId,
    source,
    status: clerkStatus,
    reason: patch.reason,
    error: patch.error,
    clerkUserId: patch.clerkUserId,
    setAuthSourceToClerk: true,
  });

  await ctx.runMutation(
    internal.wordpressSync.phases.users.markImportedUserCredentialMigration,
    {
      userId,
      status: patch.status,
      reason: patch.reason,
      passwordHasher: patch.passwordHasher,
      clerkUserId: patch.clerkUserId,
      error: patch.error,
    },
  );
}

export const provisionImportedUserCredentials = internalAction({
  args: {
    userId: v.id("users"),
    siteId: v.id("wordpressSites"),
    wpUserId: v.number(),
    email: v.optional(v.string()),
    username: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    passwordDigest: v.optional(v.string()),
    credentialExportConfigured: v.boolean(),
    credentialExportFailed: v.boolean(),
    jobId: v.optional(v.id("wordpressSyncJobs")),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const source = args.jobId ? "wordpress_import" : "wordpress_credential_backfill";

    if (!email || email.endsWith("@imported.local")) {
      await markCredentialMigration(ctx, args.userId, {
        status: "skipped",
        reason: "missing_email",
        source,
      });
      return { status: "skipped" as const };
    }

    if (!args.credentialExportConfigured) {
      await markCredentialMigration(ctx, args.userId, {
        status: "reset_required",
        reason: "credential_export_not_configured",
        source,
      });
      return { status: "reset_required" as const };
    }

    if (args.credentialExportFailed) {
      await markCredentialMigration(ctx, args.userId, {
        status: "reset_required",
        reason: "credential_export_unavailable",
        source,
      });
      return { status: "reset_required" as const };
    }

    const digest = args.passwordDigest?.trim();
    const detected = detectClerkPasswordHasher(digest);
    if (!detected.supported) {
      await markCredentialMigration(ctx, args.userId, {
        status: detected.reason === "missing_digest" ? "reset_required" : "unsupported_hash",
        reason: detected.reason,
        source,
      });

      if (args.jobId && detected.reason !== "missing_digest") {
        await createFinding(ctx, {
          siteId: args.siteId,
          jobId: args.jobId,
          severity: "warning",
          phase: "users",
          code: FINDING_CODES.USER_PASSWORD_HASH_UNSUPPORTED,
          message:
            "Imported WordPress user has a password hash format Clerk cannot ingest directly; user will require reset fallback.",
          sourceType: "user",
          sourceId: String(args.wpUserId),
          destinationTable: "users",
          wpId: args.wpUserId,
          convexId: args.userId,
          metadata: { reason: detected.reason },
        });
      }

      return { status: "reset_required" as const, reason: detected.reason };
    }

    const provisioningResult = await ctx.runAction(
      internal.auth.clerkManagement.ensureUserInClerk,
      {
        userId: args.userId,
        source,
        email,
        username: args.username,
        firstName: args.firstName,
        lastName: args.lastName,
        displayName: args.displayName,
        passwordDigest: digest,
        passwordHasher: detected.hasher,
        externalId: `wp:${args.siteId}:${args.wpUserId}`,
        setAuthSourceToClerk: true,
      },
    );

    if (provisioningResult.status === "failed") {
      const message = provisioningResult.error || provisioningResult.reason || "Unknown Clerk provisioning failure";
      await markCredentialMigration(ctx, args.userId, {
        status: "failed",
        reason: provisioningResult.reason || "clerk_create_user_failed",
        passwordHasher: detected.hasher,
        error: message,
        source,
      });

      if (args.jobId) {
        await createFinding(ctx, {
          siteId: args.siteId,
          jobId: args.jobId,
          severity: "warning",
          phase: "users",
          code: FINDING_CODES.CLERK_USER_PROVISIONING_FAILED,
          message: `Clerk user provisioning failed for imported WordPress user: ${message}`,
          sourceType: "user",
          sourceId: String(args.wpUserId),
          destinationTable: "users",
          wpId: args.wpUserId,
          convexId: args.userId,
        });
      }

      return { status: "failed" as const, error: message };
    }

    if (!provisioningResult.clerkUserId) {
      await markCredentialMigration(ctx, args.userId, {
        status: "failed",
        reason: "clerk_response_missing_user_id",
        passwordHasher: detected.hasher,
        source,
      });
      return { status: "failed" as const };
    }

    const status =
      provisioningResult.status === "linked_existing" ? "linked_existing" : "provisioned";
    await markCredentialMigration(ctx, args.userId, {
      status,
      reason: provisioningResult.reason || "password_digest_imported",
      clerkUserId: provisioningResult.clerkUserId,
      passwordHasher: detected.hasher,
      source,
    });

    return { status, clerkUserId: provisioningResult.clerkUserId };
  },
});

export const getCredentialBackfillBatch = internalQuery({
  args: {
    siteId: v.id("wordpressSites"),
    afterWpId: v.optional(v.number()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const afterWpId = args.afterWpId ?? -1;
    const mappings = await ctx.db
      .query("wpIdMappings")
      .withIndex("by_wp_id", (q) =>
        q.eq("siteId", args.siteId).eq("objectType", "user").gt("wpId", afterWpId),
      )
      .take(args.limit);

    const users = [];
    for (const mapping of mappings) {
      const user = await ctx.db.get(mapping.convexId as Id<"users">);
      if (!user || user.clerkUserId || !user.wpUserId) continue;
      users.push({
        userId: user._id,
        wpUserId: user.wpUserId,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
      });
    }

    return {
      users,
      nextAfterWpId: mappings.length > 0 ? mappings[mappings.length - 1]!.wpId : afterWpId,
      hasMore: mappings.length === args.limit,
    };
  },
});

export const backfillImportedUserCredentials = action({
  args: {
    siteId: v.id("wordpressSites"),
    afterWpId: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.settings.internals.requireManageOptionsInternal, {});

    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, {
      siteId: args.siteId,
    });
    if (!site) {
      return { processed: 0, hasMore: false, nextAfterWpId: args.afterWpId ?? -1 };
    }

    const passwordExportPath = site.userPasswordExportPath || DEFAULT_USER_PASSWORD_EXPORT_PATH;
    const passwordExportSecret = await decryptStoredSecret(site.userPasswordExportSecret);
    const decryptedPassword = await decryptStoredSecret(site.applicationPassword) ?? site.applicationPassword;
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 100);
    const batch = await ctx.runQuery(
      internal.wordpressSync.phases.users.getCredentialBackfillBatch,
      {
        siteId: args.siteId,
        afterWpId: args.afterWpId,
        limit,
      },
    );

    let digestByWpId = new Map<number, WPUserPasswordDigest>();
    let credentialExportFailed = false;
    if (passwordExportSecret && batch.users.length > 0) {
      try {
        const digestResult = await fetchWPUserPasswordDigests(
          {
            siteUrl: site.siteUrl,
            username: site.username,
            applicationPassword: decryptedPassword,
          },
          passwordExportPath,
          passwordExportSecret,
          batch.users.map((user: { wpUserId: number }) => user.wpUserId),
        );
        digestByWpId = new Map(digestResult.data.map((row) => [row.id, row]));
      } catch {
        credentialExportFailed = true;
      }
    }

    for (const user of batch.users) {
      await ctx.runAction(
        internal.wordpressSync.phases.users.provisionImportedUserCredentials,
        {
          userId: user.userId,
          siteId: args.siteId,
          wpUserId: user.wpUserId,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName,
          passwordDigest: digestByWpId.get(user.wpUserId)?.user_pass,
          credentialExportConfigured: Boolean(passwordExportSecret),
          credentialExportFailed,
        },
      );
    }

    return {
      processed: batch.users.length,
      hasMore: batch.hasMore,
      nextAfterWpId: batch.nextAfterWpId,
    };
  },
});
