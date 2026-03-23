/**
 * Admin List Table UI - Shared TypeScript Types
 *
 * These types define the contract for all list table pages in the admin.
 * Every entity page (Posts, Pages, Comments, Users, Media, etc.) composes
 * these shared types with entity-specific column definitions and data shapes.
 */

import type * as React from "react";

// --- Column Definition ---

export type SortDirection = "asc" | "desc";

export interface ColumnDef<TRow> {
  /** Unique key for this column. Used in URL params and localStorage. */
  key: string;
  /** Display label in the column header. */
  label: string;
  /** Whether this column supports sorting. */
  sortable?: boolean;
  /** Default sort direction when first clicked. Default: "asc". */
  defaultSortDir?: SortDirection;
  /** Whether this column is visible by default. Default: true. */
  defaultVisible?: boolean;
  /** Whether this column can be hidden via Screen Options. Default: true. */
  hideable?: boolean;
  /** Tailwind width class (e.g., "w-[40%]", "w-32", "min-w-48"). */
  width?: string;
  /** Column header alignment. Default: "left". */
  align?: "left" | "center" | "right";
  /** Render function for cell content. */
  render: (row: TRow, index: number) => React.ReactNode;
  /** Optional render for the column header (overrides default label). */
  renderHeader?: () => React.ReactNode;
}

// --- Filter & Sort State ---

export interface ListTableSortState {
  /** Column key to sort by. */
  orderBy: string;
  /** Sort direction. */
  orderDir: SortDirection;
}

export interface ListTablePaginationState {
  /** Current page (1-based). */
  page: number;
  /** Items per page. */
  perPage: number;
}

export interface ListTableSearchState {
  /** Current search query (debounced). */
  search: string;
}

/** Combined URL search params state for any list table. */
export interface ListTableSearchParams {
  /** Active status tab filter (entity-specific). */
  status?: string;
  /** Search query. */
  search?: string;
  /** Sort column key. */
  orderBy?: string;
  /** Sort direction. */
  orderDir?: SortDirection;
  /** Current page (1-based). */
  page?: number;
  /** Items per page. */
  perPage?: number;
  /** Entity-specific extra filters (e.g., authorId, categoryId, dateRange). */
  [key: string]: string | number | undefined;
}

// --- Status Tab ---

export interface StatusTab {
  /** Unique key matching a status value (e.g., "publish", "draft", "trash"). */
  key: string;
  /** Display label (e.g., "Published", "Drafts", "Trash"). */
  label: string;
  /** Live count from Convex query. undefined = still loading. */
  count?: number;
}

// --- Bulk Action ---

export interface BulkAction {
  /** Unique key (e.g., "trash", "delete", "publish"). */
  key: string;
  /** Display label (e.g., "Move to Trash", "Delete Permanently"). */
  label: string;
  /** Whether this action requires a confirmation dialog. */
  requiresConfirmation?: boolean;
  /** Confirmation dialog message. */
  confirmMessage?: string;
  /** Whether this action is destructive (affects styling). */
  destructive?: boolean;
  /** Required capability to see this action. Checked against current user role. */
  capability?: string;
  /** Only show this action when a specific status tab is active. */
  visibleOnStatus?: string[];
}

// --- Row Action ---

export interface RowAction<TRow> {
  /** Unique key (e.g., "edit", "quick-edit", "trash", "view"). */
  key: string;
  /** Display label. */
  label: string;
  /** Action type: "link" navigates, "button" calls a handler. */
  type: "link" | "button";
  /** For "link" type: generates the href from the row data. */
  href?: (row: TRow) => string;
  /** For "button" type: click handler. */
  onClick?: (row: TRow) => void;
  /** Whether this action is destructive (red text). */
  destructive?: boolean;
  /** Required capability. */
  capability?: string;
  /** Condition to show this action (e.g., only show "Restore" for trashed items). */
  visible?: (row: TRow) => boolean;
  /** Separator before this action (visual pipe character). */
  separator?: boolean;
}

// --- List Table Config ---

export interface ListTableConfig<TRow> {
  /** Entity name for display (e.g., "post", "page", "user"). */
  entityName: string;
  /** Plural entity name (e.g., "posts", "pages", "users"). */
  entityNamePlural: string;
  /** localStorage key prefix for screen options persistence. */
  storageKey: string;
  /** Column definitions. */
  columns: ColumnDef<TRow>[];
  /** Status tabs. */
  statusTabs: StatusTab[];
  /** Available bulk actions. */
  bulkActions: BulkAction[];
  /** Row-level actions (shown on hover). */
  rowActions: RowAction<TRow>[];
  /** Default sort state. */
  defaultSort: ListTableSortState;
  /** Default items per page. */
  defaultPerPage: number;
  /** Items per page options for the dropdown. */
  perPageOptions: number[];
  /** Row key extractor (returns unique ID). */
  getRowId: (row: TRow) => string;
  /** Optional: Primary column key (the column that shows row actions on hover). Default: first column after checkbox. */
  primaryColumn?: string;
  /** Optional: Whether to show the checkbox column. Default: true. */
  showCheckboxes?: boolean;
  /** Optional: Empty state content per status tab. */
  emptyStates?: Record<
    string,
    { title: string; description: string; action?: React.ReactNode }
  >;
}

// --- Paginated Result (matches Convex query return shape) ---

export interface PaginatedResult<TRow> {
  items: TRow[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// --- Screen Options ---

export interface ScreenOptionsState {
  /** Map of column key -> visibility boolean. */
  visibleColumns: Record<string, boolean>;
  /** Items per page setting. */
  perPage: number;
}

// --- Bulk Selection ---

export interface BulkSelectionState {
  /** Set of selected row IDs. */
  selectedIds: Set<string>;
  /** Whether all visible rows are selected. */
  isAllSelected: boolean;
  /** Whether some (but not all) visible rows are selected (indeterminate checkbox). */
  isIndeterminate: boolean;
  /** Number of selected items. */
  count: number;
}
