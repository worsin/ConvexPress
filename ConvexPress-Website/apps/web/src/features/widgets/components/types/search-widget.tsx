/**
 * Search Widget - Website Renderer
 *
 * Displays a search form that submits to the site's search route.
 */

import { Search } from "lucide-react";

interface SearchWidgetConfig {
  placeholder?: string;
}

export function SearchWidget({ config }: { config: SearchWidgetConfig }) {
  const placeholder = config.placeholder || "Search...";

  return (
    <form action="/search" method="get" className="relative">
      <input
        type="search"
        name="q"
        placeholder={placeholder}
        className="w-full border border-border bg-transparent px-3 py-2 pr-9 text-sm outline-hidden focus:border-border/80 transition-colors"
        aria-label="Search"
      />
      <button
        type="submit"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground/70 transition-colors outline-hidden focus-visible:text-foreground/70 focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
        aria-label="Submit search"
      >
        <Search className="size-4" />
      </button>
    </form>
  );
}
