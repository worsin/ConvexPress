/**
 * Depot · chrome.searchOverlay — the search row that drops below the header:
 * a full-width `h-10` input with a Search button, live suggestions, Escape to
 * close. Same targets as Core (shops search the catalog first).
 */
import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { SearchSuggestions } from "@/components/search/SearchSuggestions";
import { useSettings } from "@/contexts/SettingsContext";
import type { SearchOverlaySurfaceData } from "@/templates/packs/core/surfaces/chrome.searchOverlay";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Container } from "../parts";

export default function DepotSearchOverlay({ data }: SurfaceProps<SearchOverlaySurfaceData>) {
  const { open, onClose } = data;
  const [query, setQuery] = useState("");
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const settings = useSettings();
  const target = settings?.plugins?.commerceEnabled === true ? "/products" : "/search";

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setSuggestionsVisible(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (suggestionsVisible) setSuggestionsVisible(false);
      else onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, suggestionsVisible]);

  const close = () => {
    onClose();
    setQuery("");
    setSuggestionsVisible(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    void navigate({ to: target, search: { q } } as any);
    close();
  };

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setSuggestionsVisible(event.target.value.trim().length >= 2);
  };

  if (!open) return null;

  return (
    <div data-slot="search-overlay" data-pack="depot" className="z-40 w-full border-b border-border bg-background animate-in fade-in slide-in-from-top-2 duration-200">
      <Container className="flex items-center gap-2 py-2">
        <div className="relative min-w-0 flex-1">
          <form role="search" onSubmit={submit} className="flex">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                ref={inputRef}
                type="search"
                name="q"
                value={query}
                onChange={change}
                onFocus={() => {
                  if (query.trim().length >= 2) setSuggestionsVisible(true);
                }}
                placeholder="Search…"
                autoComplete="off"
                aria-label="Search query"
                aria-autocomplete="list"
                role="combobox"
                aria-expanded={suggestionsVisible}
                className="h-10 w-full rounded-l-md border border-r-0 border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <Button type="submit" className="rounded-l-none">
              Search
            </Button>
          </form>
          <SearchSuggestions query={query} isVisible={suggestionsVisible} onClose={() => setSuggestionsVisible(false)} onSelect={(text) => {
            setQuery(text);
            setSuggestionsVisible(false);
          }} />
        </div>
        <button type="button" onClick={close} className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Close search">
          <X className="size-4" aria-hidden="true" />
        </button>
      </Container>
    </div>
  );
}
