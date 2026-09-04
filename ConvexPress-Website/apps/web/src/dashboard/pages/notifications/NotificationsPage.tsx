/**
 * Notifications page loader.
 *
 * Owns the URL state (?view=&id=&kind=&tab=) so the bell, the widget and the
 * shell can deep-link into a specific view or notification, subscribes to
 * notifications.queries.listForCenter, and hands the result plus the
 * callbacks to the `dashboard.notifications` surface.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { isNotificationKind, isNotificationView, type CenterResult, type NotificationKind, type NotificationView } from "@/lib/notifications";
import { useNotificationActions } from "@/components/notifications/useNotificationActions";
import CoreDashboardNotifications, {
  type DashboardNotificationsSurfaceData,
} from "@/templates/packs/core/surfaces/dashboard.notifications";
import { Surface } from "@/templates/sdk/Surface";

interface CenterSearch {
  view?: string;
  id?: string;
  kind?: string;
  tab?: string;
}

export function NotificationsPage() {
  const search = useSearch({ strict: false }) as CenterSearch;
  const navigate = useNavigate();
  const view: NotificationView = isNotificationView(search.view) ? search.view : "inbox";
  const kind: NotificationKind | "all" = isNotificationKind(search.kind) ? search.kind : "all";
  const selectedId = typeof search.id === "string" && search.id ? search.id : null;
  const preferencesOpen = search.tab === "preferences";
  const [query, setQuery] = useState("");

  const live = useQuery(api.notifications.queries.listForCenter, {
    view,
    kind: kind === "all" ? undefined : kind,
    search: query.trim() || undefined,
  }) as CenterResult | undefined;

  // Keep the last answer on screen while a new view/kind/search subscription
  // loads, so switching tabs or typing never flashes skeletons. The center
  // filters client-side too, so the stale list is already narrowed correctly.
  const [last, setLast] = useState<CenterResult | undefined>(undefined);
  useEffect(() => {
    if (live !== undefined) setLast(live);
  }, [live]);
  const result = live ?? last;

  const setSearch = useCallback(
    (next: { id?: string | null; view?: NotificationView; kind?: NotificationKind | "all"; tab?: "preferences" | null }) => {
      void navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => {
          const merged: Record<string, unknown> = { ...prev };
          if (next.id !== undefined) {
            if (next.id) merged.id = next.id;
            else delete merged.id;
          }
          if (next.view !== undefined) {
            if (next.view === "inbox") delete merged.view;
            else merged.view = next.view;
          }
          if (next.kind !== undefined) {
            if (next.kind === "all") delete merged.kind;
            else merged.kind = next.kind;
          }
          if (next.tab !== undefined) {
            if (next.tab) merged.tab = next.tab;
            else delete merged.tab;
          }
          return merged;
        },
        replace: true,
      } as never);
    },
    [navigate],
  );

  const actions = useNotificationActions({ onSnoozed: (id) => (id === selectedId ? setSearch({ id: null }) : undefined) });

  const data: DashboardNotificationsSurfaceData = {
    items: result?.items,
    counts: result?.counts,
    kinds: result?.kinds,
    now: result?.now,
    view,
    kind,
    query,
    selectedId,
    preferencesOpen,
    actions,
    onViewChange: (v) => setSearch({ view: v, id: null }),
    onKindChange: (k) => setSearch({ kind: k }),
    onQueryChange: setQuery,
    onSelect: (id) => setSearch({ id }),
    onPreferencesOpenChange: (open) => setSearch({ tab: open ? "preferences" : null, id: null }),
  };

  return <Surface name="dashboard.notifications" data={data} fallback={CoreDashboardNotifications} />;
}
