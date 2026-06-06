/**
 * Registration System - Shared Helper Functions
 *
 * Reusable helpers for token generation, email validation,
 * username generation, and settings retrieval.
 *
 * Used by:
 *   - registration/mutations.ts
 *   - registration/internals.ts
 *   - registration/queries.ts
 */

import type { QueryCtx } from "../_generated/server";
import {
  MAX_CLERK_NAME_LENGTH,
  MAX_USERNAME_LENGTH,
  normalizeEmail,
  normalizeOptionalString,
} from "../auth/inputLimits";

type ReadCtx = Pick<QueryCtx, "db">;

export const INVITATION_TOKEN_LENGTH = 64;
export const MAX_INVITATION_MESSAGE_LENGTH = 1000;
export const MAX_BULK_INVITATIONS = 100;

const INVITATION_TOKEN_RE = /^[a-f0-9]{64}$/i;

// ─── Token Generation ────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random, URL-safe invitation token.
 *
 * Produces a 64-character hex string by concatenating two UUIDs
 * with hyphens stripped. This provides sufficient entropy for
 * secure invitation tokens.
 *
 * Example output: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
 */
export function generateInvitationToken(): string {
  const part1 = crypto.randomUUID().replace(/-/g, "");
  const part2 = crypto.randomUUID().replace(/-/g, "");
  return part1 + part2;
}

// ─── Email Validation ────────────────────────────────────────────────────────

/**
 * Basic email format validation.
 * Returns true if the string looks like a valid email address.
 */
export function isValidEmail(email: string): boolean {
  return normalizeRegistrationEmail(email) !== null;
}

export function normalizeRegistrationEmail(value: unknown): string | null {
  return normalizeEmail(value) ?? null;
}

export function normalizeInvitationToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  if (token.length !== INVITATION_TOKEN_LENGTH) return null;
  return INVITATION_TOKEN_RE.test(token) ? token : null;
}

export function normalizeInvitationMessage(value: unknown): string | undefined {
  return normalizeOptionalString(value, MAX_INVITATION_MESSAGE_LENGTH);
}

export function normalizeRegistrationName(value: unknown): string | undefined {
  return normalizeOptionalString(value, MAX_CLERK_NAME_LENGTH);
}

export function normalizeRegistrationUsername(value: unknown): string | undefined {
  return normalizeOptionalString(value, MAX_USERNAME_LENGTH);
}

/**
 * Check if an email is already registered as a user.
 *
 * @param ctx - Query or mutation context
 * @param email - Email address to check
 * @returns The existing user document, or null if not found
 */
export async function findUserByEmail(
  ctx: ReadCtx,
  email: string,
) {
  const normalizedEmail = normalizeRegistrationEmail(email);
  if (!normalizedEmail) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", normalizedEmail))
    .unique();
}

/**
 * Check if there is already a pending invitation for an email address.
 *
 * @param ctx - Query or mutation context
 * @param email - Email address to check
 * @returns The pending invitation document, or null if not found
 */
export async function findPendingInvitation(
  ctx: ReadCtx,
  email: string,
) {
  const normalizedEmail = normalizeRegistrationEmail(email);
  if (!normalizedEmail) return null;

  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  const invitations = await ctx.db
    .query("invitations")
    .withIndex("by_email", (q: ConvexQueryBuilder) => q.eq("email", normalizedEmail))
    .collect();

  const now = Date.now();
  // Return the first live pending invitation (there should only be one).
  // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
  return invitations.find((inv) => inv.status === "pending" && inv.expiresAt >= now) ?? null;
}

// ─── Username Generation ─────────────────────────────────────────────────────

/**
 * Generate a username from an email address.
 *
 * Rules:
 *   - Extract local part (before @)
 *   - Lowercase
 *   - Remove non-alphanumeric characters
 *   - Truncate to 60 characters
 *   - Fallback to "user" if empty
 *
 * Examples:
 *   "troy.smith@example.com" -> "troysmith"
 *   "Jane_Doe123@test.com" -> "janedoe123"
 *   "...@example.com" -> "user"
 */
export function generateUsernameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const cleaned = localPart
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 60);

  return cleaned || "user";
}

/**
 * Ensure a username is unique by appending a numeric suffix if taken.
 *
 * Checks the `by_username` index on the users table. If the base username
 * is taken, tries "base2", "base3", etc. up to a safety limit of 100.
 *
 * @param ctx - Mutation context
 * @param base - The desired base username
 * @returns A unique username string
 */
export async function ensureUniqueUsername(
  ctx: ReadCtx,
  base: string,
): Promise<string> {
  // Check if the base username is available
  const existing = await ctx.db
    .query("users")
    .withIndex("by_username", (q: ConvexQueryBuilder) => q.eq("username", base))
    .unique();

  if (!existing) return base;

  // Username is taken -- append incrementing suffix
  let counter = 2;
  while (counter < 100) {
    const candidate = `${base}${counter}`;
    const candidateExisting = await ctx.db
      .query("users")
      .withIndex("by_username", (q: ConvexQueryBuilder) => q.eq("username", candidate))
      .unique();

    if (!candidateExisting) return candidate;
    counter++;
  }

  // Extremely unlikely fallback
  return `${base}${Date.now()}`;
}

