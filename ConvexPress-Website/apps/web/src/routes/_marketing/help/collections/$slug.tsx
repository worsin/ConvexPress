import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, ErrorComponent } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { siteTitled } from "@/lib/seo/head";
import CoreHelpCollection, {
  type HelpCollectionSurfaceData,
  type KbCollection,
} from "@/templates/packs/core/surfaces/help.collection";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/help/collections/$slug")({
  component: CollectionView,
  errorComponent: ErrorComponent,
  loader: async ({ context: { queryClient }, params }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );

    if (!isPublicPluginEnabled("kb", publicSettings)) {
      return;
    }

    await queryClient.ensureQueryData(
      convexQuery(api.kb.collections.getBySlug, { slug: params.slug }),
    );
  },
  head: ({ params }) => ({
    meta: [
      {
        title: siteTitled(`${params.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} - Collections - Help Center`),
      },
    ],
  }),
});

function CollectionView() {
  const { slug } = Route.useParams();
  const { data: collection }: { data: KbCollection | null } = useSuspenseQuery(
    convexQuery(api.kb.collections.getBySlug, { slug }),
  );

  const data: HelpCollectionSurfaceData = { collection };

  return <Surface name="help.collection" data={data} fallback={CoreHelpCollection} />;
}
