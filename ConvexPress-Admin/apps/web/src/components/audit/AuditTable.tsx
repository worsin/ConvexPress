/**
 * AuditTable Component
 *
 * WordPress-style data table for audit log entries.
 * Columns: Severity (dot), Timestamp, User, Action, Description, Detail arrow.
 * Click row to navigate to detail page. Cursor-based pagination.
 */

import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  LoaderIcon,
  UserIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import type { AuditEntryListItem } from "@/lib/audit/types";
import { formatAuditDateShort } from "@/lib/audit/formatters";
import { SeverityBadge } from "./SeverityBadge";

interface AuditTableProps {
  entries: AuditEntryListItem[];
  isLoading: boolean;
  hasActiveFilters: boolean;
  hasNextPage: boolean;
  hasCursor: boolean;
  onNextPage: () => void;
}

export function AuditTable({
  entries,
  isLoading,
  hasActiveFilters,
  hasNextPage,
  hasCursor,
  onNextPage,
}: AuditTableProps) {
  const navigate = useNavigate();

  const handleRowClick = useCallback(
    (entryId: string) => {
      navigate({
        to: "/tools/audit-log/$entryId",
        params: { entryId },
      });
    },
    [navigate],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin mr-2" />
        Loading audit log...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No audit entries found."
        description={
          hasActiveFilters
            ? "Try adjusting your filters to see more results."
            : "Audit entries will appear here as users interact with the system."
        }
        isFiltered={hasActiveFilters}
      />
    );
  }

  return (
    <div>
      <div className="border border-border rounded-none overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[3%]">
                {/* Severity dot */}
              </th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[14%]">
                Time
              </th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[14%]">
                User
              </th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[12%]">
                Action
              </th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[35%]">
                Description
              </th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[10%]">
                Object
              </th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[8%]">
                Severity
              </th>
              <th className="w-[4%]">{/* Arrow */}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry._id}
                className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => handleRowClick(entry._id)}
              >
                {/* Severity dot */}
                <td className="px-3 py-2">
                  <SeverityBadge severity={entry.severity} variant="dot" />
                </td>

                {/* Timestamp */}
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {formatAuditDateShort(entry.occurredAt)}
                </td>

                {/* User */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="shrink-0 flex items-center justify-center size-5 rounded-full bg-muted">
                      <UserIcon className="size-2.5 text-muted-foreground" />
                    </div>
                    <span className="text-xs text-foreground truncate max-w-[120px]">
                      {entry.actorName ?? entry.actorEmail ?? "System"}
                    </span>
                  </div>
                </td>

                {/* Action */}
                <td className="px-3 py-2">
                  <code className="text-[11px] text-muted-foreground">
                    {entry.action}
                  </code>
                </td>

                {/* Description */}
                <td className="px-3 py-2 text-xs text-foreground truncate max-w-[300px]">
                  {entry.description}
                </td>

                {/* Object */}
                <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[100px]">
                  {entry.objectLabel ?? entry.objectType}
                </td>

                {/* Severity label */}
                <td className="px-3 py-2">
                  <SeverityBadge severity={entry.severity} variant="label" />
                </td>

                {/* Arrow */}
                <td className="px-3 py-2">
                  <ChevronRightIcon className="size-3.5 text-muted-foreground" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-muted-foreground">
          Showing {entries.length} entries
          {hasNextPage ? "+" : ""}
        </span>
        <div className="flex items-center gap-2">
          {hasNextPage && (
            <Button variant="outline" size="sm" onClick={onNextPage}>
              Next Page
              <ChevronRightIcon className="size-3.5 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
