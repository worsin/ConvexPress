import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { FunctionReturnType } from "convex/server";
import { createFileRoute, ErrorComponent } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { helpCategoryParams } from "@/lib/help-search-params";
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
  isDone: boolean;
  continueCursor: string;
};

export const Route = createFileRoute("/_marketing/help/$categorySlug/")({
  validateSearch: helpCategoryParams,
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  component: CategoryPage,
  errorComponent: ErrorComponent,
  loader: async ({ context: { queryClient }, params, deps }) => {
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
        convexQuery(api.kb.queries.listPublished, {
          categoryId: category._id,
          paginationOpts: { numItems: 50, cursor: deps.cursor ?? null },
        }),
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
  const { data: category } = useSuspenseQuery(
    convexQuery(api.kb.categories.getBySlug, { slug: categorySlug }),
  );
  return category ? <CategoryArticles category={category} /> : <CategoryView category={null} articles={null} />;
}

function CategoryArticles({ category }: { category: NonNullable<FunctionReturnType<typeof api.kb.categories.getBySlug>> }) {
  const { cursor } = Route.useSearch();
  const { data: articles } = useSuspenseQuery(
    convexQuery(api.kb.queries.listPublished, {
      categoryId: category._id,
      paginationOpts: { numItems: 50, cursor: cursor ?? null },
    }),
  );
  return <CategoryView category={category} articles={articles} />;
}

function CategoryView({ category, articles }: { category: KbCategory | null; articles: ArticlesResult | null }) {
  const { categorySlug } = Route.useParams();
  const { cursor } = Route.useSearch();
  const data: HelpCategorySurfaceData = {
    categorySlug,
    category,
    articles: articles?.items ?? articles?.page ?? [],
    hasMore: articles ? !articles.isDone : false,
  };

  const categoryPath = `/help/${encodeURIComponent(categorySlug)}`;
  return <>
    <Surface name="help.category" data={data} fallback={CoreHelpCategory} />
    {category && (cursor || articles && !articles.isDone) && <nav aria-label="Help category pages" className="mx-auto flex max-w-3xl flex-wrap gap-6 px-4 pb-12 text-sm">
      {cursor && <a className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" href={categoryPath}>Back to first articles</a>}
      {articles && !articles.isDone && <a className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" href={`${categoryPath}?${new URLSearchParams({ cursor: articles.continueCursor })}`}>More articles →</a>}
    </nav>}
  </>;
}