// ─── Settings Retrieval ──────────────────────────────────────────────────────

/**
 * Registration-related setting defaults.
 * Used when the Settings System has not been configured yet.
 */
const REGISTRATION_DEFAULTS = {
  anyoneCanRegister: false,
  membershipEnabled: false,
  defaultRole: "subscriber",
  invitationExpiryDays: 7,
  maxResendsPerInvitation: 5,
  requireEmailVerification: true,
};

/**
 * Read a specific setting value from the settings table.
 *
 * Uses the same pattern as the Settings System's internal query:
 * reads the stored document for a section and merges with defaults.
 *
 * If the Settings System is not yet deployed or the section doesn't exist,
 * returns the default value via nullish coalescing.
 *
 * @param ctx - Query or mutation context
 * @param section - Settings section name (e.g., "general")
 * @param key - Setting key within the section
 * @returns The setting value, or undefined if section/key not found
 */
async function getSettingValue(
  ctx: ReadCtx,
  section:
    | "general"
    | "reading"
    | "writing"
    | "discussion"
    | "permalinks"
    | "privacy",
  key: string,
): Promise<unknown> {
  try {
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q: ConvexQueryBuilder) => q.eq("section", section))
      .unique();

    if (doc && doc.values && typeof doc.values === "object") {
      return (doc.values as Record<string, unknown>)[key];
    }
  } catch {
    // Settings table may not exist yet during incremental development
  }
  return undefined;
}

/**
 * Get all registration-related settings with defaults applied.
 *
 * All registration settings are stored in the "general" section because
 * the Settings System schema does not include a dedicated "registration"
 * section. This is documented here for clarity:
 *
 * Settings mapping:
 *   - "general" / "membershipEnabled"        -> anyoneCanRegister (PRD name)
 *   - "general" / "registrationMode"         -> invite-only vs closed when public registration is off
 *   - "general" / "defaultRole"              -> defaultRole
 *   - "general" / "invitationExpiryDays"     -> invitationExpiryDays
 *   - "general" / "maxResendsPerInvitation"  -> maxResendsPerInvitation
 *   - "general" / "requireEmailVerification" -> requireEmailVerification
 *
 * The PRD references `anyoneCanRegister` as the setting key. The actual
 * stored key is `membershipEnabled` (WordPress-style naming used on the
 * Settings > General admin page). Both names refer to the same boolean
 * toggle: whether open self-registration is allowed.
 *
 * Falls back to hardcoded defaults if settings are unavailable.
 *
 * @returns Object with all registration settings
 */
export async function getRegistrationSettings(ctx: ReadCtx) {
  // "membershipEnabled" is the stored key (Settings > General page).
  // Maps to PRD concept "anyoneCanRegister".
  const membershipEnabled = await getSettingValue(
    ctx,
    "general",
    "membershipEnabled",
  );
  const defaultRole = await getSettingValue(ctx, "general", "defaultRole");
  const registrationMode = await getSettingValue(
    ctx,
    "general",
    "registrationMode",
  );

  // Registration-specific settings also stored in "general" section
  // because there is no "registration" section in the settings schema.
  // If a "registration" section is added to the schema in the future,
  // these reads should be migrated to read from that section instead.
  const invitationExpiryDays = await getSettingValue(
    ctx,
    "general",
    "invitationExpiryDays",
  );
  const maxResendsPerInvitation = await getSettingValue(
    ctx,
    "general",
    "maxResendsPerInvitation",
  );
  const requireEmailVerification = await getSettingValue(
    ctx,
    "general",
    "requireEmailVerification",
  );

  const anyoneCanRegister =
    (membershipEnabled as boolean | undefined) ??
    REGISTRATION_DEFAULTS.anyoneCanRegister;
  const closedMode =
    registrationMode === "closed" ? "closed" : "invite_only";

  return {
    anyoneCanRegister,
    status: anyoneCanRegister ? "open" : closedMode,
    inviteOnly: !anyoneCanRegister && closedMode === "invite_only",
    defaultRole:
      (defaultRole as string | undefined) ?? REGISTRATION_DEFAULTS.defaultRole,
    invitationExpiryDays:
      (invitationExpiryDays as number | undefined) ??
      REGISTRATION_DEFAULTS.invitationExpiryDays,
    maxResendsPerInvitation:
      (maxResendsPerInvitation as number | undefined) ??
      REGISTRATION_DEFAULTS.maxResendsPerInvitation,
    requireEmailVerification:
      (requireEmailVerification as boolean | undefined) ??
      REGISTRATION_DEFAULTS.requireEmailVerification,
  };
}

/**
 * Get the default role ID from the roles table.
 *
 * Looks up the role marked as `isDefault: true`. Falls back to
 * looking up the subscriber role by slug if no default is marked.
 *
 * @returns The default role document, or null if not found
 */
export async function getDefaultRoleDoc(ctx: ReadCtx) {
  // First try: role marked as default
  const defaultRole = await ctx.db
    .query("roles")
    .withIndex("by_isDefault", (q: ConvexQueryBuilder) => q.eq("isDefault", true))
    .first();

  if (defaultRole) return defaultRole;

  // Fallback: look up subscriber by slug
  const subscriber = await ctx.db
    .query("roles")
    .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", "subscriber"))
    .unique();

  return subscriber;
}
