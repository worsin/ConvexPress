/**
 * Customer dashboard — module contracts.
 *
 * The dashboard is assembled from two kinds of modules discovered by
 * `import.meta.glob` (like blocks):
 *
 *   apps/web/src/dashboard/pages/<id>/manifest.tsx    default-exports DashboardPageModule
 *   apps/web/src/dashboard/widgets/<id>/manifest.tsx  default-exports DashboardWidgetModule
 *
 * The <id> MUST equal an entry in the backend registry
 * (ConvexPress-Admin/packages/backend/convex/extensions/dashboard/registry.ts,
 * or an extension's convex/extensions/<ext>/dashboard.ts). The registry owns
 * titles, icons, plugin gates, capabilities, and widget sizes; a module only
 * owns rendering. Menus, layouts, and badges all key off the same ids.
 *
 * Rules every module follows:
 *   - Never hardcode the dashboard base path; use `useDashboardPath()` to
 *     build links (the base path is a site setting, and a menu item can
 *     override it).
 *   - Plugin and capability gates are enforced by the shell from registry
 *     data; modules may assume they are allowed to render.
 *   - Widgets render at any of the registry's allowed sizes; read `size` and
 *     `settings` from props and degrade gracefully (fewer rows, no chart).
 *   - Widgets must render their own empty, loading, and error states inside
 *     the card the shell provides. No outer chrome.
 *   - Use brand tokens only (no literal colors); see design-kit/BRAND.md.
 */

import type { ComponentType, ReactNode } from "react";

export type DashboardWidgetSize = "sm" | "md" | "lg" | "xl";

export interface DashboardPageModule {
  /** Registry page id (folder name). */
  id: string;
  /** Renders the page body inside the shell's content column. */
  Page: ComponentType<{ /** Remaining path after the page's own path, e.g. "/TKT-1" */ subpath: string }>;
  /** Optional nested pages, e.g. an order detail; matched by prefix on subpath. */
  matchSubpath?: (subpath: string) => boolean;
}

export interface DashboardWidgetProps {
  /** Layout instance key, unique on the grid. */
  instanceKey: string;
  size: DashboardWidgetSize;
  settings: Record<string, string | number | boolean>;
  /** True while the member is arranging the grid; widgets should be inert. */
  editing: boolean;
}

export interface DashboardWidgetModule {
  /** Registry widget id (folder name). */
  id: string;
  Widget: ComponentType<DashboardWidgetProps>;
  /** Optional header actions rendered in the card title row (e.g. "View all"). */
  Actions?: ComponentType<DashboardWidgetProps>;
  /** Card title override; defaults to the registry title. */
  title?: string | ((props: DashboardWidgetProps) => ReactNode);
}
