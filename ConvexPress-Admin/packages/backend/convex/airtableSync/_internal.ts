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
export const checkAdminPermission = internalQuery({
  args: { workosUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await lookupUserByIdentifier(ctx, args.workosUserId);

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
        .withIndex("by_slug", (q) => q.eq("slug", user.internalRole as string))
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

export const getCapabilityByAirtableId = internalQuery({
  args: { airtableRecordId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("capabilities")
      .withIndex("by_airtable_id", (q) =>
        q.eq("airtableRecordId", args.airtableRecordId),
      )
      .unique();
  },
});

export const insertCapability = internalMutation({
  args: {
    name: v.string(),
    actionCode: v.string(),
    notes: v.optional(v.string()),
    status: v.string(),
    auditStatus: v.optional(v.string()),
    completion: v.optional(v.number()),
    category: v.optional(v.string()),
    roleNames: v.optional(v.array(v.string())),
    eventCodes: v.optional(v.array(v.string())),
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("capabilities", args);
  },
});

export const updateCapability = internalMutation({
  args: {
    id: v.id("capabilities"),
    name: v.string(),
    actionCode: v.string(),
    notes: v.optional(v.string()),
    status: v.string(),
    auditStatus: v.optional(v.string()),
    completion: v.optional(v.number()),
    category: v.optional(v.string()),
    roleNames: v.optional(v.array(v.string())),
    eventCodes: v.optional(v.array(v.string())),
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch("capabilities", id, data);
  },
});

// ─── Roles ───────────────────────────────────────────────────────────────────

export const getRoleByAirtableId = internalQuery({
  args: { airtableRecordId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("roles")
      .withIndex("by_airtable_id", (q) =>
        q.eq("airtableRecordId", args.airtableRecordId),
      )
      .unique();
  },
});

export const getRoleBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const insertRole = internalMutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    level: v.number(),
    type: v.union(
      v.literal("internal"),
      v.literal("customer"),
      v.literal("system"),
    ),
    isDefault: v.boolean(),
    isProtected: v.optional(v.boolean()),
    capabilities: v.optional(v.array(v.string())),
    pageAccess: v.optional(v.array(v.string())),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
    airtableRecordId: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  },
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

export const updateRole = internalMutation({
  args: {
    id: v.id("roles"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    level: v.optional(v.number()),
    type: v.optional(
      v.union(
        v.literal("internal"),
        v.literal("customer"),
        v.literal("system"),
      ),
    ),
    isDefault: v.optional(v.boolean()),
    isProtected: v.optional(v.boolean()),
    capabilities: v.optional(v.array(v.string())),
    pageAccess: v.optional(v.array(v.string())),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
    airtableRecordId: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  },
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
export const reassignUsersFromRole = internalMutation({
  args: {
    fromRoleId: v.id("roles"),
    toRoleId: v.id("roles"),
  },
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
      .withIndex("by_roleId", (q) => q.eq("roleId", args.fromRoleId))
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
export const deleteRoleById = internalMutation({
  args: {
    roleId: v.id("roles"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete("roles", args.roleId);
  },
});

// ─── Event Definitions ───────────────────────────────────────────────────────

export const getEventDefByAirtableId = internalQuery({
  args: { airtableRecordId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("eventDefinitions")
      .withIndex("by_airtable_id", (q) =>
        q.eq("airtableRecordId", args.airtableRecordId),
      )
      .unique();
  },
});

export const insertEventDef = internalMutation({
  args: {
    name: v.string(),
    eventCode: v.string(),
    notes: v.optional(v.string()),
    status: v.string(),
    auditStatus: v.optional(v.string()),
    completion: v.optional(v.number()),
    payloadSchema: v.optional(v.string()),
    category: v.optional(v.string()),
    actionCodes: v.optional(v.array(v.string())),
    emailNotificationNames: v.optional(v.array(v.string())),
    siteNotificationNames: v.optional(v.array(v.string())),
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("eventDefinitions", args);
  },
});

export const updateEventDef = internalMutation({
  args: {
    id: v.id("eventDefinitions"),
    name: v.string(),
    eventCode: v.string(),
    notes: v.optional(v.string()),
    status: v.string(),
    auditStatus: v.optional(v.string()),
    completion: v.optional(v.number()),
    payloadSchema: v.optional(v.string()),
    category: v.optional(v.string()),
    actionCodes: v.optional(v.array(v.string())),
    emailNotificationNames: v.optional(v.array(v.string())),
    siteNotificationNames: v.optional(v.array(v.string())),
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch("eventDefinitions", id, data);
  },
});

// ─── Route Definitions ───────────────────────────────────────────────────────

export const getRouteDefByAirtableId = internalQuery({
  args: { airtableRecordId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("routeDefinitions")
      .withIndex("by_airtable_id", (q) =>
        q.eq("airtableRecordId", args.airtableRecordId),
      )
      .unique();
  },
});

export const insertRouteDef = internalMutation({
  args: {
    name: v.string(),
    path: v.string(),
    notes: v.optional(v.string()),
    layout: v.optional(v.string()),
    authRequired: v.boolean(),
    routeType: v.string(),
    status: v.string(),
    app: v.optional(v.string()),
    completion: v.optional(v.number()),
    roleNames: v.optional(v.array(v.string())),
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("routeDefinitions", args);
  },
});

export const updateRouteDef = internalMutation({
  args: {
    id: v.id("routeDefinitions"),
    name: v.string(),
    path: v.string(),
    notes: v.optional(v.string()),
    layout: v.optional(v.string()),
    authRequired: v.boolean(),
    routeType: v.string(),
    status: v.string(),
    app: v.optional(v.string()),
    completion: v.optional(v.number()),
    roleNames: v.optional(v.array(v.string())),
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch("routeDefinitions", id, data);
  },
});

// ─── Email Templates ─────────────────────────────────────────────────────────

export const getEmailTemplateByAirtableId = internalQuery({
  args: { airtableRecordId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailTemplates")
      .withIndex("by_airtable_id", (q) =>
        q.eq("airtableRecordId", args.airtableRecordId),
      )
      .unique();
  },
});

export const updateEmailTemplate = internalMutation({
  args: {
    id: v.id("emailTemplates"),
    airtableRecordId: v.optional(v.string()),
    syncedAt: v.optional(v.number()),
    // Only metadata fields — do not overwrite admin-customized content
    name: v.optional(v.string()),
    recipientType: v.optional(
      v.union(
        v.literal("customer"),
        v.literal("employee"),
        v.literal("admin"),
        v.literal("custom"),
      ),
    ),
    priority: v.optional(
      v.union(
        v.literal("immediate"),
        v.literal("batched"),
        v.literal("digest"),
      ),
    ),
    isActive: v.optional(v.boolean()),
    eventCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch("emailTemplates", id, data);
  },
});

// ─── Site Notification Definitions ───────────────────────────────────────────

export const getSiteNotifDefByAirtableId = internalQuery({
  args: { airtableRecordId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("siteNotificationDefinitions")
      .withIndex("by_airtable_id", (q) =>
        q.eq("airtableRecordId", args.airtableRecordId),
      )
      .unique();
  },
});

export const insertSiteNotifDef = internalMutation({
  args: {
    name: v.string(),
    messageTemplate: v.optional(v.string()),
    notificationType: v.string(),
    status: v.string(),
    persistent: v.boolean(),
    recipientType: v.optional(v.string()),
    actionUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
    auditStatus: v.optional(v.string()),
    completion: v.optional(v.number()),
    eventCodes: v.optional(v.array(v.string())),
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("siteNotificationDefinitions", args);
  },
});

export const updateSiteNotifDef = internalMutation({
  args: {
    id: v.id("siteNotificationDefinitions"),
    name: v.string(),
    messageTemplate: v.optional(v.string()),
    notificationType: v.string(),
    status: v.string(),
    persistent: v.boolean(),
    recipientType: v.optional(v.string()),
    actionUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
    auditStatus: v.optional(v.string()),
    completion: v.optional(v.number()),
    eventCodes: v.optional(v.array(v.string())),
    systemName: v.optional(v.string()),
    airtableRecordId: v.string(),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch("siteNotificationDefinitions", id, data);
  },
});
