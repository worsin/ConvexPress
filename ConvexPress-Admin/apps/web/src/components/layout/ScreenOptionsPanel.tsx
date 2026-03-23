import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import type { ScreenOptionsConfig } from "@/lib/admin-shell/types";

interface ScreenOptionsPanelProps {
  /** The current screen options configuration */
  config: ScreenOptionsConfig;
  /** Whether the panel is expanded */
  isOpen: boolean;
  /** Toggle panel open/close */
  onToggle: () => void;
  /** Callback when a column visibility is changed */
  onColumnChange: (columnId: string, visible: boolean) => void;
  /** Callback when items per page is changed */
  onPerPageChange: (value: number) => void;
  /** Callback when a custom field value is changed */
  onCustomChange?: (fieldId: string, value: unknown) => void;
}

/**
 * ScreenOptionsPanel - Collapsible per-page display options panel.
 *
 * WordPress equivalent: The "Screen Options" dropdown at the top of
 * admin list table pages. Allows users to toggle column visibility
 * and set items per page.
 *
 * This component is placed at the top of the content area, above the
 * breadcrumbs. It renders a toggle button and an expandable panel
 * with checkboxes for columns and a select for items per page.
 *
 * Screen options are persisted to localStorage per-route by the
 * useScreenOptions hook.
 */
export function ScreenOptionsPanel({
  config,
  isOpen,
  onToggle,
  onColumnChange,
  onPerPageChange,
  onCustomChange,
}: ScreenOptionsPanelProps) {
  const hasColumns = config.columns && config.columns.length > 0;
  const hasPerPage = config.perPage !== undefined;
  const hasCustom = config.custom && config.custom.length > 0;
  const hasAnyOptions = hasColumns || hasPerPage || hasCustom;

  if (!hasAnyOptions) return null;

  return (
    <div className="mb-4">
      {/* Toggle button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
            "text-muted-foreground hover:text-foreground hover:bg-muted",
            isOpen && "bg-muted text-foreground",
          )}
          aria-expanded={isOpen}
          aria-controls="screen-options-panel"
        >
          Screen Options
          {isOpen ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
        </button>
      </div>

      {/* Expandable panel */}
      {isOpen && (
        <div
          id="screen-options-panel"
          className="mt-1 rounded-sm border border-border bg-card p-4"
        >
          <div className="flex flex-wrap gap-8">
            {/* Column visibility */}
            {hasColumns && (
              <fieldset>
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Columns
                </legend>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {config.columns!.map((column) => (
                    <label
                      key={column.id}
                      className="group/field flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={column.visible}
                        onCheckedChange={(checked) =>
                          onColumnChange(column.id, checked === true)
                        }
                      />
                      <span className="text-card-foreground">
                        {column.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {/* Items per page */}
            {hasPerPage && (
              <fieldset>
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pagination
                </legend>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="screen-options-per-page"
                    className="text-sm text-card-foreground"
                  >
                    {config.perPage!.label ?? "Items"} per page:
                  </label>
                  <select
                    id="screen-options-per-page"
                    value={config.perPage!.value}
                    onChange={(e) => onPerPageChange(Number(e.target.value))}
                    className={cn(
                      "rounded-sm border border-border bg-background px-2 py-1 text-sm text-foreground",
                      "focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50",
                    )}
                  >
                    {config.perPage!.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>
            )}

            {/* Custom fields */}
            {hasCustom &&
              config.custom!.map((field) => (
                <fieldset key={field.id}>
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {field.label}
                  </legend>
                  <div className="flex items-center gap-2">
                    {field.type === "checkbox" && (
                      <label className="group/field flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={field.value === true}
                          onCheckedChange={(checked) =>
                            onCustomChange?.(field.id, checked === true)
                          }
                        />
                        <span className="text-card-foreground">
                          {field.label}
                        </span>
                      </label>
                    )}
                    {field.type === "number" && (
                      <input
                        type="number"
                        value={Number(field.value) || 0}
                        onChange={(e) =>
                          onCustomChange?.(field.id, Number(e.target.value))
                        }
                        className={cn(
                          "w-20 rounded-sm border border-border bg-background px-2 py-1 text-sm text-foreground",
                          "focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50",
                        )}
                      />
                    )}
                    {field.type === "select" && field.options && (
                      <select
                        value={String(field.value)}
                        onChange={(e) =>
                          onCustomChange?.(field.id, e.target.value)
                        }
                        className={cn(
                          "rounded-sm border border-border bg-background px-2 py-1 text-sm text-foreground",
                          "focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50",
                        )}
                      >
                        {field.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </fieldset>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
