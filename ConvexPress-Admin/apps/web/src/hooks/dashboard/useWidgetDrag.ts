/**
 * Dashboard System - Widget Drag & Drop Hook
 *
 * Manages HTML5 drag-and-drop state for reordering widgets.
 * No external libraries required for v1 - uses native DnD API.
 *
 * Supports:
 *   - Dragging widgets within the same column (reorder)
 *   - Dragging widgets between columns (move)
 *   - Visual drop indicators
 */

import { useCallback, useRef, useState } from "react";

interface DragState {
  /** Widget ID being dragged. */
  draggedId: string | null;
  /** Column the dragged widget originated from. */
  sourceColumn: "primary" | "secondary" | null;
  /** Column currently being hovered over. */
  overColumn: "primary" | "secondary" | null;
  /** Index position within the target column for drop indicator. */
  overIndex: number | null;
}

interface UseWidgetDragOptions {
  /** Current widget order. */
  widgetOrder: { primary: string[]; secondary: string[] };
  /** Callback when a widget is dropped in a new position. */
  onReorder: (newOrder: { primary: string[]; secondary: string[] }) => void;
}

const INITIAL_STATE: DragState = {
  draggedId: null,
  sourceColumn: null,
  overColumn: null,
  overIndex: null,
};

/**
 * Hook for widget drag-and-drop reordering.
 *
 * Returns handlers to spread on draggable widgets and drop zones.
 */
export function useWidgetDrag({ widgetOrder, onReorder }: UseWidgetDragOptions) {
  const [dragState, setDragState] = useState<DragState>(INITIAL_STATE);
  const dragCounterRef = useRef(0);

  // ── Drag Start ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (widgetId: string, column: "primary" | "secondary") => {
      setDragState({
        draggedId: widgetId,
        sourceColumn: column,
        overColumn: null,
        overIndex: null,
      });
    },
    [],
  );

  // ── Drag Over (column level) ────────────────────────────────────────────

  const handleDragOverColumn = useCallback(
    (
      e: React.DragEvent,
      column: "primary" | "secondary",
      index: number,
    ) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragState((prev) => ({
        ...prev,
        overColumn: column,
        overIndex: index,
      }));
    },
    [],
  );

  // ── Drag Enter ──────────────────────────────────────────────────────────

  const handleDragEnterColumn = useCallback(
    (column: "primary" | "secondary") => {
      dragCounterRef.current += 1;
      setDragState((prev) => ({ ...prev, overColumn: column }));
    },
    [],
  );

  // ── Drag Leave ──────────────────────────────────────────────────────────

  const handleDragLeaveColumn = useCallback(() => {
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setDragState((prev) => ({
        ...prev,
        overColumn: null,
        overIndex: null,
      }));
    }
  }, []);

  // ── Drop ────────────────────────────────────────────────────────────────

  const handleDrop = useCallback(
    (targetColumn: "primary" | "secondary", targetIndex: number) => {
      const { draggedId, sourceColumn } = dragState;
      if (!draggedId || !sourceColumn) {
        setDragState(INITIAL_STATE);
        return;
      }

      const newOrder = {
        primary: [...widgetOrder.primary],
        secondary: [...widgetOrder.secondary],
      };

      // Remove from source column
      const sourceList = newOrder[sourceColumn];
      const fromIndex = sourceList.indexOf(draggedId);
      if (fromIndex !== -1) {
        sourceList.splice(fromIndex, 1);
      }

      // Insert into target column
      const targetList = newOrder[targetColumn];
      // Adjust index if moving within the same column and dropping after original position
      const adjustedIndex =
        sourceColumn === targetColumn && fromIndex < targetIndex
          ? targetIndex - 1
          : targetIndex;

      targetList.splice(
        Math.min(adjustedIndex, targetList.length),
        0,
        draggedId,
      );

      onReorder(newOrder);
      setDragState(INITIAL_STATE);
      dragCounterRef.current = 0;
    },
    [dragState, widgetOrder, onReorder],
  );

  // ── Drag End (cleanup) ──────────────────────────────────────────────────

  const handleDragEnd = useCallback(() => {
    setDragState(INITIAL_STATE);
    dragCounterRef.current = 0;
  }, []);

  return {
    dragState,
    handleDragStart,
    handleDragOverColumn,
    handleDragEnterColumn,
    handleDragLeaveColumn,
    handleDrop,
    handleDragEnd,
    isDragging: dragState.draggedId !== null,
  };
}
