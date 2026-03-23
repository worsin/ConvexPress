/**
 * Search Results Template
 *
 * Displays search results with a search query header.
 * Supports an optional sidebar.
 */

import type { ReactNode } from "react";

interface SearchResultsTemplateProps {
  children?: ReactNode;
  sidebar?: ReactNode;
  query?: string;
  resultCount?: number;
}

export function SearchResultsTemplate({
  children,
  sidebar,
  query,
  resultCount,
}: SearchResultsTemplateProps) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth: "var(--sh-layout-wide, 1200px)" }}>
      <header className="mb-8 border-b border-border pb-6">
        <h1
          className="text-3xl font-bold"
          style={{ fontFamily: "var(--sh-font-heading, inherit)" }}
        >
          {query ? `Search Results for: "${query}"` : "Search Results"}
        </h1>
        {resultCount !== undefined && (
          <p className="mt-2 text-muted-foreground">
            {resultCount === 0
              ? "No results found."
              : `${resultCount} result${resultCount === 1 ? "" : "s"} found.`}
          </p>
        )}
      </header>
      <div className={sidebar ? "flex gap-8" : ""}>
        <main className="flex-1 min-w-0">
          {children ?? (
            <div className="py-12 text-center text-muted-foreground">
              <p>Try searching with different keywords.</p>
            </div>
          )}
        </main>
        {sidebar && (
          <aside className="hidden lg:block w-72 shrink-0">{sidebar}</aside>
        )}
      </div>
    </div>
  );
}
