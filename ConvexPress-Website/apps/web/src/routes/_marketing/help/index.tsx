import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, ErrorComponent } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildIndexablePageHead } from "@/lib/seo/head";

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
    title: "Help Center - ConvexPress",
    description: "Find answers to your questions in our help center.",
    path: "/help",
  }),
});

/** Category shape returned by listPublished. */
type KbCategory = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  articleCount: number;
};

/** Featured article shape returned by getFeatured. */
type FeaturedArticle = {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  viewCount: number;
  categoryId?: string;
  categorySlug?: string;
  featuredImageId?: string;
  readingTimeMinutes?: number;
};

function HelpCenter() {
  const navigate = useNavigate();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Convex query type mismatch with useSuspenseQuery; fix by regenerating website types
  const { data: categories } = useSuspenseQuery(
    convexQuery(api.kb.categories.listPublished, {}) as any,
  ) as { data: KbCategory[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Convex query type mismatch with useSuspenseQuery; fix by regenerating website types
  const { data: featured } = useSuspenseQuery(
    convexQuery(api.kb.queries.getFeatured, { limit: 6 }) as any,
  ) as { data: FeaturedArticle[] };

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = new FormData(e.currentTarget).get("q") as string;
    if (query.trim()) {
      navigate({ to: "/help/search", search: { q: query.trim() } } as any);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Search hero */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight">How can we help?</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Search our knowledge base or browse by category
        </p>
        <form
          className="mx-auto mt-6 flex max-w-lg gap-2"
          onSubmit={handleSearchSubmit}
        >
          <input
            name="q"
            type="text"
            placeholder="Search articles..."
            className="flex-1 rounded-lg border border-border bg-card px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Categories grid */}
      <section className="mb-12">
        <h2 className="mb-6 text-2xl font-semibold">Browse by Category</h2>
        {categories && categories.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <Link
                key={cat._id}
                to="/help/$categorySlug"
                params={{ categorySlug: cat.slug }}
                className="rounded-lg border border-border bg-card p-6 transition hover:border-primary/50 hover:shadow-sm"
              >
                {cat.icon && (
                  <span className="mb-2 block text-2xl">{cat.icon}</span>
                )}
                <h3 className="text-lg font-medium">{cat.name}</h3>
                {cat.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {cat.description}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {cat.articleCount}{" "}
                  {cat.articleCount === 1 ? "article" : "articles"}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No categories yet.</p>
        )}
      </section>

      {/* Featured articles */}
      {featured && featured.length > 0 && (
        <section>
          <h2 className="mb-6 text-2xl font-semibold">Featured Articles</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((article) => (
              <Link
                key={article._id}
                to="/help/$categorySlug/$articleSlug"
                params={{
                  categorySlug: article.categorySlug ?? "uncategorized",
                  articleSlug: article.slug,
                }}
                className="rounded-lg border border-border bg-card p-5 transition hover:border-primary/50 hover:shadow-sm"
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
          </div>
        </section>
      )}
    </div>
  );
}
