import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Archive, BellOff, Check, CheckCheck, Search, Settings2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  EMPTY_COUNTS,
  KIND_META,
  KIND_ORDER,
  NOTIFICATION_VIEWS,
  VIEW_META,
  defaultSnoozePreset,
  groupByDay,
  isArchived,
  matchesView,
  searchText,
  summaryLine,
  type CenterNotification,
  type NotificationCounts,
  type NotificationKind,
  type NotificationView,
} from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { KIND_ICON } from "@/components/notifications/kind";
import { NotificationRow } from "@/components/notifications/NotificationRow";
import { NotificationDetail } from "@/components/notifications/NotificationDetail";
import { SideSheet } from "@/components/notifications/SideSheet";
import type { NotificationActions } from "@/components/notifications/useNotificationActions";

export interface NotificationCenterProps {
  items: CenterNotification[] | undefined;
  counts: NotificationCounts | undefined;
  /** Kinds present in the member's feed (from the backend), for the filter chips. */
  kinds?: NotificationKind[];
  view: NotificationView;
  onViewChange: (view: NotificationView) => void;
  kind: NotificationKind | "all";
  onKindChange: (kind: NotificationKind | "all") => void;
  query: string;
  onQueryChange: (query: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  actions: NotificationActions;
  /** Server clock from the query, so snooze state matches the backend. */
  now?: number;
  /** Rendered below the list when the "Preferences" tab is active. */
  preferences?: ReactNode;
  preferencesOpen: boolean;
  onPreferencesOpenChange: (open: boolean) => void;
}

function useIsNarrow(px = 1024) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px - 1}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [px]);
  return narrow;
}

/**
 * The notification center: view tabs with live counts, kind chips, search,
 * a day-grouped list on the left and the open notification on the right (a
 * side sheet on narrow screens). Keyboard: j/k move, Enter opens, e archives
 * or restores, u toggles read, s snoozes until tomorrow, Esc closes.
 */
