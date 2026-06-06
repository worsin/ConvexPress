/**
 * Role & Capability System - Internal Functions
 *
 * Functions that are NOT callable from clients. Used for:
 *   - Database seeding (CLI / dashboard triggers)
 *   - System-to-system operations
 *   - Migration utilities
 *
 * Internal functions use internalMutation/internalQuery and are
 * invoked via `npx convex run` or from other server-side functions.
 */

import { ConvexError } from "convex/values";
import { internalMutation } from "../_generated/server";
import { BUILT_IN_ROLES, LEGACY_ROLE_MAP } from "../seed/roles";

const ADMIN_SETUP_PAGE_ACCESS = "/admin/setup";

// ─── Seed Roles ─────────────────────────────────────────────────────────────

/**
 * Idempotent seed function that creates the 5 built-in WordPress-standard roles.
 *
 * Behavior:
 *   - If a role with the same slug already exists, it is SKIPPED (not overwritten)
 *   - Only creates missing roles
 *   - Safe to call multiple times
 *
 * Usage:
 *   npx convex run roles/internals:seedRoles
 */
export const seedRoles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const created: string[] = [];
    const skipped: string[] = [];

    for (const roleDef of BUILT_IN_ROLES) {
      // Check if this role already exists by slug
      const existing = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", roleDef.slug))
        .unique();

      if (existing) {
        skipped.push(roleDef.slug);
        continue;
      }

      const now = Date.now();
      await ctx.db.insert("roles", {
        name: roleDef.name,
        slug: roleDef.slug,
        description: roleDef.description,
        level: roleDef.level,
        type: roleDef.type,
        isDefault: roleDef.isDefault,
        isProtected: roleDef.isProtected,
        capabilities: roleDef.capabilities,
        pageAccess: roleDef.pageAccess,
        status: roleDef.status,
        createdAt: now,
        updatedAt: now,
      });

      created.push(roleDef.slug);
    }

    return {
      message: `Seed complete. Created: ${created.length}, Skipped: ${skipped.length}`,
      created,
      skipped,
    };
  },
});

// ─── Reseed Roles (Force Update) ────────────────────────────────────────────

/**
 * Force-update all built-in roles to match the current seed data.
 * This OVERWRITES capabilities, pageAccess, and other fields for existing built-in roles.
 *
 * WARNING: This will reset any manual customizations made to built-in roles.
 * Use only when the seed data has been updated with new capabilities.
 *
 * Usage:
 *   npx convex run roles/internals:reseedRoles
 */
export const reseedRoles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const updated: string[] = [];
    const created: string[] = [];

    for (const roleDef of BUILT_IN_ROLES) {
      const existing = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", roleDef.slug))
        .unique();

      const now = Date.now();

      if (existing) {
        await ctx.db.patch("roles", existing._id, {
          name: roleDef.name,
          description: roleDef.description,
          level: roleDef.level,
          type: roleDef.type,
          isDefault: roleDef.isDefault,
          isProtected: roleDef.isProtected,
          capabilities: roleDef.capabilities,
          pageAccess: roleDef.pageAccess,
          status: roleDef.status,
          updatedAt: now,
        });
        updated.push(roleDef.slug);
      } else {
        await ctx.db.insert("roles", {
          name: roleDef.name,
          slug: roleDef.slug,
          description: roleDef.description,
          level: roleDef.level,
          type: roleDef.type,
          isDefault: roleDef.isDefault,
          isProtected: roleDef.isProtected,
          capabilities: roleDef.capabilities,
          pageAccess: roleDef.pageAccess,
          status: roleDef.status,
          createdAt: now,
          updatedAt: now,
        });
        created.push(roleDef.slug);
      }
    }

    return {
      message: `Reseed complete. Updated: ${updated.length}, Created: ${created.length}`,
      updated,
      created,
    };
  },
});

// ─── Targeted Page Access Repair ────────────────────────────────────────────

/**
 * Add the setup page to the protected Administrator role without overwriting
 * any existing built-in role customizations. Use this when a live deployment
 * predates the `/setup` first-run checklist route.
 */
export const ensureAdminSetupPageAccess = internalMutation({
  args: {},
  handler: async (ctx) => {
    const administrator = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
      .unique();

    if (!administrator) {
      return {
        updated: false,
        reason: "Administrator role is not seeded",
      };
    }

    if (administrator.pageAccess.includes(ADMIN_SETUP_PAGE_ACCESS)) {
      return {
        updated: false,
        reason: "Administrator role already has setup page access",
      };
    }

    await ctx.db.patch("roles", administrator._id, {
      pageAccess: [...administrator.pageAccess, ADMIN_SETUP_PAGE_ACCESS],
      updatedAt: Date.now(),
    });

    return {
      updated: true,
      added: ADMIN_SETUP_PAGE_ACCESS,
    };
  },
});

// ─── Migrate Legacy Roles ───────────────────────────────────────────────────

/**
 * Migrate users from the legacy internalRole string field to the new roleId system.
 *
 * For each user that has an internalRole but no roleId:
 *   1. Maps the legacy slug to the new role slug via LEGACY_ROLE_MAP
 *   2. Looks up the new role by slug
 *   3. Sets the user's roleId
 *
 * Safe to run multiple times - only processes users without roleId.
 *
 * Usage:
 *   npx convex run roles/internals:migrateLegacyRoles
 */
export const migrateLegacyRoles = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all users who have internalRole but no roleId
    const allUsers = await ctx.db.query("users").collect();
    const usersToMigrate = allUsers.filter(
      (u) => u.internalRole && !u.roleId,
    );

    let migrated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const user of usersToMigrate) {
      const legacyRole = user.internalRole!;
      const newSlug = LEGACY_ROLE_MAP[legacyRole] ?? legacyRole;

      const role = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", newSlug))
        .unique();

      if (!role) {
        failed++;
        errors.push(
          `User ${user.email}: no role found for slug "${newSlug}" (legacy: "${legacyRole}")`,
        );
        continue;
      }

      await ctx.db.patch("users", user._id, {
        roleId: role._id,
        updatedAt: Date.now(),
      });

      migrated++;
    }

    return {
      message: `Migration complete. Migrated: ${migrated}, Failed: ${failed}, Already migrated: ${allUsers.length - usersToMigrate.length}`,
      migrated,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});
