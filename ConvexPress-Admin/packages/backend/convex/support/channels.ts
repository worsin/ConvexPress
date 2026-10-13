import type {RegisteredMutation} from "convex/server";
import type {Id} from "../_generated/dataModel";
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

import { tableDocs } from "../schema/tableDocs.generated";
export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(tableDocs.support_channels),
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

export const getByCode = query({
  args: {
    code: v.string(),
  },
  returns: v.union(v.null(), tableDocs.support_channels),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    await requireCan(ctx, "manage_options");
    return await ctx.db
      .query("support_channels")
      .withIndex("by_code", (q: any) => q.eq("code", args.code))
      .unique();
  },
});

export const create: RegisteredMutation<"public", {code:string;kind:"email"|"slack"|"discord"|"twilio_sms"|"form"|"chat"|"api";label:string;config?:unknown;webhookUrl?:string},Id<"support_channels">> = mutation({
  returns: v.id("support_channels"),
  args: {
    code: v.string(),
    kind: v.union(
      v.literal("email"),
      v.literal("slack"),
      v.literal("discord"),
      v.literal("twilio_sms"),
      v.literal("form"),
      v.literal("chat"),
      v.literal("api"),
    ),
    label: v.string(),
    config: v.optional(v.any()),
    webhookUrl: v.optional(v.string()),
  },
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

export const update = mutation({
  args: {
    id: v.id("support_channels"),
    label: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    config: v.optional(v.any()),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    await requireCan(ctx, "manage_options");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.label !== undefined) patch.label = args.label;
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    if (args.config !== undefined) patch.config = args.config;
    await ctx.db.patch("support_channels", args.id, patch);
    return { success: true };
  },
});

export const remove = mutation({
  args: {
    id: v.id("support_channels"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "tickets");
    await requireCan(ctx, "manage_options");
    await ctx.db.delete("support_channels", args.id);
    return { success: true };
  },
});

/**
 * Wave 13: health report — channels silent for > threshold ms are flagged.
 * Default threshold: 72h.
 */
export const healthReport = query({
  args: {
    silentThresholdMs: v.optional(v.number()),
  },
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
