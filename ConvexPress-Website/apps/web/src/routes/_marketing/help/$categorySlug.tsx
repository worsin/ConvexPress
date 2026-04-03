import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

export const Route = createFileRoute("/_marketing/help/$categorySlug")({
  component: CategoryPage,
  loader: async ({ context: { queryClient }, params }) => {
    await queryClient.ensureQueryData(
      convexQuery(api.kb.categories.getBySlug, { slug: params.categorySlug }),
    );
  },
  head: ({ params }) => ({
    meta: [
      { title: `${params.categorySlug} - Help Center - ConvexPress` },
    ],
  }),
});

function CategoryPage() {
  const { categorySlug } = Route.useParams();

  const { data: category } = useSuspenseQuery(
    // @ts-expect-error - Convex query type mismatch with useSuspenseQuery
    convexQuery(api.kb.categories.getBySlug, { slug: categorySlug }),
  );

  const { data: articles } = useSuspenseQuery(
    // @ts-expect-error - Convex query type mismatch with useSuspenseQuery
    convexQuery(api.kb.queries.listPublished, {
      categoryId: (category as any)?._id,
      page: 1,
      perPage: 50,
    }),
  );

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

  const cat = category as any;
  const articleItems = (articles as any)?.items ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/help" className="hover:text-foreground transition-colors">
          Help Center
        </Link>
        <span className="mx-2">/</span>
        <span>{cat.name}</span>
      </nav>

      <h1 className="text-3xl font-bold">{cat.name}</h1>
      {cat.description && (
        <p className="mt-2 text-muted-foreground">{cat.description}</p>
      )}

      <div className="mt-8 space-y-3">
        {articleItems.map((article: any) => (
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
