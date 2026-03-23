/**
 * Tools > Audit Log
 *
 * Full-featured, filterable, exportable audit interface.
 * WordPress equivalent: WP Activity Log plugin's main view.
 *
 * Features:
 * - Stats bar with severity counts (clickable to filter)
 * - Search, severity/type/system dropdowns, date range
 * - Data table with cursor-based pagination
 * - Export to CSV/JSON
 * - Clear old entries with safety guards
 * - Real-time Convex subscription
 */

import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ShieldCheckIcon } from "lucide-react";

import { useAuditList } from "@/hooks/audit/useAuditList";
import type { AuditSeverity, AuditEntryListItem } from "@/lib/audit/types";
import { AuditStatsBar } from "@/components/audit/AuditStatsBar";
import { AuditFilterBar } from "@/components/audit/AuditFilterBar";
import { AuditTable } from "@/components/audit/AuditTable";
import { AuditExportDialog } from "@/components/audit/AuditExportDialog";
import { AuditClearDialog } from "@/components/audit/AuditClearDialog";

const auditLogSearchSchema = z.object({
  severity: z.string().optional(),
  system: z.string().optional(),
  actorId: z.string().optional(),
  objectType: z.string().optional(),
  eventCode: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  cursor: z.string().optional(),
});

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/audit-log/",
)({
  validateSearch: auditLogSearchSchema,
  component: AuditLogPage,
});

function AuditLogPage() {
  const {
    entries,
    isLoading,
    filters,
    updateFilter,
    clearFilters,
    hasActiveFilters,
    hasNextPage,
    hasCursor,
    goToNextPage,
  } = useAuditList({ pageSize: 50 });

  const [showExport, setShowExport] = useState(false);
  const [showClear, setShowClear] = useState(false);

  const handleSeverityFilter = useCallback(
    (severity: AuditSeverity | undefined) => {
      updateFilter("severity", severity);
    },
    [updateFilter],
  );

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheckIcon className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
      </div>

      {/* Stats bar */}
      <AuditStatsBar
        onSeverityFilter={handleSeverityFilter}
        activeSeverity={filters.severity}
      />

      {/* Filter bar */}
      <AuditFilterBar
        filters={{
          severity: filters.severity,
          system: filters.system,
          objectType: filters.objectType,
          search: filters.search,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        }}
        onFilterChange={updateFilter}
        onClearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
        onExportClick={() => setShowExport(true)}
        onClearClick={() => setShowClear(true)}
      />

      {/* Data table */}
      <AuditTable
        entries={entries as AuditEntryListItem[]}
        isLoading={isLoading}
        hasActiveFilters={hasActiveFilters}
        hasNextPage={hasNextPage}
        hasCursor={hasCursor}
        onNextPage={goToNextPage}
      />

      {/* Export dialog */}
      <AuditExportDialog
        open={showExport}
        onClose={() => setShowExport(false)}
        currentFilters={{
          severity: filters.severity,
          objectType: filters.objectType,
          actorId: filters.actorId,
          eventCode: filters.eventCode,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        }}
      />

      {/* Clear dialog */}
      <AuditClearDialog
        open={showClear}
        onClose={() => setShowClear(false)}
      />
    </div>
  );
}
