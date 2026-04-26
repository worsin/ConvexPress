interface ListTableToolbarProps {
  /** Left side content (BulkActions). */
  bulkActionsSlot?: React.ReactNode;
  /** Center/right content (entity-specific filters). */
  filtersSlot?: React.ReactNode;
  /** Right side content (SearchBox). */
  searchSlot: React.ReactNode;
}

/**
 * Horizontal bar containing bulk actions on the left and filters + search on the right.
 * Wraps BulkActions, entity-specific FilterBar, and SearchBox.
 *
 * Rendering: [Bulk Actions v] [Apply]  |  [All Dates v] [All Categories v] [Filter]  |  Search [________]
 */
export function ListTableToolbar({
  bulkActionsSlot = null,
  filtersSlot,
  searchSlot,
}: ListTableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-3">
      <div className="flex flex-wrap items-center gap-4">
        {bulkActionsSlot}
        {filtersSlot}
      </div>
      <div className="flex items-center">{searchSlot}</div>
    </div>
  );
}
