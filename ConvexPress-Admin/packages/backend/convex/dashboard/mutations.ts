/**
 * Dashboard System - Mutations
 *
 * All write operations for the admin dashboard:
 *   quickDraft              - Create a draft post from Quick Draft widget
 *   saveWidgetPreferences   - Upsert dashboard preferences for user+surface
 *   dismissWidget           - Add widgetId to hiddenWidgets
 *   restoreWidget           - Remove widgetId from hiddenWidgets
 *   toggleWidgetCollapse    - Toggle widgetId in/out of collapsedWidgets
 *   reorderWidgets          - Replace widgetOrder with new layout
 *   dismissWelcome          - Dismiss the welcome panel
 *
 * Authorization:
 *   - quickDraft requires "post.create" capability (via requireCan)
 *   - All preference mutations require "dashboard.view" capability
 *   - reorderWidgets requires "dashboard.reorder_widgets" capability
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { getDefaultWidgetOrder } from "./helpers";

// ─── Quick Draft ────────────────────────────────────────────────────────────

/**
 * Create a draft post from the Quick Draft widget.
 *
 * Requires "post.create" capability.
 * Creates a post with status "draft" and source indicator "quick_draft".
 *
 * @returns The new post document ID
 */
export const quickDraft = mutation({
  args: {
    title: v.string(),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.create");

    const title = args.title.trim();
    if (!title) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Title is required",
      });
    }

    if (title.length > 200) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Title must be 200 characters or fewer",
      });
    }

    const now = Date.now();
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 100);

    const postId = await ctx.db.insert("posts", {
      type: "post",
      title,
      slug: slug || "untitled",
      content: args.content?.trim() || undefined,
      status: "draft",
      visibility: "public",
      authorId: user._id,
      commentStatus: "open",
      createdAt: now,
      updatedAt: now,
    });

    // Emit dashboard-specific quick_drafted event
    await emitEvent(ctx, "dashboard.quick_drafted", "dashboard", {
      postId,
      title,
      authorId: user._id,
      surface: "admin",
    });

    // Also emit post.created so Post System handlers fire
    await emitEvent(ctx, "post.created", "dashboard", {
      postId,
      title,
      authorId: user._id,
      source: "quick_draft",
    });

    return postId;
  },
});

// ─── Save Widget Preferences ────────────────────────────────────────────────

/**
 * Upsert dashboard preferences for user+surface.
 *
 * Uses partial update pattern: only provided fields are updated.
 * Creates a new record if none exists.
 */
export const saveWidgetPreferences = mutation({
  args: {
    surface: v.union(v.literal("admin"), v.literal("website")),
    widgetOrder: v.optional(
      v.object({
        primary: v.array(v.string()),
        secondary: v.array(v.string()),
      }),
    ),
    hiddenWidgets: v.optional(v.array(v.string())),
    collapsedWidgets: v.optional(v.array(v.string())),
    welcomeDismissed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "dashboard.view");

    const existing = await ctx.db
      .query("dashboardPreferences")
      .withIndex("by_user_surface", (q) =>
        q.eq("userId", user._id).eq("surface", args.surface),
      )
      .unique();

    if (existing) {
      // Partial update: only patch provided fields
      const patch: Record<string, unknown> = {};
      if (args.widgetOrder !== undefined) patch.widgetOrder = args.widgetOrder;
      if (args.hiddenWidgets !== undefined)
        patch.hiddenWidgets = args.hiddenWidgets;
      if (args.collapsedWidgets !== undefined)
        patch.collapsedWidgets = args.collapsedWidgets;
      if (args.welcomeDismissed !== undefined)
        patch.welcomeDismissed = args.welcomeDismissed;

      await ctx.db.patch("dashboardPreferences", existing._id, patch);
      return existing._id;
    }

    // Create new preferences with defaults for unspecified fields
    const newId = await ctx.db.insert("dashboardPreferences", {
      userId: user._id,
      surface: args.surface,
      widgetOrder: args.widgetOrder ?? getDefaultWidgetOrder(args.surface),
      hiddenWidgets: args.hiddenWidgets ?? [],
      collapsedWidgets: args.collapsedWidgets ?? [],
      welcomeDismissed: args.welcomeDismissed ?? false,
    });

    return newId;
  },
});

// ─── Dismiss Widget ─────────────────────────────────────────────────────────

/**
 * Add a widget to the hidden list.
 *
 * Requires "dashboard.dismiss_widget" capability.
 */
export const dismissWidget = mutation({
  args: {
    surface: v.union(v.literal("admin"), v.literal("website")),
    widgetId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "dashboard.dismiss_widget");

    const existing = await ctx.db
      .query("dashboardPreferences")
      .withIndex("by_user_surface", (q) =>
        q.eq("userId", user._id).eq("surface", args.surface),
      )
      .unique();

    if (existing) {
      const hidden = new Set(existing.hiddenWidgets);
      hidden.add(args.widgetId);
      await ctx.db.patch("dashboardPreferences", existing._id, {
        hiddenWidgets: Array.from(hidden),
      });
    } else {
      // Create preferences with widget hidden
      await ctx.db.insert("dashboardPreferences", {
        userId: user._id,
        surface: args.surface,
        widgetOrder: getDefaultWidgetOrder(args.surface),
        hiddenWidgets: [args.widgetId],
        collapsedWidgets: [],
        welcomeDismissed: false,
      });
    }

    // Emit dashboard.widget_dismissed event
    await emitEvent(ctx, "dashboard.widget_dismissed", "dashboard", {
      userId: user._id,
      widgetId: args.widgetId,
      surface: args.surface,
    });
  },
});

