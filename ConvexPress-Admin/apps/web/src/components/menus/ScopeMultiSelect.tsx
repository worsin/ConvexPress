/**
 * Multi-select for role / membership plan slugs: chips plus a popover with a
 * checkbox list. Unknown slugs (deleted roles) stay selectable so they can be
 * removed.
 */

import { useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ScopeChoice {
  slug: string;
  name: string;
  hint?: string;
}

interface ScopeMultiSelectProps {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  choices: ScopeChoice[];
  placeholder: string;
  emptyMessage: string;
  disabled?: boolean;
  isLoading?: boolean;
}

export function ScopeMultiSelect({ id, value, onChange, choices, placeholder, emptyMessage, disabled, isLoading }: ScopeMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const all = useMemo<ScopeChoice[]>(() => {
    const known = new Set(choices.map((choice) => choice.slug));
    const orphans = value.filter((slug) => !known.has(slug)).map((slug) => ({ slug, name: slug, hint: "no longer exists" }));
    return [...choices, ...orphans];
  }, [choices, value]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((choice) => choice.name.toLowerCase().includes(needle) || choice.slug.includes(needle));
  }, [all, query]);

  const toggle = (slug: string) => {
    onChange(value.includes(slug) ? value.filter((entry) => entry !== slug) : [...value, slug]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        className={cn(
          "flex min-h-8 w-full items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1 text-left text-xs transition-colors hover:bg-surface-2 focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {value.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            value.map((slug) => {
              const choice = all.find((entry) => entry.slug === slug);
              return (
                <span
                  key={slug}
                  className={cn(
                    "inline-flex h-5 items-center gap-1 rounded-md bg-muted px-1.5 text-[11px] font-medium text-foreground",
                    choice?.hint && "text-warning",
                  )}
                >
                  {choice?.name ?? slug}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${choice?.name ?? slug}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(slug);
                    }}
                    className="grid size-3.5 place-items-center rounded opacity-60 hover:opacity-100"
                  >
                    <X className="size-2.5" />
                  </span>
                </span>
              );
            })
          )}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {all.length > 6 && (
          <div className="border-b border-border p-2">
            <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter" className="h-7 text-xs" aria-label="Filter options" />
          </div>
        )}
        <div className="max-h-56 overflow-y-auto p-1">
          {isLoading ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">{all.length === 0 ? emptyMessage : "No matches."}</p>
          ) : (
            visible.map((choice) => (
              <label key={choice.slug} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                <Checkbox checked={value.includes(choice.slug)} onCheckedChange={() => toggle(choice.slug)} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-xs text-foreground">{choice.name}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    {choice.slug}
                    {choice.hint ? ` · ${choice.hint}` : ""}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
        {value.length > 0 && (
          <div className="border-t border-border px-2 py-1.5">
            <button type="button" onClick={() => onChange([])} className="text-[10px] text-muted-foreground underline-offset-2 hover:underline">
              Clear all
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
