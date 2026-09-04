/**
 * Dashboard extension — queries (v2 Layer 2).
 *
 *   registry     public: pages and widgets available on this site (plugin-filtered)
 *   myLayout     member: resolved home layout (own arrangement over the inherited scope)
 *   myBadges     member: live counters for menu badges, one subscription
 *   defaultLayouts / defaultLayout   admin: scope layouts for the editor
 */

import { v } from "convex/values";

import { query } from "../../_generated/server";
import { getCurrentUser, requireCan, resolveUserRole } from "../../helpers/permissions";
import { getDefaults } from "../../settings/defaults";
import {
  BADGE_SOURCES,
  DASHBOARD_GRID,
  DASHBOARD_PAGES,
  DASHBOARD_WIDGETS,
  buildDefaultLayoutItems,
  pluginIsEnabled,
  type DashboardLayoutItem,
} from "./registry";

async function pluginFlags(ctx: any): Promise<Record<string, unknown>> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q: any) => q.eq("section", "plugins"))
    .unique();
  return { ...getDefaults("plugins"), ...((doc?.values as Record<string, unknown>) ?? {}) };
}

async function dashboardSettings(ctx: any): Promise<Record<string, unknown>> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q: any) => q.eq("section", "dashboard"))
    .unique();
  return { ...getDefaults("dashboard"), ...((doc?.values as Record<string, unknown>) ?? {}) };
}

/** Scope chain for a viewer, most specific first: plan, role, default. */
async function scopesFor(ctx: any, user: any): Promise<string[]> {
  const scopes: string[] = [];
  try {
    const grants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user_status", (q: any) => q.eq("userId", user._id).eq("status", "active"))
      .take(10);
    for (const grant of grants) {
      const plan = grant.planId ? await ctx.db.get(grant.planId) : null;
      if (plan?.slug) scopes.push(`plan:${plan.slug}`);
    }
  } catch {
    // membership off
  }
  const role = await resolveUserRole(ctx, user).catch(() => null);
  if (role?.slug) scopes.push(`role:${role.slug}`);
  scopes.push("default");
  return scopes;
}

/** Widgets whose plugin is enabled and whose capability the viewer holds. */
function allowedWidgetIds(flags: Record<string, unknown>, capabilities: string[]): Set<string> {
  return new Set(
    DASHBOARD_WIDGETS.filter(
      (widget) =>
        pluginIsEnabled(widget.pluginId, flags) &&
        (!widget.capability || capabilities.includes(widget.capability)),
    ).map((widget) => widget.id),
  );
}

export const registry = query({
  args: {},
  handler: async (ctx) => {
    const flags = await pluginFlags(ctx);
    return {
      grid: DASHBOARD_GRID,
      pages: DASHBOARD_PAGES.filter((page) => pluginIsEnabled(page.pluginId, flags)),
      widgets: DASHBOARD_WIDGETS.filter((widget) => pluginIsEnabled(widget.pluginId, flags)),
      badgeSources: BADGE_SOURCES,
    };
  },
});

export const myLayout = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user || user.status !== "active") return null;
    const flags = await pluginFlags(ctx);
    const settings = await dashboardSettings(ctx);
    const role = await resolveUserRole(ctx, user).catch(() => null);
    const allowed = allowedWidgetIds(flags, role?.capabilities ?? []);
    const scopes = await scopesFor(ctx, user);

    let base: { scope: string; items: DashboardLayoutItem[]; membersCanEdit: boolean } | null = null;
    for (const scope of scopes) {
      const row = await ctx.db
        .query("dashboard_layouts")
        .withIndex("by_scope", (q: any) => q.eq("scope", scope))
        .unique();
      if (row) {
        base = { scope: row.scope, items: row.items, membersCanEdit: row.membersCanEdit };
        break;
      }
    }
    if (!base) {
      base = { scope: "default", items: buildDefaultLayoutItems(flags), membersCanEdit: true };
    }

    const own = await ctx.db
      .query("dashboard_user_layouts")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .unique();
    const canEdit = settings.membersCanEditHome === true && base.membersCanEdit;
    const source = own && canEdit ? own.items : base.items;
    const items = source.filter((item: DashboardLayoutItem) => allowed.has(item.widgetId));

    return {
      scope: base.scope,
      items,
      canEdit,
      customized: Boolean(own) && canEdit,
      /** True when the admin changed the inherited layout after the member customized. */
      baseChanged: Boolean(own && own.baseScope !== base.scope),
      grid: DASHBOARD_GRID,
    };
  },
});

export const myBadges = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const empty = Object.fromEntries(BADGE_SOURCES.map((source) => [source, 0]));
    if (!user || user.status !== "active") return empty;
    const counts: Record<string, number> = { ...empty };
    try {
      const unread = await ctx.db
        .query("siteNotifications")
        .withIndex("by_user_unread", (q: any) => q.eq("userId", user._id).eq("readAt", undefined))
        .take(100);
      counts["notifications.unread"] = unread.filter((n: any) => !n.dismissedAt).length;
    } catch {
      // table shape differs: leave 0
    }
    try {
      const tickets = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .take(200);
      counts["tickets.awaitingYou"] = tickets.filter((t: any) => t.status === "awaitingResponse").length;
    } catch {
      // tickets off
    }
    try {
      const orders = await ctx.db
        .query("commerce_orders")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .take(200);
      counts["orders.active"] = orders.filter((o: any) =>
        ["pending", "processing", "shipped"].includes(String(o.status)),
      ).length;
    } catch {
      // commerce off or index differs
    }
    return counts;
  },
});

export const defaultLayouts = query({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    const rows = await ctx.db.query("dashboard_layouts").take(100);
    return rows.map((row: any) => ({
      _id: row._id,
      scope: row.scope,
      title: row.title,
      itemCount: row.items.length,
      membersCanEdit: row.membersCanEdit,
      updatedAt: row.updatedAt,
    }));
  },
});

export const defaultLayout = query({
  args: { scope: v.string() },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const flags = await pluginFlags(ctx);
    const row = await ctx.db
      .query("dashboard_layouts")
      .withIndex("by_scope", (q: any) => q.eq("scope", args.scope))
      .unique();
    return {
      scope: args.scope,
      exists: Boolean(row),
      title: row?.title ?? (args.scope === "default" ? "Everyone" : args.scope),
      items: row?.items ?? buildDefaultLayoutItems(flags),
      membersCanEdit: row?.membersCanEdit ?? true,
      grid: DASHBOARD_GRID,
    };
  },
});

/** Role and plan slugs the admin can scope a layout or menu item to. */
export const scopeOptions = query({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    const roles = await ctx.db.query("roles").take(100);
    let plans: Array<{ slug: string; name: string }> = [];
    try {
      const rows = await ctx.db.query("membership_plans").take(100);
      plans = rows.map((plan: any) => ({ slug: String(plan.slug), name: String(plan.name ?? plan.slug) }));
    } catch {
      plans = [];
    }
    return {
      roles: roles
        .filter((role: any) => role.status === "active" && role.type !== "system")
        .map((role: any) => ({ slug: role.slug, name: role.name, type: role.type })),
      plans,
    };
  },
});
