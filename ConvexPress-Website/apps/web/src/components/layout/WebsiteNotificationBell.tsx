/**
 * Website Notification Bell
 *
 * Header bell with an unread badge and a popover showing the latest inbox
 * items (one-tap open / mark read / archive), "Mark all read", a link to
 * notification preferences, and "Open inbox". The badge count comes from
 * the notification center's live counts (unread, not archived, not snoozed).
 */

import { useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { Bell, CheckCheck, Loader2, Settings2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import { EMPTY_COUNTS, summaryLine, type CenterResult } from "@/lib/notifications";
import { NotificationRow } from "@/components/notifications/NotificationRow";
import { useNotificationActions } from "@/components/notifications/useNotificationActions";

const PEEK_LIMIT = 6;

export function WebsiteNotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { to } = useDashboardPath();
  const inboxHref = to("/notifications");
  const actions = useNotificationActions({ quiet: true });

  // One cheap subscription for the badge; the list only while open.
  const countsResult = useQuery(api.notifications.queries.listForCenter, { view: "inbox", limit: 1 }) as CenterResult | undefined;
  const peek = useQuery(api.notifications.queries.listForCenter, open ? { view: "inbox", limit: PEEK_LIMIT } : "skip") as CenterResult | undefined;

  const counts = countsResult?.counts ?? EMPTY_COUNTS;
  const unread = counts.unread;
  const needs = counts.needs;
  const displayCount = unread > 99 ? "99+" : String(unread);
  const now = peek?.now ?? countsResult?.now ?? Date.now();

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        className="relative flex size-8 items-center justify-center rounded-full text-muted-foreground outline-hidden transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-expanded:text-foreground"
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      >
        <Bell className="size-4" aria-hidden="true" />
        {unread > 0 && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 inline-flex items-center justify-center rounded-full px-1 py-0.5 text-[9px] font-bold leading-none",
              needs > 0 ? "bg-warning text-foreground" : "bg-destructive text-destructive-foreground",
              unread > 9 ? "min-w-5" : "min-w-4",
            )}
            aria-hidden="true"
          >
            {displayCount}
          </span>
        )}
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner align="end" sideOffset={8} className="isolate z-50 outline-hidden">
          <PopoverPrimitive.Popup className="w-[min(400px,calc(100vw-1rem))] origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/5 outline-hidden duration-100 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <PopoverPrimitive.Title className="text-sm font-semibold text-foreground">Notifications</PopoverPrimitive.Title>
                <PopoverPrimitive.Description className="text-xs text-muted-foreground">{summaryLine(counts)}</PopoverPrimitive.Description>
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button type="button" onClick={() => void actions.markAllRead()} className="inline-flex h-7 items-center gap-1 rounded-4xl px-2 text-xs font-medium text-muted-foreground outline-hidden transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
                    <CheckCheck className="size-3.5" aria-hidden />
                    Mark all read
                  </button>
                )}
                <Link to={`${inboxHref}?tab=preferences` as "/"} onClick={() => setOpen(false)} className="grid size-7 place-items-center rounded-full text-muted-foreground outline-hidden transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label="Notification preferences">
                  <Settings2 className="size-3.5" aria-hidden />
                </Link>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {peek === undefined ? (
                <div className="grid h-28 place-items-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
                </div>
              ) : peek.items.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Bell className="mx-auto mb-2 size-7 text-muted-foreground/50" aria-hidden />
                  <p className="text-sm font-medium text-foreground">Nothing here yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Updates about your orders, tickets, courses, and account show up here.</p>
                </div>
              ) : (
                <ul className="space-y-1.5 p-2">
                  {peek.items.map((n) => (
                    <NotificationRow
                      key={n.id}
                      n={n}
                      now={now}
                      compact
                      onOpen={() => {
                        if (typeof n.readAt !== "number") void actions.markRead(n.id);
                        setOpen(false);
                        void navigate({ to: `${inboxHref}?id=${encodeURIComponent(n.id)}` as "/" });
                      }}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border p-2">
              <Link
                to={(needs > 0 ? `${inboxHref}?view=needs` : inboxHref) as "/"}
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-full items-center justify-center rounded-4xl text-sm font-medium text-foreground outline-hidden transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {needs > 0 ? `See what needs you (${needs})` : "Open inbox"}
              </Link>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
