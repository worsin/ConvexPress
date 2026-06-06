/**
 * Role & Capability System - Mutations
 *
 * All write operations for managing roles and role assignments.
 * Every mutation requires appropriate capabilities via requireCan.
 *
 * Mutations:
 *   create           - Create a new custom role
 *   update           - Update an existing role's properties
 *   remove           - Delete a non-protected role with no assigned users
 *   assign           - Assign a role to a user (with audit trail)
 *   grantCapability  - Add a capability to a role
 *   revokeCapability - Remove a capability from a role
 */

import { ConvexError } from "convex/values";
import { mutation, type MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireCan, resolveUserRole } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { ROLE_EVENTS, SYSTEM } from "../events/constants";
import { isValidCapability, type Capability } from "../types/capabilities";
import {
  assignRoleArgs,
  createRoleArgs,
  grantCapabilityArgs,
  revokeCapabilityArgs,
  updateRoleArgs,
} from "./validators";

/**
 * The slug for the Administrator role in the NEW capability system.
 * Distinct from the legacy "admin" slug used in the `internalRole` field.
 * See LEGACY_ROLE_MAP in seed/roles.ts: legacy "admin" maps to new "administrator".
 */
const ADMIN_ROLE_SLUG = "administrator";
const SELF_ROLE_BASELINE_CAPABILITY = "role.update" satisfies Capability;
const ADMIN_BASELINE_CAPABILITY = "manage_options" satisfies Capability;
const ADMIN_SETUP_PAGE_ACCESS = "/admin/setup";
const ROLE_MANAGEMENT_PAGE_ACCESS = "/admin/roles";

type AuthenticatedRoleUser = Awaited<ReturnType<typeof requireCan>>;

function idsMatch(left: unknown, right: unknown): boolean {
  return String(left) === String(right);
}

async function isCallerCurrentRole(
  ctx: MutationCtx,
  user: AuthenticatedRoleUser,
  role: Doc<"roles">,
): Promise<boolean> {
  if (user.roleId && idsMatch(user.roleId, role._id)) return true;

  const currentRole = await resolveUserRole(ctx, user);
  return !!currentRole && idsMatch(currentRole._id, role._id);
}

async function assertOwnRolePolicyRemainsUsable(
  ctx: MutationCtx,
  user: AuthenticatedRoleUser,
  role: Doc<"roles">,
  next: {
    capabilities: string[];
    pageAccess: string[];
    status: "active" | "inactive";
    type: "internal" | "customer" | "system";
  },
) {
  if (!(await isCallerCurrentRole(ctx, user, role))) return;

  const requiredCapabilities = new Set<Capability>([
    SELF_ROLE_BASELINE_CAPABILITY,
  ]);
  if (
    role.slug === ADMIN_ROLE_SLUG ||
    role.capabilities.includes(ADMIN_BASELINE_CAPABILITY)
  ) {
    requiredCapabilities.add(ADMIN_BASELINE_CAPABILITY);
  }

  const missingCapabilities = [...requiredCapabilities].filter(
    (capability) => !next.capabilities.includes(capability),
  );
  const requiredPageAccess = new Set<string>();
  if (
    role.slug === ADMIN_ROLE_SLUG ||
    role.pageAccess.includes(ADMIN_SETUP_PAGE_ACCESS)
  ) {
    requiredPageAccess.add(ADMIN_SETUP_PAGE_ACCESS);
  }
  if (role.pageAccess.includes(ROLE_MANAGEMENT_PAGE_ACCESS)) {
    requiredPageAccess.add(ROLE_MANAGEMENT_PAGE_ACCESS);
  }
  const missingPageAccess = [...requiredPageAccess].filter(
    (route) => !next.pageAccess.includes(route),
  );

  if (
    next.status !== "active" ||
    (role.type === "internal" && next.type !== "internal") ||
    missingCapabilities.length > 0 ||
    missingPageAccess.length > 0
  ) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message:
        "Cannot remove administrative access from your current role. Ask another administrator.",
    });
  }
}

// ─── Create ─────────────────────────────────────────────────────────────────

/**
 * Create a new custom role.
 *
 * Requirements:
 *   - Caller must have "role.create" capability
 *   - Slug must be unique
 *   - All capabilities must be valid
 *   - Custom roles are never protected (only built-in roles are)
 */
