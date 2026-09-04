/**
 * Dashboard widget module: notifications (registry id "notifications").
 *
 * Latest unread notifications with one-tap read / archive. Honors the
 * `limit` setting and the card size (md shows fewer rows than lg).
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { Archive, Bell, Check, MailOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import { fullTime, relativeTime, type CenterResult } from "@/lib/notifications";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardWidgetModule, DashboardWidgetProps } from "@/dashboard/contracts";
import { KIND_ICON, tileClass } from "@/components/notifications/kind";
import { IconButton } from "@/components/notifications/NotificationRow";
import { useNotificationActions } from "@/components/notifications/useNotificationActions";

const SIZE_ROWS: Record<DashboardWidgetProps["size"], number> = { sm: 3, md: 5, lg: 8, xl: 12 };

function rowLimit({ size, settings }: DashboardWidgetProps): number {
  const wanted = Number(settings.limit);
  const fallback = SIZE_ROWS[size] ?? 5;
  if (!Number.isFinite(wanted) || wanted <= 0) return fallback;
  return Math.min(Math.round(wanted), SIZE_ROWS[size] ?? wanted);
}

function NotificationsWidget(props: DashboardWidgetProps) {
  const { editing } = props;
  const limit = rowLimit(props);
  const { to } = useDashboardPath();
  const inboxHref = to("/notifications");
  const actions = useNotificationActions({ quiet: true });
  const result = useQuery(api.notifications.queries.listForCenter, { view: "unread", limit }) as CenterResult | undefined;

  if (result === undefined) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: Math.min(limit, 3) }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const { items, counts, now } = result;

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-6 text-center">
        <span className="mb-2 grid size-9 place-items-center rounded-full bg-primary/12 text-primary">
          <Check className="size-4" strokeWidth={2.5} aria-hidden />
        </span>
        <p className="text-sm font-medium text-foreground">You're all caught up</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{counts.inbox > 0 ? `${counts.inbox} in your inbox, nothing unread.` : "New notifications will show up here."}</p>
      </div>
    );
  }

  return (
    <ul className={cn("space-y-1", editing && "pointer-events-none")} aria-label="Unread notifications">
      {items.map((n) => {
        const Icon = KIND_ICON[n.kind] ?? KIND_ICON.system;
        return (
          <li key={n.id} className="group flex items-start gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-muted/60">
            <Link
              to={`${inboxHref}?id=${encodeURIComponent(n.id)}` as "/"}
              onClick={() => void actions.markRead(n.id)}
              className="flex min-w-0 flex-1 items-start gap-2.5 outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-lg"
            >
              <span className={cn("relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", tileClass(n.kind, n.type))}>
                <Icon className="size-4" aria-hidden />
                {n.needsAction && typeof n.actionedAt !== "number" && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-warning ring-2 ring-card" aria-label="Needs you" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 text-[13.5px] font-semibold leading-tight text-foreground">{n.title}</span>
                <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{n.message}</span>
                <time dateTime={new Date(n.createdAt).toISOString()} title={fullTime(n.createdAt)} className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground/80">
                  {relativeTime(n.createdAt, now)}
                </time>
              </span>
            </Link>
            <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <IconButton label="Mark read" onClick={() => void actions.markRead(n.id)}>
                <MailOpen className="size-3.5" />
              </IconButton>
              <IconButton label="Archive" onClick={() => void actions.archive(n.id)}>
                <Archive className="size-3.5" />
              </IconButton>
            </span>
          </li>
        );
      })}
      {counts.unread > items.length && (
        <li className="pt-1 text-xs text-muted-foreground">
          <Link to={`${inboxHref}?view=unread` as "/"} className="font-medium text-primary hover:underline">
            {counts.unread - items.length} more unread
          </Link>
        </li>
      )}
    </ul>
  );
}

function NotificationsWidgetActions() {
  const { to } = useDashboardPath();
  return (
    <Link to={to("/notifications") as "/"} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
      <Bell className="size-3.5" aria-hidden />
      Open inbox
    </Link>
  );
}

const notificationsWidgetModule: DashboardWidgetModule = {
  id: "notifications",
  Widget: NotificationsWidget,
  Actions: NotificationsWidgetActions,
};

export default notificationsWidgetModule;
