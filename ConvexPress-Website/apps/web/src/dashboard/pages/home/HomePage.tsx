/**
 * Home page loader: the member's layout (api.extensions.dashboard.queries.myLayout),
 * the widget registry from the shell, and the layout editor (debounced
 * saves, reset). Rendering belongs to the `dashboard.home` surface.
 */
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import CoreDashboardHome, { type DashboardHomeSurfaceData } from "@/templates/packs/core/surfaces/dashboard.home";
import { Surface } from "@/templates/sdk/Surface";
import { useLayoutEditor } from "../../grid/useLayoutEditor";
import { listWidgetModuleIds } from "../../registry";
import { useDashboardShell } from "../../shell/DashboardShellContext";
import { DEFAULT_DASHBOARD_GRID, type MyLayoutPayload } from "../../types";

export function DashboardHomePage() {
  const layout = useQuery(api.extensions.dashboard.queries.myLayout, {}) as MyLayoutPayload | null | undefined;
  const { registry } = useDashboardShell();
  const grid = layout?.grid ?? registry?.grid ?? DEFAULT_DASHBOARD_GRID;
  const widgets = useMemo(() => registry?.widgets ?? [], [registry?.widgets]);
  const editor = useLayoutEditor(layout, widgets, grid);

  const data: DashboardHomeSurfaceData = {
    status: layout === undefined || !registry ? "loading" : layout === null ? "signedOut" : "ready",
    layout: layout ?? null,
    grid,
    widgets,
    availableWidgetIds: listWidgetModuleIds(),
    editor,
  };

  return <Surface name="dashboard.home" data={data} fallback={CoreDashboardHome} />;
}
