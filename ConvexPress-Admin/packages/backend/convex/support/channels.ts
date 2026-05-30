/**
 * Support Channels — CRUD (Wave 13).
 *
 * Admin-managed inbound channel registry. One row per Postmark mailbox,
 * Slack workspace, Twilio number, etc.
 */

import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    activeOnly: v.optional(v.boolean()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return [];
    await requireCan(ctx, "manage_options");
    const rows = args.activeOnly
      ? await ctx.db
          .query("support_channels")
          .withIndex("by_active", (q: any) => q.eq("isActive", true))
          .collect()
      : await ctx.db.query("support_channels").collect();
    return rows.sort(
      (a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0),
    );
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getByCode = query({
  args: {
    code: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    await requireCan(ctx, "manage_options");
    return await ctx.db
      .query("support_channels")
      .withIndex("by_code", (q: any) => q.eq("code", args.code))
      .unique();
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const create = mutation({
  args: {
    code: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    kind: v.union(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("email"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("slack"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("discord"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("twilio_sms"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("form"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("chat"),
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.literal("api"),
    ),
    label: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    config: v.optional(v.any()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    webhookUrl: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    await requireCan(ctx, "manage_options");
    const existing = await ctx.db
      .query("support_channels")
      .withIndex("by_code", (q: any) => q.eq("code", args.code))
      .unique();
    if (existing) {
      throw new ConvexError({
        code: "DUPLICATE_CODE",
        message: `Channel with code "${args.code}" already exists.`,
      });
    }
    const now = Date.now();
    return await ctx.db.insert("support_channels", {
      code: args.code,
      kind: args.kind,
      label: args.label,
      isActive: true,
      config: args.config,
      webhookUrl: args.webhookUrl,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const update = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    id: v.id("support_channels"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    label: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    isActive: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    config: v.optional(v.any()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    await requireCan(ctx, "manage_options");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.label !== undefined) patch.label = args.label;
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    if (args.config !== undefined) patch.config = args.config;
    await ctx.db.patch(args.id, patch);
    return { success: true };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const remove = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    id: v.id("support_channels"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    await requireCan(ctx, "manage_options");
    await ctx.db.delete(args.id);
    return { success: true };
  },
});

/**
 * Wave 13: health report — channels silent for > threshold ms are flagged.
 * Default threshold: 72h.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const healthReport = query({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    silentThresholdMs: v.optional(v.number()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return [];
    await requireCan(ctx, "manage_options");
    const threshold = args.silentThresholdMs ?? 72 * 60 * 60 * 1000;
    const now = Date.now();
    const rows = await ctx.db
      .query("support_channels")
      .withIndex("by_active", (q: any) => q.eq("isActive", true))
      .collect();
    return rows.map((row: any) => ({
      _id: row._id,
      code: row.code,
      kind: row.kind,
      label: row.label,
      lastInboundAt: row.lastInboundAt,
      healthy:
        !row.lastInboundAt || now - row.lastInboundAt <= threshold,
      silentHours: row.lastInboundAt
        ? Math.round((now - row.lastInboundAt) / (60 * 60 * 1000))
        : null,
    }));
  },
});
