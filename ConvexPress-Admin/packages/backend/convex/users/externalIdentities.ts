/**
 * External operator identities: the integrator API.
 *
 * An integrator that embeds ConvexPress in a larger deployment may trust its
 * own staff identity provider as another JWT issuer in `auth.config.ts`. Those
 * staff act as ConvexPress operators (editors, support agents...) under
 * ConvexPress's own roles and capabilities, with no ConvexPress password and
 * no Clerk account.
 *
 * Such an identity resolves to a user ONLY through a `userExternalIdentities`
 * row written here (see helpers/permissions.ts getCurrentUser). Every function
 * is internal: only the integrator's own server code (or `npx convex run`) can
 * create, change or remove a link. Nothing here is reachable from a client.
 *
 * Contract:
 *   - pass `issuer` and `subject` exactly as they appear in the token's `iss`
 *     and `sub` claims; the link matches Convex's tokenIdentifier exactly;
 *   - ConvexPress's own issuers and the configured Clerk issuer are refused;
 *   - an email that belongs to a non-external account is a typed conflict,
 *     never a merge;
 *   - a banned account is never changed by the sync (a typed conflict);
 *   - a deactivated or unlinked identity resolves to no user.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { WithoutSystemFields } from "convex/server";
import { insertWithMediaReferences, patchWithMediaReferences } from "../media/attachmentGuard";
import { isReservedIssuer, tokenIdentifierFor } from "../auth/issuers";
import { MAX_CLERK_NAME_LENGTH, normalizeEmail, normalizeOptionalString } from "../auth/inputLimits";
import {
  legacyInternalRoleForRoleSlug,
  roleCompatibleWithIdentity,
} from "../../lib/auth/roleAssignment";
import { ensureUniqueSlug, generateDisplayName, generateSlug } from "../helpers/profile";
import { emitEvent } from "../helpers/events";
import { PROFILE_EVENTS, ROLE_EVENTS, SYSTEM } from "../events/constants";

const MAX_ISSUER_LENGTH = 2048;
const MAX_SUBJECT_LENGTH = 256;
const MAX_LABEL_LENGTH = 200;
const MAX_LINKED_BY_LENGTH = 256;
const SYNC_SOURCE = "external_identity";

type DbReadCtx = Pick<QueryCtx, "db">;
type UserDoc = Doc<"users">;
type LinkDoc = Doc<"userExternalIdentities">;
type UserPatch = Partial<WithoutSystemFields<UserDoc>>;

// ─── Validators ──────────────────────────────────────────────────────────────

const identityArgs = { issuer: v.string(), subject: v.string() };

const operatorStatusValidator = v.union(v.literal("active"), v.literal("inactive"));

const upsertConflictReasonValidator = v.union(
  // The email belongs to a local, Clerk or management account, or to an
  // external account still linked to a different identity.
  v.literal("email_conflict"),
  // The identity is linked to an account that is not an external account.
  v.literal("identity_conflict"),
  // A ConvexPress administrator banned this account; the sync never lifts a ban.
  v.literal("account_banned"),
);

const upsertResultValidator = v.union(
  v.object({ ok: v.literal(true), userId: v.id("users"), created: v.boolean() }),
  v.object({
    ok: v.literal(false),
    reason: upsertConflictReasonValidator,
    message: v.string(),
  }),
);

const externalOperatorValidator = v.object({
  userId: v.id("users"),
  issuer: v.string(),
  subject: v.string(),
  tokenIdentifier: v.string(),
  email: v.string(),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  displayName: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("inactive"), v.literal("banned")),
  roleSlug: v.union(v.string(), v.null()),
  linkedAt: v.number(),
  linkedBy: v.optional(v.string()),
  label: v.optional(v.string()),
});

// ─── Input Normalization ────────────────────────────────────────────────────

function invalid(message: string): never {
  throw new ConvexError({ code: "EXTERNAL_IDENTITY_INVALID", message });
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** A claim value must be used exactly as the token carries it. */
function exactClaim(value: string, name: "issuer" | "subject", maxLength: number): string {
  if (!value || value !== value.trim() || value.length > maxLength || hasControlCharacter(value)) {
    invalid(`The ${name} must be the exact, non-empty token claim (at most ${maxLength} characters, no surrounding whitespace).`);
  }
  return value;
}

