import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CommentPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Current sort order: "asc" (oldest first) or "desc" (newest first). Defaults to "asc". */
  order?: "asc" | "desc";
}

/**
 * Comment pagination with directional labels that respect current sort order.
 *
 * When order is "asc" (oldest first, default):
 *   - Previous page = Newer Comments, Next page = Older Comments
 * When order is "desc" (newest first):
 *   - Previous page = Older Comments, Next page = Newer Comments
 */
export function CommentPagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
  order = "asc",
}: CommentPaginationProps) {
  if (totalPages <= 1) return null;

  // When ascending (oldest first): going backward = newer, going forward = older
  // When descending (newest first): going backward = older, going forward = newer
  const prevLabel = order === "asc" ? "Newer Comments" : "Older Comments";
  const nextLabel = order === "asc" ? "Older Comments" : "Newer Comments";

  return (
    <div
      data-slot="comment-pagination"
      className={cn("flex items-center justify-center gap-2", className)}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
      >
        {prevLabel}
      </Button>
      <span className="text-xs text-muted-foreground">
        Page {currentPage} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
      >
        {nextLabel}
      </Button>
    </div>
  );
}
