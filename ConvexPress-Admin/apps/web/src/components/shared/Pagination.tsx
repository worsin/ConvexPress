import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PaginationProps {
  /** Total number of items across all pages. */
  total: number;
  /** Current page (1-based). */
  page: number;
  /** Items per page. */
  perPage: number;
  /** Total pages. */
  totalPages: number;
  /** Page change handler. */
  onPageChange: (page: number) => void;
  /** Per-page change handler. */
  onPerPageChange: (perPage: number) => void;
  /** Per-page options. */
  perPageOptions: number[];
  /** Entity name plural for display. */
  entityNamePlural: string;
}

/**
 * WordPress-style pagination with total count, page navigation, and per-page selector.
 *
 * Rendering: 42 items | [<<] [<] Page [1] of 3 [>] [>>] | [20 v] items per page
 */
export function Pagination({
  total,
  page,
  perPage,
  totalPages,
  onPageChange,
  onPerPageChange,
  perPageOptions,
  entityNamePlural,
}: PaginationProps) {
  const [pageInput, setPageInput] = useState(String(page));
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync page input when page changes externally (unless user is typing)
  useEffect(() => {
    if (inputRef.current !== document.activeElement) {
      setPageInput(String(page));
    }
  }, [page]);

  const handlePageInputSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const parsed = parseInt(pageInput, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= totalPages) {
        onPageChange(parsed);
      } else {
        setPageInput(String(page));
      }
    },
    [pageInput, totalPages, onPageChange, page],
  );

  const handlePageInputBlur = useCallback(() => {
    const parsed = parseInt(pageInput, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > totalPages) {
      setPageInput(String(page));
    } else if (parsed !== page) {
      onPageChange(parsed);
    }
  }, [pageInput, totalPages, page, onPageChange]);

  // Hidden when total is 0
  if (total === 0) return null;

  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground"
    >
      {/* Total count */}
      <span>
        {total} {total === 1 ? entityNamePlural.replace(/s$/, "") : entityNamePlural}
      </span>

      {/* Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onPageChange(1)}
            disabled={isFirstPage}
            aria-label="First page"
          >
            <ChevronsLeftIcon className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onPageChange(page - 1)}
            disabled={isFirstPage}
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="size-3.5" aria-hidden="true" />
          </Button>

          <form
            onSubmit={handlePageInputSubmit}
            className="flex items-center gap-1"
          >
            <span>Page</span>
            <input
              ref={inputRef}
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={handlePageInputBlur}
              aria-label="Current page"
              className="h-6 w-10 rounded-none border border-input bg-transparent px-1 text-center text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            />
            <span>of {totalPages}</span>
          </form>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onPageChange(page + 1)}
            disabled={isLastPage}
            aria-label="Next page"
          >
            <ChevronRightIcon className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onPageChange(totalPages)}
            disabled={isLastPage}
            aria-label="Last page"
          >
            <ChevronsRightIcon className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* Per-page selector */}
      <div className="flex items-center gap-1.5">
        <Select
          value={perPage}
          onValueChange={(val) => onPerPageChange(Number(val))}
        >
          <SelectTrigger
            size="sm"
            aria-label="Items per page"
            className="h-6 min-w-[50px] rounded-none border border-input bg-transparent px-1 text-xs text-foreground"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            {perPageOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>items per page</span>
      </div>
    </nav>
  );
}
