import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { useBulkSelection } from "@/hooks/useBulkSelection";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import type {
  BulkSelectionState,
  ColumnDef,
  ListTableConfig,
  ListTablePaginationState,
  ListTableSortState,
  PaginatedResult,
  ScreenOptionsState,
  StatusTab,
} from "@/types/list-table";

interface UseListTableOptions<TRow> {
  /** The list table configuration. */
  config: ListTableConfig<TRow>;
  /** Convex query result for the list. undefined = loading. */
  data: PaginatedResult<TRow> | undefined;
  /** Convex query result for status counts. undefined = loading. */
  counts: Record<string, number> | undefined;
}

interface UseListTableReturn<TRow> {
  // --- State ---
  /** Parsed filter/sort/pagination state from URL. */
  sort: ListTableSortState;
  pagination: ListTablePaginationState;
  search: string;
  activeStatus: string | undefined;
  /** Visible columns (filtered by Screen Options). */
  visibleColumns: ColumnDef<TRow>[];
  /** Screen options state (persisted to localStorage). */
  screenOptions: ScreenOptionsState;
  /** Status tabs with live counts merged. */
  statusTabs: StatusTab[];
  /** Whether data is loading (data === undefined). */
  isLoading: boolean;
  /** Rows from query result. */
  rows: TRow[];
  /** Total items count. */
  total: number;
  /** Total pages. */
  totalPages: number;

  // --- Updaters (write to URL) ---
  setSort: (sort: ListTableSortState) => void;
  setPage: (page: number) => void;
  setPerPage: (perPage: number) => void;
  setSearch: (search: string) => void;
  setStatus: (status: string | undefined) => void;
  setScreenOptions: (options: ScreenOptionsState) => void;

  // --- Bulk Selection ---
  selection: BulkSelectionState;
  toggleRow: (id: string) => void;
  toggleAll: () => void;
  clearSelection: () => void;
  selectedRows: TRow[];
}

/**
 * Central hook for list table pages. Parses URL search params into
 * filter/sort/pagination state and provides updater functions that
 * write back to the URL via TanStack Router's navigate().
 */
export function useListTable<TRow>(
  options: UseListTableOptions<TRow>,
): UseListTableReturn<TRow> {
  const { config, data, counts } = options;
  const navigate = useNavigate();

  // Read URL search params (generic -- works with any validated search schema)
  const searchParams = useSearch({ strict: false }) as Record<
    string,
    string | number | undefined
  >;

  // --- Parse state from URL ---

  const sort: ListTableSortState = useMemo(
    () => ({
      orderBy:
        (searchParams.orderBy as string) || config.defaultSort.orderBy,
      orderDir:
        (searchParams.orderDir as "asc" | "desc") ||
        config.defaultSort.orderDir,
    }),
    [searchParams.orderBy, searchParams.orderDir, config.defaultSort],
  );

  const activeStatus = searchParams.status as string | undefined;
  const searchValue = (searchParams.search as string) || "";

  // --- Screen Options ---

  const { state: screenOptions, setState: setScreenOptions } =
    useScreenOptions({
      storageKey: config.storageKey,
      columns: config.columns,
      defaultPerPage: config.defaultPerPage,
    });

  const pagination: ListTablePaginationState = useMemo(
    () => ({
      page: (searchParams.page as number) || 1,
      perPage: (searchParams.perPage as number) || screenOptions.perPage,
    }),
    [searchParams.page, searchParams.perPage, screenOptions.perPage],
  );

  // --- Visible Columns ---

  const visibleColumns = useMemo(
    () =>
      config.columns.filter((col) => {
        // Non-hideable columns are always visible
        if (col.hideable === false) return true;
        return screenOptions.visibleColumns[col.key] !== false;
      }),
    [config.columns, screenOptions.visibleColumns],
  );

  // --- Status Tabs with Counts ---

  const statusTabs = useMemo<StatusTab[]>(
    () =>
      config.statusTabs.map((tab) => ({
        ...tab,
        count: counts ? counts[tab.key] : undefined,
      })),
    [config.statusTabs, counts],
  );

  // --- Data ---

  const isLoading = data === undefined;
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  // --- Bulk Selection ---

  const rowIds = useMemo(
    () => rows.map((row) => config.getRowId(row)),
    [rows, config],
  );

  const {
    state: selection,
    toggleRow,
    toggleAll,
    clearSelection,
    isSelected,
  } = useBulkSelection({ rowIds });

  const selectedRows = useMemo(
    () => rows.filter((row) => isSelected(config.getRowId(row))),
    [rows, isSelected, config],
  );

  // --- URL Updaters ---

  const updateSearch = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      const searchUpdater = (prev: Record<string, unknown>) => {
        const next = { ...prev, ...updates };
        // Remove undefined/empty values from search params
        for (const key of Object.keys(next)) {
          if (
            next[key] === undefined ||
            next[key] === "" ||
            next[key] === null
          ) {
            delete next[key];
          }
        }
        return next;
      };

      navigate({
        search: searchUpdater as never,
        replace: true,
      });
    },
    [navigate],
  );

  const setSort = useCallback(
    (newSort: ListTableSortState) => {
      updateSearch({
        orderBy: newSort.orderBy,
        orderDir: newSort.orderDir,
      });
    },
    [updateSearch],
  );

  const setPage = useCallback(
    (page: number) => {
      updateSearch({ page: page === 1 ? undefined : page });
    },
    [updateSearch],
  );

  const setPerPage = useCallback(
    (perPage: number) => {
      // Reset to page 1 when changing items per page
      updateSearch({ perPage, page: undefined });
      // Also persist in screen options
      setScreenOptions({ ...screenOptions, perPage });
    },
    [updateSearch, screenOptions, setScreenOptions],
  );

  const setSearchValue = useCallback(
    (search: string) => {
      // Reset to page 1 when search changes
      updateSearch({ search: search || undefined, page: undefined });
    },
    [updateSearch],
  );

  const setStatus = useCallback(
    (status: string | undefined) => {
      // Reset page and clear search when changing status tab
      updateSearch({
        status: status || undefined,
        page: undefined,
        search: undefined,
      });
      clearSelection();
    },
    [updateSearch, clearSelection],
  );

  return {
    // State
    sort,
    pagination,
    search: searchValue,
    activeStatus,
    visibleColumns,
    screenOptions,
    statusTabs,
    isLoading,
    rows,
    total,
    totalPages,

    // Updaters
    setSort,
    setPage,
    setPerPage,
    setSearch: setSearchValue,
    setStatus,
    setScreenOptions,

    // Bulk Selection
    selection,
    toggleRow,
    toggleAll,
    clearSelection,
    selectedRows,
  };
}
