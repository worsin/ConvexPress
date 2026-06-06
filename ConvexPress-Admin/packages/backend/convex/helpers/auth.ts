import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getCurrentUser, requireAuth } from "./permissions";

type AuthCtx = Pick<QueryCtx, "auth" | "db">;
type ReadCtx = Pick<QueryCtx, "db">;
type UserAccessFields = {
  roleId?: Id<"roles">;
  isInternal?: boolean;
  internalRole?: string;
};

// ─── Consolidated Re-exports (MEDIUM-6 fix) ────────────────────────────────
// getCurrentUser and requireAuth are re-exported from permissions.ts
// which includes the active status check. This ensures ALL callers
// (whether they import from helpers/auth or helpers/permissions)
// get the version that rejects banned/inactive users.
export {
  getCurrentUser,
  requireAuth,
  getUserIdentifier,
  lookupUserByIdentifier,
} from "./permissions";

export type InternalRole =
  | "admin"
  | "editor"
  | "author"
  | "contributor"
  | "support"
  | "customer";

// ─── Identity Retrieval ─────────────────────────────────────────────────────

export async function getIdentity(ctx: AuthCtx) {
  return await ctx.auth.getUserIdentity();
}

async function hasInternalRoleAccess(
  ctx: ReadCtx,
  user: UserAccessFields,
): Promise<boolean> {
  if (user.roleId) {
    const role = await ctx.db.get("roles", user.roleId);
    return !!role && role.status === "active" && role.type === "internal";
  }

  return user.isInternal === true;
}

async function hasAdministratorRoleAccess(
  ctx: ReadCtx,
  user: UserAccessFields,
): Promise<boolean> {
  if (user.roleId) {
    const role = await ctx.db.get("roles", user.roleId);
    return (
      !!role &&
      role.status === "active" &&
      role.type === "internal" &&
      role.slug === "administrator"
    );
  }

  return user.isInternal === true && user.internalRole === "admin";
}

// ─── Internal User Classification ────────────────────────────────────────────

/**
 * @deprecated Use `getCurrentRoleLevel(ctx)` from `helpers/permissions.ts` and check
 * for role type "internal" instead. This checks the legacy `isInternal` field.
 */
export async function isInternal(
  ctx: AuthCtx,
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  if (!user) return false;
  return await hasInternalRoleAccess(ctx, user);
}

/**
 * @deprecated Use `requireCan(ctx, capability)` from `helpers/permissions.ts` instead.
 * This checks the legacy `isInternal` field rather than the capability system.
 */
export async function requireInternal(ctx: AuthCtx) {
  const user = await requireAuth(ctx);
  if (!(await hasInternalRoleAccess(ctx, user))) {
    throw new Error("Internal team access required");
  }
  return user;
}

// ─── Admin-Specific Checks ──────────────────────────────────────────────────

/**
 * @deprecated Use `requireCan(ctx, "role.create")` or `getCurrentRoleLevel(ctx) >= 100`
 * from `helpers/permissions.ts` instead. This function bypasses the capability system
 * and only checks legacy `isInternal` / `internalRole` fields.
 */
export async function isAdmin(ctx: AuthCtx): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  if (!user) return false;
  return await hasAdministratorRoleAccess(ctx, user);
}

/**
 * @deprecated Use `requireCan(ctx, capability)` from `helpers/permissions.ts` instead.
 * This function bypasses the capability system and only checks legacy fields.
 */
export async function requireAdmin(ctx: AuthCtx) {
  const user = await requireAuth(ctx);
  if (!(await hasAdministratorRoleAccess(ctx, user))) {
    throw new Error("Admin access required");
  }
  return user;
}

// ─── Role Hierarchy (Legacy) ────────────────────────────────────────────────
// @deprecated - Use the roles table and getCurrentRoleLevel() from helpers/permissions.ts instead.

const LEGACY_ROLE_HIERARCHY: Record<string, number> = {
  admin: 100,
  editor: 80,
  author: 60,
  contributor: 40,
  support: 30,
  customer: 10,
};

