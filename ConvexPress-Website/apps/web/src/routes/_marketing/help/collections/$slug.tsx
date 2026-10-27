import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, ErrorComponent } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { helpPageTitle } from "@/lib/help-trail";
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
      return { name: null };
    }

    const collection = await queryClient.ensureQueryData(
      convexQuery(api.kb.collections.getBySlug, { slug: params.slug }),
    );
    return { name: collection?.name ?? null };
  },
  head: ({ params, loaderData }) => ({
    meta: [{ title: helpPageTitle(loaderData?.name, params.slug, "Collections") }],
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
