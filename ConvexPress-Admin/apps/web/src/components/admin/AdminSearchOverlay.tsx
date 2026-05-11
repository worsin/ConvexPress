/**
 * Admin Search Overlay (Command Palette)
 *
 * A Ctrl+K / Cmd+K triggered modal search dialog for the admin area.
 * Provides unified search across all content types with results grouped
 * by type and keyboard navigation support.
 *
 * Features:
 *   - Debounced input (200ms), minimum 2 characters
 *   - Results grouped by content type with count badges
 *   - Arrow key navigation, Enter to navigate, Escape to close
 *   - Status badges on each result
 *   - Uses search.adminSearch Convex query
 */

import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { Search, X, Loader2 } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import {
  AdminSearchResult,
  type AdminSearchResultData,
} from "./AdminSearchResult";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AdminSearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Group Results ──────────────────────────────────────────────────────────

type ContentType = "post" | "page" | "media" | "comment";

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  post: "Posts",
  page: "Pages",
  media: "Media",
  comment: "Comments",
};

const CONTENT_TYPE_ORDER: ContentType[] = ["post", "page", "media", "comment"];

function groupByContentType(
  results: AdminSearchResultData[],
): Map<ContentType, AdminSearchResultData[]> {
  const groups = new Map<ContentType, AdminSearchResultData[]>();

  for (const result of results) {
    const ct = result.contentType as ContentType;
    const existing = groups.get(ct);
    if (existing) {
      existing.push(result);
    } else {
      groups.set(ct, [result]);
    }
  }

  return groups;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AdminSearchOverlay({ isOpen, onClose }: AdminSearchOverlayProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const debouncedQuery = useDebounce(inputValue, 200);
  const shouldSearch = debouncedQuery.trim().length >= 2;

  // Convex query for admin search
  const searchData = useQuery(
    api.search.queries.adminSearch,
    shouldSearch ? { q: debouncedQuery, perPage: 20 } : "skip",
  );

  const results: AdminSearchResultData[] = searchData?.results ?? [];
  const grouped = groupByContentType(results);
  const isLoading = shouldSearch && searchData === undefined;

  // Build a flat list of results for keyboard navigation
  const flatResults = React.useMemo(() => {
    const flat: AdminSearchResultData[] = [];
    for (const ct of CONTENT_TYPE_ORDER) {
      const items = grouped.get(ct);
      if (items) {
        flat.push(...items);
      }
    }
    return flat;
  }, [grouped]);

  // Reset active index when results change (inline during render, no useEffect)
  const prevResultsLengthRef = React.useRef(flatResults.length);
  if (prevResultsLengthRef.current !== flatResults.length) {
    prevResultsLengthRef.current = flatResults.length;
    setActiveIndex(0);
  }

  // Focus input when opened
  React.useEffect(() => {
    if (isOpen) {
      setInputValue("");
      setActiveIndex(0);
      // Small delay to ensure the overlay is rendered
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < flatResults.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : flatResults.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (flatResults[activeIndex]) {
            const result = flatResults[activeIndex];
            // Navigate to the edit page
            let editUrl: string;
            switch (result.contentType) {
              case "post":
                editUrl = `/admin/posts/${result.contentId}/edit`;
                break;
              case "page":
                editUrl = `/admin/pages/${result.contentId}/edit`;
                break;
              case "media":
                editUrl = `/admin/media/${result.contentId}`;
                break;
              case "comment":
                editUrl = `/admin/comments`;
                break;
              default:
                editUrl = `/admin`;
            }
            navigate({ to: editUrl });
            onClose();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatResults, activeIndex, navigate, onClose],
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Overlay panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search admin content"
        className={cn(
          "fixed left-1/2 top-[20%] z-50 w-full max-w-xl -translate-x-1/2",
          "rounded-lg border border-border bg-background shadow-lg",
          "animate-in fade-in slide-in-from-top-2 duration-200",
        )}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            id="admin-search-query"
            name="adminSearch"
            type="text"
            placeholder="Search everything..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
            aria-label="Search query"
            autoComplete="off"
          />
          {isLoading && (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close search"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Results Area */}
        <div className="max-h-80 overflow-y-auto p-2">
          {!shouldSearch && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Type at least 2 characters to search...
            </div>
          )}

          {shouldSearch && !isLoading && flatResults.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No results found for &ldquo;{debouncedQuery}&rdquo;
            </div>
          )}

          {shouldSearch && flatResults.length > 0 && (
            <div className="flex flex-col gap-1">
              {CONTENT_TYPE_ORDER.map((ct) => {
                const items = grouped.get(ct);
                if (!items || items.length === 0) return null;

                return (
                  <div key={ct}>
                    {/* Group header */}
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {CONTENT_TYPE_LABELS[ct]}
                      </span>
                      <span className="inline-flex size-4 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground">
                        {items.length}
                      </span>
                    </div>

                    {/* Group items */}
                    {items.map((result) => {
                      const flatIndex = flatResults.indexOf(result);
                      return (
                        <AdminSearchResult
                          key={`${result.contentType}:${result.contentId}`}
                          result={result}
                          isActive={flatIndex === activeIndex}
                          onSelect={onClose}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px]">
                &uarr;&darr;
              </kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px]">
                Enter
              </kbd>{" "}
              Open
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[9px]">
                Esc
              </kbd>{" "}
              Close
            </span>
          </div>
          {searchData && (
            <span>
              {searchData.total} result{searchData.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
