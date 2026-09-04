/**
 * Notifications page module body.
 *
 * Owns the URL state (?view=&id=) so the bell, the widget and the shell can
 * deep-link into a specific view or notification, subscribes to
 * notifications.queries.listForCenter, and renders the center with the
 * preferences section reachable from a "Preferences" toggle.
 */

import { useCallback, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { isNotificationKind, isNotificationView, type CenterResult, type NotificationKind, type NotificationView } from "@/lib/notifications";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { useNotificationActions } from "@/components/notifications/useNotificationActions";
import { NotificationPreferencesSection } from "@/components/dashboard/notifications/NotificationPreferencesSection";

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

  const result = useQuery(api.notifications.queries.listForCenter, {
    view,
    kind: kind === "all" ? undefined : kind,
    search: query.trim() || undefined,
  }) as CenterResult | undefined;

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

  return (
    <NotificationCenter
      items={result?.items}
      counts={result?.counts}
      kinds={result?.kinds}
      now={result?.now}
      view={view}
      onViewChange={(v) => setSearch({ view: v, id: null })}
      kind={kind}
      onKindChange={(k) => setSearch({ kind: k })}
      query={query}
      onQueryChange={setQuery}
      selectedId={selectedId}
      onSelect={(id) => setSearch({ id })}
      actions={actions}
      preferences={<NotificationPreferencesSection defaultExpanded />}
      preferencesOpen={preferencesOpen}
      onPreferencesOpenChange={(open) => setSearch({ tab: open ? "preferences" : null, id: null })}
    />
  );
}
