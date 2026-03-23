/**
 * Search Form Widget
 *
 * Compact search form for placement in sidebars, footers, and widget areas.
 * Two variants:
 *   - Compact (default): Single-line input with search icon
 *   - Expanded: Full-width with helpful text, used on 404 pages / empty states
 */

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

interface SearchFormWidgetProps {
  variant?: "compact" | "expanded";
  placeholder?: string;
  className?: string;
}

export function SearchFormWidget({
  variant = "compact",
  placeholder,
  className,
}: SearchFormWidgetProps) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    navigate({
      to: "/search",
      search: { q: trimmed },
    });
  };

  if (variant === "expanded") {
    return (
      <div
        data-slot="search-form-widget"
        className={cn("flex flex-col gap-3 text-center", className)}
      >
        <p className="text-sm text-muted-foreground">
          Looking for something?
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2" role="search">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder={placeholder ?? "Search this site..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-sm border border-border bg-background py-2 pl-8 pr-3 text-sm outline-hidden placeholder:text-muted-foreground focus:border-primary"
              aria-label="Search query"
            />
          </div>
          <button
            type="submit"
            className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Search
          </button>
        </form>
      </div>
    );
  }

  // Compact variant
  return (
    <form
      data-slot="search-form-widget"
      onSubmit={handleSubmit}
      className={cn("flex items-center gap-2", className)}
      role="search"
      aria-label="Search"
    >
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder={placeholder ?? "Search..."}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-sm border border-border bg-background py-1.5 pl-7 pr-2 text-xs outline-hidden placeholder:text-muted-foreground focus:border-primary"
          aria-label="Search query"
        />
      </div>
      <button
        type="submit"
        className="rounded-sm bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Go
      </button>
    </form>
  );
}
