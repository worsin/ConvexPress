import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, ErrorComponent } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildIndexablePageHead, siteTitled } from "@/lib/seo/head";
import CoreHelpHome, {
  type FeaturedArticle,
  type HelpHomeSurfaceData,
  type KbCategory,
} from "@/templates/packs/core/surfaces/help.home";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/help/")({
  component: HelpCenter,
  errorComponent: ErrorComponent,
  loader: async ({ context: { queryClient } }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );

    if (!isPublicPluginEnabled("kb", publicSettings)) {
      return;
    }

    await Promise.all([
      queryClient.ensureQueryData(
        convexQuery(api.kb.categories.listPublished, {}),
      ),
      queryClient.ensureQueryData(
        convexQuery(api.kb.queries.getFeatured, { limit: 6 }),
      ),
    ]);
  },
  head: () => buildIndexablePageHead({
    title: siteTitled("Help Center"),
    description: "Find answers to your questions in our help center.",
    path: "/help",
  }),
});

function HelpCenter() {
  const navigate = useNavigate();
  const { data: categories }: { data: KbCategory[] } = useSuspenseQuery(
    convexQuery(api.kb.categories.listPublished, {}),
  );
  const { data: featured }: { data: FeaturedArticle[] } = useSuspenseQuery(
    convexQuery(api.kb.queries.getFeatured, { limit: 6 }),
  );

  function search(query: string) {
    if (query.trim()) {
      navigate({ to: "/help/search", search: { q: query.trim() } });
    }
  }

  const data: HelpHomeSurfaceData = { categories, featured, actions: { search } };

  return <Surface name="help.home" data={data} fallback={CoreHelpHome} />;
}
