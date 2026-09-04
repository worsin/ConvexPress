/**
 * Dashboard widget module: support tickets (registry id "tickets").
 *
 * Open tickets with the ones waiting on the member first, honoring the
 * `limit` setting and the card size. "New ticket" lives in the card actions.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { LifeBuoy, MessageSquare, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import { compareTickets, isFinished, needsYou, relativeTime, type TicketOverviewResult } from "@/lib/support-tickets";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardWidgetModule, DashboardWidgetProps } from "@/dashboard/contracts";
import { StatusChip } from "@/components/support/tickets/TicketBits";

const SIZE_ROWS: Record<DashboardWidgetProps["size"], number> = { sm: 2, md: 3, lg: 5, xl: 8 };

function rowLimit({ size, settings }: DashboardWidgetProps): number {
  const wanted = Number(settings.limit);
  const fallback = SIZE_ROWS[size] ?? 3;
  if (!Number.isFinite(wanted) || wanted <= 0) return fallback;
  return Math.min(Math.round(wanted), SIZE_ROWS[size] ?? wanted);
}

function TicketsWidget(props: DashboardWidgetProps) {
  const limit = rowLimit(props);
  const { to } = useDashboardPath();
  const data = useQuery(api.tickets.queries.getMyTicketsOverview, {}) as TicketOverviewResult | undefined;
  const now = Date.now();

  if (data === undefined) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: Math.min(limit, 3) }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const open = data.tickets.filter((t) => !isFinished(t)).sort(compareTickets);
  const shown = open.slice(0, limit);

  if (open.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-6 text-center">
        <span className="mb-2 grid size-9 place-items-center rounded-full bg-primary/12 text-primary">
          <LifeBuoy className="size-4" aria-hidden />
        </span>
        <p className="text-sm font-medium text-foreground">No open tickets</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{data.counts.done > 0 ? `${data.counts.done} resolved. Need something? Open a ticket.` : "Stuck on something? Open a ticket and we'll pick it up."}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", props.editing && "pointer-events-none")}>
      {data.counts.yours > 0 && (
        <p className="px-1.5 pb-1 text-xs font-medium text-warning">
          {data.counts.yours} waiting on you
        </p>
      )}
      <ul className="space-y-1" aria-label="Open support tickets">
        {shown.map((t) => {
          const yours = needsYou(t);
          return (
            <li key={t._id}>
              <Link
                to={to(`/tickets/${t.ticketNumber}`) as "/"}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border p-2 outline-hidden transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  yours ? "border-warning/50 bg-warning/5" : "border-transparent",
                )}
              >
                <span className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <MessageSquare className="size-4" aria-hidden />
                  {t.unread && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-warning ring-2 ring-card" aria-label="Unread reply" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn("line-clamp-1 text-[13.5px] leading-tight text-foreground", t.unread ? "font-bold" : "font-semibold")}>{t.subject}</span>
                    <StatusChip status={t.status} size="sm" className="ml-auto" />
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{t.lastMessagePreview}</span>
                  <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground/80">
                    {t.ticketNumber} · {relativeTime(t.lastMessageAt ?? t.updatedAt, now)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {open.length > shown.length && (
        <p className="px-1.5 pt-1 text-xs text-muted-foreground">
          <Link to={to("/tickets") as "/"} className="font-medium text-primary hover:underline">
            {open.length - shown.length} more open
          </Link>
        </p>
      )}
    </div>
  );
}

function TicketsWidgetActions() {
  const { to } = useDashboardPath();
  return (
    <Link to={to("/tickets/new") as "/"} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
      <Plus className="size-3.5" aria-hidden />
      New ticket
    </Link>
  );
}

const ticketsWidgetModule: DashboardWidgetModule = {
  id: "tickets",
  Widget: TicketsWidget,
  Actions: TicketsWidgetActions,
};

export default ticketsWidgetModule;
