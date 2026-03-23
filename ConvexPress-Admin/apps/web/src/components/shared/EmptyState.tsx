import { FileTextIcon, SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Heading text (e.g., "No posts found."). */
  title: string;
  /** Descriptive text (e.g., "Try adjusting your search or filters."). */
  description?: string;
  /** Optional action button (e.g., "Add New Post" link). */
  action?: React.ReactNode;
  /** Optional icon. Default: search icon for filtered results, document icon for empty collection. */
  icon?: React.ReactNode;
  /** Whether this empty state is a result of a search/filter (uses search icon). */
  isFiltered?: boolean;
  /** Number of columns to span (for use inside table body). */
  colSpan?: number;
  /** Additional className. */
  className?: string;
}

/**
 * Friendly empty state shown when the table has no data for the current filters.
 * Can be used standalone or within a table body via colSpan.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  isFiltered = false,
  colSpan,
  className,
}: EmptyStateProps) {
  const defaultIcon = isFiltered ? (
    <SearchIcon className="size-12 text-muted-foreground/50" aria-hidden="true" />
  ) : (
    <FileTextIcon className="size-12 text-muted-foreground/50" aria-hidden="true" />
  );

  const content = (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className,
      )}
    >
      {icon || defaultIcon}
      <h3 className="mt-4 text-sm font-medium text-muted-foreground">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground/70">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );

  if (colSpan) {
    return (
      <tr>
        <td colSpan={colSpan}>{content}</td>
      </tr>
    );
  }

  return content;
}
