/**
 * Dashboard System - Widget Card
 *
 * Generic widget wrapper used by all dashboard widgets.
 * Provides:
 *   - Header with title, optional action, and collapse toggle
 *   - Collapsible body using Base UI Collapsible
 *   - Drag handle for reordering
 *
 * This is a presentational component. State is managed by parent (WidgetGrid).
 */

import { Suspense, useCallback, type ReactNode } from "react";
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronUpIcon, GripVerticalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface WidgetCardProps {
  /** Unique widget ID. */
  id: string;
  /** Widget title displayed in the header. */
  title: string;
  /** Optional header action (link or button) rendered before the collapse toggle. */
  action?: ReactNode;
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
    <div className="space-y-2 px-[18px] py-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function WidgetCard({
  id,
  title,
  action,
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
      <section
        aria-labelledby={`widget-${id}-title`}
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-card shadow-soft",
          isDragging && "opacity-50",
        )}
      >
        {/* Widget Header */}
        <div className="flex items-center gap-2 px-[18px] pb-2.5 pt-3.5">
          <div
            draggable
            onDragStart={handleDragStartEvent}
            onDragEnd={onDragEnd}
            className="-ml-2 cursor-grab rounded-md p-1 text-muted-foreground/70 hover:text-foreground active:cursor-grabbing"
            title="Drag to reorder"
            aria-label={`Drag to reorder ${title}`}
          >
            <GripVerticalIcon className="size-3.5" aria-hidden="true" />
          </div>

          <h3
            id={`widget-${id}-title`}
            className="text-[15px] font-semibold tracking-[-0.005em] text-foreground"
          >
            {title}
          </h3>

          <div className="ml-auto flex items-center gap-2">
            {action}
            <CollapsiblePrimitive.Trigger
              onClick={onToggleCollapse}
              className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={isCollapsed ? "Expand widget" : "Collapse widget"}
              aria-label={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}
            >
              <ChevronUpIcon
                className={cn(
                  "size-3.5 transition-transform",
                  isCollapsed && "rotate-180",
                )}
                aria-hidden="true"
              />
            </CollapsiblePrimitive.Trigger>
          </div>
        </div>

        {/* Widget Body */}
        <CollapsiblePrimitive.Panel className="overflow-hidden data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0">
          <Suspense fallback={<WidgetCardSkeleton />}>{children}</Suspense>
        </CollapsiblePrimitive.Panel>
      </section>
    </CollapsiblePrimitive.Root>
  );
}
