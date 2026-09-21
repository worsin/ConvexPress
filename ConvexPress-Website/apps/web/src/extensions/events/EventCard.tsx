import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin } from "lucide-react";
import { eventDate, type EventView } from "./types";
export function EventCard({ event }: { event: EventView }) {
 return <article className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-6"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" /><time dateTime={new Date(event.startsAt).toISOString()}>{eventDate(event)}</time></div><h2 className="font-display text-2xl"><Link to="/events/$slug" params={{ slug: event.slug }} className="hover:text-primary">{event.title}</Link></h2><p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{event.description}</p>{event.venue && <p className="mt-auto flex items-center gap-2 text-sm"><MapPin className="size-4" aria-hidden="true" />{event.venue}</p>}<Link to="/events/$slug" params={{ slug: event.slug }} className="text-sm font-medium text-primary hover:underline">Event details →</Link></article>;
}
