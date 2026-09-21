export interface EventView { _id: string; title: string; slug: string; description: string; startsAt: number; endsAt: number; timeZone: string; venue: string; venueAddress: string; registrationUrl: string | null; status: "published" | "cancelled" }
export interface EventsIndexSurfaceData { events: EventView[]; loading: boolean; hasMore: boolean; loadMore: () => void }
export interface EventDetailSurfaceData { event: EventView }
export function eventDate(event: EventView, value = event.startsAt) { return new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: event.timeZone }).format(value); }
