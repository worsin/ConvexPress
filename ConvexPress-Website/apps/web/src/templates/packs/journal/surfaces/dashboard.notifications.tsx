/**
 * Journal · dashboard.notifications — the notification center with the
 * preferences section behind the "Preferences" toggle. View, kind, search
 * and selection live in the loader; the shared NotificationCenter keeps the
 * keyboard model and actions; the frame sets the heading in display type and
 * the buttons as pills.
 */
import { NotificationPreferencesSection } from "@/components/dashboard/notifications/NotificationPreferencesSection";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { cn } from "@/lib/utils";
import type { DashboardNotificationsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.notifications";
import type { SurfaceProps } from "@/templates/sdk/types";

import { JOURNAL_NOTIFICATIONS_FRAME } from "../parts/extra-dashboard";

export default function JournalDashboardNotifications({ data }: SurfaceProps<DashboardNotificationsSurfaceData>) {
  return (
    <div data-slot="dashboard-notifications" className={cn("flex flex-col", JOURNAL_NOTIFICATIONS_FRAME)}>
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
