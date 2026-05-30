/**
 * Support Bridge System - Widget Backend
 *
 * Queries powering the floating support widget on the website:
 *
 *   getConfig         - Widget configuration from Settings System
 *   getRecentTickets  - User's most recent tickets for context panel
 *
 * Both queries are designed to work for authenticated and anonymous users.
 * Anonymous users get the config but no ticket history.
 */

import { query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { getConfigArgs, getRecentTicketsArgs } from "./validators";
import { SUPPORT_WIDGET_DEFAULTS } from "./settings";
import { isPluginEnabled } from "../helpers/plugins";

// ─── getConfig ────────────────────────────────────────────────────────────────

/**
 * Get support widget configuration from Settings System.
 *
 * Returns the support.widget settings section, merged with defaults.
 * No auth required — widget config is needed before user identifies themselves.
 *
 * Config includes:
 *   - enabled: boolean (widget visible or not)
 *   - widgetTitle: string
 *   - widgetSubtitle: string
 *   - widgetColor: string (hex/CSS)
 *   - showKbSearch: boolean
 *   - showTicketHistory: boolean
 *   - aiEnabled: boolean (deflection on/off)
 *   - escalationButtonLabel: string
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getConfig = query({
  args: getConfigArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return null;
    const knowledgeBaseEnabled = await isPluginEnabled(ctx, "knowledgeBase");
    // Additional widget-display-only defaults (not persisted in settings)
    const WIDGET_DISPLAY_DEFAULTS = {
      position: "bottomRight",
      greeting: "Hi! How can we help?",
    };

    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q: ConvexQueryBuilder) => q.eq("section", "support.widget"))
      .unique();

    const stored = doc ? (doc.values as Record<string, unknown>) : {};

    return {
      ...SUPPORT_WIDGET_DEFAULTS,
      ...WIDGET_DISPLAY_DEFAULTS,
      ...stored,
      showKbSearch:
        knowledgeBaseEnabled && (stored.showKbSearch ?? SUPPORT_WIDGET_DEFAULTS.showKbSearch) !== false,
    };
  },
});

// ─── getRecentTickets ─────────────────────────────────────────────────────────

/**
 * Get the current user's most recent support tickets (up to 5).
 *
 * Used in the widget's "My Tickets" panel to let users quickly check
 * the status of their existing tickets without leaving the current page.
 *
 * Returns null for anonymous users (not authenticated).
 *
 * Each ticket is returned with minimal fields needed for the widget:
 *   { _id, ticketNumber, subject, status, updatedAt }
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getRecentTickets = query({
  args: getRecentTicketsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "tickets"))) return [];
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const limit = Math.min(args.limit ?? 5, 20);

    const tickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_user", (q: ConvexQueryBuilder) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    return tickets.map((t) => ({
      _id: t._id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      messageCount: t.messageCount,
      lastMessageAt: t.lastMessageAt,
      updatedAt: t.updatedAt,
      createdAt: t.createdAt,
    }));
  },
});
