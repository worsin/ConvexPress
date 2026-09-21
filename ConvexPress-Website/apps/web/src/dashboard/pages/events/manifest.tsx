import { useEventWindow } from "@/extensions/events/useEventWindow";
import { usePaginatedQuery } from "convex/react";
import { upcomingEvents } from "@/extensions/events/api";
import type { DashboardPageModule } from "../../contracts";
import { Surface } from "@/templates/sdk/Surface";
import CoreEvents from "@/templates/packs/core/surfaces/dashboard.events";
function EventsPage() { const startsAtOrAfter = useEventWindow(); const { results, status, loadMore } = usePaginatedQuery(upcomingEvents, { startsAtOrAfter }, { initialNumItems: 12 }); return <Surface name="dashboard.events" data={{ events: results, loading: status === "LoadingFirstPage", hasMore: status === "CanLoadMore", loadMore: () => loadMore(12) }} fallback={CoreEvents} />; }
export default { id: "events", Page: EventsPage, matchSubpath: path => !path || path === "/" } satisfies DashboardPageModule;
