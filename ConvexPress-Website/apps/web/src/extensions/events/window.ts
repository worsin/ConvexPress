export const EVENT_WINDOW_MS = 60_000;
/** Public lists use a minute-granularity lower bound. Never recompute the bound
 * while reusing a cursor: it is part of the index query identity. */
export function eventWindowStart(now: number) { return Math.floor(now / EVENT_WINDOW_MS) * EVENT_WINDOW_MS; }
export function eventListWindow(search: { cursor?: string; startsAtOrAfter?: number }, now: number) {
  return { startsAtOrAfter: search.startsAtOrAfter ?? eventWindowStart(now), cursor: search.startsAtOrAfter === undefined ? undefined : search.cursor };
}
export function eventNextPageHref(cursor: string, startsAtOrAfter: number) {
  return `/events?${new URLSearchParams({ cursor, startsAtOrAfter: String(startsAtOrAfter) })}`;
}
