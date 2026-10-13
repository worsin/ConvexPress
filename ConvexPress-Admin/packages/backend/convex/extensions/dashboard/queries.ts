/**
 * Dashboard extension — queries (v2 Layer 2).
 *
 *   registry     public: pages and widgets available on this site (plugin-filtered)
 *   myLayout     member: resolved home layout (own arrangement over the inherited scope)
 *   myBadges     member: live counters for menu badges, one subscription
 *   defaultLayouts / defaultLayout   admin: scope layouts for the editor
 */

import { v } from "convex/values";

import { query, type QueryCtx } from "../../_generated/server";
import { getCurrentUser, getUserIdentifier, requireCan, resolveUserRole } from "../../helpers/permissions";
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

type DbCtx = { db: QueryCtx["db"] };

function settingsValues(values: unknown): Record<string, unknown> {
  return typeof values === "object" && values !== null ? { ...values } : {};
}

async function pluginFlags(ctx: DbCtx): Promise<Record<string, unknown>> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", "plugins"))
    .unique();
  return { ...getDefaults("plugins"), ...settingsValues(doc?.values) };
}

async function dashboardSettings(ctx: DbCtx): Promise<Record<string, unknown>> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", "dashboard"))
    .unique();
  return { ...getDefaults("dashboard"), ...settingsValues(doc?.values) };
}