export const create = mutation({
  args: createRoleArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "role.create");

    // Validate slug uniqueness
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existing) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `Role with slug "${args.slug}" already exists`,
      });
    }

    // Validate all capabilities
    for (const cap of args.capabilities) {
      if (!isValidCapability(cap)) {
        throw new ConvexError({
          code: "VALIDATION",
          message: `Invalid capability: "${cap}"`,
        });
      }
    }

    // Validate level is within range
    if (args.level < 1 || args.level > 99) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Role level must be between 1 and 99 (100 is reserved for Administrator)",
      });
    }

    const now = Date.now();
    const roleId = await ctx.db.insert("roles", {
      name: args.name,
      slug: args.slug,
      description: args.description,
      level: args.level,
      type: args.type,
      isDefault: args.isDefault ?? false,
      isProtected: false, // Custom roles are never protected
      capabilities: args.capabilities,
      pageAccess: args.pageAccess,
      status: "active",
      createdAt: now,
      updatedAt: now,
      createdBy: user._id,
    });

    // If this role is set as default, unset other defaults
    if (args.isDefault) {
      const allRoles = await ctx.db
        .query("roles")
        .withIndex("by_isDefault", (q) => q.eq("isDefault", true))
        .collect();

      for (const role of allRoles) {
        if (role._id !== roleId) {
          await ctx.db.patch("roles", role._id, { isDefault: false, updatedAt: now });
        }
      }
    }

    await emitEvent(ctx, ROLE_EVENTS.CREATED, SYSTEM.ROLE, {
      roleId,
      roleName: args.name,
      roleSlug: args.slug,
      createdBy: user._id,
    });

    return roleId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

/**
 * Update an existing role.
 *
 * Requirements:
 *   - Caller must have "role.update" capability
 *   - Role must exist
 *   - Slug changes must maintain uniqueness
 *   - Protected roles can be updated (capabilities, name, etc.) but not deleted
 *   - All capabilities must be valid
 */
export const update = mutation({
  args: updateRoleArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "role.update");

    const role = await ctx.db.get("roles", args.roleId);
    if (!role) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Role not found",
      });
    }

    // Validate slug uniqueness if changing
    if (args.slug && args.slug !== role.slug) {
      const existing = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug!))
        .unique();

      if (existing) {
        throw new ConvexError({
          code: "CONFLICT",
          message: `Role with slug "${args.slug}" already exists`,
        });
      }
    }

    // Validate capabilities if provided
    if (args.capabilities) {
      for (const cap of args.capabilities) {
        if (!isValidCapability(cap)) {
          throw new ConvexError({
            code: "VALIDATION",
            message: `Invalid capability: "${cap}"`,
          });
        }
      }
    }

    // Validate level if provided
    if (args.level !== undefined) {
      if (args.level < 1 || args.level > 100) {
        throw new ConvexError({
          code: "VALIDATION",
          message: "Role level must be between 1 and 100",
        });
      }
    }

    const now = Date.now();

    // Build the patch object with only provided fields
    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.name !== undefined) patch.name = args.name;
    if (args.slug !== undefined) patch.slug = args.slug;
    if (args.description !== undefined) patch.description = args.description;
    if (args.level !== undefined) patch.level = args.level;
    if (args.type !== undefined) patch.type = args.type;
    if (args.capabilities !== undefined) patch.capabilities = args.capabilities;
    if (args.pageAccess !== undefined) patch.pageAccess = args.pageAccess;
    if (args.status !== undefined) patch.status = args.status;

    // Handle isDefault changes
    if (args.isDefault !== undefined) {
      patch.isDefault = args.isDefault;

      // If setting as default, unset other defaults
      if (args.isDefault) {
        const allDefaults = await ctx.db
          .query("roles")
          .withIndex("by_isDefault", (q) => q.eq("isDefault", true))
          .collect();

        for (const r of allDefaults) {
          if (r._id !== args.roleId) {
            await ctx.db.patch("roles", r._id, { isDefault: false, updatedAt: now });
          }
        }
      }
    }

    await assertOwnRolePolicyRemainsUsable(ctx, user, role, {
      capabilities: args.capabilities ?? role.capabilities,
      pageAccess: args.pageAccess ?? role.pageAccess,
      status: args.status ?? role.status,
      type: args.type ?? role.type,
    });

    await ctx.db.patch("roles", args.roleId, patch);

    await emitEvent(ctx, ROLE_EVENTS.UPDATED, SYSTEM.ROLE, {
      roleId: args.roleId,
      roleName: role.name,
      roleSlug: role.slug,
      updatedBy: user._id,
      changes: Object.keys(patch).filter((k) => k !== "updatedAt"),
    });

    return args.roleId;
  },
});

