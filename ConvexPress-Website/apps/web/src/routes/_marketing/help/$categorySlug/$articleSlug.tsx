import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

export const Route = createFileRoute(
  "/_marketing/help/$categorySlug/$articleSlug",
)({
  component: ArticleReader,
  loader: async ({ context: { queryClient }, params }) => {
    await queryClient.ensureQueryData(
      convexQuery(api.kb.queries.getBySlug, { slug: params.articleSlug }),
    );
  },
  head: ({ params }) => ({
    meta: [
      { title: `${params.articleSlug} - Help Center - ConvexPress` },
    ],
  }),
});

function ArticleReader() {
  const { categorySlug, articleSlug } = Route.useParams();

  const { data: article } = useSuspenseQuery(
    // @ts-expect-error - Convex query type mismatch with useSuspenseQuery
    convexQuery(api.kb.queries.getBySlug, { slug: articleSlug }),
  );

  if (!article) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Article not found</h1>
        <Link
          to="/help"
          className="mt-4 inline-block text-primary hover:underline"
        >
          Back to Help Center
        </Link>
      </div>
    );
  }

  const art = article as any;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/help" className="hover:text-foreground transition-colors">
          Help Center
        </Link>
        <span className="mx-2">/</span>
        {art.category && (
          <>
            <Link
              to="/help/$categorySlug"
              params={{ categorySlug }}
              className="hover:text-foreground transition-colors"
            >
              {art.category.name}
            </Link>
            <span className="mx-2">/</span>
          </>
        )}
        <span className="text-foreground">{art.title}</span>
      </nav>

      {/* Article header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold leading-tight">{art.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {art.author && <span>By {art.author.displayName}</span>}
          {art.publishedAt && (
            <span>
              Updated {new Date(art.publishedAt).toLocaleDateString()}
            </span>
          )}
          {art.readingTimeMinutes && (
            <span>{art.readingTimeMinutes} min read</span>
          )}
        </div>
      </header>

      {/* Article content — placeholder for TipTap renderer */}
      <article className="prose prose-lg max-w-none">
        {art.contentPlaintext ? (
          <p className="text-foreground">{art.contentPlaintext}</p>
        ) : (
          <p className="text-muted-foreground">
            Article content will be rendered here using the TipTap content
            renderer. The full reader experience (with feedback widget,
            comments, progress tracking, and bookmarks) will be implemented
            by the Website Blog UI Expert.
          </p>
        )}
      </article>

      {/* Helpful feedback widget */}
      <div className="mt-10 rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm font-medium">Was this article helpful?</p>
        <div className="mt-3 flex justify-center gap-3">
          <button
            type="button"
            className="rounded-lg border border-border bg-background px-5 py-2 text-sm transition hover:border-primary hover:text-primary"
          >
            Yes
          </button>
          <button
            type="button"
            className="rounded-lg border border-border bg-background px-5 py-2 text-sm transition hover:border-primary hover:text-primary"
          >
            No
          </button>
        </div>
      </div>

      {/* Related articles */}
      {art.relatedArticles && (art.relatedArticles as any[]).length > 0 && (
        <section className="mt-12 border-t border-border pt-8">
          <h2 className="mb-4 text-xl font-semibold">Related Articles</h2>
          <div className="space-y-3">
            {(art.relatedArticles as any[]).map((related) => (
              <Link
                key={related._id}
                to="/help/$categorySlug/$articleSlug"
                params={{ categorySlug, articleSlug: related.slug }}
                className="block text-primary hover:underline"
              >
                {related.title}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
