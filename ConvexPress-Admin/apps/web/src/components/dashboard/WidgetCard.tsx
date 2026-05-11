/**
 * Dashboard System - Widget Card
 *
 * Generic widget wrapper used by all dashboard widgets.
 * Provides:
 *   - Header with title and collapse toggle
 *   - Collapsible body using Base UI Collapsible
 *   - Drag handle for reordering
 *   - Consistent WordPress-style widget box styling
 *
 * This is a presentational component. State is managed by parent (WidgetGrid).
 */

import { Suspense, useCallback } from "react";
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronUpIcon, GripVerticalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface WidgetCardProps {
  /** Unique widget ID. */
  id: string;
  /** Widget title displayed in the header. */
  title: string;
  /** Whether the widget body is collapsed. */
  isCollapsed: boolean;
  /** Toggle collapsed state. */
  onToggleCollapse: () => void;
  /** The widget body content. */
  children: React.ReactNode;
  /** Column this widget is in (for drag). */
  column: "primary" | "secondary";
  /** Drag start handler. */
  onDragStart?: (widgetId: string, column: "primary" | "secondary") => void;
  /** Drag end handler. */
  onDragEnd?: () => void;
  /** Whether another widget is being dragged. */
  isDragging?: boolean;
}

function WidgetCardSkeleton() {
  return (
    <div className="p-4 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function WidgetCard({
  id,
  title,
  isCollapsed,
  onToggleCollapse,
  children,
  column,
  onDragStart,
  onDragEnd,
  isDragging,
}: WidgetCardProps) {
  const handleDragStartEvent = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
      onDragStart?.(id, column);
    },
    [id, column, onDragStart],
  );

  return (
    <CollapsiblePrimitive.Root open={!isCollapsed}>
      <div
        className={cn(
          "border border-border bg-card",
          isDragging && "opacity-50",
        )}
      >
        {/* Widget Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            {/* Drag Handle */}
            <div
              draggable
              onDragStart={handleDragStartEvent}
              onDragEnd={onDragEnd}
              className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
              title="Drag to reorder"
            >
              <GripVerticalIcon className="size-3.5" />
            </div>

            <h3 className="text-xs font-semibold text-foreground">{title}</h3>
          </div>

          {/* Collapse Toggle */}
          <CollapsiblePrimitive.Trigger
            onClick={onToggleCollapse}
            className="flex items-center justify-center size-5 text-muted-foreground hover:text-foreground transition-colors"
            title={isCollapsed ? "Expand widget" : "Collapse widget"}
          >
            <ChevronUpIcon
              className={cn(
                "size-3.5 transition-transform",
                isCollapsed && "rotate-180",
              )}
            />
          </CollapsiblePrimitive.Trigger>
        </div>

        {/* Widget Body */}
        <CollapsiblePrimitive.Panel className="overflow-hidden data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0">
          <Suspense fallback={<WidgetCardSkeleton />}>
            {children}
          </Suspense>
        </CollapsiblePrimitive.Panel>
      </div>
    </CollapsiblePrimitive.Root>
  );
}
