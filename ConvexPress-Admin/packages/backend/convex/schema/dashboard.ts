/**
 * Dashboard System - Schema
 *
 * One table supporting user-customizable dashboard preferences:
 *   - `dashboardPreferences` - Per-user, per-surface widget layout and visibility
 *
 * ConvexPress's dashboard mirrors WordPress's admin dashboard widget system:
 *   - Two-column layout (primary/secondary) on desktop, single column on mobile
 *   - Widgets can be hidden, collapsed, and reordered
 *   - Dismissable welcome panel
 *   - Per-surface preferences (admin vs website dashboard)
 *
 * The dashboard system does NOT own any content tables. It reads from:
 *   - posts (Post System) - for At a Glance counts + Quick Draft
 *   - comments (Comment System) - for comment counts + moderation queue
 *   - users (User Profile System) - for user counts
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Tables ─────────────────────────────────────────────────────────────────

export const dashboardTables = {
  /**
   * User dashboard preferences.
   *
   * Stores per-user, per-surface layout preferences. Each user can have
   * one record per surface (admin, website).
   *
   * The `by_user_surface` index enforces lookup efficiency and serves
   * as a pseudo-uniqueness constraint (upsert pattern in mutations).
   */
  dashboardPreferences: defineTable({
    userId: v.id("users"), // The user these preferences belong to
    surface: v.union(v.literal("admin"), v.literal("website")), // Which dashboard surface

    // ── Widget Layout ──────────────────────────────────────────────────
    widgetOrder: v.object({
      primary: v.array(v.string()), // Widget IDs in primary (left) column
      secondary: v.array(v.string()), // Widget IDs in secondary (right) column
    }),

    // ── Widget Visibility ──────────────────────────────────────────────
    hiddenWidgets: v.array(v.string()), // Widget IDs that are hidden via Screen Options
    collapsedWidgets: v.array(v.string()), // Widget IDs that are collapsed (header only)

    // ── Welcome Panel ──────────────────────────────────────────────────
    welcomeDismissed: v.boolean(), // Whether the welcome panel has been dismissed
  }).index("by_user_surface", ["userId", "surface"]),
};
