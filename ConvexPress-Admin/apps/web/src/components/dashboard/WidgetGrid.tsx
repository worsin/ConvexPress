/**
 * Dashboard System - Widget Grid
 *
 * Two-column (desktop) / single-column (mobile) grid container.
 * Renders widgets based on user preferences (order, visibility, collapse state).
 * Filters widgets by user capabilities.
 *
 * Supports drag-and-drop reordering via native HTML5 DnD API.
 */

import { useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { WIDGET_REGISTRY, getWidgetById } from "@/lib/dashboard/widget-registry";
import type { WidgetPreferences } from "@/lib/dashboard/types";
import { WidgetCard } from "./WidgetCard";
import { useWidgetDrag } from "@/hooks/dashboard/useWidgetDrag";

interface WidgetGridProps {
  /** User's widget preferences. */
  prefs: WidgetPreferences;
  /** User's capabilities for filtering widgets. */
  userCapabilities: string[];
  /** Toggle collapsed state for a widget. */
  onToggleCollapse: (widgetId: string) => void;
  /** Reorder widgets callback. */
  onReorder: (widgetOrder: { primary: string[]; secondary: string[] }) => void;
}

export function WidgetGrid({
  prefs,
  userCapabilities,
  onToggleCollapse,
  onReorder,
}: WidgetGridProps) {
  // ── Capability filtering ────────────────────────────────────────────────

  const visibleWidgetIds = useMemo(() => {
    return new Set(
      WIDGET_REGISTRY.filter((widget) => {
        // Skip hidden widgets
        if (prefs.hiddenWidgets.includes(widget.id)) return false;
        // Skip widgets the user doesn't have capability for
        if (
          widget.minCapability &&
          !userCapabilities.includes(widget.minCapability)
        )
          return false;
        return true;
      }).map((w) => w.id),
    );
  }, [prefs.hiddenWidgets, userCapabilities]);

  // ── Ordered widget IDs per column ───────────────────────────────────────

  const primaryWidgets = useMemo(
    () => prefs.widgetOrder.primary.filter((id) => visibleWidgetIds.has(id)),
    [prefs.widgetOrder.primary, visibleWidgetIds],
  );

  const secondaryWidgets = useMemo(
    () => prefs.widgetOrder.secondary.filter((id) => visibleWidgetIds.has(id)),
    [prefs.widgetOrder.secondary, visibleWidgetIds],
  );

  // ── Drag and drop ──────────────────────────────────────────────────────

  const { dragState, handleDragStart, handleDragOverColumn, handleDrop, handleDragEnd, isDragging } =
    useWidgetDrag({
      widgetOrder: { primary: primaryWidgets, secondary: secondaryWidgets },
      onReorder,
    });

  // ── Render column ───────────────────────────────────────────────────────

  const renderColumn = useCallback(
    (column: "primary" | "secondary", widgetIds: string[]) => (
      <div
        className={cn(
          "flex flex-col gap-4 min-h-[100px]",
          isDragging &&
            dragState.overColumn === column &&
            "outline outline-2 outline-dashed outline-muted-foreground/20",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={() => handleDrop(column, widgetIds.length)}
      >
        {widgetIds.map((widgetId, index) => {
          const widget = getWidgetById(widgetId);
          if (!widget) return null;

          const Component = widget.component;

          return (
            <div
              key={widgetId}
              onDragOver={(e) => handleDragOverColumn(e, column, index)}
              onDrop={(e) => {
                e.stopPropagation();
                handleDrop(column, index);
              }}
            >
              {/* Drop indicator above */}
              {isDragging &&
                dragState.overColumn === column &&
                dragState.overIndex === index && (
                  <div className="h-0.5 bg-primary/50 -mb-0.5" />
                )}

              <WidgetCard
                id={widgetId}
                title={widget.title}
                isCollapsed={prefs.collapsedWidgets.includes(widgetId)}
                onToggleCollapse={() => onToggleCollapse(widgetId)}
                column={column}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                isDragging={dragState.draggedId === widgetId}
              >
                <Component />
              </WidgetCard>
            </div>
          );
        })}

        {/* Drop zone at end of column */}
        {isDragging && widgetIds.length === 0 && (
          <div
            className="border-2 border-dashed border-muted-foreground/20 p-8 text-center text-xs text-muted-foreground"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.stopPropagation();
              handleDrop(column, 0);
            }}
          >
            Drop widget here
          </div>
        )}
      </div>
    ),
    [
      prefs.collapsedWidgets,
      onToggleCollapse,
      dragState,
      isDragging,
      handleDragStart,
      handleDragEnd,
      handleDragOverColumn,
      handleDrop,
    ],
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
      {/* Primary column (left, wider) */}
      {renderColumn("primary", primaryWidgets)}

      {/* Secondary column (right, narrower) */}
      {renderColumn("secondary", secondaryWidgets)}
    </div>
  );
}
