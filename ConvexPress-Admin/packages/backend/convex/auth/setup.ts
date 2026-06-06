import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { hashPassword } from "./helpers";
import type { Id } from "../_generated/dataModel";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,64}$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string): string {
  return username.trim();
}

function validateFirstAdminCredentials(args: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}) {
  const email = normalizeEmail(args.email);
  const username = normalizeUsername(args.username);
  const displayName = args.displayName?.trim();

  if (!EMAIL_RE.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (!USERNAME_RE.test(username)) {
    throw new Error(
      "Username must be 3-64 characters and may contain letters, numbers, dots, underscores, or hyphens.",
    );
  }
  if (args.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  return {
    email,
    username,
    displayName: displayName || username,
  };
}

function validateFirstAdminSetupToken(setupToken: string | undefined) {
  const requiredToken = process.env.FIRST_ADMIN_SETUP_SECRET?.trim();
  if (!requiredToken) return;

  if (!setupToken || setupToken !== requiredToken) {
    throw new Error("First-admin setup token is invalid or missing.");
  }
}

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createFirstAdmin = action({
  args: {
    email: v.string(),
    username: v.string(),
    password: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    displayName: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    setupToken: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    validateFirstAdminSetupToken(args.setupToken);
    const credentials = validateFirstAdminCredentials(args);

    // Ensure the built-in WordPress roles exist before checking for or
    // assigning the first administrator role on a fresh deployment.
    await ctx.runMutation(internal.roles.internals.seedRoles);

    const existingAdmins = await ctx.runQuery(internal.auth.internals.checkExistingAdmins);
    if (existingAdmins) {
      throw new Error("An administrator account already exists");
    }

    const passwordHash = await hashPassword(args.password);

    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const userId = await ctx.runMutation(internal.auth.internals.createAdminUser, {
      email: credentials.email,
      username: credentials.username,
      passwordHash,
      displayName: credentials.displayName,
    });

    return { userId, message: "Administrator account created" };
  },
});

/**
 * Idempotently provision a dedicated smoke-test admin user.
 *
 * Used by Playwright smoke tests (tests/smoke/auth.setup.ts) to log in
 * with known credentials without depending on an existing admin account.
 *
 * Gated behind CONVEXPRESS_ENABLE_DEV_INTERNALS to prevent accidental
 * use on production deployments. On a fresh-or-existing dev deployment:
 *   - If smoketest user does not exist: creates it with admin role + isInternal=true
 *   - If smoketest user exists: updates passwordHash to match the supplied password
 *     (so credential rotation works) and ensures admin flags are set
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const provisionSmokeAdmin = action({
  args: {
    email: v.string(),
    username: v.string(),
    password: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args): Promise<{ created: boolean; userId: string; email: string }> => {
    if (process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS !== "true") {
      throw new Error(
        "provisionSmokeAdmin is disabled. Set CONVEXPRESS_ENABLE_DEV_INTERNALS=true on the Convex deployment.",
      );
    }

    const credentials = validateFirstAdminCredentials(args);
    const passwordHash = await hashPassword(args.password);

    const result: { created: boolean; userId: Id<"users">; email: string } = await ctx.runMutation(
      internal.auth.setup.upsertSmokeAdmin,
      {
        email: credentials.email,
        username: credentials.username,
        passwordHash,
      },
    );

    return result;
  },
});

/**
 * Internal upsert used by provisionSmokeAdmin. Not client-callable.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const upsertSmokeAdmin = internalMutation({
  args: {
    email: v.string(),
    username: v.string(),
    passwordHash: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const adminRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", "administrator"))
      .unique();

    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", args.email))
      .first();

    if (existing) {
      await ctx.db.patch("users", existing._id, {
        passwordHash: args.passwordHash,
        authSource: "local",
        emailVerified: true,
        status: "active",
        isInternal: true,
        internalRole: "admin",
        ...(adminRole ? { roleId: adminRole._id } : {}),
        clerkProvisioningStatus: "skipped",
        clerkProvisioningSource: "smoke_admin",
        clerkProvisioningReason: "local_admin_auth_only",
        updatedAt: now,
      });
      return { created: false, userId: existing._id, email: existing.email };
    }

    const userId = await ctx.db.insert("users", {
      authSource: "local",
      email: args.email,
      username: args.username,
      passwordHash: args.passwordHash,
      displayName: args.username,
      slug: args.username.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: "admin",
      roleId: adminRole?._id,
      clerkProvisioningStatus: "skipped",
      clerkProvisioningSource: "smoke_admin",
      clerkProvisioningReason: "local_admin_auth_only",
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { created: true, userId, email: args.email };
  },
});
