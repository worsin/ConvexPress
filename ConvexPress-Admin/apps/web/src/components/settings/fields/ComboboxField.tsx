/**
 * ComboboxField - Searchable select for large option lists.
 *
 * Used for: timezone picker, page select, category select, language select.
 * Integrates with TanStack Form field API.
 *
 * Uses @base-ui/react/popover for proper dropdown positioning:
 * - Floating UI-based positioning
 * - Portal rendering
 * - Automatic flip/shift when near viewport edges
 *
 * Features:
 * - Type-to-filter with instant results
 * - Grouped options support
 * - Clearable selection
 * - Keyboard navigation
 */

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { ChevronDown, Search, X } from "lucide-react";

import type { FieldOption, FieldOptionGroup } from "@/types/settings";
import { cn } from "@/lib/utils";
import type { SettingsFieldApi } from "./types";

interface ComboboxFieldProps {
  /** TanStack Form field API */
  field: SettingsFieldApi;
  /** Options to display (flat or grouped) */
  options: FieldOption[] | FieldOptionGroup[];
  /** Placeholder text */
  placeholder?: string;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Whether to allow clearing the selection */
  clearable?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state (for async options) */
  isLoading?: boolean;
}

/** Type guard: check if options are grouped */
function isGrouped(
  options: FieldOption[] | FieldOptionGroup[],
): options is FieldOptionGroup[] {
  return (
    options.length > 0 &&
    "options" in options[0] &&
    Array.isArray((options[0] as FieldOptionGroup).options)
  );
}

/** Flatten grouped options for searching */
function flattenOptions(
  options: FieldOption[] | FieldOptionGroup[],
): FieldOption[] {
  if (isGrouped(options)) {
    return options.flatMap((g) => g.options);
  }
  return options;
}

export function ComboboxField({
  field,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  clearable = false,
  disabled = false,
  isLoading = false,
}: ComboboxFieldProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const value = field.state.value as string | null;

  // Find the selected option label
  const allOptions = flattenOptions(options);
  const selectedOption = allOptions.find((opt) => opt.value === value);

  // Filter options by search query
  const filteredOptions = React.useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return options;

    if (isGrouped(options)) {
      return options
        .map((group) => ({
          ...group,
          options: group.options.filter(
            (opt) =>
              opt.label.toLowerCase().includes(query) ||
              opt.value.toLowerCase().includes(query),
          ),
        }))
        .filter((group) => group.options.length > 0);
    }

    return (options as FieldOption[]).filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        opt.value.toLowerCase().includes(query),
    );
  }, [options, searchQuery]);

  const filteredFlat = flattenOptions(filteredOptions);

  // Focus input when opening
  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    field.handleChange(optionValue);
    setIsOpen(false);
    setSearchQuery("");
    setHighlightedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    field.handleChange(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredFlat.length - 1 ? prev + 1 : 0,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredFlat.length - 1,
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredFlat.length) {
          handleSelect(filteredFlat[highlightedIndex].value);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery("");
        break;
    }
  };

  return (
    <PopoverPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (disabled) return;
        setIsOpen(open);
        if (!open) setSearchQuery("");
      }}
    >
      <PopoverPrimitive.Trigger
        disabled={disabled}
        className={cn(
          "dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 rounded-none border bg-transparent px-2.5 py-1 text-xs transition-colors focus-visible:ring-1 w-full min-w-0 outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-between gap-1 text-left",
        )}
        aria-haspopup="listbox"
      >
        <span
          className={cn(
            "truncate",
            !selectedOption && "text-muted-foreground",
          )}
        >
          {selectedOption?.label ?? placeholder}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          {clearable && value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              className="p-0.5 hover:text-foreground text-muted-foreground"
            >
              <X className="size-3" />
            </span>
          )}
          <ChevronDown
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </div>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          sideOffset={4}
          align="start"
          className="z-50 w-[var(--anchor-width)]"
        >
          <PopoverPrimitive.Popup
            className="rounded-none border border-border bg-popover shadow-md w-full"
            onKeyDown={handleKeyDown}
          >
            {/* Search input */}
            <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
              <Search className="size-3 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-xs outline-hidden placeholder:text-muted-foreground"
              />
            </div>

            {/* Options list */}
            <div
              role="listbox"
              className="max-h-60 overflow-y-auto p-1"
            >
              {isLoading ? (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                  Loading...
                </div>
              ) : filteredFlat.length === 0 ? (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No results found
                </div>
              ) : isGrouped(filteredOptions) ? (
                (filteredOptions as FieldOptionGroup[]).map((group) => (
                  <div key={group.label}>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {group.label}
                    </div>
                    {group.options.map((opt) => {
                      const globalIndex = filteredFlat.indexOf(opt);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={opt.value === value}
                          onClick={() => handleSelect(opt.value)}
                          className={cn(
                            "w-full text-left px-2 py-1.5 text-xs rounded-none flex items-center gap-2 cursor-pointer",
                            opt.value === value
                              ? "bg-primary/10 text-foreground"
                              : globalIndex === highlightedIndex
                                ? "bg-muted text-foreground"
                                : "text-foreground hover:bg-muted",
                            opt.disabled &&
                              "opacity-50 pointer-events-none",
                          )}
                          disabled={opt.disabled}
                        >
                          <span className="truncate pl-2">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))
              ) : (
                (filteredFlat as FieldOption[]).map((opt, index) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={opt.value === value}
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 text-xs rounded-none flex items-center gap-2 cursor-pointer",
                      opt.value === value
                        ? "bg-primary/10 text-foreground"
                        : index === highlightedIndex
                          ? "bg-muted text-foreground"
                          : "text-foreground hover:bg-muted",
                      opt.disabled && "opacity-50 pointer-events-none",
                    )}
                    disabled={opt.disabled}
                  >
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