/** Scope chain for a viewer, most specific first: plan, role, default. */
async function scopesFor(
  ctx: QueryCtx,
  user: Parameters<typeof resolveUserRole>[1],
): Promise<string[]> {
  const scopes: string[] = [];
  try {
    const grants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user_status", (q) => q.eq("userId", user._id).eq("status", "active"))
      .take(10);
    for (const grant of grants) {
      const plan = await ctx.db.get(grant.planId);
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
  returns: v.object({
    grid: v.object({
      columns: v.literal(12),
      rowHeight: v.literal(96),
      gap: v.literal(16),
      sizes: v.object({
        sm: v.object({ w: v.number(), h: v.number() }),
        md: v.object({ w: v.number(), h: v.number() }),
        lg: v.object({ w: v.number(), h: v.number() }),
        xl: v.object({ w: v.number(), h: v.number() }),
      }),
    }),
    pages: v.array(v.object({
      id: v.string(),
      title: v.string(),
      icon: v.string(),
      description: v.string(),
      path: v.string(),
      pluginId: v.union(v.literal("forms"), v.literal("core"), v.literal("commerce"), v.literal("commerceDigital"), v.literal("commerceReviews"), v.literal("commerceSubscriptions"), v.literal("commerceWishlists"), v.literal("commerceReturns"), v.literal("membership"), v.literal("tickets"), v.literal("knowledgeBase"), v.literal("lms"), v.string()),
      capability: v.optional(v.string()),
      group: v.union(v.literal("overview"), v.literal("account"), v.literal("commerce"), v.literal("activity"), v.literal("learning"), v.literal("support")),
      defaultInSidebar: v.boolean(),
      badge: v.optional(v.union(v.literal("notifications.unread"), v.literal("tickets.awaitingYou"), v.literal("orders.active"), v.literal("cart.items"), v.literal("courses.inProgress"))),
    })),
    widgets: v.array(v.object({
      id: v.string(),
      title: v.string(),
      description: v.string(),
      icon: v.string(),
      pluginId: v.union(v.literal("forms"), v.literal("core"), v.literal("commerce"), v.literal("commerceDigital"), v.literal("commerceReviews"), v.literal("commerceSubscriptions"), v.literal("commerceWishlists"), v.literal("commerceReturns"), v.literal("membership"), v.literal("tickets"), v.literal("knowledgeBase"), v.literal("lms"), v.string()),
      capability: v.optional(v.string()),
      sizes: v.array(v.union(v.literal("sm"), v.literal("md"), v.literal("lg"), v.literal("xl"))),
      defaultSize: v.union(v.literal("sm"), v.literal("md"), v.literal("lg"), v.literal("xl")),
      settings: v.optional(v.array(v.object({
        key: v.string(),
        label: v.string(),
        kind: v.union(v.literal("number"), v.literal("text"), v.literal("select"), v.literal("toggle")),
        defaultValue: v.union(v.boolean(), v.string(), v.number()),
        options: v.optional(v.array(v.object({ value: v.string(), label: v.string() }))),
        min: v.optional(v.number()),
        max: v.optional(v.number()),
      }))),
      defaultInHome: v.boolean(),
      category: v.union(v.literal("content"), v.literal("overview"), v.literal("commerce"), v.literal("activity"), v.literal("learning"), v.literal("support")),
    })),
    badgeSources: v.array(v.union(v.literal("notifications.unread"), v.literal("tickets.awaitingYou"), v.literal("orders.active"), v.literal("cart.items"), v.literal("courses.inProgress"))),
  }),
  handler: async (ctx) => {
    const flags = await pluginFlags(ctx);
    return {
      grid: DASHBOARD_GRID,
      pages: DASHBOARD_PAGES.filter((page) => pluginIsEnabled(page.pluginId, flags)),
      widgets: DASHBOARD_WIDGETS.filter((widget) => pluginIsEnabled(widget.pluginId, flags)),
      badgeSources: [...BADGE_SOURCES],
    };
  },
});

export const myLayout = query({
  args: {},
  returns: v.union(v.null(), v.object({
    scope: v.string(),
    items: v.array(v.object({
      settings: v.optional(v.record(v.string(), v.union(v.boolean(), v.string(), v.number()))),
      hidden: v.optional(v.boolean()),
      key: v.string(),
      widgetId: v.string(),
      x: v.number(),
      y: v.number(),
      w: v.number(),
      h: v.number(),
    })),
    canEdit: v.boolean(),
    customized: v.boolean(),
    baseChanged: v.boolean(),
    grid: v.object({
      columns: v.literal(12),
      rowHeight: v.literal(96),
      gap: v.literal(16),
      sizes: v.object({
        sm: v.object({ w: v.number(), h: v.number() }),
        md: v.object({ w: v.number(), h: v.number() }),
        lg: v.object({ w: v.number(), h: v.number() }),
        xl: v.object({ w: v.number(), h: v.number() }),
      }),
    }),
  })),
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
        .withIndex("by_scope", (q) => q.eq("scope", scope))
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
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const canEdit = settings.membersCanEditHome === true && base.membersCanEdit;
    const source = own && canEdit ? own.items : base.items;
    const items = source.filter((item) => allowed.has(item.widgetId));

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
  returns: v.record(v.string(), v.number()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const empty = Object.fromEntries(BADGE_SOURCES.map((source) => [source, 0]));
    if (!user || user.status !== "active") return empty;
    const counts: Record<string, number> = { ...empty };
    try {
      // siteNotifications.userId is the notification-system identifier
      // (clerkUserId when present, else the Convex _id), not always _id.
      const now = Date.now();
      const unread = await ctx.db
        .query("siteNotifications")
        .withIndex("by_user_unread", (q) =>
          q.eq("userId", getUserIdentifier(user)).eq("readAt", undefined),
        )
        .take(100);
      counts["notifications.unread"] = unread.filter(
        (n) => !n.dismissedAt && !(typeof n.snoozedUntil === "number" && n.snoozedUntil > now),
      ).length;
    } catch {
      // table shape differs: leave 0
    }
    try {
      const tickets = await ctx.db
        .query("ticket_tickets")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(200);
      counts["tickets.awaitingYou"] = tickets.filter((t) => t.status === "awaitingResponse").length;
    } catch {
      // tickets off
    }
    try {
      const orders = await ctx.db
        .query("commerce_orders")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(200);
      counts["orders.active"] = orders.filter((o) =>
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
  returns: v.array(v.object({
    _id: v.id("dashboard_layouts"),
    scope: v.string(),
    title: v.string(),
    itemCount: v.number(),
    membersCanEdit: v.boolean(),
    updatedAt: v.number(),
  })),
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    const rows = await ctx.db.query("dashboard_layouts").take(100);
    return rows.map((row) => ({
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
  returns: v.object({
    scope: v.string(),
    exists: v.boolean(),
    title: v.string(),
    items: v.array(v.object({
      settings: v.optional(v.record(v.string(), v.union(v.boolean(), v.string(), v.number()))),
      hidden: v.optional(v.boolean()),
      key: v.string(),
      widgetId: v.string(),
      x: v.number(),
      y: v.number(),
      w: v.number(),
      h: v.number(),
    })),
    membersCanEdit: v.boolean(),
    grid: v.object({
      columns: v.literal(12),
      rowHeight: v.literal(96),
      gap: v.literal(16),
      sizes: v.object({
        sm: v.object({ w: v.number(), h: v.number() }),
        md: v.object({ w: v.number(), h: v.number() }),
        lg: v.object({ w: v.number(), h: v.number() }),
        xl: v.object({ w: v.number(), h: v.number() }),
      }),
    }),
  }),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const flags = await pluginFlags(ctx);
    const row = await ctx.db
      .query("dashboard_layouts")
      .withIndex("by_scope", (q) => q.eq("scope", args.scope))
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
  returns: v.object({
    roles: v.array(v.object({
      slug: v.string(),
      name: v.string(),
      type: v.union(v.literal("internal"), v.literal("customer"), v.literal("system")),
    })),
    plans: v.array(v.object({ slug: v.string(), name: v.string() })),
  }),
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    const roles = await ctx.db.query("roles").take(100);
    let plans: Array<{ slug: string; name: string }> = [];
    try {
      const rows = await ctx.db.query("membership_plans").take(100);
      plans = rows.map((plan) => ({ slug: plan.slug, name: plan.title }));
    } catch {
      plans = [];
    }
    return {
      roles: roles
        .filter((role) => role.status === "active" && role.type !== "system")
        .map((role) => ({ slug: role.slug, name: role.name, type: role.type })),
      plans,
    };
  },
});
