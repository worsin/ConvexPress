import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { SurfaceProps } from "@/templates/sdk/types";
import { eventDate, type EventDetailSurfaceData } from "@/extensions/events/types";
import { Container, SmallCaps } from "../parts";
export default function AsterEvent({ data: { event } }: SurfaceProps<EventDetailSurfaceData>) {
  return <Container as="article" className="py-12 md:py-20"><Link to="/events" className="text-xs uppercase tracking-widest text-primary hover:underline">← All events</Link><header className="mb-14 mt-12 max-w-5xl"><h1 className="font-display text-5xl leading-[0.95] tracking-tight md:text-7xl lg:text-8xl">{event.title}</h1></header>
    {event.status === "cancelled" && <p role="status" className="mb-10 border-l-2 border-destructive py-4 pl-5 text-destructive">This event has been cancelled.</p>}
    <div className="grid gap-12 border-t border-border pt-10 md:grid-cols-[1fr_2fr]"><aside className="space-y-8"><div className="space-y-3"><SmallCaps>When</SmallCaps><p className="text-sm leading-7">{eventDate(event)}<br />{eventDate(event, event.endsAt)}</p><p className="text-xs text-muted-foreground">{event.timeZone}</p></div>{event.venue && <div className="space-y-3"><SmallCaps>Where</SmallCaps><p className="font-display text-2xl">{event.venue}</p><p className="text-sm text-muted-foreground">{event.venueAddress}</p></div>}{event.registrationUrl && event.status === "published" && <a href={event.registrationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-8 bg-primary px-6 py-4 text-xs font-semibold uppercase tracking-widest text-primary-foreground">Register <ArrowUpRight className="size-4" aria-hidden="true" /></a>}</aside><p className="max-w-[55ch] whitespace-pre-line text-lg leading-9">{event.description}</p></div>
  </Container>;
}
