import { useCallback, useMemo, useState } from "react";

import type { BulkSelectionState } from "@/types/list-table";

interface UseBulkSelectionOptions {
  /** IDs of all visible rows. */
  rowIds: string[];
}

interface UseBulkSelectionReturn {
  /** Current selection state. */
  state: BulkSelectionState;
  /** Toggle a single row. */
  toggleRow: (id: string) => void;
  /** Toggle all visible rows (select all / deselect all). */
  toggleAll: () => void;
  /** Clear all selections. */
  clearSelection: () => void;
  /** Check if a specific row is selected. */
  isSelected: (id: string) => boolean;
}

/**
 * Manages checkbox selection state for bulk actions.
 * Handles select-all, individual toggle, and clearing.
 *
 * Selection persists across pages (WordPress behavior) --
 * selected IDs that are no longer visible remain selected.
 */
export function useBulkSelection({
  rowIds,
}: UseBulkSelectionOptions): UseBulkSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allVisibleSelected = rowIds.every((id) => prev.has(id));
      if (allVisibleSelected) {
        // Deselect all visible rows
        const next = new Set(prev);
        for (const id of rowIds) {
          next.delete(id);
        }
        return next;
      }
      // Select all visible rows
      const next = new Set(prev);
      for (const id of rowIds) {
        next.add(id);
      }
      return next;
    });
  }, [rowIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  const state = useMemo<BulkSelectionState>(() => {
    const visibleSelectedCount = rowIds.filter((id) =>
      selectedIds.has(id),
    ).length;
    const isAllSelected =
      rowIds.length > 0 && visibleSelectedCount === rowIds.length;
    const isIndeterminate =
      visibleSelectedCount > 0 && visibleSelectedCount < rowIds.length;

    return {
      selectedIds,
      isAllSelected,
      isIndeterminate,
      count: selectedIds.size,
    };
  }, [selectedIds, rowIds]);

  return {
    state,
    toggleRow,
    toggleAll,
    clearSelection,
    isSelected,
  };
}
