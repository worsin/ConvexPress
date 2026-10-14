import * as catalogRevisionWrites from "../media/attachmentGuard";
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

import { ConvexError, v } from "convex/values";
import {
  roleCompatibleWithIdentity,
  CUSTOMER_ROLE_ASSIGNMENT_EXPLANATION,
  legacyInternalRoleForRoleSlug,
} from "../../lib/auth/roleAssignment";
import { mutation, type MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireCan, resolveUserRole } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { ROLE_EVENTS, SYSTEM } from "../events/constants";
import { isValidCapability, type Capability } from "../types/capabilities";
import {
  canUseLocalAdminLogin,
  hasOtherActiveAdmin,
} from "../auth/adminPresence";
import {
  assignRoleArgs,
  createRoleArgs,
  grantCapabilityArgs,
  revokeCapabilityArgs,
  updateRoleArgs,
} from "./validators";
import { patchWithMediaReferences } from "../media/attachmentGuard";

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
  returns: v.id("roles"),
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
    const roleId = await catalogRevisionWrites.insertWithMediaReferences<"roles">(ctx, "roles", {
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
          await catalogRevisionWrites.patchWithMediaReferences<"roles">(ctx, "roles", role._id, { isDefault: false, updatedAt: now });
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
  returns: v.id("roles"),
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
            await catalogRevisionWrites.patchWithMediaReferences<"roles">(ctx, "roles", r._id, { isDefault: false, updatedAt: now });
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

    await catalogRevisionWrites.patchWithMediaReferences<"roles">(ctx, "roles", args.roleId, patch);

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
  returns: v.object({ success: v.boolean(), deletedRole: v.string() }),
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

    await catalogRevisionWrites.deleteWithMediaReferences<"roles">(ctx, "roles", args.roleId);

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
  returns: v.object({
    success: v.boolean(),
    userId: v.id("users"),
    newRole: v.string(),
  }),
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

    if (!roleCompatibleWithIdentity(targetUser, newRole)) {
      throw new ConvexError({
        code: "ROLE_IDENTITY_INCOMPATIBLE",
        message: CUSTOMER_ROLE_ASSIGNMENT_EXPLANATION,
      });
    }

    // Last admin protection
    // If the target user currently has the Administrator role and the new role is different,
    // ensure at least one other Administrator remains.
    const oldRoleId = targetUser.roleId ?? null;
    if (oldRoleId) {
      const oldRole = await ctx.db.get("roles", oldRoleId);
      if (
        oldRole &&
        oldRole.slug === ADMIN_ROLE_SLUG &&
        newRole.slug !== ADMIN_ROLE_SLUG &&
        canUseLocalAdminLogin(targetUser)
      ) {
        if (!(await hasOtherActiveAdmin(ctx, args.userId))) {
          throw new ConvexError({
            code: "FORBIDDEN",
            message: "Cannot remove the last Administrator. Promote another user first.",
          });
        }
      }
    } else if (
      targetUser.internalRole === "admin" &&
      canUseLocalAdminLogin(targetUser)
    ) {
      // Legacy admin check - user hasn't been migrated yet
      if (
        newRole.slug !== ADMIN_ROLE_SLUG &&
        !(await hasOtherActiveAdmin(ctx, args.userId))
      ) {
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
    const legacyRole = legacyInternalRoleForRoleSlug(newRole.slug);
    const isInternalType = newRole.type === "internal";

    // Update user's role
    await patchWithMediaReferences<"users">(ctx, "users", args.userId, {
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
  returns: v.union(v.object({
    success: v.boolean(),
    role: v.string(),
    capability: v.union(v.literal("post.publish"), v.literal("post.unpublish"), v.literal("post.create"), v.literal("post.read"), v.literal("post.update"), v.literal("post.delete"), v.literal("post.schedule"), v.literal("post.trash"), v.literal("post.restore"), v.literal("post.duplicate"), v.literal("post.bulk_delete"), v.literal("post.bulk_publish"), v.literal("post.preview"), v.literal("page.create"), v.literal("page.read"), v.literal("page.read_private"), v.literal("page.update"), v.literal("page.delete"), v.literal("page.publish"), v.literal("page.reorder"), v.literal("page.set_parent"), v.literal("media.read"), v.literal("media.upload"), v.literal("media.update"), v.literal("media.delete"), v.literal("media.crop"), v.literal("media.bulk_delete"), v.literal("taxonomy.create_category"), v.literal("taxonomy.update_category"), v.literal("taxonomy.delete_category"), v.literal("taxonomy.create_tag"), v.literal("taxonomy.update_tag"), v.literal("taxonomy.delete_tag"), v.literal("taxonomy.assign"), v.literal("taxonomy.unassign"), v.literal("taxonomy.merge"), v.literal("comment.create"), v.literal("comment.read"), v.literal("comment.update"), v.literal("comment.delete"), v.literal("comment.reply"), v.literal("comment.approve"), v.literal("comment.reject"), v.literal("comment.spam"), v.literal("comment.flag"), v.literal("comment.like"), v.literal("comment.bulk_approve"), v.literal("comment.bulk_delete"), v.literal("comment.bulk_spam"), v.literal("role.create"), v.literal("role.update"), v.literal("role.delete"), v.literal("role.assign"), v.literal("role.grant_capability"), v.literal("role.revoke_capability"), v.literal("profile.view"), v.literal("profile.update"), v.literal("profile.upload_avatar"), v.literal("profile.deactivate"), v.literal("profile.delete_user"), v.literal("profile.bulk_delete"), v.literal("auth.login"), v.literal("auth.logout"), v.literal("auth.oauth_login"), v.literal("auth.refresh_session"), v.literal("auth.verify_email"), v.literal("password.change"), v.literal("password.reset"), v.literal("password.request_reset"), v.literal("registration.register"), v.literal("registration.invite"), v.literal("registration.resend_verification"), v.literal("dashboard.view"), v.literal("dashboard.quick_draft"), v.literal("dashboard.dismiss_widget"), v.literal("dashboard.reorder_widgets"), v.literal("editor.add_block"), v.literal("editor.remove_block"), v.literal("editor.reorder_blocks"), v.literal("editor.save_draft"), v.literal("editor.save_reusable"), v.literal("editor.autosave"), v.literal("blocks.compose"), v.literal("blocks.ai"), v.literal("blocks.promote"), v.literal("custom_field.create_group"), v.literal("custom_field.update_group"), v.literal("custom_field.delete_group"), v.literal("custom_field.set_value"), v.literal("custom_field.read_value"), v.literal("revision.view"), v.literal("revision.compare"), v.literal("revision.restore"), v.literal("revision.delete"), v.literal("seo.update_post"), v.literal("seo.update_global"), v.literal("seo.update_robots"), v.literal("seo.generate_sitemap"), v.literal("search.query"), v.literal("search.reindex"), v.literal("menu.create"), v.literal("menu.update"), v.literal("menu.delete"), v.literal("menu.add_item"), v.literal("menu.update_item"), v.literal("menu.delete_item"), v.literal("menu.reorder"), v.literal("menu.assign_location"), v.literal("settings.update_general"), v.literal("settings.update_reading"), v.literal("settings.update_writing"), v.literal("settings.update_discussion"), v.literal("settings.update_permalinks"), v.literal("settings.update_privacy"), v.literal("settings.update_email"), v.literal("settings.export"), v.literal("settings.import"), v.literal("email.send"), v.literal("email.queue"), v.literal("email.retry"), v.literal("email.update_template"), v.literal("notification.send"), v.literal("notification.mark_read"), v.literal("notification.mark_all_read"), v.literal("notification.delete"), v.literal("notification.update_preferences"), v.literal("audit.view"), v.literal("audit.export"), v.literal("audit.clear"), v.literal("api.create_key"), v.literal("api.revoke_key"), v.literal("api.create_webhook"), v.literal("api.update_webhook"), v.literal("api.delete_webhook"), v.literal("api.test_webhook"), v.literal("event.emit"), v.literal("event.register_listener"), v.literal("event.remove_listener"), v.literal("routing.view_redirects"), v.literal("routing.create_redirect"), v.literal("routing.update_redirect"), v.literal("routing.delete_redirect"), v.literal("analytics.view"), v.literal("analytics.manage"), v.literal("kb.view"), v.literal("kb.create"), v.literal("kb.edit"), v.literal("kb.editOwn"), v.literal("kb.delete"), v.literal("kb.publish"), v.literal("kb.manageCategories"), v.literal("kb.manageTags"), v.literal("kb.manageCollections"), v.literal("kb.manageWorkflows"), v.literal("kb.manageTemplates"), v.literal("kb.moderateComments"), v.literal("kb.viewAnalytics"), v.literal("lms.course.view"), v.literal("lms.course.create"), v.literal("lms.course.edit"), v.literal("lms.course.publish"), v.literal("lms.course.delete"), v.literal("lms.lesson.edit"), v.literal("lms.lesson.delete"), v.literal("lms.builder.manage"), v.literal("lms.ai.generate"), v.literal("lms.enroll.manage"), v.literal("lms.certificate.manage"), v.literal("lms.settings.manage"), v.literal("ticket.view"), v.literal("ticket.viewAll"), v.literal("ticket.respond"), v.literal("ticket.assign"), v.literal("ticket.updateStatus"), v.literal("ticket.updatePriority"), v.literal("ticket.close"), v.literal("ticket.manageCannedResponses"), v.literal("ticket.viewAnalytics"), v.literal("ticket.viewInternalNotes"), v.literal("form.view"), v.literal("form.create"), v.literal("form.update"), v.literal("form.delete"), v.literal("form.duplicate"), v.literal("form.view_entries"), v.literal("form.edit_entry"), v.literal("form.delete_entry"), v.literal("form.manage_notifications"), v.literal("form.manage_confirmations"), v.literal("form.manage_actions"), v.literal("form.view_analytics"), v.literal("form.export_entries"), v.literal("form.manage_security"), v.literal("commerce.returns.view"), v.literal("commerce.returns.review"), v.literal("commerce.returns.receive"), v.literal("commerce.returns.refund"), v.literal("commerce.returns.manage"), v.literal("commerce.bundles.view"), v.literal("commerce.bundles.create"), v.literal("commerce.bundles.edit"), v.literal("commerce.bundles.delete"), v.literal("commerce.reviews.view"), v.literal("commerce.reviews.moderate"), v.literal("commerce.reviews.delete"), v.literal("commerce.wishlists.view"), v.literal("commerce.wishlists.manage"), v.literal("commerce.tax.view"), v.literal("commerce.tax.manage"), v.literal("commerce.customers.tax_exempt"), v.literal("commerce.discount.view"), v.literal("commerce.discount.create"), v.literal("commerce.discount.update"), v.literal("commerce.discount.delete"), v.literal("commerce.discount.apply"), v.literal("manage_options"), v.literal("shipping.zones.manage"), v.literal("shipping.zones.read"), v.literal("shipping.classes.manage"), v.literal("shipping.classes.read"), v.literal("shipping.packages.manage"), v.literal("shipping.packages.read"), v.literal("shipping.locations.manage"), v.literal("shipping.locations.read"), v.literal("shipping.address_validation.manage"), v.literal("shipping.address_validation.read"), v.literal("shipping.rules.manage"), v.literal("shipping.rules.read"), v.literal("shipping.diagnostics.view"), v.literal("shipping.test_rates.run"), v.literal("shipping.methods.manage"), v.literal("shipping.methods.read"), v.literal("shipping.methods.preview"), v.literal("shipping.methods.test"), v.literal("shipping.methods.quote"), v.literal("shipping.providers.manage"), v.literal("shipping.providers.read"), v.literal("shipping.providers.test"), v.literal("shipping.labels.purchase"), v.literal("shipping.labels.void"), v.literal("shipping.labels.reprint"), v.literal("shipping.labels.batch"), v.literal("shipping.labels.read"), v.literal("shipping.tracking.view"), v.literal("shipping.tracking.sync"), v.literal("shipping.manifests.view"), v.literal("shipping.manifests.close"), v.literal("shipping.manifests.reprint"), v.literal("post.edit"), v.literal("post.delete_one"), v.literal("post.publish_one"), v.literal("page.edit"), v.literal("media.edit"), v.literal("media.delete_one"), v.literal("comment.edit"), v.literal("comment.delete_one"), v.literal("seo.edit_post"), v.literal("custom_field.edit_value")),
    alreadyGranted: v.boolean(),
  }), v.object({
    success: v.boolean(),
    role: v.string(),
    capability: v.union(v.literal("post.publish"), v.literal("post.unpublish"), v.literal("post.create"), v.literal("post.read"), v.literal("post.update"), v.literal("post.delete"), v.literal("post.schedule"), v.literal("post.trash"), v.literal("post.restore"), v.literal("post.duplicate"), v.literal("post.bulk_delete"), v.literal("post.bulk_publish"), v.literal("post.preview"), v.literal("page.create"), v.literal("page.read"), v.literal("page.read_private"), v.literal("page.update"), v.literal("page.delete"), v.literal("page.publish"), v.literal("page.reorder"), v.literal("page.set_parent"), v.literal("media.read"), v.literal("media.upload"), v.literal("media.update"), v.literal("media.delete"), v.literal("media.crop"), v.literal("media.bulk_delete"), v.literal("taxonomy.create_category"), v.literal("taxonomy.update_category"), v.literal("taxonomy.delete_category"), v.literal("taxonomy.create_tag"), v.literal("taxonomy.update_tag"), v.literal("taxonomy.delete_tag"), v.literal("taxonomy.assign"), v.literal("taxonomy.unassign"), v.literal("taxonomy.merge"), v.literal("comment.create"), v.literal("comment.read"), v.literal("comment.update"), v.literal("comment.delete"), v.literal("comment.reply"), v.literal("comment.approve"), v.literal("comment.reject"), v.literal("comment.spam"), v.literal("comment.flag"), v.literal("comment.like"), v.literal("comment.bulk_approve"), v.literal("comment.bulk_delete"), v.literal("comment.bulk_spam"), v.literal("role.create"), v.literal("role.update"), v.literal("role.delete"), v.literal("role.assign"), v.literal("role.grant_capability"), v.literal("role.revoke_capability"), v.literal("profile.view"), v.literal("profile.update"), v.literal("profile.upload_avatar"), v.literal("profile.deactivate"), v.literal("profile.delete_user"), v.literal("profile.bulk_delete"), v.literal("auth.login"), v.literal("auth.logout"), v.literal("auth.oauth_login"), v.literal("auth.refresh_session"), v.literal("auth.verify_email"), v.literal("password.change"), v.literal("password.reset"), v.literal("password.request_reset"), v.literal("registration.register"), v.literal("registration.invite"), v.literal("registration.resend_verification"), v.literal("dashboard.view"), v.literal("dashboard.quick_draft"), v.literal("dashboard.dismiss_widget"), v.literal("dashboard.reorder_widgets"), v.literal("editor.add_block"), v.literal("editor.remove_block"), v.literal("editor.reorder_blocks"), v.literal("editor.save_draft"), v.literal("editor.save_reusable"), v.literal("editor.autosave"), v.literal("blocks.compose"), v.literal("blocks.ai"), v.literal("blocks.promote"), v.literal("custom_field.create_group"), v.literal("custom_field.update_group"), v.literal("custom_field.delete_group"), v.literal("custom_field.set_value"), v.literal("custom_field.read_value"), v.literal("revision.view"), v.literal("revision.compare"), v.literal("revision.restore"), v.literal("revision.delete"), v.literal("seo.update_post"), v.literal("seo.update_global"), v.literal("seo.update_robots"), v.literal("seo.generate_sitemap"), v.literal("search.query"), v.literal("search.reindex"), v.literal("menu.create"), v.literal("menu.update"), v.literal("menu.delete"), v.literal("menu.add_item"), v.literal("menu.update_item"), v.literal("menu.delete_item"), v.literal("menu.reorder"), v.literal("menu.assign_location"), v.literal("settings.update_general"), v.literal("settings.update_reading"), v.literal("settings.update_writing"), v.literal("settings.update_discussion"), v.literal("settings.update_permalinks"), v.literal("settings.update_privacy"), v.literal("settings.update_email"), v.literal("settings.export"), v.literal("settings.import"), v.literal("email.send"), v.literal("email.queue"), v.literal("email.retry"), v.literal("email.update_template"), v.literal("notification.send"), v.literal("notification.mark_read"), v.literal("notification.mark_all_read"), v.literal("notification.delete"), v.literal("notification.update_preferences"), v.literal("audit.view"), v.literal("audit.export"), v.literal("audit.clear"), v.literal("api.create_key"), v.literal("api.revoke_key"), v.literal("api.create_webhook"), v.literal("api.update_webhook"), v.literal("api.delete_webhook"), v.literal("api.test_webhook"), v.literal("event.emit"), v.literal("event.register_listener"), v.literal("event.remove_listener"), v.literal("routing.view_redirects"), v.literal("routing.create_redirect"), v.literal("routing.update_redirect"), v.literal("routing.delete_redirect"), v.literal("analytics.view"), v.literal("analytics.manage"), v.literal("kb.view"), v.literal("kb.create"), v.literal("kb.edit"), v.literal("kb.editOwn"), v.literal("kb.delete"), v.literal("kb.publish"), v.literal("kb.manageCategories"), v.literal("kb.manageTags"), v.literal("kb.manageCollections"), v.literal("kb.manageWorkflows"), v.literal("kb.manageTemplates"), v.literal("kb.moderateComments"), v.literal("kb.viewAnalytics"), v.literal("lms.course.view"), v.literal("lms.course.create"), v.literal("lms.course.edit"), v.literal("lms.course.publish"), v.literal("lms.course.delete"), v.literal("lms.lesson.edit"), v.literal("lms.lesson.delete"), v.literal("lms.builder.manage"), v.literal("lms.ai.generate"), v.literal("lms.enroll.manage"), v.literal("lms.certificate.manage"), v.literal("lms.settings.manage"), v.literal("ticket.view"), v.literal("ticket.viewAll"), v.literal("ticket.respond"), v.literal("ticket.assign"), v.literal("ticket.updateStatus"), v.literal("ticket.updatePriority"), v.literal("ticket.close"), v.literal("ticket.manageCannedResponses"), v.literal("ticket.viewAnalytics"), v.literal("ticket.viewInternalNotes"), v.literal("form.view"), v.literal("form.create"), v.literal("form.update"), v.literal("form.delete"), v.literal("form.duplicate"), v.literal("form.view_entries"), v.literal("form.edit_entry"), v.literal("form.delete_entry"), v.literal("form.manage_notifications"), v.literal("form.manage_confirmations"), v.literal("form.manage_actions"), v.literal("form.view_analytics"), v.literal("form.export_entries"), v.literal("form.manage_security"), v.literal("commerce.returns.view"), v.literal("commerce.returns.review"), v.literal("commerce.returns.receive"), v.literal("commerce.returns.refund"), v.literal("commerce.returns.manage"), v.literal("commerce.bundles.view"), v.literal("commerce.bundles.create"), v.literal("commerce.bundles.edit"), v.literal("commerce.bundles.delete"), v.literal("commerce.reviews.view"), v.literal("commerce.reviews.moderate"), v.literal("commerce.reviews.delete"), v.literal("commerce.wishlists.view"), v.literal("commerce.wishlists.manage"), v.literal("commerce.tax.view"), v.literal("commerce.tax.manage"), v.literal("commerce.customers.tax_exempt"), v.literal("commerce.discount.view"), v.literal("commerce.discount.create"), v.literal("commerce.discount.update"), v.literal("commerce.discount.delete"), v.literal("commerce.discount.apply"), v.literal("manage_options"), v.literal("shipping.zones.manage"), v.literal("shipping.zones.read"), v.literal("shipping.classes.manage"), v.literal("shipping.classes.read"), v.literal("shipping.packages.manage"), v.literal("shipping.packages.read"), v.literal("shipping.locations.manage"), v.literal("shipping.locations.read"), v.literal("shipping.address_validation.manage"), v.literal("shipping.address_validation.read"), v.literal("shipping.rules.manage"), v.literal("shipping.rules.read"), v.literal("shipping.diagnostics.view"), v.literal("shipping.test_rates.run"), v.literal("shipping.methods.manage"), v.literal("shipping.methods.read"), v.literal("shipping.methods.preview"), v.literal("shipping.methods.test"), v.literal("shipping.methods.quote"), v.literal("shipping.providers.manage"), v.literal("shipping.providers.read"), v.literal("shipping.providers.test"), v.literal("shipping.labels.purchase"), v.literal("shipping.labels.void"), v.literal("shipping.labels.reprint"), v.literal("shipping.labels.batch"), v.literal("shipping.labels.read"), v.literal("shipping.tracking.view"), v.literal("shipping.tracking.sync"), v.literal("shipping.manifests.view"), v.literal("shipping.manifests.close"), v.literal("shipping.manifests.reprint"), v.literal("post.edit"), v.literal("post.delete_one"), v.literal("post.publish_one"), v.literal("page.edit"), v.literal("media.edit"), v.literal("media.delete_one"), v.literal("comment.edit"), v.literal("comment.delete_one"), v.literal("seo.edit_post"), v.literal("custom_field.edit_value")),
    alreadyGranted: v.optional(v.null()),
  })),
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
    await catalogRevisionWrites.patchWithMediaReferences<"roles">(ctx, "roles", args.roleId, {
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
  returns: v.union(v.object({
    success: v.boolean(),
    role: v.string(),
    capability: v.string(),
    alreadyRevoked: v.boolean(),
  }), v.object({
    success: v.boolean(),
    role: v.string(),
    capability: v.string(),
    alreadyRevoked: v.optional(v.null()),
  })),
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
    await catalogRevisionWrites.patchWithMediaReferences<"roles">(ctx, "roles", args.roleId, {
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
