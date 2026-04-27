import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { InlineActions } from "@/components/shared/InlineActions";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { cn } from "@/lib/utils";
import type {
  BulkSelectionState,
  ColumnDef,
  ListTableSortState,
  RowAction,
} from "@/types/list-table";

interface ListTableProps<TRow> {
  /** Column definitions (already filtered by visibility). */
  columns: ColumnDef<TRow>[];
  /** Row data from Convex query. */
  rows: TRow[];
  /** Current sort state. */
  sort: ListTableSortState;
  /** Sort change handler. */
  onSortChange: (sort: ListTableSortState) => void;
  /** Row key extractor. */
  getRowId: (row: TRow) => string;
  /** Bulk selection state. */
  selection: BulkSelectionState;
  /** Selection handlers. */
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  /** Row actions. */
  rowActions: RowAction<TRow>[];
  /** Primary column key (where row actions render). */
  primaryColumn: string;
  /** Whether checkboxes are shown. */
  showCheckboxes: boolean;
  /** Whether table is loading (show skeleton). */
  isLoading: boolean;
  /** Number of skeleton rows to show while loading. */
  skeletonRows?: number;
  /** Active Quick Edit row ID (only one at a time). */
  quickEditId?: string | null;
  /** Quick Edit form component. */
  quickEditRender?: (row: TRow, onClose: () => void) => React.ReactNode;
  /** Handler to close Quick Edit (sets quickEditId to null). */
  onQuickEditClose?: () => void;
  /** Empty state content. */
  emptyState?: React.ReactNode;
  /** Current user capabilities (passed to InlineActions). */
  userCapabilities?: string[];
  /** Extract a human-readable label from a row for accessible checkbox aria-labels. */
  getRowLabel?: (row: TRow) => string;
}

/**
 * Core list table component. Renders a <table> with header row and body rows.
 * Handles column visibility, sort state, and delegates cell rendering to column definitions.
 *
 * This is the visual backbone of every admin list page.
 */
export function ListTable<TRow>({
  columns,
  rows,
  sort,
  onSortChange,
  getRowId,
  selection,
  onToggleRow,
  onToggleAll,
  rowActions,
  primaryColumn,
  showCheckboxes,
  isLoading,
  skeletonRows = 5,
  quickEditId,
  quickEditRender,
  onQuickEditClose,
  emptyState,
  userCapabilities,
  getRowLabel,
}: ListTableProps<TRow>) {
  const totalColumns = columns.length + (showCheckboxes ? 1 : 0);

  const handleSort = (columnKey: string, defaultDir: "asc" | "desc" = "asc") => {
    if (sort.orderBy === columnKey) {
      // Toggle direction
      onSortChange({
        orderBy: columnKey,
        orderDir: sort.orderDir === "asc" ? "desc" : "asc",
      });
    } else {
      onSortChange({ orderBy: columnKey, orderDir: defaultDir });
    }
  };

  return (
    <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <table className="w-full border-collapse">
        {/* Header */}
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            {/* Select-all checkbox */}
            {showCheckboxes && (
              <th className="w-10 px-3 py-2">
                <Checkbox
                  checked={selection.isAllSelected}
                  indeterminate={selection.isIndeterminate}
                  onCheckedChange={onToggleAll}
                  aria-label="Select all items"
                />
              </th>
            )}

            {/* Column headers */}
            {columns.map((col) => {
              const isSorted = sort.orderBy === col.key;
              const ariaSort = isSorted
                ? sort.orderDir === "asc"
                  ? "ascending"
                  : "descending"
                : "none";

              const alignClass =
                col.align === "center"
                  ? "text-center"
                  : col.align === "right"
                    ? "text-right"
                    : "text-left";

              return (
                <th
                  key={col.key}
                  className={cn(
                    "px-3 py-2 text-xs font-semibold text-muted-foreground",
                    col.width,
                    alignClass,
                  )}
                  aria-sort={col.sortable ? ariaSort : undefined}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      onClick={() =>
                        handleSort(col.key, col.defaultSortDir || "asc")
                      }
                    >
                      {col.renderHeader ? col.renderHeader() : col.label}
                      {isSorted ? (
                        sort.orderDir === "asc" ? (
                          <ArrowUpIcon className="size-3" />
                        ) : (
                          <ArrowDownIcon className="size-3" />
                        )
                      ) : (
                        <ArrowUpDownIcon className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : col.renderHeader ? (
                    col.renderHeader()
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {/* Loading skeleton */}
          {isLoading && (
            <TableSkeleton
              columnCount={totalColumns}
              rowCount={skeletonRows}
              showCheckboxes={showCheckboxes}
            />
          )}

          {/* Empty state */}
          {!isLoading && rows.length === 0 && emptyState && (
            <tr>
              <td colSpan={totalColumns}>{emptyState}</td>
            </tr>
          )}

          {/* Data rows */}
          {!isLoading &&
            rows.map((row, index) => {
              const rowId = getRowId(row);
              const isSelected = selection.selectedIds.has(rowId);
              const isQuickEdit = quickEditId === rowId;

              // Quick Edit mode: render inline form instead of the row
              if (isQuickEdit && quickEditRender) {
                return (
                  <tr key={rowId} className="border-b border-border bg-muted/20">
                    <td colSpan={totalColumns} className="p-4">
                      {quickEditRender(row, () => {
                        onQuickEditClose?.();
                      })}
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={rowId}
                  className={cn(
                    "group/row border-b border-border transition-colors",
                    "hover:bg-muted/30",
                    isSelected && "bg-primary/5",
                  )}
                >
                  {/* Row checkbox */}
                  {showCheckboxes && (
                    <td className="w-10 px-3 py-2.5">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleRow(rowId)}
                        aria-label={`Select ${getRowLabel ? getRowLabel(row) : "item"}`}
                      />
                    </td>
                  )}

                  {/* Data cells */}
                  {columns.map((col) => {
                    const isPrimary = col.key === primaryColumn;
                    const alignClass =
                      col.align === "center"
                        ? "text-center"
                        : col.align === "right"
                          ? "text-right"
                          : "text-left";

                    return (
                      <td
                        key={col.key}
                        className={cn(
                          "px-3 py-2.5 text-xs",
                          col.width,
                          alignClass,
                        )}
                      >
                        <div>
                          {col.render(row, index)}
                          {/* Inline row actions below the primary column */}
                          {isPrimary && rowActions.length > 0 && (
                            <InlineActions
                              row={row}
                              actions={rowActions}
                              userCapabilities={userCapabilities}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
