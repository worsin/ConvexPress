/**
 * AuditChangesTable Component
 *
 * Diff table showing field, old value, new value.
 * Color-coded: additions (primary), removals (destructive), changes (yellow).
 */

import { cn } from "@/lib/utils";

interface ChangeRecord {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface AuditChangesTableProps {
  changes: ChangeRecord[];
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function getChangeType(
  change: ChangeRecord,
): "added" | "removed" | "changed" {
  if (
    change.oldValue === null ||
    change.oldValue === undefined ||
    change.oldValue === ""
  ) {
    return "added";
  }
  if (
    change.newValue === null ||
    change.newValue === undefined ||
    change.newValue === ""
  ) {
    return "removed";
  }
  return "changed";
}

export function AuditChangesTable({ changes }: AuditChangesTableProps) {
  if (!changes || changes.length === 0) return null;

  return (
    <div className="border border-border rounded-none overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[25%]">
              Field
            </th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[35%]">
              Old Value
            </th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[35%]">
              New Value
            </th>
            <th className="w-[5%]" />
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => {
            const type = getChangeType(change);
            return (
              <tr
                key={change.field}
                className="border-b border-border last:border-0"
              >
                <td className="px-3 py-2 font-medium text-foreground">
                  {change.field}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 font-mono",
                    type === "removed" && "bg-destructive/5 text-destructive",
                    type === "changed" && "bg-destructive/5 text-muted-foreground line-through",
                    type === "added" && "text-muted-foreground",
                  )}
                >
                  <span className="break-all">
                    {formatValue(change.oldValue)}
                  </span>
                </td>
                <td
                  className={cn(
                    "px-3 py-2 font-mono",
                    type === "added" && "bg-primary/5 text-primary",
                    type === "changed" && "bg-primary/5 text-foreground",
                    type === "removed" && "text-muted-foreground",
                  )}
                >
                  <span className="break-all">
                    {formatValue(change.newValue)}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  {type === "added" && (
                    <span className="text-primary text-[11px]">+</span>
                  )}
                  {type === "removed" && (
                    <span className="text-destructive text-[11px]">-</span>
                  )}
                  {type === "changed" && (
                    <span className="text-[var(--color-caution,hsl(48,96%,53%))] text-[11px]">~</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
