/**
 * MetaboxContainer - Generic wrapper for all sidebar metaboxes
 *
 * Provides drag handle, collapse/expand toggle, title bar, and consistent styling.
 * Integrates with @dnd-kit useSortable for drag-and-drop reordering when isDraggable is true.
 */

import { useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetaboxContainerProps {
  /** Unique metabox ID */
  id: string;
  /** Display title in the header bar */
  title: string;
  /** Whether to show drag handle (false for Publish box) */
  isDraggable?: boolean;
  /** Controlled collapse state */
  isCollapsed?: boolean;
  /** Collapse toggle callback */
  onToggleCollapse?: () => void;
  /** Optional action buttons in the title bar */
  actions?: React.ReactNode;
  /** Metabox content */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

export function MetaboxContainer({
  id,
  title,
  isDraggable = true,
  isCollapsed = false,
  onToggleCollapse,
  actions,
  children,
  className,
}: MetaboxContainerProps) {
  const contentId = `metabox-content-${id}`;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const handleToggle = useCallback(() => {
    onToggleCollapse?.();
  }, [onToggleCollapse]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-slot="metabox"
      role="region"
      aria-label={title}
      className={cn("border border-border bg-card rounded-none", className)}
    >
      {/* Title bar */}
      <div className="flex items-center gap-1 bg-muted/50 px-3 py-2">
        {isDraggable && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing p-0.5 -ml-1 shrink-0"
            aria-roledescription="sortable"
            aria-label={`Reorder ${title}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={handleToggle}
          className="flex-1 flex items-center justify-between text-left min-w-0"
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground truncate">
            {title}
          </span>
          {isCollapsed ? (
            <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronUp className="size-3.5 text-muted-foreground shrink-0" />
          )}
        </button>

        {actions && (
          <div className="flex items-center gap-1 shrink-0">{actions}</div>
        )}
      </div>

      {/* Content */}
      <div
        id={contentId}
        className={cn(
          "px-3 py-3 transition-all",
          isCollapsed && "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
