/**
 * Dashboard System - Widget Registry
 *
 * Static registry of all dashboard widgets. Defines each widget's ID,
 * title, component, default column, sort order, and capability gate.
 *
 * Used by WidgetGrid to determine which widgets to show based on user
 * capabilities, and by ScreenOptions to list all available widgets.
 */

import { lazy } from "react";
import type { DashboardWidget } from "./types";

// ─── Lazy-loaded widget components ──────────────────────────────────────────

const AtAGlanceWidget = lazy(
  () => import("@/components/dashboard/widgets/AtAGlanceWidget"),
);
const ActivityFeedWidget = lazy(
  () => import("@/components/dashboard/widgets/ActivityFeedWidget"),
);
const QuickDraftWidget = lazy(
  () => import("@/components/dashboard/widgets/QuickDraftWidget"),
);
const ModerationQueueWidget = lazy(
  () => import("@/components/dashboard/widgets/ModerationQueueWidget"),
);
const RecentCommentsWidget = lazy(
  () => import("@/components/dashboard/widgets/RecentCommentsWidget"),
);
const SystemHealthWidget = lazy(
  () => import("@/components/dashboard/widgets/SystemHealthWidget"),
);

// ─── Widget Registry ────────────────────────────────────────────────────────

/**
 * Complete list of dashboard widgets, ordered by default appearance.
 *
 * To add a new widget:
 *   1. Create the component in `components/dashboard/widgets/`
 *   2. Add a lazy import above
 *   3. Add an entry here with a unique `id`
 */
export const WIDGET_REGISTRY: DashboardWidget[] = [
  // ── Primary Column (Left) ────────────────────────────────────────────────
  {
    id: "at-a-glance",
    title: "At a Glance",
    component: AtAGlanceWidget,
    defaultColumn: "primary",
    defaultOrder: 10,
    minCapability: "dashboard.view",
  },
  {
    id: "activity-feed",
    title: "Activity",
    component: ActivityFeedWidget,
    defaultColumn: "primary",
    defaultOrder: 20,
    minCapability: "dashboard.view",
  },
  // ── Secondary Column (Right) ─────────────────────────────────────────────
  {
    id: "quick-draft",
    title: "Quick Draft",
    component: QuickDraftWidget,
    defaultColumn: "secondary",
    defaultOrder: 0,
    minCapability: "post.create",
  },
  {
    id: "moderation-queue",
    title: "Moderation Queue",
    component: ModerationQueueWidget,
    defaultColumn: "secondary",
    defaultOrder: 10,
    minCapability: "comment.approve",
  },
  {
    id: "recent-comments",
    title: "Recent Comments",
    component: RecentCommentsWidget,
    defaultColumn: "secondary",
    defaultOrder: 15,
    minCapability: "comment.approve",
  },
  {
    id: "system-health",
    title: "System Health",
    component: SystemHealthWidget,
    defaultColumn: "secondary",
    defaultOrder: 20,
    minCapability: "settings.update_general",
  },
];

/**
 * Get a widget definition by ID.
 */
export function getWidgetById(id: string): DashboardWidget | undefined {
  return WIDGET_REGISTRY.find((w) => w.id === id);
}

/**
 * Get default widget order from the registry.
 */
export function getDefaultWidgetOrder(): {
  primary: string[];
  secondary: string[];
} {
  const primary = WIDGET_REGISTRY.filter((w) => w.defaultColumn === "primary")
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map((w) => w.id);

  const secondary = WIDGET_REGISTRY.filter(
    (w) => w.defaultColumn === "secondary",
  )
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map((w) => w.id);

  return { primary, secondary };
}
