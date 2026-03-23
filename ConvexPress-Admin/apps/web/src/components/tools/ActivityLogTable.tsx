/**
 * Activity Log Table
 *
 * Displays the audit log (auditEntries) with cursor-based pagination.
 * Shows: Time, Action, Description, Actor, Severity, System, Object.
 *
 * No sync button — audit entries are created by the Event Dispatcher system.
 * This page reads directly from the auditEntries table.
 */

import { useMemo, useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { useSearch, useNavigate } from "@tanstack/react-router";

import { api } from "@backend/convex/_generated/api";

import { EmptyState } from "@/components/shared/EmptyState";
import { SearchBox } from "@/components/shared/SearchBox";
import { Button } from "@/components/ui/button";

interface AuditEntry {
  _id: string;
  eventCode: string;
  action: string;
  description: string;
  severity: string;
  system: string;
  actorName?: string;
  actorEmail?: string;
  objectType: string;
  objectId?: string;
  objectLabel?: string;
  occurredAt: number;
}

const SEVERITY_CLASSES: Record<string, string> = {
  critical: "text-red-500",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-foreground",
  informational: "text-muted-foreground",
};

export function ActivityLogTable() {
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as Record<
    string,
    string | undefined
  >;

  const [search, setSearch] = useState(searchParams.search ?? "");

  type AuditSeverity = "critical" | "high" | "medium" | "low" | "informational";
  const result = useQuery(api.auditLogs.queries.list, {
    severity: searchParams.severity as AuditSeverity | undefined,
    system: searchParams.system,
    search: search || undefined,
    cursor: searchParams.cursor,
    limit: 50,
  });

  const entries = (result?.entries ?? []) as AuditEntry[];
  const nextCursor = result?.nextCursor;

  const updateFilter = useCallback(
    (key: string, value: string | undefined) => {
      navigate({
        search: (prev: Record<string, unknown>) => {
          const next = { ...prev, [key]: value, cursor: undefined };
          for (const k of Object.keys(next)) {
            if (next[k] === undefined || next[k] === "") delete next[k];
          }
          return next;
        },
        replace: true,
      });
    },
    [navigate],
  );

  const handleLoadMore = useCallback(() => {
    if (nextCursor) {
      navigate({
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          cursor: nextCursor,
        }),
        replace: true,
      });
    }
  }, [nextCursor, navigate]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const isLoading = result === undefined;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Activity Log</h1>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <SearchBox
          value={search}
          onChange={setSearch}
          entityName="Activity"
        />

        {/* Severity filter */}
        <select
          className="text-sm border border-border rounded px-2 py-1.5 bg-background text-foreground"
          value={searchParams.severity ?? ""}
          onChange={(e) =>
            updateFilter("severity", e.target.value || undefined)
          }
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="informational">Informational</option>
        </select>

        {/* System filter */}
        <select
          className="text-sm border border-border rounded px-2 py-1.5 bg-background text-foreground"
          value={searchParams.system ?? ""}
          onChange={(e) =>
            updateFilter("system", e.target.value || undefined)
          }
        >
          <option value="">All systems</option>
          <option value="Post System">Post System</option>
          <option value="Comment System">Comment System</option>
          <option value="User Profile System">User Profile System</option>
          <option value="Media System">Media System</option>
          <option value="Role & Capability System">Role & Capability</option>
          <option value="Settings System">Settings System</option>
          <option value="Auth System">Auth System</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          Loading activity log...
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          title="No activity found."
          description={
            search || searchParams.severity || searchParams.system
              ? "Try adjusting your filters."
              : "Activity will appear here as users interact with the system."
          }
          isFiltered={
            !!search || !!searchParams.severity || !!searchParams.system
          }
        />
      ) : (
        <>
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[12%]">
                    Time
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[12%]">
                    Action
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[28%]">
                    Description
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[12%]">
                    Actor
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[10%]">
                    Severity
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[12%]">
                    System
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[14%]">
                    Object
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry._id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatTime(entry.occurredAt)}
                    </td>
                    <td className="px-3 py-2">
                      <code className="text-xs text-muted-foreground">
                        {entry.action}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {entry.description}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {entry.actorName ?? entry.actorEmail ?? "System"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`capitalize ${SEVERITY_CLASSES[entry.severity] ?? "text-muted-foreground"}`}
                      >
                        {entry.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {entry.system}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {entry.objectLabel ?? entry.objectType}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load More */}
          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={handleLoadMore}>
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
