import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, ErrorComponent } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { siteTitled } from "@/lib/seo/head";
import CoreHelpCategory, {
  type HelpCategorySurfaceData,
  type KbArticleItem,
  type KbCategory,
} from "@/templates/packs/core/surfaces/help.category";
import { Surface } from "@/templates/sdk/Surface";

type ArticlesResult = {
  items?: KbArticleItem[];
  page?: KbArticleItem[];
};

export const Route = createFileRoute("/_marketing/help/$categorySlug/")({
  component: CategoryPage,
  errorComponent: ErrorComponent,
  loader: async ({ context: { queryClient }, params }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );

    if (!isPublicPluginEnabled("kb", publicSettings)) {
      return;
    }

    const category = await queryClient.ensureQueryData(
      convexQuery(api.kb.categories.getBySlug, { slug: params.categorySlug }),
    );
    // Pre-fetch articles to eliminate the data waterfall (H6)
    if (category?._id) {
      await queryClient.ensureQueryData(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Convex query type mismatch; fix by regenerating website types
        convexQuery(api.kb.queries.listPublished, {
          categoryId: (category as KbCategory)._id,
          page: 1,
          perPage: 50,
        }) as any,
      );
    }
  },
  head: ({ params }) => ({
    meta: [
      {
        title: siteTitled(`${params.categorySlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} - Help Center`),
      },
    ],
  }),
});

function CategoryPage() {
  const { categorySlug } = Route.useParams();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Convex query type mismatch with useSuspenseQuery; fix by regenerating website types
  const { data: category } = useSuspenseQuery(
    convexQuery(api.kb.categories.getBySlug, { slug: categorySlug }) as any,
  ) as { data: KbCategory | null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Convex query type mismatch with useSuspenseQuery; fix by regenerating website types
  const { data: articles } = useSuspenseQuery(
    convexQuery(api.kb.queries.listPublished, {
      categoryId: category?._id,
      page: 1,
      perPage: 50,
    }) as any,
  ) as { data: ArticlesResult | null };

  const data: HelpCategorySurfaceData = {
    categorySlug,
    category,
    articles: articles?.items ?? articles?.page ?? [],
  };

  return <Surface name="help.category" data={data} fallback={CoreHelpCategory} />;
}
