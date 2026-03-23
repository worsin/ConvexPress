import { useCallback, useState } from "react";
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { ColumnDef, ScreenOptionsState } from "@/types/list-table";

/** Minimal column shape needed for ScreenOptions - only non-generic fields */
type ScreenOptionsColumn = Pick<ColumnDef<unknown>, "key" | "label" | "hideable">;

interface ScreenOptionsProps {
  /** All column definitions (even hidden ones). */
  columns: ScreenOptionsColumn[];
  /** Current screen options state. */
  state: ScreenOptionsState;
  /** State change handler. */
  onChange: (state: ScreenOptionsState) => void;
  /** Per-page options for the dropdown. */
  perPageOptions: number[];
  /** Entity name for labeling. */
  entityName: string;
}

/**
 * Collapsible panel at the top of the page for configuring
 * column visibility and items per page. Mirrors WordPress's Screen Options tab.
 *
 * Uses Base UI Collapsible (NOT Radix).
 */
export function ScreenOptions({
  columns,
  state,
  onChange,
  perPageOptions,
  entityName,
}: ScreenOptionsProps) {
  const [localPerPage, setLocalPerPage] = useState(String(state.perPage));

  const hideableColumns = columns.filter((col) => col.hideable !== false);

  const handleColumnToggle = useCallback(
    (key: string, checked: boolean) => {
      onChange({
        ...state,
        visibleColumns: {
          ...state.visibleColumns,
          [key]: checked,
        },
      });
    },
    [state, onChange],
  );

  const handlePerPageApply = useCallback(() => {
    const parsed = parseInt(localPerPage, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) {
      onChange({
        ...state,
        perPage: parsed,
      });
    } else {
      setLocalPerPage(String(state.perPage));
    }
  }, [localPerPage, state, onChange]);

  return (
    <CollapsiblePrimitive.Root>
      <div className="flex justify-end mb-2">
        <CollapsiblePrimitive.Trigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          Screen Options
          <ChevronDownIcon className="size-3.5 transition-transform data-[panel-open]:rotate-180" />
        </CollapsiblePrimitive.Trigger>
      </div>
      <CollapsiblePrimitive.Panel className="overflow-hidden data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0">
        <div className="border border-border bg-card p-4 mb-4">
          {/* Column visibility */}
          {hideableColumns.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-foreground mb-2">
                Columns
              </h4>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {hideableColumns.map((col) => {
                  const isVisible =
                    state.visibleColumns[col.key] !== false;
                  return (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer"
                    >
                      <Checkbox
                        checked={isVisible}
                        onCheckedChange={(checked) =>
                          handleColumnToggle(col.key, !!checked)
                        }
                      />
                      {col.label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-page setting */}
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2">
              Pagination
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Number of items per page:
              </span>
              <input
                type="number"
                min={1}
                max={100}
                value={localPerPage}
                onChange={(e) => setLocalPerPage(e.target.value)}
                className="h-7 w-16 rounded-none border border-input bg-transparent px-2 text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
              />
              <Button variant="outline" size="xs" onClick={handlePerPageApply}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </CollapsiblePrimitive.Panel>
    </CollapsiblePrimitive.Root>
  );
}