// ─── Delete ─────────────────────────────────────────────────────────────────

/**
 * Delete a non-protected role.
 *
 * Requirements:
 *   - Caller must have "role.delete" capability
 *   - Role must exist and NOT be protected
 *   - Role must have NO users assigned to it
 */
export const remove = mutation({
  args: { roleId: updateRoleArgs.roleId },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "role.delete");

    const role = await ctx.db.get("roles", args.roleId);
    if (!role) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Role not found",
      });
    }

    // Cannot delete protected (built-in) roles
    if (role.isProtected) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: `Cannot delete protected role "${role.name}". Built-in roles cannot be removed.`,
      });
    }

    // Check for users assigned to this role via roleId
    const assignedUsers = await ctx.db
      .query("users")
      .withIndex("by_roleId", (q) => q.eq("roleId", args.roleId))
      .first();

    if (assignedUsers) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `Cannot delete role "${role.name}" because users are still assigned to it. Reassign users first.`,
      });
    }

    await ctx.db.delete("roles", args.roleId);

    await emitEvent(ctx, ROLE_EVENTS.DELETED, SYSTEM.ROLE, {
      roleSlug: role.slug,
      roleName: role.name,
      deletedBy: user._id,
    });

    return { success: true, deletedRole: role.slug };
  },
});

// ─── Assign ─────────────────────────────────────────────────────────────────

/**
 * Assign a role to a user.
 *
 * Requirements:
 *   - Caller must have "role.assign" capability
 *   - Target user must exist
 *   - Target role must exist and be active
 *   - Cannot change own role (self-role-change prevention)
 *   - Last admin protection: cannot remove the last Administrator
 *
 * Side effects:
 *   - Creates a roleChanges audit record
 *   - Updates the user's roleId field
 *   - Also updates legacy internalRole field for backward compatibility
 */
export const assign = mutation({
  args: assignRoleArgs,
  handler: async (ctx, args) => {
    const currentUser = await requireCan(ctx, "role.assign");

    // Prevent self-role-change
    if (currentUser._id === args.userId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot change your own role. Ask another administrator.",
      });
    }

    // Validate target user exists
    const targetUser = await ctx.db.get("users", args.userId);
    if (!targetUser) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Target user not found",
      });
    }

    // Validate target role exists and is active
    const newRole = await ctx.db.get("roles", args.roleId);
    if (!newRole) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Target role not found",
      });
    }
    if (newRole.status !== "active") {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Cannot assign an inactive role",
      });
    }

    // Last admin protection
    // If the target user currently has the Administrator role and the new role is different,
    // ensure at least one other Administrator remains.
    const oldRoleId = targetUser.roleId ?? null;
    if (oldRoleId) {
      const oldRole = await ctx.db.get("roles", oldRoleId);
      if (oldRole && oldRole.slug === ADMIN_ROLE_SLUG && newRole.slug !== ADMIN_ROLE_SLUG) {
        // Count how many users have the Administrator role
        const admins = await ctx.db
          .query("users")
          .withIndex("by_roleId", (q) => q.eq("roleId", oldRoleId))
          .collect();

        if (admins.length <= 1) {
          throw new ConvexError({
            code: "FORBIDDEN",
            message: "Cannot remove the last Administrator. Promote another user first.",
          });
        }
      }
    } else if (targetUser.internalRole === "admin") {
      // Legacy admin check - user hasn't been migrated yet
      // Check if there are other admins via legacy field
      const legacyAdmins = await ctx.db
        .query("users")
        .withIndex("by_internal_role", (q) => q.eq("internalRole", "admin"))
        .collect();

      if (legacyAdmins.length <= 1 && newRole.slug !== ADMIN_ROLE_SLUG) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Cannot remove the last Administrator. Promote another user first.",
        });
      }
    }

    const now = Date.now();

    // Create role change audit record
    await ctx.db.insert("roleChanges", {
      userId: args.userId,
      oldRoleId: oldRoleId ?? undefined,
      newRoleId: args.roleId,
      changedBy: currentUser._id,
      reason: args.reason,
      timestamp: now,
    });

    // Map new role slug to legacy internalRole for backward compatibility
    const legacyRoleMap: Record<string, string> = {
      administrator: "admin",
      editor: "editor",
      author: "author",
      contributor: "contributor",
      subscriber: "customer",
    };
    const legacyRole = legacyRoleMap[newRole.slug] ?? newRole.slug;
    const isInternalType = newRole.type === "internal";

    // Update user's role
    await ctx.db.patch("users", args.userId, {
      roleId: args.roleId,
      // Keep legacy fields in sync for backward compatibility
      internalRole: legacyRole,
      isInternal: isInternalType,
      updatedAt: now,
    });

    await emitEvent(ctx, ROLE_EVENTS.ASSIGNED, SYSTEM.ROLE, {
      userId: args.userId,
      newRoleId: args.roleId,
      newRoleName: newRole.name,
      newRoleSlug: newRole.slug,
      oldRoleId,
      changedBy: currentUser._id,
      reason: args.reason,
    });

    return {
      success: true,
      userId: args.userId,
      newRole: newRole.slug,
    };
  },
});

