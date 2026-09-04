/**
 * Core · dashboard.home — the member's widget grid.
 *
 * Renders the layout the loader (dashboard/pages/home/HomePage.tsx) resolved:
 * one card per visible layout item on the 12-column grid, the customize
 * toolbar, hidden-widget tray, picker, per-widget settings and the reset
 * dialog. All persistence goes through `data.editor`.
 */
import { WidgetGridView } from "@/dashboard/WidgetGrid";
import type { LayoutEditor } from "@/dashboard/grid/useLayoutEditor";
import type { DashboardGridGeometry, DashboardWidgetDefinition, MyLayoutPayload } from "@/dashboard/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface DashboardHomeSurfaceData {
  /** "loading" until the layout and registry answer; "signedOut" when the layout query returns null. */
  status: "loading" | "signedOut" | "ready";
  layout: MyLayoutPayload | null;
  grid: DashboardGridGeometry;
  /** Widgets available on this site (plugin-filtered registry). */
  widgets: DashboardWidgetDefinition[];
  /** Widget ids that have a website module and can be added. */
  availableWidgetIds: string[];
  /** Layout editing state and the debounced save/reset actions. */
  editor: LayoutEditor;
}

export default function CoreDashboardHome({ data }: SurfaceProps<DashboardHomeSurfaceData>) {
  return (
    <WidgetGridView
      status={data.status}
      layout={data.layout}
      grid={data.grid}
      widgets={data.widgets}
      availableWidgetIds={data.availableWidgetIds}
      editor={data.editor}
    />
  );
}
