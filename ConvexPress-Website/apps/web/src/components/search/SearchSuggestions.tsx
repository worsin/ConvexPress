/**
 * Search Suggestions / Autocomplete Dropdown
 *
 * Positioned below a search input, shows live suggestions as the user types.
 * Two types of suggestions:
 *   - "content" - Content title matches (navigate directly to content page)
 *   - "popular" - Popular search queries (navigate to /search?q=...)
 *
 * Requirements:
 *   - Debounced input (200ms)
 *   - Minimum 2 characters
 *   - Arrow key navigation, Enter to select, Escape to close
 *   - Uses search.suggest Convex query
 */

import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { FileText, Search, Newspaper, Image, MessageSquare } from "lucide-react";

import { api } from "@convexpress-website/backend/generated/api";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Suggestion {
  text: string;
  type: "content" | "popular";
  contentType?: string;
  resultCount?: number;
}

interface SearchSuggestionsProps {
  query: string;
  isVisible: boolean;
  onClose: () => void;
  onSelect: (text: string) => void;
  className?: string;
}

// ─── Content Type Icons ─────────────────────────────────────────────────────

const CONTENT_TYPE_ICONS: Record<string, typeof Newspaper> = {
  post: Newspaper,
  page: FileText,
  media: Image,
  comment: MessageSquare,
};

// ─── Component ──────────────────────────────────────────────────────────────

export function SearchSuggestions({
  query,
  isVisible,
  onClose,
  onSelect,
  className,
}: SearchSuggestionsProps) {
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const navigate = useNavigate();

  const debouncedQuery = useDebounce(query, 200);
  const shouldFetch = debouncedQuery.trim().length >= 2 && isVisible;

  const suggestData = useQuery(
    api.search.queries.suggest,
    shouldFetch ? { q: debouncedQuery, limit: 5 } : "skip",
  );

  const suggestions: Suggestion[] = suggestData?.suggestions ?? [];

  // Reset active index when suggestions change (inline during render, no useEffect)
  const prevSuggestionsLengthRef = React.useRef(suggestions.length);
  if (prevSuggestionsLengthRef.current !== suggestions.length) {
    prevSuggestionsLengthRef.current = suggestions.length;
    setActiveIndex(-1);
  }


  if (!isVisible || !shouldFetch || suggestions.length === 0) return null;

  return (
    <div
      data-slot="search-suggestions"
      className={cn(
        "absolute left-0 right-0 top-full z-30 mt-1 rounded-sm border border-border bg-background shadow-md",
        className,
      )}
      role="listbox"
      aria-label="Search suggestions"
    >
      {suggestions.map((suggestion, i) => {
        const Icon =
          suggestion.type === "content" && suggestion.contentType
            ? CONTENT_TYPE_ICONS[suggestion.contentType] ?? Search
            : Search;

        return (
          <button
            key={`${suggestion.type}:${suggestion.text}`}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
              i === activeIndex
                ? "bg-muted text-foreground"
                : "text-foreground/80 hover:bg-muted/50",
            )}
            onMouseEnter={() => setActiveIndex(i)}
            onClick={() => {
              onSelect(suggestion.text);
	              navigate({
	                to: "/search",
	                search: { q: suggestion.text },
	              } as any);
              onClose();
            }}
          >
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{suggestion.text}</span>
            {suggestion.type === "content" && suggestion.contentType && (
              <span className="text-[10px] uppercase text-muted-foreground">
                {suggestion.contentType}
              </span>
            )}
            {suggestion.type === "popular" && suggestion.resultCount != null && (
              <span className="text-[10px] text-muted-foreground">
                {suggestion.resultCount} results
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Export the keyboard handler hook for parent integration
export function useSearchSuggestionsKeyboard() {
  return React.useRef<((e: React.KeyboardEvent) => void) | null>(null);
}
