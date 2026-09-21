import { createFileRoute } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { eventBySlug } from "@/extensions/events/api";
import { requirePublicPluginEnabled, throwPublicNotFound } from "@/lib/plugins/public-route-loader";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";
import { Surface } from "@/templates/sdk/Surface";
import CoreEvent from "@/templates/packs/core/surfaces/events.detail";
export const Route = createFileRoute("/_marketing/events/$slug")({
 loader: async ({ context: { queryClient }, params }) => { const settings = await requirePublicPluginEnabled(queryClient, "events"); const event = await queryClient.ensureQueryData(convexQuery(eventBySlug, { slug: params.slug })); if (!event) throwPublicNotFound(); return { seoHead: buildSeoHead({ title: event.title, description: event.description.slice(0, 160), canonical: toAbsoluteUrl(`/events/${event.slug}`, normalizeSiteUrl(settings?.siteUrl)) }) }; },
 head: ({ loaderData }) => loaderData?.seoHead ?? {}, component: Page,
});
function Page() { const { slug } = Route.useParams(); const { data } = useSuspenseQuery(convexQuery(eventBySlug, { slug })); if (!data) throwPublicNotFound(); return <Surface name="events.detail" data={{ event: data }} fallback={CoreEvent} />; }
