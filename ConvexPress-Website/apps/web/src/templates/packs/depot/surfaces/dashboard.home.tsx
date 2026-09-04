/**
 * Depot · dashboard.home — the member's widget grid (customize toolbar,
 * hidden tray, picker, per-widget settings, reset) in the Depot frame:
 * widget cards become `rounded-md` boxes in the dense rhythm. Same
 * behaviour as Core; persistence goes through `data.editor`.
 */
import { WidgetGridView } from "@/dashboard/WidgetGrid";
import { cn } from "@/lib/utils";
import type { DashboardHomeSurfaceData } from "@/templates/packs/core/surfaces/dashboard.home";
import type { SurfaceProps } from "@/templates/sdk/types";

import { dashboardFrame } from "../parts/extra-dashboard";

export default function DepotDashboardHome({ data }: SurfaceProps<DashboardHomeSurfaceData>) {
  return (
    <div data-slot="dashboard-home" data-pack="depot" className={cn("flex flex-col gap-4", dashboardFrame)}>
      <WidgetGridView status={data.status} layout={data.layout} grid={data.grid} widgets={data.widgets} availableWidgetIds={data.availableWidgetIds} editor={data.editor} />
    </div>
  );
}
