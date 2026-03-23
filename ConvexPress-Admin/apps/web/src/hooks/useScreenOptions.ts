import { useCallback, useMemo, useState } from "react";

import type { ColumnDef, ScreenOptionsState } from "@/types/list-table";

/** Minimal column shape needed for screen options - only non-generic fields */
type ScreenOptionsColumn = Pick<ColumnDef<unknown>, "key" | "defaultVisible">;

interface UseScreenOptionsOptions {
  /** localStorage key. */
  storageKey: string;
  /** Column definitions (to derive defaults). */
  columns: ScreenOptionsColumn[];
  /** Default per-page value. */
  defaultPerPage: number;
}

interface UseScreenOptionsReturn {
  state: ScreenOptionsState;
  setState: (state: ScreenOptionsState) => void;
  resetDefaults: () => void;
}

/**
 * Reads/writes Screen Options state (column visibility, per-page) from localStorage.
 * On mount, reads from `localStorage.getItem(storageKey)`.
 * If nothing stored, derives defaults from column definitions.
 */
export function useScreenOptions({
  storageKey,
  columns,
  defaultPerPage,
}: UseScreenOptionsOptions): UseScreenOptionsReturn {
  const defaults = useMemo<ScreenOptionsState>(() => {
    const visibleColumns: Record<string, boolean> = {};
    for (const col of columns) {
      visibleColumns[col.key] = col.defaultVisible !== false;
    }
    return { visibleColumns, perPage: defaultPerPage };
  }, [columns, defaultPerPage]);

  const [state, setStateInternal] = useState<ScreenOptionsState>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ScreenOptionsState;
        // Merge with defaults so new columns get their default visibility
        const merged: ScreenOptionsState = {
          visibleColumns: { ...defaults.visibleColumns, ...parsed.visibleColumns },
          perPage: parsed.perPage || defaultPerPage,
        };
        return merged;
      }
    } catch {
      // Ignore invalid localStorage data
    }
    return defaults;
  });

  const setState = useCallback(
    (next: ScreenOptionsState) => {
      setStateInternal(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // localStorage full or unavailable
      }
    },
    [storageKey],
  );

  const resetDefaults = useCallback(() => {
    setStateInternal(defaults);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
  }, [defaults, storageKey]);

  return { state, setState, resetDefaults };
}
