import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useLayoutShell } from "@/hooks/layout/useLayoutShell";
import { useSettings } from "@/contexts/SettingsContext";
import { SearchSuggestions } from "@/components/search/SearchSuggestions";
import type { HeaderConfig } from "@/lib/layout/types";
import { cn } from "@/lib/utils";

type SearchConfig = HeaderConfig["search"];
type Pack = "core" | "journal" | "depot" | "aster-house";

export function HeaderSearchTrigger({ config }: { config?: SearchConfig }) {
  const { searchOpen, toggleSearch } = useLayoutShell();
  const ref = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    // Return keyboard focus when a revealed field is dismissed.
    if (wasOpen.current && !searchOpen) ref.current?.focus();
    wasOpen.current = searchOpen;
  }, [searchOpen]);
  if (config?.enabled === false || config?.variant === "inline") return null;
  return <button ref={ref} type="button" onClick={toggleSearch} aria-label="Toggle search" aria-expanded={searchOpen}
    className="flex size-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground">
    <Search className="size-[18px]" aria-hidden="true" />
  </button>;
}

/** Desktop inline fields occupy the main row; phones get their own full-width row. */
export function HeaderSearchInline({ config, pack = "core", mobile = false }: { config: SearchConfig; pack?: Pack; mobile?: boolean }) {
  if (!config.enabled || config.variant !== "inline") return null;
  return <HeaderSearchField placeholder={config.placeholder} pack={pack} className={mobile ? "flex pb-2 md:hidden" : "hidden min-w-0 flex-1 md:flex"} />;
}

/** Expandable is part of the header flow, distinct from the icon's pack overlay. */
export function HeaderSearchExpansion({ config, pack = "core" }: { config: SearchConfig; pack?: Pack }) {
  const { searchOpen, closeSearch } = useLayoutShell();
  if (!config.enabled || config.variant !== "expandable" || !searchOpen) return null;
  return <HeaderSearchField placeholder={config.placeholder} pack={pack} onClose={closeSearch} className="flex w-full pb-3" />;
}

function HeaderSearchField({ placeholder, pack, onClose, className }: { placeholder: string; pack: Pack; onClose?: () => void; className: string }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const settings = useSettings();
  const target = settings?.plugins?.commerceEnabled === true ? "/products" : "/search";
  const editorial = pack === "journal" || pack === "aster-house";
  useEffect(() => { if (onClose) inputRef.current?.focus(); }, [onClose]);
  return <div data-slot="header-search-field" className={cn("relative min-w-0 items-center gap-2", className)}>
    <form role="search" aria-label="Search the site" className="flex min-w-0 flex-1 items-center" onSubmit={event => {
      event.preventDefault();
      const q = query.trim();
      if (!q) return;
      void navigate({ to: target, search: { q } } as any);
      setSuggestions(false);
      onClose?.();
    }} onKeyDown={event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (suggestions) setSuggestions(false);
      else onClose?.();
    }}>
      <input ref={inputRef} type="search" name="q" aria-label="Search query" autoComplete="off" placeholder={placeholder}
        value={query} onChange={event => { setQuery(event.target.value); setSuggestions(event.target.value.trim().length >= 2); }}
        onFocus={() => { if (query.trim().length >= 2) setSuggestions(true); }}
        className={cn("h-10 w-full min-w-0 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30",
          editorial ? "border-b border-border font-display" : "border border-border bg-background", pack === "depot" && "rounded-l-md")}
      />
      <button type="submit" aria-label="Search" className={cn("flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground hover:opacity-90", pack === "depot" && "rounded-r-md")}>
        <Search className="size-4" aria-hidden="true" />
      </button>
    </form>
    {onClose && <button type="button" aria-label="Close search" onClick={onClose} className="flex size-9 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"><X className="size-4" aria-hidden="true" /></button>}
    <SearchSuggestions query={query} isVisible={suggestions} onClose={() => setSuggestions(false)} onSelect={text => { setQuery(text); setSuggestions(false); }} className="top-full" />
  </div>;
}
