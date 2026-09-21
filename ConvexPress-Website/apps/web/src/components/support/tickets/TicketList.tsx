import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, LifeBuoy, MessageSquare, Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { FILTER_LABELS, categoryLabel, compareTickets, matchesFilter, needsYou, relativeTime, ticketSearchText, type TicketFilter, type TicketOverview, type TicketOverviewResult } from "@/lib/support-tickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentAvatar, PersonAvatar, PriorityChip, StatusChip } from "@/components/support/tickets/TicketBits";

export interface TicketListProps {
  data: TicketOverviewResult | undefined;
  /** Href builders so the same list works in the dashboard and on /support. */
  hrefFor: (ticketNumber: string) => string;
  newHref: string;
  now?: number;
  /** Hide the page title (the dashboard shell may render its own). */
  compactHeader?: boolean;
}

const FILTERS: TicketFilter[] = ["all", "yours", "active", "done"];

/**
 * The member's support inbox: Yours / Active / Done with counts, search,
 * unread dots, status and priority chips, agent avatar, last-message preview,
 * sorted with tickets that need the member first.
 */
export function TicketList({ data, hrefFor, newHref, now = Date.now(), compactHeader = false }: TicketListProps) {
  const [filter, setFilter] = useState<TicketFilter>("all");
  const [query, setQuery] = useState("");
  const settings = useSettings();
  const kbEnabled = isPublicPluginEnabled("kb", settings);

  const all = useMemo(() => data?.tickets ?? [], [data]);
  const counts = data?.counts ?? { yours: 0, active: 0, done: 0, total: 0 };
  const countFor = (f: TicketFilter) => (f === "all" ? counts.total : counts[f]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((t) => matchesFilter(t, filter) && (!q || ticketSearchText(t).includes(q))).sort(compareTickets);
  }, [all, filter, query]);

  const loading = data === undefined;
  const empty = !loading && all.length === 0;

  return (
    <div className="space-y-5" data-slot="ticket-list">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {!compactHeader && <h1 className="text-2xl font-bold tracking-tight text-foreground">Support tickets</h1>}
          <p className="text-sm text-muted-foreground">Your support conversations and replies, together in one place.</p>
          {!loading && all.length > 0 && (
            <p className="mt-1 text-sm tabular-nums text-muted-foreground/80">
              {counts.active} open, {counts.done} done.{counts.yours > 0 && ` ${counts.yours} waiting on you.`}
            </p>
          )}
        </div>
        <Button nativeButton={false} render={<Link to={newHref as "/"} />}>
          <Plus className="size-4" aria-hidden />
          New ticket
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {!empty && (
            <div className="flex flex-wrap items-center gap-2.5">
              <div role="group" aria-label="Filter tickets" className="flex gap-1 rounded-4xl border border-border bg-muted/60 p-[3px]">
                {FILTERS.map((key) => {
                  const on = filter === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setFilter(key)}
                      className={cn(
                        "inline-flex h-[30px] items-center gap-1.5 rounded-4xl px-3 text-[13px] font-medium outline-hidden transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {key === "yours" && counts.yours > 0 && <span className="size-[7px] rounded-full bg-warning" aria-hidden />}
                      {FILTER_LABELS[key]}
                      <span className={cn("rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums", on ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground/80")}>{countFor(key)}</span>
                    </button>
                  );
                })}
              </div>
              <label className="relative min-w-[180px] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" aria-hidden />
                <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a ticket" aria-label="Find a ticket" className="h-9 pl-9" />
              </label>
            </div>
          )}

          {loading && (
            <div className="space-y-2" aria-busy="true" aria-label="Loading tickets">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[92px] w-full rounded-2xl" />
              ))}
            </div>
          )}

          {empty && (
            <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
              <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-primary/12 text-primary">
                <LifeBuoy className="size-6" aria-hidden />
              </span>
              <h2 className="text-lg font-bold text-foreground">No tickets yet</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Need help with an order or something else? Open a ticket to keep your question and replies in one thread.</p>
              <Button className="mt-5" nativeButton={false} render={<Link to={newHref as "/"} />}>
                <Plus className="size-4" aria-hidden />
                Open a ticket
              </Button>
            </div>
          )}

          {!loading && !empty && visible.length === 0 && <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No tickets match. Clear the search or pick a different filter.</div>}

          {visible.length > 0 && (
            <ul className="space-y-2">
              {visible.map((t) => (
                <TicketRow key={t._id} ticket={t} now={now} href={hrefFor(t.ticketNumber)} />
              ))}
            </ul>
          )}
        </div>

        <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
          {kbEnabled && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-[15px] font-bold text-foreground">Other ways to get help</h2>
              <ul className="mt-3 space-y-2.5 text-sm">
                <li>
                  <Link to="/help" className="group flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-muted/60">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <BookOpen className="size-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-medium text-foreground">Help center</span>
                      <span className="block text-xs text-muted-foreground">Guides and answers you can read right now.</span>
                    </span>
                  </Link>
                </li>
              </ul>
            </div>
          )}
          <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
            <div className="flex items-center gap-2.5">
              <AgentAvatar size="sm" />
              <span className="font-semibold text-foreground">Support replies</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              We aim to reply {data?.responseWindow ?? "as soon as we can"}. Check your ticket here for updates.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TicketRow({ ticket, now, href }: { ticket: TicketOverview; now: number; href: string }) {
  const yours = needsYou(ticket);
  const preview = ticket.lastMessagePreview.replace(/\s+/g, " ").trim();
  const who = ticket.lastMessageSender === "user" ? "You" : ticket.lastMessageSender === "system" ? "" : ticket.lastMessageSender === "ai" ? "Assistant" : (ticket.agentName ?? "Support");
  return (
    <li>
      <Link
        to={href as "/"}
        className={cn(
          "group relative block rounded-2xl border bg-card p-4 shadow-sm outline-hidden transition-[box-shadow,border-color] hover:border-foreground/25 hover:shadow-lg focus-visible:ring-[3px] focus-visible:ring-ring/50",
          yours ? "border-warning/60 before:absolute before:-left-px before:bottom-4 before:top-4 before:w-[3px] before:rounded-r-[3px] before:bg-warning" : "border-border",
        )}
      >
        <div className="flex items-start gap-3">
          <span className="relative mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            {ticket.agentInitials ? <PersonAvatar initials={ticket.agentInitials} size="md" className="size-9 border-0 bg-transparent" /> : <MessageSquare className="size-4" aria-hidden />}
            {ticket.unread && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-warning ring-2 ring-card" aria-label="Unread reply" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className={cn("text-[15px] leading-tight text-foreground", ticket.unread ? "font-bold" : "font-semibold")}>{ticket.subject}</h3>
              <StatusChip status={ticket.status} size="sm" />
              <PriorityChip priority={ticket.priority} />
            </div>
            <p className={cn("mt-1 line-clamp-1 text-[13.5px]", ticket.unread ? "text-foreground" : "text-muted-foreground")}>
              {who && <span className="font-medium">{who}: </span>}
              {preview}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80">
              <span className="tabular-nums">{ticket.ticketNumber}</span>
              <span>{categoryLabel(ticket.category)}</span>
              {ticket.agentName && <span>with {ticket.agentName}</span>}
              {ticket.messageCount > 1 && <span className="tabular-nums">{ticket.messageCount} messages</span>}
              <span className="ml-auto">{relativeTime(ticket.lastMessageAt ?? ticket.updatedAt, now)}</span>
            </div>
          </div>
          <ArrowRight className="mt-2 size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
        </div>
      </Link>
    </li>
  );
}
