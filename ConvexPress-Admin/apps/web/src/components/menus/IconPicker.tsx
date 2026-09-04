/**
 * Icon picker — searchable lucide icon names rendered live. Shows a curated
 * "suggested" set until the user searches, so we never mount all 1,200 icons.
 */

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { LucideDynamicIcon, LUCIDE_ICON_NAMES, isLucideIconName } from "@/components/icons/LucideDynamicIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const SUGGESTED = [
  "layout-dashboard", "home", "bell", "shopping-bag", "shopping-cart", "package", "repeat", "download", "heart", "star",
  "map-pin", "badge-check", "graduation-cap", "life-buoy", "book-open", "user", "settings", "shield-check", "file-text",
  "message-square", "credit-card", "receipt", "gift", "calendar", "clock", "inbox", "mail", "link", "external-link",
  "log-out", "sparkles", "help-circle", "search", "tag", "folder", "image", "video", "music", "bookmark",
];

const MAX_RESULTS = 96;

interface IconPickerProps {
  id?: string;
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
  /** Registry default shown when the value is empty (dashboard items). */
  fallbackIcon?: string;
}

export function IconPicker({ id, value, onChange, disabled, fallbackIcon }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, "-");
    if (!needle) return SUGGESTED.filter(isLucideIconName);
    const starts = LUCIDE_ICON_NAMES.filter((name) => name.startsWith(needle));
    const contains = LUCIDE_ICON_NAMES.filter((name) => !name.startsWith(needle) && name.includes(needle));
    return [...starts, ...contains].slice(0, MAX_RESULTS);
  }, [query]);

  const effective = value || fallbackIcon || "";
  const known = isLucideIconName(effective);

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          disabled={disabled}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-lg border border-input bg-card px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2 focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
          )}
          aria-label="Choose icon"
        >
          <LucideDynamicIcon name={effective} className="size-4 text-ink-2" />
          <span className="font-mono">{effective || "No icon"}</span>
          {value === "" && fallbackIcon && <span className="text-[10px] text-muted-foreground">(from registry)</span>}
          {effective && !known && <span className="text-[10px] text-warning">unknown</span>}
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search 1,200+ lucide icons"
                className="h-8 pl-8 text-xs"
                aria-label="Search icons"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {!query.trim() && <div className="eyebrow mb-1.5 px-1">Suggested</div>}
            {results.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-muted-foreground">No icons match "{query}".</p>
            ) : (
              <div className="grid grid-cols-8 gap-1" role="listbox" aria-label="Icons">
                {results.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={name === value}
                    title={name}
                    onClick={() => {
                      onChange(name);
                      setOpen(false);
                    }}
                    className={cn(
                      "grid size-8 place-items-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      name === value && "bg-primary-soft text-primary",
                    )}
                  >
                    <LucideDynamicIcon name={name} className="size-4" />
                  </button>
                ))}
              </div>
            )}
            {query.trim() && results.length >= MAX_RESULTS && (
              <p className="mt-2 px-1 text-[10px] text-muted-foreground">Showing the first {MAX_RESULTS} — keep typing to narrow.</p>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
            <a href="https://lucide.dev/icons" target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground underline-offset-2 hover:underline">
              Browse lucide.dev
            </a>
            <Input
              value={value}
              onChange={(event) => onChange(event.target.value.trim().toLowerCase())}
              placeholder="or type a name"
              className="h-7 w-36 font-mono text-[10px]"
              aria-label="Icon name"
            />
          </div>
        </PopoverContent>
      </Popover>
      {value && (
        <Button variant="ghost" size="icon-xs" onClick={() => onChange("")} disabled={disabled} aria-label="Clear icon">
          <X />
        </Button>
      )}
    </div>
  );
}
