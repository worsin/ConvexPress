/**
 * Dashboard System - Widget Grid
 *
 * Two-column (desktop) / single-column (mobile) grid container.
 * Renders widgets based on user preferences (order, visibility, collapse state).
 * Filters widgets by user capabilities and, for standalone-only widgets, by
 * whether the control shell is present.
 *
 * Supports drag-and-drop reordering via native HTML5 DnD API.
 */

import { useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { WIDGET_REGISTRY, getWidgetById } from "@/lib/dashboard/widget-registry";
import type { WidgetPreferences } from "@/lib/dashboard/types";
import { useControlShell } from "@/control/ControlShellContext";
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
  const standalone = useControlShell() !== null;

  // ── Capability filtering ────────────────────────────────────────────────

  const visibleWidgetIds = useMemo(() => {
    return new Set(
      WIDGET_REGISTRY.filter((widget) => {
        if (prefs.hiddenWidgets.includes(widget.id)) return false;
        if (widget.standaloneOnly && !standalone) return false;
        if (
          widget.minCapability &&
          !userCapabilities.includes(widget.minCapability)
        )
          return false;
        return true;
      }).map((w) => w.id),
    );
  }, [prefs.hiddenWidgets, userCapabilities, standalone]);

  // ── Ordered widget IDs per column ───────────────────────────────────────
  // Widgets registered after a user's preferences were saved are appended to
  // their default column so new capabilities never silently disappear.

  const primaryWidgets = useMemo(() => {
    const ordered = prefs.widgetOrder.primary.filter((id) => visibleWidgetIds.has(id));
    const known = new Set([...prefs.widgetOrder.primary, ...prefs.widgetOrder.secondary]);
    for (const widget of WIDGET_REGISTRY) {
      if (widget.defaultColumn === "primary" && !known.has(widget.id) && visibleWidgetIds.has(widget.id)) {
        ordered.push(widget.id);
      }
    }
    return ordered;
  }, [prefs.widgetOrder, visibleWidgetIds]);

  const secondaryWidgets = useMemo(() => {
    const ordered = prefs.widgetOrder.secondary.filter((id) => visibleWidgetIds.has(id));
    const known = new Set([...prefs.widgetOrder.primary, ...prefs.widgetOrder.secondary]);
    for (const widget of WIDGET_REGISTRY) {
      if (widget.defaultColumn === "secondary" && !known.has(widget.id) && visibleWidgetIds.has(widget.id)) {
        ordered.push(widget.id);
      }
    }
    return ordered;
  }, [prefs.widgetOrder, visibleWidgetIds]);

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
          "flex min-h-[100px] flex-col gap-3.5 rounded-xl",
          isDragging &&
            dragState.overColumn === column &&
            "outline-2 outline-dashed outline-line-strong",
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
                  <div className="-mb-0.5 h-0.5 rounded bg-primary/60" />
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
            className="rounded-xl border-2 border-dashed border-line-strong p-8 text-center text-[12.5px] text-muted-foreground"
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
    <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      {/* Primary column (left, wider) */}
      {renderColumn("primary", primaryWidgets)}

      {/* Secondary column (right, narrower) */}
      {renderColumn("secondary", secondaryWidgets)}
    </div>
  );
}
