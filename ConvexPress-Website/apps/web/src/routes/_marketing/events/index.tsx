import { createFileRoute } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { upcomingEvents } from "@/extensions/events/api";
import { eventListWindow, eventNextPageHref } from "@/extensions/events/window";
import { z } from "zod";
import { requirePublicPluginEnabled } from "@/lib/plugins/public-route-loader";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";
import { Surface } from "@/templates/sdk/Surface";
import CoreEvents from "@/templates/packs/core/surfaces/events.index";
const query = (window: { cursor?: string; startsAtOrAfter: number }) => convexQuery(upcomingEvents, { startsAtOrAfter: window.startsAtOrAfter, paginationOpts: { numItems: 12, cursor: window.cursor ?? null } });
export const Route = createFileRoute("/_marketing/events/")({
 validateSearch: z.object({ cursor: z.string().optional(), startsAtOrAfter: z.coerce.number().int().min(0).max(8_640_000_000_000_000).optional() }),
 loaderDeps: ({ search }) => ({ cursor: search.cursor, startsAtOrAfter: search.startsAtOrAfter }),
 loader: async ({ context: { queryClient }, deps }) => {
  const settings = await requirePublicPluginEnabled(queryClient, "events");
  const window = eventListWindow(deps, Date.now());
  await queryClient.ensureQueryData(query(window));
  return { window, seoHead: buildSeoHead({ title: "Upcoming events", description: "Workshops, gatherings and community events.", canonical: toAbsoluteUrl("/events", normalizeSiteUrl(settings?.siteUrl)), robots: window.cursor ? "noindex, follow" : undefined }) };
 },
 head: ({ loaderData }) => loaderData?.seoHead ?? {}, component: Page,
});
function Page() {
 const { window } = Route.useLoaderData();
 const navigate = Route.useNavigate();
 const { data } = useSuspenseQuery(query(window));
 return <Surface name="events.index" data={{ events: data.page, loading: false, hasMore: !data.isDone, loadMore: () => { void navigate({ href: eventNextPageHref(data.continueCursor, window.startsAtOrAfter), search: true }); } }} fallback={CoreEvents} />;
}
