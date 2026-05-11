import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSuggestions } from "@/components/search/SearchSuggestions";

interface SearchFormProps {
  initialQuery?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Search input form with live suggestions. Navigates to /search?q=... on submit.
 */
export function SearchForm({ initialQuery = "", className, autoFocus }: SearchFormProps) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const navigate = useNavigate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setSuggestionsVisible(false);
	    navigate({
	      to: "/search",
	      search: { q: trimmed },
	    } as any);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setSuggestionsVisible(e.target.value.trim().length >= 2);
  }

  function handleSuggestionSelect(text: string) {
    setQuery(text);
    setSuggestionsVisible(false);
  }

  return (
    <form
      data-slot="search-form"
      onSubmit={handleSubmit}
      className={cn("flex gap-2", className)}
      role="search"
      aria-label="Search posts"
    >
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          placeholder="Search posts and pages..."
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (query.trim().length >= 2) setSuggestionsVisible(true);
          }}
          onBlur={() => {
            // Delay to allow click on suggestion
            setTimeout(() => setSuggestionsVisible(false), 200);
          }}
          className="pl-8"
          autoFocus={autoFocus}
          aria-label="Search query"
          aria-autocomplete="list"
          role="combobox"
          aria-expanded={suggestionsVisible}
        />
        <SearchSuggestions
          query={query}
          isVisible={suggestionsVisible}
          onClose={() => setSuggestionsVisible(false)}
          onSelect={handleSuggestionSelect}
        />
      </div>
      <Button type="submit" variant="default" size="default">
        Search
      </Button>
    </form>
  );
}
