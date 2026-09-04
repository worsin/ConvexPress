/** Core · help.search — knowledge base search form and results. */
import { Link } from "@tanstack/react-router";

import type { SurfaceProps } from "@/templates/sdk/types";

export type KbSearchResult = {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  categorySlug?: string;
  categoryName?: string;
  readingTimeMinutes?: number;
};

export interface HelpSearchSurfaceData {
  /** Raw `q` from the URL. */
  q?: string;
  /** Whether `q` has a non-empty trimmed value. */
  hasQuery: boolean;
  results: KbSearchResult[];
  total: number;
  actions: {
    /** Navigate to help search for a query (raw value from the input; route trims). */
    search: (query: string) => void;
  };
}

export default function CoreHelpSearch({ data }: SurfaceProps<HelpSearchSurfaceData>) {
  const { q, hasQuery, results, total, actions } = data;

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = new FormData(e.currentTarget).get("q") as string;
    actions.search(query);
  }

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
          className="flex-1 rounded-lg border border-border bg-card px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
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
        {results.map((article) => (
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
