/**
 * Depot · dashboard.notifications — the notification center (view tabs,
 * kind chips, search, day-grouped list, detail pane, preferences) in the
 * Depot frame. View, kind, search and selection live in the loader (URL
 * state); this surface only renders the center, as Core does.
 */
import { NotificationPreferencesSection } from "@/components/dashboard/notifications/NotificationPreferencesSection";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { cn } from "@/lib/utils";
import type { DashboardNotificationsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.notifications";
import type { SurfaceProps } from "@/templates/sdk/types";

import { dashboardFrame } from "../parts/extra-dashboard";

export default function DepotDashboardNotifications({ data }: SurfaceProps<DashboardNotificationsSurfaceData>) {
  return (
    <div data-slot="dashboard-notifications" data-pack="depot" className={cn("flex flex-col gap-4 [&_h1]:font-display [&_h1]:font-semibold", dashboardFrame)}>
      <NotificationCenter
        items={data.items}
        counts={data.counts}
        kinds={data.kinds}
        now={data.now}
        view={data.view}
        onViewChange={data.onViewChange}
        kind={data.kind}
        onKindChange={data.onKindChange}
        query={data.query}
        onQueryChange={data.onQueryChange}
        selectedId={data.selectedId}
        onSelect={data.onSelect}
        actions={data.actions}
        preferences={<NotificationPreferencesSection defaultExpanded />}
        preferencesOpen={data.preferencesOpen}
        onPreferencesOpenChange={data.onPreferencesOpenChange}
      />
    </div>
  );
}
