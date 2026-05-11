import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { Input } from "@/components/ui/input";
import { SearchSuggestions } from "@/components/search/SearchSuggestions";

/**
 * Full-width search input overlay that slides down from the header.
 * Includes live search suggestions as the user types.
 */
export function SearchOverlay() {
  const { searchOpen, closeSearch } = useLayoutShell();
  const [query, setQuery] = React.useState("");
  const [suggestionsVisible, setSuggestionsVisible] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Auto-focus input on open
  React.useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus();
    }
    if (!searchOpen) {
      setSuggestionsVisible(false);
    }
  }, [searchOpen]);

  // Close on Escape
  React.useEffect(() => {
    if (!searchOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (suggestionsVisible) {
          setSuggestionsVisible(false);
        } else {
          closeSearch();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen, closeSearch, suggestionsVisible]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate({ to: "/search", search: { q: query.trim() } } as any);
      closeSearch();
      setQuery("");
      setSuggestionsVisible(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSuggestionsVisible(e.target.value.trim().length >= 2);
  };

  const handleSuggestionSelect = (text: string) => {
    setQuery(text);
    setSuggestionsVisible(false);
  };

  if (!searchOpen) return null;

  return (
    <div
      data-slot="search-overlay"
      className={cn(
        "z-40 w-full border-b border-border bg-background",
        "animate-in slide-in-from-top-2 fade-in duration-200",
      )}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 md:px-6 lg:px-8">
        <div className="relative flex-1">
          <form onSubmit={handleSubmit} className="flex items-center gap-3">
            <Input
              ref={inputRef}
              type="search"
              placeholder="Search..."
              value={query}
              onChange={handleInputChange}
              onFocus={() => {
                if (query.trim().length >= 2) setSuggestionsVisible(true);
              }}
              className="flex-1"
              aria-label="Search query"
              aria-autocomplete="list"
              role="combobox"
              aria-expanded={suggestionsVisible}
            />
          </form>
          <SearchSuggestions
            query={query}
            isVisible={suggestionsVisible}
            onClose={() => setSuggestionsVisible(false)}
            onSelect={handleSuggestionSelect}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            closeSearch();
            setQuery("");
            setSuggestionsVisible(false);
          }}
          className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close search"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
