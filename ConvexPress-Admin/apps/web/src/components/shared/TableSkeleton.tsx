import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  /** Number of columns (including checkbox). */
  columnCount: number;
  /** Number of skeleton rows. Default: 5. */
  rowCount?: number;
  /** Column widths to match (for realistic skeleton proportions). */
  columnWidths?: string[];
  /** Whether to show checkbox column skeleton. */
  showCheckboxes?: boolean;
}

/**
 * Loading skeleton that matches the table column layout.
 * Shows while Convex queries are loading (data === undefined).
 */
export function TableSkeleton({
  columnCount,
  rowCount = 5,
  columnWidths,
  showCheckboxes = true,
}: TableSkeletonProps) {
  // Vary skeleton widths for realistic appearance
  const widthPercents = [75, 60, 85, 70, 90, 65, 80, 55];

  return (
    <>
      {Array.from({ length: rowCount }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-border">
          {showCheckboxes && (
            <td className="w-10 px-3 py-2.5">
              <Skeleton className="size-4" />
            </td>
          )}
          {Array.from({
            length: showCheckboxes ? columnCount - 1 : columnCount,
          }).map((_, colIndex) => (
            <td
              key={colIndex}
              className={columnWidths?.[colIndex] ? columnWidths[colIndex] : "px-3 py-2.5"}
              style={!columnWidths?.[colIndex] ? { padding: "10px 12px" } : undefined}
            >
              <Skeleton
                className="h-3.5"
                style={{
                  width: `${widthPercents[(rowIndex + colIndex) % widthPercents.length]}%`,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
