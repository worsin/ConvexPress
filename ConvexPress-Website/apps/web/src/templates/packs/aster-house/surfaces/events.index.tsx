import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { SurfaceProps } from "@/templates/sdk/types";
import { eventDate, type EventsIndexSurfaceData } from "@/extensions/events/types";
import { Container, SectionHeading } from "../parts";

export function EventList({ data }: { data: EventsIndexSurfaceData }) {
  return <div className="space-y-8">
    {data.loading && <p role="status" className="py-8 text-muted-foreground">Loading events…</p>}
    {!data.loading && !data.events.length && <p className="border-y border-border py-12 text-muted-foreground">New dates are on the way.</p>}
    <div className="divide-y divide-border border-t border-border">{data.events.map(event => <article key={event._id} className="grid gap-6 py-9 sm:grid-cols-[6rem_1fr] lg:grid-cols-[8rem_1fr_13rem]">
      <time dateTime={new Date(event.startsAt).toISOString()} className="flex items-baseline gap-3 sm:block"><span className="block font-display text-6xl leading-none text-primary">{new Intl.DateTimeFormat("en-US", { day: "2-digit", timeZone: event.timeZone }).format(event.startsAt)}</span><span className="text-xs uppercase tracking-[0.2em]">{new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: event.timeZone }).format(event.startsAt)}</span></time>
      <div className="space-y-4"><Link to="/events/$slug" params={{ slug: event.slug }} className="group flex items-start justify-between gap-5 font-display text-3xl leading-tight hover:text-primary md:text-4xl">{event.title}<ArrowUpRight className="mt-2 size-5 shrink-0 transition-transform group-hover:-translate-y-1" aria-hidden="true" /></Link><p className="max-w-2xl line-clamp-2 text-sm leading-7 text-muted-foreground">{event.description}</p></div>
      <div className="space-y-3 text-xs leading-6 sm:col-start-2 lg:col-start-auto"><p>{eventDate(event)}</p><p className="text-muted-foreground">{event.venue}</p>{event.status === "cancelled" && <p className="font-semibold uppercase tracking-widest text-destructive">Cancelled</p>}</div>
    </article>)}</div>
    {data.hasMore && <button onClick={data.loadMore} className="border border-foreground px-7 py-3 text-xs font-semibold uppercase tracking-widest hover:bg-foreground hover:text-background">More events</button>}
  </div>;
}
export default function AsterEvents({ data }: SurfaceProps<EventsIndexSurfaceData>) {
  return <Container className="space-y-14 py-14 md:py-20"><SectionHeading level={1} title="Events" /><EventList data={data} /></Container>;
}
