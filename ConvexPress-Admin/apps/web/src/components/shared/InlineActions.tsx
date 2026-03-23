import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import type { RowAction } from "@/types/list-table";

interface InlineActionsProps<TRow> {
  /** Row data. */
  row: TRow;
  /** Action definitions. */
  actions: RowAction<TRow>[];
  /** Current user capabilities. */
  userCapabilities?: string[];
}

/**
 * Row-level action links shown on hover beneath the primary column.
 * Mimics WordPress's inline row actions.
 *
 * Rendering: Edit | Quick Edit | Trash | View
 *
 * Shown on row hover via opacity-0 group-hover/row:opacity-100 transition-opacity.
 * Actions separated by | pipe character.
 * Destructive actions styled with text-destructive.
 */
export function InlineActions<TRow>({
  row,
  actions,
  userCapabilities,
}: InlineActionsProps<TRow>) {
  // Filter actions by capability and visibility condition
  const visibleActions = actions.filter((action) => {
    if (action.capability && userCapabilities && !userCapabilities.includes(action.capability)) {
      return false;
    }
    if (action.visible && !action.visible(row)) {
      return false;
    }
    return true;
  });

  if (visibleActions.length === 0) return null;

  return (
    <div className="opacity-0 group-hover/row:opacity-100 transition-opacity flex items-center gap-0 text-xs leading-none mt-1">
      {visibleActions.map((action, index) => {
        const showSeparator = index > 0;

        const actionClasses = cn(
          "hover:underline transition-colors",
          action.destructive
            ? "text-destructive hover:text-destructive/80"
            : "text-primary hover:text-primary/80",
        );

        return (
          <span key={action.key} className="flex items-center">
            {showSeparator && (
              <span className="text-muted-foreground/50 px-1">|</span>
            )}
            {action.type === "link" && action.href ? (
              <Link to={action.href(row)} className={actionClasses}>
                {action.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => action.onClick?.(row)}
                className={actionClasses}
              >
                {action.label}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
