/**
 * Search Filters
 *
 * Content type tabs, sort selector for search results page.
 * Updates URL search params when filters change.
 */

import { useNavigate } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Search page URL params */
interface SearchPageParams {
  q: string;
  type?: string;
  sort?: string;
  page?: number;
}

interface SearchFiltersProps {
  currentQuery: string;
  currentType?: string;
  currentSort?: string;
  className?: string;
}

const CONTENT_TYPES = [
  { value: undefined, label: "All" },
  { value: "post", label: "Posts" },
  { value: "page", label: "Pages" },
  { value: "course", label: "Courses" },
  { value: "media", label: "Media" },
] as const;

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "date", label: "Date" },
  { value: "title", label: "Title" },
] as const;

// ─── Component ──────────────────────────────────────────────────────────────

export function SearchFilters({
  currentQuery,
  currentType,
  currentSort,
  className,
}: SearchFiltersProps) {
  const navigate = useNavigate();

  const handleTypeChange = (type: string | undefined) => {
    const search: SearchPageParams = {
      q: currentQuery,
      type,
      page: 1,
    };
    navigate({ to: "/search", search } as any);
  };

  const handleSortChange = (sort: string) => {
    const search: SearchPageParams = {
      q: currentQuery,
      type: currentType,
      sort,
      page: 1,
    };
    navigate({ to: "/search", search } as any);
  };

  return (
    <div
      data-slot="search-filters"
      className={cn("flex flex-wrap items-center justify-between gap-3", className)}
    >
      {/* Content Type Tabs */}
      <div className="flex items-center gap-1">
        {CONTENT_TYPES.map((ct) => (
          <button
            key={ct.label}
            type="button"
            onClick={() => handleTypeChange(ct.value)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
              (currentType ?? undefined) === ct.value
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {ct.label}
          </button>
        ))}
      </div>

      {/* Sort Selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Sort by:</span>
        <select
          value={currentSort ?? "relevance"}
          onChange={(e) => handleSortChange(e.target.value)}
          className="rounded-sm border border-border bg-background px-2 py-1 text-xs outline-hidden focus:border-primary"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
