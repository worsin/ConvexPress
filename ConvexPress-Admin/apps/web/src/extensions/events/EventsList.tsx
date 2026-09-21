import { Link } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
export function EventsList() {
  const { results, status, loadMore } = usePaginatedQuery(api.extensions.events.queries.list, {}, { initialNumItems: 25 });
  return <div className="space-y-5"><PageHeader title="Events" meta={["Schedules, places and registration details for your community."]} actions={<Link to="/events/new" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Add event</Link>} />
    <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="border-b bg-muted"><tr><th className="p-3">Event</th><th className="p-3">Starts</th><th className="p-3">Status</th></tr></thead><tbody>{results.map((event: any) => <tr key={event._id} className="border-b last:border-0"><td className="p-3"><Link to="/events/$eventId" params={{ eventId: event._id }} className="font-medium text-primary hover:underline">{event.title}</Link><p className="text-xs text-muted-foreground">{event.venue}</p></td><td className="p-3">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: event.timeZone }).format(event.startsAt)}<span className="block text-xs text-muted-foreground">{event.timeZone}</span></td><td className="p-3 capitalize">{event.status}</td></tr>)}</tbody></table>
    {status === "LoadingFirstPage" && <p role="status" className="p-6">Loading events…</p>}{status !== "LoadingFirstPage" && !results.length && <p className="p-6 text-muted-foreground">No events yet. Add your first gathering or workshop.</p>}</div>
    {status === "CanLoadMore" && <Button variant="outline" onClick={() => loadMore(25)}>Load more</Button>}
  </div>;
}