export function NotificationCenter({
  items,
  counts,
  kinds,
  view,
  onViewChange,
  kind,
  onKindChange,
  query,
  onQueryChange,
  selectedId,
  onSelect,
  actions,
  now = Date.now(),
  preferences,
  preferencesOpen,
  onPreferencesOpenChange,
}: NotificationCenterProps) {
  const [cursor, setCursor] = useState(0);
  const narrow = useIsNarrow();
  const listRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => items ?? [], [items]);
  // The backend already filtered by view/kind/search; a second client-side
  // pass keeps typing responsive between subscription updates.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((n) => matchesView(n, view, now) && (kind === "all" || n.kind === kind) && (!q || searchText(n).includes(q)));
  }, [all, view, now, kind, query]);
  const groups = useMemo(() => groupByDay(visible, now), [visible, now]);
  const selected = selectedId ? (all.find((n) => n.id === selectedId) ?? null) : null;
  const kindsPresent = kinds ?? Array.from(new Set(all.map((n) => n.kind)));

  useEffect(() => {
    if (selectedId) {
      const i = visible.findIndex((n) => n.id === selectedId);
      if (i >= 0) setCursor(i);
    }
  }, [selectedId, visible]);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(visible.length - 1, 0)));
  }, [visible.length]);

  const open = (n: CenterNotification) => {
    onSelect(n.id);
    if (typeof n.readAt !== "number") void actions.markRead(n.id);
  };

  // Keyboard shortcuts, ignored while typing or when a modifier is held.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const cur = visible[cursor];
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          setCursor((c) => Math.min(c + 1, Math.max(visible.length - 1, 0)));
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          setCursor((c) => Math.max(c - 1, 0));
          break;
        case "Enter":
          if (cur && document.activeElement?.closest("[data-notification-list]")) {
            e.preventDefault();
            open(cur);
          }
          break;
        case "e":
          if (cur) void (isArchived(cur) ? actions.restore(cur.id) : actions.archive(cur.id));
          break;
        case "u":
          if (cur) void (typeof cur.readAt === "number" ? actions.markUnread(cur.id) : actions.markRead(cur.id));
          break;
        case "s":
          if (cur) void actions.snooze(cur.id, defaultSnoozePreset().until(Date.now()));
          break;
        case "Escape":
          if (selectedId) onSelect(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, cursor, actions, onSelect, selectedId]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const loading = items === undefined;
  const c = counts ?? EMPTY_COUNTS;
  const detail = selected ? <NotificationDetail n={selected} actions={actions} now={now} onClose={() => onSelect(null)} /> : null;
  const readInInbox = Math.max(0, c.inbox - c.unread);

  return (
    <div className="space-y-5" data-slot="notification-center">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground">{summaryLine(c)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={c.unread === 0} onClick={() => void actions.markAllRead()}>
            <CheckCheck className="size-4" aria-hidden />
            Mark all read
          </Button>
          <Button variant="outline" size="sm" disabled={readInInbox <= 0} onClick={() => void actions.archiveRead()}>
            <Archive className="size-4" aria-hidden />
            Archive read
          </Button>
          {preferences && (
            <Button variant={preferencesOpen ? "secondary" : "outline"} size="sm" aria-pressed={preferencesOpen} onClick={() => onPreferencesOpenChange(!preferencesOpen)}>
              <Settings2 className="size-4" aria-hidden />
              Preferences
            </Button>
          )}
        </div>
      </div>

      {preferencesOpen && preferences ? (
        <section aria-label="Notification preferences">{preferences}</section>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <div role="tablist" aria-label="View" className="flex flex-wrap gap-1 rounded-4xl border border-border bg-muted/60 p-[3px]">
              {NOTIFICATION_VIEWS.map((v) => {
                const on = view === v;
                const count = c[v];
                return (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => {
                      onViewChange(v);
                      setCursor(0);
                    }}
                    className={cn(
                      "inline-flex h-[30px] items-center gap-1.5 rounded-4xl px-3 text-[13px] font-medium outline-hidden transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {v === "needs" && c.needs > 0 && <span className="size-[7px] rounded-full bg-warning" aria-hidden />}
                    {VIEW_META[v].label}
                    {count > 0 && <span className={cn("rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums", on ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground/80")}>{count}</span>}
                  </button>
                );
              })}
            </div>
            <label className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" aria-hidden />
              <Input type="search" value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Search notifications" aria-label="Search notifications" className="h-9 pl-9" />
            </label>
          </div>

          {kindsPresent.length > 1 && (
            <div role="group" aria-label="Kind" className="flex flex-wrap gap-1.5">
              <KindChip on={kind === "all"} onClick={() => onKindChange("all")}>
                Everything
              </KindChip>
              {KIND_ORDER.filter((k) => kindsPresent.includes(k)).map((k) => {
                const Icon = KIND_ICON[k];
                return (
                  <KindChip key={k} on={kind === k} onClick={() => onKindChange(k)}>
                    <Icon className="size-3.5" aria-hidden />
                    {KIND_META[k].label}
                  </KindChip>
                );
              })}
            </div>
          )}

          <div className={cn("grid gap-5", !narrow && selected && "lg:grid-cols-[minmax(0,1fr)_400px]")}>
            <div ref={listRef} className="space-y-5" data-notification-list>
              {loading && (
                <div className="space-y-2" aria-busy="true" aria-label="Loading notifications">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-[76px] w-full rounded-2xl" />
                  ))}
                </div>
              )}
              {!loading && visible.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
                  <span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-primary/12 text-primary">
                    {view === "inbox" || view === "unread" || view === "needs" ? <Check className="size-5" strokeWidth={2.5} aria-hidden /> : <BellOff className="size-5" aria-hidden />}
                  </span>
                  <p className="text-sm font-semibold text-foreground">{query || kind !== "all" ? "Nothing matches" : VIEW_META[view].emptyTitle}</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{query || kind !== "all" ? "Clear the search or pick a different kind." : VIEW_META[view].empty}</p>
                </div>
              )}
              {groups.map((g) => (
                <section key={g.label} aria-label={g.label} className="space-y-2">
                  <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{g.label}</h2>
                  <ul className="space-y-2">
                    {g.items.map((n) => {
                      const index = visible.indexOf(n);
                      return <NotificationRow key={n.id} n={n} index={index} active={index === cursor} selected={n.id === selectedId} now={now} onOpen={() => open(n)} onHover={() => setCursor(index)} actions={actions} />;
                    })}
                  </ul>
                </section>
              ))}
              {!loading && visible.length > 0 && (
                <p className="hidden px-1 text-xs text-muted-foreground/70 md:block">
                  Keyboard: <Kbd>j</Kbd> <Kbd>k</Kbd> move, <Kbd>Enter</Kbd> open, <Kbd>e</Kbd> archive, <Kbd>u</Kbd> read or unread, <Kbd>s</Kbd> snooze until tomorrow, <Kbd>Esc</Kbd> close.
                </p>
              )}
            </div>

            {!narrow && selected && <aside className="lg:sticky lg:top-24 lg:self-start">{detail}</aside>}
          </div>

          {narrow && (
            <SideSheet open={Boolean(selected)} onOpenChange={(o) => !o && onSelect(null)} title={selected?.title ?? "Notification"} description="Notification details">
              {detail}
            </SideSheet>
          )}
        </>
      )}
    </div>
  );
}

function KindChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-4xl border px-3 text-[13px] font-medium outline-hidden transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
        on ? "border-primary bg-primary/8 text-foreground" : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border bg-muted px-1 font-sans text-[11px] text-foreground">{children}</kbd>;
}
