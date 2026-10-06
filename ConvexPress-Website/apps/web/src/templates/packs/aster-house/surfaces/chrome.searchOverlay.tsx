/**
 * Aster · chrome.searchOverlay — one underline search line that drops
 * beneath the header, with live suggestions. Same behaviour as Core: focuses
 * on open, Escape closes suggestions then the overlay, shops search the
 * catalog first (`/products`), everything else goes to `/search`.
 */
import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { SearchSuggestions } from "@/components/search/SearchSuggestions";
import { useSettings } from "@/contexts/SettingsContext";
import type { SearchOverlaySurfaceData } from "@/templates/packs/core/surfaces/chrome.searchOverlay";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, UnderlineInput } from "../parts";

export default function AsterChromeSearchOverlay({ data }: SurfaceProps<SearchOverlaySurfaceData>) {
  const { open, onClose } = data;
  const [query, setQuery] = useState("");
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const settings = useSettings();
  const searchTarget = settings?.plugins?.commerceEnabled === true ? "/products" : "/search";

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

  function close() {
    onClose();
    setQuery("");
    setSuggestionsVisible(false);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    void navigate({ to: searchTarget, search: { q: trimmed } } as any);
    close();
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setSuggestionsVisible(event.target.value.trim().length >= 2);
  }

  if (!open) return null;

  return (
    <div data-slot="search-overlay" className="z-40 w-full border-b border-border bg-background animate-in slide-in-from-top-2 fade-in duration-200">
      <Container className="flex items-end gap-4 py-4">
        <div className="relative min-w-0 flex-1">
          <form id="aster-search-overlay" onSubmit={onSubmit} role="search" aria-label="Search the site" className="relative">
            <Search className="pointer-events-none absolute left-0 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <UnderlineInput
              ref={inputRef}
              type="search"
              placeholder={data.placeholder ?? "Search…"}
              value={query}
              onChange={onChange}
              onFocus={() => {
                if (query.trim().length >= 2) setSuggestionsVisible(true);
              }}
              className="pl-7 text-lg md:text-xl"
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
            onSelect={(text) => {
              setQuery(text);
              setSuggestionsVisible(false);
            }}
            className="rounded-xl shadow-sm"
          />
        </div>
        <button type="submit" form="aster-search-overlay" className="hidden h-11 shrink-0 text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground sm:block">
          Search
        </button>
        <button type="button" onClick={close} className="flex size-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground" aria-label="Close search">
          <X className="size-4" aria-hidden="true" />
        </button>
      </Container>
    </div>
  );
}
