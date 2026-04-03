import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { api } from "@convexpress-website/backend/generated/api";

const searchSchema = z.object({
  q: z.string().optional(),
});

export const Route = createFileRoute("/_marketing/help/search")({
  validateSearch: searchSchema,
  component: KbSearchResults,
  loader: async ({ context: { queryClient }, search }) => {
    if (search.q?.trim()) {
      await queryClient.ensureQueryData(
        convexQuery(api.kb.search.search, {
          query: search.q.trim(),
          limit: 20,
        }),
      );
    }
  },
  head: (ctx) => {
    const q =
      typeof (ctx as any).search?.q === "string"
        ? (ctx as any).search.q
        : "";
    return {
      meta: [
        {
          title: q
            ? `Search: ${q} - Help Center - ConvexPress`
            : "Search - Help Center - ConvexPress",
        },
      ],
    };
  },
});

function KbSearchResults() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();

  const hasQuery = Boolean(q?.trim());

  const { data } = useSuspenseQuery(
    // @ts-expect-error - Convex query type mismatch with useSuspenseQuery
    hasQuery
      ? convexQuery(api.kb.search.search, {
          query: q!.trim(),
          limit: 20,
        })
      : { queryKey: ["kb-search-empty"], queryFn: () => ({ results: [], total: 0 }) },
  );

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = new FormData(e.currentTarget).get("q") as string;
    navigate({ to: "/help/search", search: { q: query.trim() || undefined } });
  }

  const results = (data as any)?.results ?? [];
  const total = (data as any)?.total ?? 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/help" className="hover:text-foreground transition-colors">
          Help Center
        </Link>
        <span className="mx-2">/</span>
        <span>Search</span>
      </nav>

      {/* Search form */}
      <form className="mb-8 flex gap-2" onSubmit={handleSearchSubmit}>
        <input
          name="q"
          type="text"
          defaultValue={q ?? ""}
          placeholder="Search articles..."
          className="flex-1 rounded-lg border border-border bg-card px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus={!hasQuery}
        />
        <button
          type="submit"
          className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Search
        </button>
      </form>

      {/* Result count */}
      {hasQuery && (
        <p className="mb-6 text-sm text-muted-foreground">
          {total} {total === 1 ? "result" : "results"} for &ldquo;{q}&rdquo;
        </p>
      )}

      {/* Results */}
      <div className="space-y-4">
        {results.map((article: any) => (
          <Link
            key={article._id}
            to="/help/$categorySlug/$articleSlug"
            params={{
              categorySlug: article.categorySlug ?? "uncategorized",
              articleSlug: article.slug,
            }}
            className="block rounded-lg border border-border bg-card p-5 transition hover:border-primary/50 hover:shadow-sm"
          >
            <h3 className="font-medium">{article.title}</h3>
            {article.categoryName && (
              <p className="mt-1 text-xs text-primary">{article.categoryName}</p>
            )}
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

        {hasQuery && results.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <p className="text-base font-medium">No articles found</p>
            <p className="mt-1 text-sm">
              Try different keywords or{" "}
              <Link to="/help" className="text-primary hover:underline">
                browse by category
              </Link>
              .
            </p>
          </div>
        )}

        {!hasQuery && (
          <div className="py-12 text-center text-muted-foreground">
            <p className="text-sm">
              Enter a search term to find articles in our knowledge base.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