// ─── Restore Widget ─────────────────────────────────────────────────────────

/**
 * Remove a widget from the hidden list.
 *
 * Requires "dashboard.dismiss_widget" capability.
 */
export const restoreWidget = mutation({
  args: {
    surface: v.union(v.literal("admin"), v.literal("website")),
    widgetId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "dashboard.dismiss_widget");

    const existing = await ctx.db
      .query("dashboardPreferences")
      .withIndex("by_user_surface", (q) =>
        q.eq("userId", user._id).eq("surface", args.surface),
      )
      .unique();

    if (existing) {
      await ctx.db.patch("dashboardPreferences", existing._id, {
        hiddenWidgets: existing.hiddenWidgets.filter(
          (id) => id !== args.widgetId,
        ),
      });

      // Emit dashboard.widget_restored event
      await emitEvent(ctx, "dashboard.widget_restored", "dashboard", {
        userId: user._id,
        widgetId: args.widgetId,
        surface: args.surface,
      });
    }
    // If no preferences exist, widget is already visible (default state)
  },
});

// ─── Toggle Widget Collapse ─────────────────────────────────────────────────

/**
 * Toggle a widget in/out of the collapsed list.
 *
 * Requires "dashboard.view" capability.
 */
export const toggleWidgetCollapse = mutation({
  args: {
    surface: v.union(v.literal("admin"), v.literal("website")),
    widgetId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "dashboard.view");

    const existing = await ctx.db
      .query("dashboardPreferences")
      .withIndex("by_user_surface", (q) =>
        q.eq("userId", user._id).eq("surface", args.surface),
      )
      .unique();

    if (existing) {
      const collapsed = new Set(existing.collapsedWidgets);
      if (collapsed.has(args.widgetId)) {
        collapsed.delete(args.widgetId);
      } else {
        collapsed.add(args.widgetId);
      }
      await ctx.db.patch("dashboardPreferences", existing._id, {
        collapsedWidgets: Array.from(collapsed),
      });
    } else {
      // Create new preferences with widget collapsed
      await ctx.db.insert("dashboardPreferences", {
        userId: user._id,
        surface: args.surface,
        widgetOrder: getDefaultWidgetOrder(args.surface),
        hiddenWidgets: [],
        collapsedWidgets: [args.widgetId],
        welcomeDismissed: false,
      });
    }
  },
});

// ─── Reorder Widgets ────────────────────────────────────────────────────────

/**
 * Replace widget order with a new layout.
 *
 * Requires "dashboard.reorder_widgets" capability.
 */
export const reorderWidgets = mutation({
  args: {
    surface: v.union(v.literal("admin"), v.literal("website")),
    widgetOrder: v.object({
      primary: v.array(v.string()),
      secondary: v.array(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "dashboard.reorder_widgets");

    const existing = await ctx.db
      .query("dashboardPreferences")
      .withIndex("by_user_surface", (q) =>
        q.eq("userId", user._id).eq("surface", args.surface),
      )
      .unique();

    if (existing) {
      await ctx.db.patch("dashboardPreferences", existing._id, {
        widgetOrder: args.widgetOrder,
      });
    } else {
      await ctx.db.insert("dashboardPreferences", {
        userId: user._id,
        surface: args.surface,
        widgetOrder: args.widgetOrder,
        hiddenWidgets: [],
        collapsedWidgets: [],
        welcomeDismissed: false,
      });
    }

    // Emit dashboard.widgets_reordered event
    await emitEvent(ctx, "dashboard.widgets_reordered", "dashboard", {
      userId: user._id,
      surface: args.surface,
      newOrder: args.widgetOrder,
    });
  },
});

// ─── Dismiss Welcome ────────────────────────────────────────────────────────

/**
 * Dismiss the welcome panel.
 *
 * Requires "dashboard.view" capability.
 */
export const dismissWelcome = mutation({
  args: {
    surface: v.union(v.literal("admin"), v.literal("website")),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "dashboard.view");

    const existing = await ctx.db
      .query("dashboardPreferences")
      .withIndex("by_user_surface", (q) =>
        q.eq("userId", user._id).eq("surface", args.surface),
      )
      .unique();

    if (existing) {
      await ctx.db.patch("dashboardPreferences", existing._id, { welcomeDismissed: true });
    } else {
      await ctx.db.insert("dashboardPreferences", {
        userId: user._id,
        surface: args.surface,
        widgetOrder: getDefaultWidgetOrder(args.surface),
        hiddenWidgets: [],
        collapsedWidgets: [],
        welcomeDismissed: true,
      });
    }

    // Emit dashboard.welcome_dismissed event
    await emitEvent(ctx, "dashboard.welcome_dismissed", "dashboard", {
      userId: user._id,
      surface: args.surface,
    });
  },
});
