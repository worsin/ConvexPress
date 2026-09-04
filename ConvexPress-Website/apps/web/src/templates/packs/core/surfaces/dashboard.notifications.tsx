/**
 * Core · dashboard.notifications — the notification center with the
 * preferences section reachable from the "Preferences" toggle. View, kind,
 * search and selection live in the loader (URL state); this surface only
 * renders the center.
 */
import { NotificationPreferencesSection } from "@/components/dashboard/notifications/NotificationPreferencesSection";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import type { NotificationActions } from "@/components/notifications/useNotificationActions";
import type { CenterNotification, NotificationCounts, NotificationKind, NotificationView } from "@/lib/notifications";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface DashboardNotificationsSurfaceData {
  /** undefined while the first subscription answers; the last answer stays while filters change. */
  items: CenterNotification[] | undefined;
  counts: NotificationCounts | undefined;
  /** Kinds present in the member's feed, for the filter chips. */
  kinds: NotificationKind[] | undefined;
  /** Server clock from the query, so snooze state matches the backend. */
  now: number | undefined;
  view: NotificationView;
  kind: NotificationKind | "all";
  query: string;
  selectedId: string | null;
  preferencesOpen: boolean;
  actions: NotificationActions;
  onViewChange: (view: NotificationView) => void;
  onKindChange: (kind: NotificationKind | "all") => void;
  onQueryChange: (query: string) => void;
  onSelect: (id: string | null) => void;
  onPreferencesOpenChange: (open: boolean) => void;
}

export default function CoreDashboardNotifications({ data }: SurfaceProps<DashboardNotificationsSurfaceData>) {
  return (
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
  );
}