/**
 * @deprecated Use `getCurrentRoleLevel(ctx)` from `helpers/permissions.ts` instead.
 * This function falls back to a legacy hardcoded hierarchy.
 */
export async function getRoleLevel(
  ctx: ReadCtx,
  roleSlug: string | null | undefined,
): Promise<number> {
  if (!roleSlug) return 0;

  const role = await ctx.db
    .query("roles")
    .withIndex("by_slug", (q) => q.eq("slug", roleSlug))
    .unique();

  // In the current schema, role.level IS the numeric level directly:
  // Administrator=100, Editor=80, Author=60, Contributor=40, Subscriber=20
  if (role && role.status === "active") {
    return role.level;
  }

  return LEGACY_ROLE_HIERARCHY[roleSlug] ?? 0;
}

/**
 * @deprecated Use `hasMinimumRoleLevel(ctx, level)` from `helpers/permissions.ts` instead.
 */
export async function hasRoleOrHigher(
  ctx: AuthCtx,
  minimumRoleSlug: InternalRole,
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  if (!user || !user.internalRole) return false;

  const userLevel = await getRoleLevel(ctx, user.internalRole);
  const requiredLevel = await getRoleLevel(ctx, minimumRoleSlug);

  return userLevel >= requiredLevel;
}

/**
 * @deprecated Use `requireMinimumRoleLevel(ctx, level)` from `helpers/permissions.ts` instead.
 */
export async function requireRoleOrHigher(
  ctx: AuthCtx,
  minimumRoleSlug: InternalRole,
) {
  const user = await requireAuth(ctx);

  const userLevel = await getRoleLevel(ctx, user.internalRole);
  const requiredLevel = await getRoleLevel(ctx, minimumRoleSlug);

  if (userLevel < requiredLevel) {
    throw new Error(`Role '${minimumRoleSlug}' or higher required`);
  }

  return user;
}

// ─── Role-Specific Helpers (Legacy) ─────────────────────────────────────────

/**
 * @deprecated Use `currentUserCan(ctx, capability)` from `helpers/permissions.ts` instead.
 * This checks the legacy `internalRole` field rather than the capability system.
 */
export async function hasRole(
  ctx: AuthCtx,
  role: InternalRole,
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  if (!user) return false;
  return user.internalRole === role;
}

/**
 * @deprecated Use `hasMinimumRoleLevel(ctx, 40)` from `helpers/permissions.ts` instead.
 */
export async function isEmployee(
  ctx: AuthCtx,
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  if (!user || user.isInternal !== true) return false;

  const employeeRoles: InternalRole[] = [
    "admin",
    "editor",
    "author",
    "contributor",
    "support",
  ];
  return employeeRoles.includes(user.internalRole as InternalRole);
}

/**
 * @deprecated Use role type checks via the capability system instead.
 */
export async function isCustomer(
  ctx: AuthCtx,
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  // Return false for unauthenticated users (null) to prevent
  // authorization bypass when used as a gate check
  if (!user) return false;
  return user.isInternal !== true;
}

// ─── Owner/Admin Resource Access (Legacy) ───────────────────────────────────

/**
 * @deprecated Use `requireCanOnResource(ctx, metaCap, resourceId)` from
 * `helpers/permissions.ts` instead. This checks legacy `isInternal`/`internalRole` fields.
 */
export async function requireAdminOrOwner(
  ctx: AuthCtx,
  resourceUserId: Id<"users">,
) {
  const user = await requireAuth(ctx);
  const adminStatus = await hasAdministratorRoleAccess(ctx, user);

  if (!adminStatus && user._id !== resourceUserId) {
    throw new Error("Access denied");
  }

  return user;
}

/**
 * @deprecated Use `requireCanOnResource(ctx, metaCap, resourceId)` from
 * `helpers/permissions.ts` instead. This checks legacy `isInternal`/`internalRole` fields.
 */
export async function canAccessResource(
  ctx: AuthCtx,
  resourceUserId: Id<"users">,
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  if (!user) return false;

  const adminStatus = await hasAdministratorRoleAccess(ctx, user);
  return adminStatus || user._id === resourceUserId;
}