type ExternalIdentityKey = { issuer: string; subject: string; tokenIdentifier: string };

function externalIdentityKey(args: { issuer: string; subject: string }): ExternalIdentityKey {
  const issuer = exactClaim(args.issuer, "issuer", MAX_ISSUER_LENGTH);
  const subject = exactClaim(args.subject, "subject", MAX_SUBJECT_LENGTH);
  // tokenIdentifier joins issuer and subject with "|". An issuer containing
  // "|" could make two different identities produce the same identifier.
  if (issuer.includes("|")) invalid("The issuer must not contain '|'.");
  if (isReservedIssuer(issuer)) {
    invalid("ConvexPress's own issuers and the configured Clerk issuer cannot back an external identity.");
  }
  return { issuer, subject, tokenIdentifier: tokenIdentifierFor(issuer, subject) };
}

function optionalText(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (hasControlCharacter(value)) invalid("Text fields must not contain control characters.");
  return normalizeOptionalString(value, maxLength);
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/** The single link for an issuer/subject pair, or null. Duplicates fail closed. */
async function readLink(ctx: DbReadCtx, key: ExternalIdentityKey): Promise<LinkDoc | null> {
  const links = await ctx.db
    .query("userExternalIdentities")
    .withIndex("by_issuer_subject", (q) => q.eq("issuer", key.issuer).eq("subject", key.subject))
    .take(2);
  if (links.length > 1) {
    throw new ConvexError({
      code: "EXTERNAL_IDENTITY_CORRUPT",
      message: "More than one link exists for this external identity. Remove the duplicates before syncing.",
    });
  }
  const [link] = links;
  return link && link.tokenIdentifier === key.tokenIdentifier ? link : null;
}

async function requireOperatorRole(ctx: DbReadCtx, roleSlug: string): Promise<Doc<"roles">> {
  const role = await ctx.db
    .query("roles")
    .withIndex("by_slug", (q) => q.eq("slug", roleSlug))
    .unique();
  if (!role || role.status !== "active" || !roleCompatibleWithIdentity({ authSource: "external" }, role)) {
    throw new ConvexError({
      code: "EXTERNAL_OPERATOR_ROLE_UNAVAILABLE",
      message: `Role "${roleSlug}" is not an active internal or customer role an external operator can hold.`,
    });
  }
  return role;
}

async function emailOwners(ctx: DbReadCtx, email: string): Promise<UserDoc[]> {
  return await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .take(2);
}

// ─── Writes ─────────────────────────────────────────────────────────────────

type OperatorProfile = {
  email: string;
  firstName: string | undefined;
  lastName: string | undefined;
  displayName: string | undefined;
  status: "active" | "inactive";
  role: Doc<"roles">;
  linkedBy: string | undefined;
};

/** Record a role assignment the way roles.assign does: audit row, legacy fields, event. */
async function recordRoleAssignment(
  ctx: MutationCtx,
  user: UserDoc,
  role: Doc<"roles">,
  linkedBy: string | undefined,
  now: number,
): Promise<void> {
  await ctx.db.insert("roleChanges", {
    userId: user._id,
    oldRoleId: user.roleId,
    newRoleId: role._id,
    // roleChanges requires a ConvexPress actor; the integrator has none, so the
    // change is self-attributed (as first-admin setup does) and the reason
    // names the external source.
    changedBy: user._id,
    reason: linkedBy ? `${SYNC_SOURCE}: ${linkedBy}` : SYNC_SOURCE,
    timestamp: now,
  });
  await emitEvent(ctx, ROLE_EVENTS.ASSIGNED, SYSTEM.ROLE, {
    userId: user._id,
    newRoleId: role._id,
    newRoleName: role.name,
    newRoleSlug: role.slug,
    roleName: role.name,
    targetEmail: user.email,
    oldRoleId: user.roleId ?? null,
    changedBy: null,
    source: SYNC_SOURCE,
  });
}

/** Apply the integrator's view of an existing external user; writes and audits only real changes. */
async function applyOperatorProfile(
  ctx: MutationCtx,
  user: UserDoc,
  profile: OperatorProfile,
  now: number,
): Promise<void> {
  const patch: UserPatch = {};
  const changes: string[] = [];
  if (profile.email !== user.email) { patch.email = profile.email; changes.push("email"); }
  if (profile.firstName !== undefined && profile.firstName !== user.firstName) { patch.firstName = profile.firstName; changes.push("firstName"); }
  if (profile.lastName !== undefined && profile.lastName !== user.lastName) { patch.lastName = profile.lastName; changes.push("lastName"); }
  if (profile.displayName !== undefined && profile.displayName !== user.displayName) { patch.displayName = profile.displayName; changes.push("displayName"); }
  const deactivating = profile.status === "inactive" && user.status === "active";
  if (profile.status !== user.status) {
    patch.status = profile.status;
    patch.deactivatedAt = profile.status === "inactive" ? now : undefined;
    patch.deactivatedBy = undefined;
    changes.push("status");
  }
  const roleChanged = user.roleId !== profile.role._id;
  if (roleChanged) {
    patch.roleId = profile.role._id;
    patch.internalRole = legacyInternalRoleForRoleSlug(profile.role.slug);
    patch.isInternal = profile.role.type === "internal";
    changes.push("roleId");
  }
  if (changes.length === 0) return;
  patch.updatedAt = now;
  await patchWithMediaReferences<"users">(ctx, "users", user._id, patch);
  if (roleChanged) await recordRoleAssignment(ctx, user, profile.role, profile.linkedBy, now);
  if (deactivating) {
    await emitEvent(ctx, PROFILE_EVENTS.DEACTIVATED, SYSTEM.PROFILE, {
      userId: user._id, email: profile.email, reason: SYNC_SOURCE, source: SYNC_SOURCE,
    });
  }
  const profileChanges = changes.filter((change) => change !== "roleId" && !(deactivating && change === "status"));
  if (profileChanges.length > 0) {
    await emitEvent(ctx, PROFILE_EVENTS.UPDATED, SYSTEM.PROFILE, {
      userId: user._id, changes: profileChanges, source: SYNC_SOURCE,
    });
  }
}

async function createOperator(ctx: MutationCtx, profile: OperatorProfile, now: number): Promise<Id<"users">> {
  const displayName = profile.displayName ?? generateDisplayName(profile.firstName, profile.lastName, profile.email);
  const slug = await ensureUniqueSlug(ctx, generateSlug(displayName));
  const userId: Id<"users"> = await insertWithMediaReferences<"users">(ctx, "users", {
    // No passwordHash and no clerkUserId: sign-in belongs to the integrator.
    authSource: "external",
    email: profile.email,
    // The integrator's identity provider vouches for the address.
    emailVerified: true,
    emailVerifiedAt: now,
    firstName: profile.firstName,
    lastName: profile.lastName,
    displayName,
    slug,
    roleId: profile.role._id,
    internalRole: legacyInternalRoleForRoleSlug(profile.role.slug),
    isInternal: profile.role.type === "internal",
    status: profile.status,
    ...(profile.status === "inactive" ? { deactivatedAt: now } : {}),
    registrationMethod: SYNC_SOURCE,
    registeredAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("roleChanges", {
    userId,
    newRoleId: profile.role._id,
    changedBy: userId,
    reason: profile.linkedBy ? `${SYNC_SOURCE}: ${profile.linkedBy}` : SYNC_SOURCE,
    timestamp: now,
  });
  return userId;
}

async function insertLink(
  ctx: MutationCtx,
  userId: Id<"users">,
  key: ExternalIdentityKey,
  linkedBy: string | undefined,
  label: string | undefined,
  now: number,
): Promise<void> {
  await ctx.db.insert("userExternalIdentities", {
    userId,
    issuer: key.issuer,
    subject: key.subject,
    tokenIdentifier: key.tokenIdentifier,
    linkedAt: now,
    ...(linkedBy !== undefined ? { linkedBy } : {}),
    ...(label !== undefined ? { label } : {}),
  });
  await emitEvent(ctx, PROFILE_EVENTS.UPDATED, SYSTEM.PROFILE, {
    userId, changes: ["external_identity_linked"], issuer: key.issuer, source: SYNC_SOURCE,
  });
}

// ─── Integrator API ─────────────────────────────────────────────────────────

/**
 * Create or update an external operator and its identity link. Idempotent:
 * repeating the same call changes nothing and returns `created: false`.
 *
 * Refuses (typed conflict, the account is left unchanged) when the email belongs to a
 * local, Clerk or management account, or to an external account linked to a
 * different identity; when the identity is linked to a non-external account;
 * or when a ConvexPress administrator banned the account.
 *
 * Throws EXTERNAL_IDENTITY_INVALID for malformed or reserved issuers/subjects
 * or an invalid email, and EXTERNAL_OPERATOR_ROLE_UNAVAILABLE for a role an
 * external operator cannot hold.
 */
export const upsertExternalOperator = internalMutation({
  args: {
    ...identityArgs,
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    roleSlug: v.string(),
    status: operatorStatusValidator,
    /** Integrator actor reference recorded on a new link and in the role audit row. */
    linkedBy: v.optional(v.string()),
    /** Integrator description of the link, e.g. "CaseMedix staff". */
    label: v.optional(v.string()),
  },
  returns: upsertResultValidator,
  handler: async (ctx, args) => {
    const key = externalIdentityKey(args);
    const email = normalizeEmail(args.email);
    if (!email) invalid("A valid email address is required.");
    const role = await requireOperatorRole(ctx, args.roleSlug);
    const linkedBy = optionalText(args.linkedBy, MAX_LINKED_BY_LENGTH);
    const label = optionalText(args.label, MAX_LABEL_LENGTH);
    const profile: OperatorProfile = {
      email,
      firstName: optionalText(args.firstName, MAX_CLERK_NAME_LENGTH),
      lastName: optionalText(args.lastName, MAX_CLERK_NAME_LENGTH),
      displayName: optionalText(args.displayName, MAX_CLERK_NAME_LENGTH),
      status: args.status,
      role,
      linkedBy,
    };
    const now = Date.now();

    let link = await readLink(ctx, key);
    let linkedUser = link ? await ctx.db.get("users", link.userId) : null;
    if (link && !linkedUser) {
      // The account was deleted without its link. Drop the dangling link and
      // treat the identity as unlinked.
      await ctx.db.delete("userExternalIdentities", link._id);
      link = null;
    }
    if (linkedUser && linkedUser.authSource !== "external") {
      return { ok: false as const, reason: "identity_conflict" as const, message: "This identity is linked to an account that does not use external sign-in." };
    }

    const owners = await emailOwners(ctx, email);
    const otherOwner = owners.find((owner) => owner._id !== linkedUser?._id);
    if (otherOwner && otherOwner.authSource !== "external") {
      return { ok: false as const, reason: "email_conflict" as const, message: "This email belongs to an existing ConvexPress account that does not use external sign-in." };
    }

    if (!linkedUser && otherOwner) {
      // An external account with this email exists. Adopt it only when no
      // other identity is linked to it (for example after unlinkExternalIdentity).
      const otherLinks = await ctx.db
        .query("userExternalIdentities")
        .withIndex("by_user", (q) => q.eq("userId", otherOwner._id))
        .take(1);
      if (otherLinks.length > 0) {
        return { ok: false as const, reason: "email_conflict" as const, message: "This email belongs to an external account linked to a different identity." };
      }
      linkedUser = otherOwner;
    } else if (linkedUser && otherOwner) {
      return { ok: false as const, reason: "email_conflict" as const, message: "This email belongs to another external account." };
    }

    if (linkedUser?.status === "banned") {
      return { ok: false as const, reason: "account_banned" as const, message: "A ConvexPress administrator banned this account. Lift the ban in ConvexPress before syncing it." };
    }

    if (linkedUser) {
      await applyOperatorProfile(ctx, linkedUser, profile, now);
      if (link) {
        if (label !== undefined && label !== link.label) await ctx.db.patch("userExternalIdentities", link._id, { label });
      } else {
        await insertLink(ctx, linkedUser._id, key, linkedBy, label, now);
      }
      return { ok: true as const, userId: linkedUser._id, created: false };
    }

    const userId = await createOperator(ctx, profile, now);
    await insertLink(ctx, userId, key, linkedBy, label, now);
    return { ok: true as const, userId, created: true };
  },
});

/**
 * Deactivate the external operator linked to an identity. Afterwards the
 * identity resolves to no user. The link is kept so a later
 * upsertExternalOperator with status "active" can restore access.
 */
export const deactivateExternalOperator = internalMutation({
  args: identityArgs,
  returns: v.union(
    v.object({ ok: v.literal(false), reason: v.literal("not_found") }),
    v.object({ ok: v.literal(true), userId: v.id("users"), changed: v.boolean() }),
  ),
  handler: async (ctx, args) => {
    const key = externalIdentityKey(args);
    const link = await readLink(ctx, key);
    const user = link ? await ctx.db.get("users", link.userId) : null;
    if (!user || user.authSource !== "external") return { ok: false as const, reason: "not_found" as const };
    if (user.status !== "active") return { ok: true as const, userId: user._id, changed: false };
    const now = Date.now();
    await patchWithMediaReferences<"users">(ctx, "users", user._id, {
      status: "inactive",
      deactivatedAt: now,
      deactivatedBy: undefined,
      updatedAt: now,
    });
    await emitEvent(ctx, PROFILE_EVENTS.DEACTIVATED, SYSTEM.PROFILE, {
      userId: user._id, email: user.email, reason: SYNC_SOURCE, source: SYNC_SOURCE,
    });
    return { ok: true as const, userId: user._id, changed: true };
  },
});

/** Read the external operator linked to an identity, or null. */
export const getExternalOperator = internalQuery({
  args: identityArgs,
  returns: v.union(v.null(), externalOperatorValidator),
  handler: async (ctx, args) => {
    const key = externalIdentityKey(args);
    const link = await readLink(ctx, key);
    if (!link) return null;
    const user = await ctx.db.get("users", link.userId);
    if (!user || user.authSource !== "external") return null;
    const role = user.roleId ? await ctx.db.get("roles", user.roleId) : null;
    return {
      userId: user._id,
      issuer: link.issuer,
      subject: link.subject,
      tokenIdentifier: link.tokenIdentifier,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      status: user.status,
      roleSlug: role?.slug ?? null,
      linkedAt: link.linkedAt,
      linkedBy: link.linkedBy,
      label: link.label,
    };
  },
});

/**
 * Remove the link between an identity and its account. The identity then
 * resolves to no user. The account itself (and its authored content) stays;
 * it can be re-linked by upsertExternalOperator with the same email.
 */
export const unlinkExternalIdentity = internalMutation({
  args: identityArgs,
  returns: v.object({ removed: v.boolean(), userId: v.union(v.id("users"), v.null()) }),
  handler: async (ctx, args) => {
    const key = externalIdentityKey(args);
    const link = await readLink(ctx, key);
    if (!link) return { removed: false, userId: null };
    await ctx.db.delete("userExternalIdentities", link._id);
    await emitEvent(ctx, PROFILE_EVENTS.UPDATED, SYSTEM.PROFILE, {
      userId: link.userId, changes: ["external_identity_unlinked"], issuer: link.issuer, source: SYNC_SOURCE,
    });
    return { removed: true, userId: link.userId };
  },
});
