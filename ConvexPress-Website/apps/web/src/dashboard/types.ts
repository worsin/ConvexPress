/**
 * Registry shapes shared with the backend.
 *
 * Mirrors ConvexPress-Admin/packages/backend/convex/extensions/dashboard/registry.ts.
 * The website reads the live registry from `api.extensions.dashboard.queries.registry`
 * (plugin-filtered per site); these types describe that payload. Keep them in
 * sync when the backend registry gains fields.
 */

import type { DashboardWidgetSize } from "./contracts";

export type { DashboardWidgetSize };

export type DashboardPageGroup = "overview" | "activity" | "commerce" | "learning" | "support" | "account";
export type DashboardWidgetCategory = "overview" | "activity" | "commerce" | "learning" | "support" | "content";

export interface DashboardPageDefinition {
  id: string;
  title: string;
  /** Lucide icon name, kebab-case. */
  icon: string;
  description: string;
  /** Path under the base path, "" for home. */
  path: string;
  pluginId: string;
  capability?: string;
  group: DashboardPageGroup;
  defaultInSidebar: boolean;
  badge?: string;
}

export interface DashboardWidgetSetting {
  key: string;
  label: string;
  kind: "number" | "toggle" | "select" | "text";
  defaultValue: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
}

export interface DashboardWidgetDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  pluginId: string;
  capability?: string;
  sizes: DashboardWidgetSize[];
  defaultSize: DashboardWidgetSize;
  settings?: DashboardWidgetSetting[];
  defaultInHome: boolean;
  category: DashboardWidgetCategory;
}

export interface DashboardGridGeometry {
  columns: number;
  rowHeight: number;
  gap: number;
  sizes: Record<DashboardWidgetSize, { w: number; h: number }>;
}

/** Fallback geometry, identical to DASHBOARD_GRID in the backend registry. */
export const DEFAULT_DASHBOARD_GRID: DashboardGridGeometry = {
  columns: 12,
  rowHeight: 96,
  gap: 16,
  sizes: {
    sm: { w: 3, h: 2 },
    md: { w: 4, h: 3 },
    lg: { w: 6, h: 3 },
    xl: { w: 12, h: 4 },
  },
};

export interface DashboardLayoutItem {
  key: string;
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  settings?: Record<string, string | number | boolean>;
  hidden?: boolean;
}

export interface DashboardRegistryPayload {
  grid: DashboardGridGeometry;
  pages: DashboardPageDefinition[];
  widgets: DashboardWidgetDefinition[];
  badgeSources: readonly string[];
}

export interface MyLayoutPayload {
  scope: string;
  items: DashboardLayoutItem[];
  canEdit: boolean;
  customized: boolean;
  baseChanged: boolean;
  grid: DashboardGridGeometry;
}

export const PAGE_GROUP_LABELS: Record<DashboardPageGroup, string> = {
  overview: "Overview",
  activity: "Activity",
  commerce: "Shop",
  learning: "Learning",
  support: "Support",
  account: "Account",
};

export const PAGE_GROUP_ORDER: DashboardPageGroup[] = [
  "overview",
  "activity",
  "commerce",
  "learning",
  "support",
  "account",
];

export const WIDGET_CATEGORY_LABELS: Record<DashboardWidgetCategory, string> = {
  overview: "Overview",
  activity: "Activity",
  commerce: "Shop",
  learning: "Learning",
  support: "Support",
  content: "Content",
};

export const WIDGET_CATEGORY_ORDER: DashboardWidgetCategory[] = [
  "overview",
  "activity",
  "content",
  "commerce",
  "learning",
  "support",
];
