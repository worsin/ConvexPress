/**
 * Dashboard page module: support tickets (registry id "tickets").
 *
 *   <basePath>/tickets                 list (Yours / Active / Done, search)
 *   <basePath>/tickets/new             new ticket (category picker, KB suggestions, AI answer)
 *   <basePath>/tickets/<ticketNumber>  thread, composer, resolve / reopen, timeline, rating
 */

import { useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import type { DashboardPageModule } from "@/dashboard/contracts";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import type { TicketOverviewResult } from "@/lib/support-tickets";
import { NewTicketForm, type NewTicketPrefill } from "@/components/support/tickets/NewTicketForm";
import { TicketDetail } from "@/components/support/tickets/TicketDetail";
import { TicketList } from "@/components/support/tickets/TicketList";

function parseSubpath(subpath: string): { kind: "list" } | { kind: "new" } | { kind: "detail"; ticketNumber: string } {
  const segments = subpath.split("/").filter(Boolean);
  if (segments.length === 0) return { kind: "list" };
  if (segments[0].toLowerCase() === "new") return { kind: "new" };
  return { kind: "detail", ticketNumber: decodeURIComponent(segments[0]).toUpperCase() };
}

function usePrefill(): NewTicketPrefill | undefined {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  return useMemo(() => {
    const pick = (key: string, max: number) => (typeof search[key] === "string" ? (search[key] as string).slice(0, max) : undefined);
    const subject = pick("subject", 200);
    const category = pick("category", 50);
    const context = pick("context", 2000);
    if (!subject && !category && !context) return undefined;
    return { subject, category, context };
  }, [search]);
}

export function TicketsPage({ subpath }: { subpath: string }) {
  const { to } = useDashboardPath();
  const route = parseSubpath(subpath);
  const listHref = to("/tickets");
  const hrefFor = (ticketNumber: string) => to(`/tickets/${ticketNumber}`);
  const prefill = usePrefill();

  if (route.kind === "new") {
    return <NewTicketForm prefill={prefill} backHref={listHref} ticketHref={hrefFor} />;
  }
  if (route.kind === "detail") {
    return (
      <TicketDetail
        ticketNumber={route.ticketNumber}
        backHref={listHref}
        newTicketHref={(p) => to(`/tickets/new?subject=${encodeURIComponent(p.subject)}&category=${encodeURIComponent(p.category)}`)}
      />
    );
  }
  return <TicketsList hrefFor={hrefFor} newHref={to("/tickets/new")} />;
}

function TicketsList({ hrefFor, newHref }: { hrefFor: (ticketNumber: string) => string; newHref: string }) {
  const data = useQuery(api.tickets.queries.getMyTicketsOverview, {}) as TicketOverviewResult | undefined;
  return <TicketList data={data} hrefFor={hrefFor} newHref={newHref} />;
}

const ticketsPageModule: DashboardPageModule = {
  id: "tickets",
  Page: TicketsPage,
  matchSubpath: () => true,
};

export default ticketsPageModule;