// ─── Grant Capability ───────────────────────────────────────────────────────

/**
 * Add a capability to a role.
 *
 * Requirements:
 *   - Caller must have "role.grant_capability" capability
 *   - Role must exist
 *   - Capability must be valid
 *   - Capability must not already be assigned to the role
 */
export const grantCapability = mutation({
  args: grantCapabilityArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "role.grant_capability");

    const role = await ctx.db.get("roles", args.roleId);
    if (!role) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Role not found",
      });
    }

    if (!isValidCapability(args.capability)) {
      throw new ConvexError({
        code: "VALIDATION",
        message: `Invalid capability: "${args.capability}"`,
      });
    }

    // Ensure capabilities array exists (defensive against legacy data)
    const currentCapabilities = role.capabilities ?? [];

    // Per PRD: if already granted, return early (no-op) rather than throwing
    if (currentCapabilities.includes(args.capability)) {
      return {
        success: true,
        role: role.slug,
        capability: args.capability,
        alreadyGranted: true,
      };
    }

    const now = Date.now();
    await ctx.db.patch("roles", args.roleId, {
      capabilities: [...currentCapabilities, args.capability],
      updatedAt: now,
    });

    await emitEvent(ctx, ROLE_EVENTS.CAPABILITY_GRANTED, SYSTEM.ROLE, {
      roleId: args.roleId,
      roleName: role.name,
      roleSlug: role.slug,
      capability: args.capability,
      grantedBy: user._id,
    });

    return {
      success: true,
      role: role.slug,
      capability: args.capability,
    };
  },
});

// ─── Revoke Capability ──────────────────────────────────────────────────────

/**
 * Remove a capability from a role.
 *
 * Requirements:
 *   - Caller must have "role.revoke_capability" capability
 *   - Role must exist
 *   - Capability must currently be assigned to the role
 */
export const revokeCapability = mutation({
  args: revokeCapabilityArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "role.revoke_capability");

    const role = await ctx.db.get("roles", args.roleId);
    if (!role) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Role not found",
      });
    }

    // Ensure capabilities array exists (defensive against legacy data)
    const currentCapabilities = role.capabilities ?? [];

    // Per PRD: if capability is not assigned, return early (no-op) matching grantCapability pattern
    if (!currentCapabilities.includes(args.capability)) {
      return {
        success: true,
        role: role.slug,
        capability: args.capability,
        alreadyRevoked: true,
      };
    }

    await assertOwnRolePolicyRemainsUsable(ctx, user, role, {
      capabilities: currentCapabilities.filter((c) => c !== args.capability),
      pageAccess: role.pageAccess,
      status: role.status,
      type: role.type,
    });

    const now = Date.now();
    await ctx.db.patch("roles", args.roleId, {
      capabilities: currentCapabilities.filter((c) => c !== args.capability),
      updatedAt: now,
    });

    await emitEvent(ctx, ROLE_EVENTS.CAPABILITY_REVOKED, SYSTEM.ROLE, {
      roleId: args.roleId,
      roleName: role.name,
      roleSlug: role.slug,
      capability: args.capability,
      revokedBy: user._id,
    });

    return {
      success: true,
      role: role.slug,
      capability: args.capability,
    };
  },
});
