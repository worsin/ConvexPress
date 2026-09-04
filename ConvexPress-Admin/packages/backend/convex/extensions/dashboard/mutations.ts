/**
 * Dashboard extension — mutations (v2 Layer 3).
 *
 *   saveDefaultLayout / deleteDefaultLayout   admin (manage_options)
 *   saveMyLayout / resetMyLayout              signed-in member
 *
 * Every layout write is normalized: unknown widgets dropped, geometry
 * clamped to the grid, duplicate keys made unique.
 */

import { ConvexError, v } from "convex/values";

import { mutation } from "../../_generated/server";
import { emitEvent } from "../../helpers/events";
import { getCurrentUser, requireCan } from "../../helpers/permissions";
import { getDefaults } from "../../settings/defaults";
import { DASHBOARD_GRID, getDashboardWidget, type DashboardLayoutItem } from "./registry";
import { dashboardLayoutItemValidator } from "./schema";

const MAX_ITEMS = 40;

export function normalizeLayoutItems(items: DashboardLayoutItem[]): DashboardLayoutItem[] {
  const seen = new Set<string>();
  const out: DashboardLayoutItem[] = [];
  for (const item of items.slice(0, MAX_ITEMS)) {
    const widget = getDashboardWidget(item.widgetId);
    if (!widget) continue;
    let key = String(item.key || item.widgetId).slice(0, 64);
    while (seen.has(key)) key = `${key}-${out.length + 1}`;
    seen.add(key);
    const w = Math.min(DASHBOARD_GRID.columns, Math.max(2, Math.round(item.w)));
    const h = Math.min(12, Math.max(1, Math.round(item.h)));
    const x = Math.min(DASHBOARD_GRID.columns - w, Math.max(0, Math.round(item.x)));
    const y = Math.max(0, Math.round(item.y));
    const settings: Record<string, string | number | boolean> = {};
    for (const setting of widget.settings ?? []) {
      const value = item.settings?.[setting.key];
      if (value === undefined) continue;
      if (setting.kind === "number") {
        const number = Number(value);
        if (!Number.isFinite(number)) continue;
        settings[setting.key] = Math.min(setting.max ?? number, Math.max(setting.min ?? number, number));
      } else if (setting.kind === "toggle") {
        settings[setting.key] = value === true;
      } else if (setting.kind === "select") {
        if (setting.options?.some((option) => option.value === value)) settings[setting.key] = String(value);
      } else {
        settings[setting.key] = String(value).slice(0, 200);
      }
    }
    out.push({
      key,
      widgetId: item.widgetId,
      x,
      y,
      w,
      h,
      ...(Object.keys(settings).length ? { settings } : {}),
      ...(item.hidden ? { hidden: true } : {}),
    });
  }
  return out;
}

function validateScope(scope: string) {
  if (scope === "default") return;
  if (/^(role|plan):[a-z0-9-]{1,64}$/u.test(scope)) return;
  throw new ConvexError({
    code: "VALIDATION_ERROR",
    message: "Scope must be default, role:<slug>, or plan:<slug>",
  });
}

export const saveDefaultLayout = mutation({
  args: {
    scope: v.string(),
    title: v.optional(v.string()),
    items: v.array(dashboardLayoutItemValidator),
    membersCanEdit: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "manage_options");
    validateScope(args.scope);
    const items = normalizeLayoutItems(args.items as DashboardLayoutItem[]);
    const now = Date.now();
    const existing = await ctx.db
      .query("dashboard_layouts")
      .withIndex("by_scope", (q: any) => q.eq("scope", args.scope))
      .unique();
    const title = (args.title ?? existing?.title ?? (args.scope === "default" ? "Everyone" : args.scope)).slice(0, 80);
    const membersCanEdit = args.membersCanEdit ?? existing?.membersCanEdit ?? true;
    let id;
    if (existing) {
      await ctx.db.patch(existing._id, { title, items, membersCanEdit, updatedBy: user._id, updatedAt: now });
      id = existing._id;
    } else {
      id = await ctx.db.insert("dashboard_layouts", {
        scope: args.scope,
        title,
        items,
        membersCanEdit,
        updatedBy: user._id,
        createdAt: now,
        updatedAt: now,
      });
    }
    await emitEvent(ctx, "dashboard.layout_saved", "dashboard", {
      layoutId: String(id),
      scope: args.scope,
      widgets: items.length,
    }).catch(() => undefined);
    return id;
  },
});

export const deleteDefaultLayout = mutation({
  args: { scope: v.string() },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const existing = await ctx.db
      .query("dashboard_layouts")
      .withIndex("by_scope", (q: any) => q.eq("scope", args.scope))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return true;
  },
});

export const saveMyLayout = mutation({
  args: {
    baseScope: v.string(),
    items: v.array(dashboardLayoutItemValidator),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user || user.status !== "active") {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Sign in to arrange your dashboard" });
    }
    const settingsDoc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q: any) => q.eq("section", "dashboard"))
      .unique();
    const settings = { ...getDefaults("dashboard"), ...((settingsDoc?.values as Record<string, unknown>) ?? {}) };
    if (settings.membersCanEditHome !== true) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Dashboard arrangement is managed by the site" });
    }
    const items = normalizeLayoutItems(args.items as DashboardLayoutItem[]);
    const existing = await ctx.db
      .query("dashboard_user_layouts")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { baseScope: args.baseScope, items, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("dashboard_user_layouts", {
      userId: user._id,
      baseScope: args.baseScope,
      items,
      updatedAt: now,
    });
  },
});

export const resetMyLayout = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new ConvexError({ code: "UNAUTHORIZED", message: "Sign in first" });
    const existing = await ctx.db
      .query("dashboard_user_layouts")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return true;
  },
});
