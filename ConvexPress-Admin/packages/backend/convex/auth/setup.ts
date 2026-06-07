import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { hashPassword, hashSetupToken } from "./helpers";
import type { Id } from "../_generated/dataModel";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,64}$/;
const LOCAL_AUTH_ISSUER_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const MAX_EMAIL_LENGTH = 254;
const MAX_DISPLAY_NAME_LENGTH = 128;
const MAX_PASSWORD_LENGTH = 256;
const SETUP_TOKEN_RE = /^[A-Za-z0-9_-]{32,256}$/;

function getRequiredFirstAdminSetupToken(): string | null {
  return process.env.FIRST_ADMIN_SETUP_SECRET?.trim() || null;
}

function parseAuthIssuerUrl(): URL | null {
  const rawIssuer = process.env.AUTH_ISSUER_URL?.trim();
  if (!rawIssuer) return null;

  try {
    const parsed = new URL(rawIssuer);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function requireValidAuthIssuerUrl() {
  const parsed = parseAuthIssuerUrl();
  if (!parsed) {
    throw new Error(
      "AUTH_ISSUER_URL is required before first-admin setup. Set it to the Convex site URL or an explicit localhost URL for local development.",
    );
  }
  return parsed;
}

function isLocalAuthIssuerUrl(parsed = parseAuthIssuerUrl()): boolean {
  return !!parsed && LOCAL_AUTH_ISSUER_HOSTS.has(parsed.hostname);
}

function canCreateFirstAdminWithoutSetupToken(parsedIssuer: URL): boolean {
  if (process.env.CONVEXPRESS_ALLOW_PUBLIC_FIRST_ADMIN_SETUP === "true") {
    return true;
  }

  return isLocalAuthIssuerUrl(parsedIssuer);
}

function getRequiredDevInternalsToken(): string | null {
  return process.env.CONVEXPRESS_DEV_INTERNALS_TOKEN?.trim() || null;
}

function assertDevInternalsAdminToken(devToken: string | undefined) {
  if (process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS !== "true") {
    throw new Error(
      "provisionSmokeAdmin is disabled. Set CONVEXPRESS_ENABLE_DEV_INTERNALS=true on the Convex deployment.",
    );
  }

  const requiredToken = getRequiredDevInternalsToken();
  if (!requiredToken) {
    throw new Error(
      "provisionSmokeAdmin requires CONVEXPRESS_DEV_INTERNALS_TOKEN before it can create an admin.",
    );
  }

  if (!devToken || devToken !== requiredToken) {
    throw new Error("Invalid dev internals token.");
  }
}

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
  if (email.length > MAX_EMAIL_LENGTH) {
    throw new Error("Email must be 254 characters or fewer.");
  }
  if (!USERNAME_RE.test(username)) {
    throw new Error(
      "Username must be 3-64 characters and may contain letters, numbers, dots, underscores, or hyphens.",
    );
  }
  if (displayName && displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error("Display name must be 128 characters or fewer.");
  }
  if (args.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (args.password.length > MAX_PASSWORD_LENGTH) {
    throw new Error("Password must be 256 characters or fewer.");
  }

  return {
    email,
    username,
    displayName: displayName || username,
  };
}

function constantTimeStringEquals(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let i = 0; i < length; i++) {
    diff |= (leftBytes[i] ?? 0) ^ (rightBytes[i] ?? 0);
  }

  return diff === 0;
}

async function validateFirstAdminSetupToken(setupToken: string | undefined) {
  const authIssuerUrl = requireValidAuthIssuerUrl();

  if (setupToken && !SETUP_TOKEN_RE.test(setupToken)) {
    throw new Error("First-admin setup token is invalid or missing.");
  }

  const requiredToken = getRequiredFirstAdminSetupToken();
  if (!requiredToken) {
    if (canCreateFirstAdminWithoutSetupToken(authIssuerUrl)) {
      return { required: false, setupTokenHash: undefined };
    }

    throw new Error(
      "FIRST_ADMIN_SETUP_SECRET is required before first-admin setup on non-local deployments. Run the desktop setup wizard again or explicitly set CONVEXPRESS_ALLOW_PUBLIC_FIRST_ADMIN_SETUP=true.",
    );
  }

  if (!SETUP_TOKEN_RE.test(requiredToken)) {
    throw new Error(
      "FIRST_ADMIN_SETUP_SECRET must be a 32-256 character URL-safe setup token. Re-run desktop setup to rotate the setup token.",
    );
  }

  if (
    !setupToken ||
    !constantTimeStringEquals(setupToken, requiredToken)
  ) {
    throw new Error("First-admin setup token is invalid or missing.");
  }

  return {
    required: true,
    setupTokenHash: await hashSetupToken(requiredToken),
  };
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
    const credentials = validateFirstAdminCredentials(args);
    const existingAdmins = await ctx.runQuery(internal.auth.internals.checkExistingAdmins);
    if (existingAdmins) {
      throw new Error("An administrator account already exists");
    }

    const setupTokenState = await validateFirstAdminSetupToken(args.setupToken);

    // Ensure the built-in WordPress roles exist before checking for or
    // assigning the first administrator role on a fresh deployment.
    await ctx.runMutation(internal.roles.internals.seedRoles);
    await ctx.runMutation(internal.roles.internals.ensureAdminSetupPageAccess);

    const existingAdminsAfterSeed = await ctx.runQuery(
      internal.auth.internals.checkExistingAdmins,
    );
    if (existingAdminsAfterSeed) {
      throw new Error("An administrator account already exists");
    }

    const passwordHash = await hashPassword(args.password);

    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const userId = await ctx.runMutation(internal.auth.internals.createAdminUser, {
      email: credentials.email,
      username: credentials.username,
      passwordHash,
      displayName: credentials.displayName,
      setupTokenRequired: setupTokenState.required,
      setupTokenHash: setupTokenState.setupTokenHash,
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
 * use on production deployments, and also requires the caller to provide
 * CONVEXPRESS_DEV_INTERNALS_TOKEN. On a fresh-or-existing dev deployment:
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
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    devToken: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args): Promise<{ created: boolean; userId: string; email: string }> => {
    assertDevInternalsAdminToken(args.devToken);

    const credentials = validateFirstAdminCredentials(args);
    const passwordHash = await hashPassword(args.password);

    await ctx.runMutation(internal.roles.internals.seedRoles);
    await ctx.runMutation(internal.roles.internals.ensureAdminSetupPageAccess);

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
