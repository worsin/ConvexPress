import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, ErrorComponent } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

type KbCategory = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  articleCount: number;
};

type ArticleItem = {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  readingTimeMinutes?: number;
};

type ArticlesResult = {
  items?: ArticleItem[];
  page?: ArticleItem[];
};

export const Route = createFileRoute("/_marketing/help/$categorySlug/")({
  component: CategoryPage,
  errorComponent: ErrorComponent,
  loader: async ({ context: { queryClient }, params }) => {
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
        title: `${params.categorySlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} - Help Center - ConvexPress`,
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

  if (!category) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Category not found</h1>
        <Link
          to="/help"
          className="mt-4 inline-block text-primary hover:underline"
        >
          Back to Help Center
        </Link>
      </div>
    );
  }

  const articleItems = articles?.items ?? articles?.page ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/help" className="hover:text-foreground transition-colors">
          Help Center
        </Link>
        <span className="mx-2">/</span>
        <span>{category.name}</span>
      </nav>

      <h1 className="text-3xl font-bold">{category.name}</h1>
      {category.description && (
        <p className="mt-2 text-muted-foreground">{category.description}</p>
      )}

      <div className="mt-8 space-y-3">
        {articleItems.map((article) => (
          <Link
            key={article._id}
            to="/help/$categorySlug/$articleSlug"
            params={{ categorySlug, articleSlug: article.slug }}
            className="block rounded-lg border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-sm"
          >
            <h3 className="font-medium">{article.title}</h3>
            {article.excerpt && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {article.excerpt}
              </p>
            )}
            {article.readingTimeMinutes && (
              <p className="mt-2 text-xs text-muted-foreground">
                {article.readingTimeMinutes} min read
              </p>
            )}
          </Link>
        ))}
        {articleItems.length === 0 && (
          <p className="text-muted-foreground">
            No articles in this category yet.
          </p>
        )}
      </div>
    </div>
  );
}
