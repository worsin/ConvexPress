import type { SurfaceProps } from "../../../sdk/types";
import { EventCard } from "@/extensions/events/EventCard";
import type { EventsIndexSurfaceData } from "@/extensions/events/types";
export type { EventsIndexSurfaceData } from "@/extensions/events/types";
export default function EventsIndex({ data }: SurfaceProps<EventsIndexSurfaceData>) {
 return <section className="mx-auto max-w-6xl space-y-8 px-4 py-12"><header className="max-w-2xl space-y-3"><p className="text-sm font-medium uppercase tracking-widest text-primary">Come together</p><h1 className="font-display text-4xl sm:text-5xl">Upcoming events</h1><p className="text-muted-foreground">Workshops, conversations and gatherings. Find a date and join us.</p></header>{data.loading && <p role="status">Loading events…</p>}{!data.loading && !data.events.length && <p className="rounded-xl border border-dashed p-8 text-muted-foreground">New dates are on the way. Check back for the next gathering.</p>}<div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{data.events.map(event=><EventCard key={event._id} event={event} />)}</div>{data.hasMore && <button onClick={data.loadMore} className="rounded-md border border-border px-5 py-2 text-sm font-medium hover:bg-muted">More events</button>}</section>;
}
