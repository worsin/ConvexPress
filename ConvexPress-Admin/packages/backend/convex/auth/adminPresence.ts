import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type DbCtx = Pick<QueryCtx, "db">;

type AdminCandidate = {
  _id?: unknown;
  roleId?: unknown;
  status?: string;
  authSource?: string;
  passwordHash?: string;
  isInternal?: boolean;
  internalRole?: string;
};

export function canUseLocalAdminLogin(user: AdminCandidate): boolean {
  return (
    user.status === "active" &&
    user.authSource === "local" &&
    typeof user.passwordHash === "string" &&
    user.passwordHash.length > 0
  );
}

function isActiveLegacyAdmin(user: AdminCandidate): boolean {
  return (
    canUseLocalAdminLogin(user) &&
    !user.roleId &&
    user.isInternal === true &&
    user.internalRole === "admin"
  );
}

function isExcluded(user: AdminCandidate, excludedUserId?: unknown): boolean {
  return (
    excludedUserId !== undefined &&
    user._id !== undefined &&
    String(user._id) === String(excludedUserId)
  );
}

/**
 * An external operator (an integrator's staff, see users/externalIdentities.ts)
 * signs in through the integrator's identity provider rather than a local
 * password. It administers the site when its account is active and still
 * linked to an identity; an unlinked account resolves to no user.
 */
async function canSignInAsExternalOperator(
  ctx: DbCtx,
  user: Doc<"users">,
): Promise<boolean> {
  if (user.status !== "active" || user.authSource !== "external") return false;
  const link = await ctx.db
    .query("userExternalIdentities")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();
  return link !== null;
}

/**
 * Return true only when there is an active administrator account that can keep
 * the admin surface out of first-run setup mode: a local administrator with a
 * password, or a linked external administrator. Clerk (website) and management
 * records never count, because they cannot open the admin surface.
 */
async function hasActiveAdminExcept(
  ctx: DbCtx,
  excludedUserId?: Id<"users">,
): Promise<boolean> {
  const adminRole = await ctx.db
    .query("roles")
    .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
    .unique();

  if (adminRole) {
    const roleAdmins = await ctx.db
      .query("users")
      .withIndex("by_roleId", (q) => q.eq("roleId", adminRole._id))
      .collect();

    for (const user of roleAdmins) {
      if (isExcluded(user, excludedUserId)) continue;
      if (canUseLocalAdminLogin(user)) return true;
      if (await canSignInAsExternalOperator(ctx, user)) return true;
    }
  }

  const legacyAdmins = await ctx.db
    .query("users")
    .withIndex("by_internal_role", (q) => q.eq("internalRole", "admin"))
    .collect();

  return legacyAdmins.some(
    (user) =>
      !isExcluded(user, excludedUserId) && isActiveLegacyAdmin(user),
  );
}

/**
 * Whether a user may sign in to the admin surface with local credentials:
 * an active internal role, or the legacy `isInternal` flag when no role is set.
 */
export async function canUseAdminLocalAuth(
  ctx: DbCtx,
  user: { isInternal?: boolean; roleId?: Id<"roles"> },
): Promise<boolean> {
  if (user.roleId) {
    const role = await ctx.db.get("roles", user.roleId);
    return !!role && role.status === "active" && role.type === "internal";
  }

  return user.isInternal === true;
}

export async function hasActiveAdmin(ctx: DbCtx): Promise<boolean> {
  return await hasActiveAdminExcept(ctx);
}

export async function hasOtherActiveAdmin(
  ctx: DbCtx,
  excludedUserId: Id<"users">,
): Promise<boolean> {
  return await hasActiveAdminExcept(ctx, excludedUserId);
}
