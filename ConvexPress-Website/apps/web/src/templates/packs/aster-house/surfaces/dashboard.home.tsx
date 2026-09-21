/**
 * Aster · dashboard.home — the member's widget grid, unchanged in
 * behaviour (customize toolbar, hidden tray, picker, settings, reset all live
 * in WidgetGridView and persist through `data.editor`); the frame turns the
 * heading into display type, the toolbar into pills and the widgets into
 * quiet rounded panels.
 */
import { WidgetGridView } from "@/dashboard/WidgetGrid";
import { cn } from "@/lib/utils";
import type { DashboardHomeSurfaceData } from "@/templates/packs/core/surfaces/dashboard.home";
import type { SurfaceProps } from "@/templates/sdk/types";

import { JOURNAL_DASHBOARD_FRAME, JOURNAL_WIDGET_FRAME } from "../parts/extra-dashboard";

export default function AsterDashboardHome({ data }: SurfaceProps<DashboardHomeSurfaceData>) {
  return (
    <div data-slot="dashboard-home" className={cn("flex flex-col gap-10", JOURNAL_DASHBOARD_FRAME, JOURNAL_WIDGET_FRAME)}>
      <WidgetGridView status={data.status} layout={data.layout} grid={data.grid} widgets={data.widgets} availableWidgetIds={data.availableWidgetIds} editor={data.editor} />
    </div>
  );
}
