import { v } from "convex/values";

import { authorizedMutation } from "./functions";
import { MVP_ROLE_DEFINITIONS } from "./roleSeeds";

const platformRbacMutation = authorizedMutation({
  selector: { type: "capability", code: "rbac.manage" },
  target: {},
});

export const seedMvpRoles = platformRbacMutation({
  args: {},
  returns: v.object({
    created: v.number(),
    updated: v.number(),
    ownerAssignmentCreated: v.boolean(),
  }),
  handler: async (ctx) => {
    let created = 0;
    let updated = 0;
    let ownerRoleId = null;
    const now = Date.now();

    for (const seed of MVP_ROLE_DEFINITIONS) {
      const matches = await ctx.db
        .query("overseer_roles")
        .withIndex("by_slug", (q) => q.eq("slug", seed.slug))
        .take(2);
      if (matches.length > 1) {
        throw new Error(`Duplicate outer role slug: ${seed.slug}`);
      }
      const value = {
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        level: seed.level,
        type: seed.type,
        isDefault: seed.isDefault,
        status: seed.status,
        capabilities: [...seed.capabilities],
        pageAccess: [...seed.pageAccess],
        sourceApp: seed.sourceApp,
        actionCodes: [...seed.capabilities],
        routePaths: [...seed.pageAccess],
      };
      if (matches[0]) {
        await ctx.db.patch(matches[0]._id, value);
        updated += 1;
        if (seed.slug === "owner") ownerRoleId = matches[0]._id;
      } else {
        const roleId = await ctx.db.insert("overseer_roles", value);
        created += 1;
        if (seed.slug === "owner") ownerRoleId = roleId;
      }
    }

    let ownerAssignmentCreated = false;
    if (ctx.operator.role === "owner" && ownerRoleId) {
      const existing = await ctx.db
        .query("overseer_roleAssignments")
        .withIndex("by_user", (q) => q.eq("userId", ctx.operator._id))
        .take(1);
      if (existing.length === 0) {
        await ctx.db.insert("overseer_roleAssignments", {
          roleId: ownerRoleId,
          userId: ctx.operator._id,
          subjectType: "user",
          subjectId: String(ctx.operator._id),
          assignedBy: ctx.operator._id,
          assignedAt: now,
          status: "active",
          owner_id: String(ctx.operator._id),
          app_id: "convexpress-control-plane",
        });
        ownerAssignmentCreated = true;
      }
    }

    return { created, updated, ownerAssignmentCreated };
  },
});

const permissionStatus = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("revoked"),
  v.literal("expired"),
);

function cleanCode(value: string, label: string) {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > 240 || /[\u0000-\u001f\u007f]/u.test(cleaned)) {
    throw new Error(`Invalid ${label}`);
  }
  return cleaned;
}

export const upsertPermission = platformRbacMutation({
  args: {
    permissionId: v.optional(v.id("overseer_permissions")),
    subjectType: v.union(v.literal("user"), v.literal("role")),
    subjectId: v.string(),
    selectorType: v.union(
      v.literal("route"),
      v.literal("capability"),
      v.literal("action"),
    ),
    selectorCode: v.string(),
    effect: v.union(v.literal("allow"), v.literal("deny")),
    status: permissionStatus,
    effectiveAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    organizationId: v.optional(v.string()),
    businessId: v.optional(v.string()),
    websiteId: v.optional(v.string()),
    instanceId: v.optional(v.string()),
    includeChildren: v.optional(v.boolean()),
  },
  returns: v.id("overseer_permissions"),
  handler: async (ctx, args) => {
    const subjectId = cleanCode(args.subjectId, "permission subject");
    const selectorCode = cleanCode(args.selectorCode, "permission selector");
    if (args.subjectType === "user") {
      const userId = ctx.db.normalizeId("overseer_users", subjectId);
      if (!userId || !(await ctx.db.get(userId))) {
        throw new Error("Permission subject user does not exist");
      }
    } else {
      const roles = await ctx.db
        .query("overseer_roles")
        .withIndex("by_slug", (q) => q.eq("slug", subjectId))
        .take(2);
      if (roles.length !== 1) {
        throw new Error("Permission subject role must resolve uniquely");
      }
    }
    if (
      args.effectiveAt !== undefined &&
      args.expiresAt !== undefined &&
      args.expiresAt <= args.effectiveAt
    ) {
      throw new Error("Permission expiry must follow its effective time");
    }

    const now = Date.now();
    const actionCode =
      args.selectorType === "route" ? `route:${selectorCode}` : selectorCode;
    const constraints = {
      requestSelectorType: args.selectorType,
      ...(args.organizationId
        ? { organizationId: cleanCode(args.organizationId, "organization target") }
        : {}),
      ...(args.businessId
        ? { businessId: cleanCode(args.businessId, "business target") }
        : {}),
      ...(args.websiteId
        ? { websiteId: cleanCode(args.websiteId, "website target") }
        : {}),
      ...(args.instanceId
        ? { instanceId: cleanCode(args.instanceId, "environment target") }
        : {}),
      includeChildren: args.includeChildren === true,
    };
    const value = {
      subjectType: args.subjectType,
      subjectId,
      roleSlug: args.subjectType === "role" ? subjectId : undefined,
      actionCode,
      capabilityCode:
        args.selectorType === "capability" ? selectorCode : undefined,
      selectorType: "action" as const,
      selectorCode: actionCode,
      constraints,
      effectiveAt: args.effectiveAt,
      expiresAt: args.expiresAt,
      grantedBy: String(ctx.operator._id),
      createdAt: now,
      updatedAt: now,
      effect: args.effect,
      status: args.status,
      sourceAppId: "convexpress-control-plane",
      owner_id: String(ctx.operator._id),
      app_id: "convexpress-control-plane",
    };

    if (args.permissionId) {
      const existing = await ctx.db.get(args.permissionId);
      if (!existing) throw new Error("Permission not found");
      await ctx.db.patch(args.permissionId, {
        ...value,
        createdAt: existing.createdAt ?? now,
      });
      return args.permissionId;
    }
    return await ctx.db.insert("overseer_permissions", value);
  },
});

export const setPermissionStatus = platformRbacMutation({
  args: {
    permissionId: v.id("overseer_permissions"),
    status: permissionStatus,
  },
  returns: v.id("overseer_permissions"),
  handler: async (ctx, args) => {
    const permission = await ctx.db.get(args.permissionId);
    if (!permission) throw new Error("Permission not found");
    await ctx.db.patch(args.permissionId, {
      status: args.status,
      updatedAt: Date.now(),
      grantedBy: String(ctx.operator._id),
    });
    return args.permissionId;
  },
});
