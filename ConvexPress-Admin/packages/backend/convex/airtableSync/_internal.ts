/**
 * Airtable Sync - Internal Functions
 *
 * Internal mutations and queries used by sync actions.
 * These are NOT client-callable — only invoked by actions via ctx.runMutation/ctx.runQuery.
 *
 * Grouped here to keep the sync actions clean and focused on transform logic.
 */

import { lookupUserByIdentifier } from "../helpers/permissions";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

// ─── Auth Helper ─────────────────────────────────────────────────────────────

/**
 * Check if a user has the manage_options capability (Administrator only).
 * Used by public action wrappers to authenticate Airtable sync requests.
 *
 * @throws UNAUTHORIZED if user not found
 * @throws FORBIDDEN if user lacks manage_options capability
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const checkAdminPermission = internalQuery({
  args: { userId: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await lookupUserByIdentifier(ctx, args.userId);

    if (!user) {
      throw new Error("User not found");
    }

    if (user.status !== "active") {
      throw new Error("Account is not active");
    }

    // Resolve role capabilities
    let capabilities: string[] = [];
    if (user.roleId) {
      const role = await ctx.db.get("roles", user.roleId);
      if (role && role.status === "active") {
        capabilities = (role as { capabilities: string[] }).capabilities || [];
      }
    } else if (user.internalRole) {
      const role = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", user.internalRole as string))
        .unique();
      if (role && role.status === "active") {
        capabilities = role.capabilities || [];
      }
    }

    if (!capabilities.includes("manage_options")) {
      throw new Error("Administrator access required for Airtable sync");
    }

    return { authorized: true, userId: user._id };
  },
});

// ─── Capabilities ────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getCapabilityByAirtableId = internalQuery({
  args: { airtableRecordId: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db
      .query("capabilities")
      .withIndex("by_airtable_id", (q: ConvexQueryBuilder) =>
        q.eq("airtableRecordId", args.airtableRecordId),
      )
      .unique();
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const insertCapability = internalMutation({
  args: {
    name: v.string(),
    actionCode: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    notes: v.optional(v.string()),
    status: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    auditStatus: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    completion: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    category: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    roleNames: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventCodes: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return await ctx.db.insert("capabilities", args);
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateCapability = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    id: v.id("capabilities"),
    name: v.string(),
    actionCode: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    notes: v.optional(v.string()),
    status: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    auditStatus: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    completion: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    category: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    roleNames: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventCodes: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch("capabilities", id, data);
  },
});

// ─── Roles ───────────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getRoleByAirtableId = internalQuery({
  args: { airtableRecordId: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db
      .query("roles")
      .withIndex("by_airtable_id", (q: ConvexQueryBuilder) =>
        q.eq("airtableRecordId", args.airtableRecordId),
      )
      .unique();
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getRoleBySlug = internalQuery({
  args: { slug: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db
      .query("roles")
      .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", args.slug))
      .unique();
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const insertRole = internalMutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    level: v.number(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    type: v.union(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("internal"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("customer"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("system"),
    ),
    isDefault: v.boolean(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    isProtected: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    capabilities: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    pageAccess: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    airtableRecordId: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    createdAt: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    updatedAt: v.optional(v.number()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("roles", {
      ...args,
      status: args.status ?? "active",
      capabilities: args.capabilities ?? [],
      pageAccess: args.pageAccess ?? [],
      isProtected: args.isProtected ?? false,
      createdAt: args.createdAt ?? now,
      updatedAt: args.updatedAt ?? now,
    });
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateRole = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    id: v.id("roles"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    name: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    slug: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    description: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    level: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    type: v.optional(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.union(
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        v.literal("internal"),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        v.literal("customer"),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        v.literal("system"),
      ),
    ),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    isDefault: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    isProtected: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    capabilities: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    pageAccess: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    airtableRecordId: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    updatedAt: v.optional(v.number()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch("roles", id, {
      ...data,
      updatedAt: data.updatedAt ?? Date.now(),
    });
  },
});

/**
 * Reassign all users from one role to another.
 *
 * Used by Airtable role sync when deduplicating aliased slugs
 * (for example "admin" -> "administrator").
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const reassignUsersFromRole = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    fromRoleId: v.id("roles"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    toRoleId: v.id("roles"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (args.fromRoleId === args.toRoleId) {
      return { moved: 0 };
    }

    const targetRole = await ctx.db.get("roles", args.toRoleId);
    if (!targetRole) {
      throw new Error("Target role not found");
    }

    const legacyRoleMap: Record<string, string> = {
      administrator: "admin",
      editor: "editor",
      author: "author",
      contributor: "contributor",
      subscriber: "customer",
    };
    const legacyRole = legacyRoleMap[targetRole.slug] ?? targetRole.slug;
    const isInternal = targetRole.type === "internal";

    const users = await ctx.db
      .query("users")
      .withIndex("by_roleId", (q: ConvexQueryBuilder) => q.eq("roleId", args.fromRoleId))
      .collect();

    const now = Date.now();
    for (const user of users) {
      await ctx.db.patch("users", user._id, {
        roleId: args.toRoleId,
        internalRole: legacyRole,
        isInternal,
        updatedAt: now,
      });
    }

    return { moved: users.length };
  },
});

/**
 * Delete a role by ID.
 *
 * Used by Airtable role sync after role deduplication merges.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deleteRoleById = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    roleId: v.id("roles"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await ctx.db.delete("roles", args.roleId);
  },
});

// ─── Event Definitions ───────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getEventDefByAirtableId = internalQuery({
  args: { airtableRecordId: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db
      .query("eventDefinitions")
      .withIndex("by_airtable_id", (q: ConvexQueryBuilder) =>
        q.eq("airtableRecordId", args.airtableRecordId),
      )
      .unique();
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const insertEventDef = internalMutation({
  args: {
    name: v.string(),
    eventCode: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    notes: v.optional(v.string()),
    status: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    auditStatus: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    completion: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payloadSchema: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    category: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    actionCodes: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    emailNotificationNames: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    siteNotificationNames: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db.insert("eventDefinitions", args);
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateEventDef = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    id: v.id("eventDefinitions"),
    name: v.string(),
    eventCode: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    notes: v.optional(v.string()),
    status: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    auditStatus: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    completion: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    payloadSchema: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    category: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    actionCodes: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    emailNotificationNames: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    siteNotificationNames: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch("eventDefinitions", id, data);
  },
});

// ─── Route Definitions ───────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getRouteDefByAirtableId = internalQuery({
  args: { airtableRecordId: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db
      .query("routeDefinitions")
      .withIndex("by_airtable_id", (q: ConvexQueryBuilder) =>
        q.eq("airtableRecordId", args.airtableRecordId),
      )
      .unique();
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const insertRouteDef = internalMutation({
  args: {
    name: v.string(),
    path: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    notes: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    layout: v.optional(v.string()),
    authRequired: v.boolean(),
    routeType: v.string(),
    status: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    app: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    completion: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    roleNames: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db.insert("routeDefinitions", args);
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateRouteDef = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    id: v.id("routeDefinitions"),
    name: v.string(),
    path: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    notes: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    layout: v.optional(v.string()),
    authRequired: v.boolean(),
    routeType: v.string(),
    status: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    app: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    completion: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    roleNames: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch("routeDefinitions", id, data);
  },
});

// ─── Email Templates ─────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getEmailTemplateByAirtableId = internalQuery({
  args: { airtableRecordId: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailTemplates")
      .withIndex("by_airtable_id", (q: ConvexQueryBuilder) =>
        q.eq("airtableRecordId", args.airtableRecordId),
      )
      .unique();
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateEmailTemplate = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    id: v.id("emailTemplates"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    airtableRecordId: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    syncedAt: v.optional(v.number()),
    // Only metadata fields — do not overwrite admin-customized content
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    name: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    recipientType: v.optional(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.union(
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        v.literal("customer"),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        v.literal("employee"),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        v.literal("admin"),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        v.literal("custom"),
      ),
    ),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    priority: v.optional(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.union(
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        v.literal("immediate"),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        v.literal("batched"),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        v.literal("digest"),
      ),
    ),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    isActive: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventCode: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch("emailTemplates", id, data);
  },
});

// ─── Site Notification Definitions ───────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getSiteNotifDefByAirtableId = internalQuery({
  args: { airtableRecordId: v.string() },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db
      .query("siteNotificationDefinitions")
      .withIndex("by_airtable_id", (q: ConvexQueryBuilder) =>
        q.eq("airtableRecordId", args.airtableRecordId),
      )
      .unique();
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const insertSiteNotifDef = internalMutation({
  args: {
    name: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    messageTemplate: v.optional(v.string()),
    notificationType: v.string(),
    status: v.string(),
    persistent: v.boolean(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    recipientType: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    actionUrl: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    notes: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    auditStatus: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    completion: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventCodes: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return await ctx.db.insert("siteNotificationDefinitions", args);
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateSiteNotifDef = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    id: v.id("siteNotificationDefinitions"),
    name: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    messageTemplate: v.optional(v.string()),
    notificationType: v.string(),
    status: v.string(),
    persistent: v.boolean(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    recipientType: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    actionUrl: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    notes: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    auditStatus: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    completion: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    eventCodes: v.optional(v.array(v.string())),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch("siteNotificationDefinitions", id, data);
  },
});
