/**
 * Empty Search Results
 *
 * Zero-results state shown when a search query returns no matches.
 * Provides helpful suggestions and a search form for retry.
 */

import { SearchForm } from "@/components/blog/SearchForm";
import { cn } from "@/lib/utils";

interface EmptySearchResultsProps {
  query: string;
  className?: string;
}

export function EmptySearchResults({ query, className }: EmptySearchResultsProps) {
  return (
    <div
      data-slot="empty-search-results"
      className={cn("flex flex-col items-center gap-6 py-12 text-center", className)}
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">No results found</h2>
        <p className="text-sm text-muted-foreground">
          Nothing matched &ldquo;{query}&rdquo;. Try a different search term.
        </p>
      </div>

      {/* Suggestions */}
      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <p className="font-medium text-foreground/80">Suggestions:</p>
        <ul className="list-inside list-disc text-left">
          <li>Check your spelling</li>
          <li>Try more general keywords</li>
          <li>Use fewer words</li>
          <li>Try different keywords</li>
        </ul>
      </div>

      {/* Retry form */}
      <SearchForm initialQuery={query} className="w-full max-w-sm" autoFocus />
    </div>
  );
}
