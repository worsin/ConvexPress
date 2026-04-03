/**
 * 404 Log Table
 *
 * WordPress-style list table for the Tools > 404 Log page.
 * Wired to real Convex queries: routing.queries.get404Log + getRedirectStats.
 *
 * Features:
 *   - Status tabs (All / Unresolved / Resolved)
 *   - Sort by hitCount, lastHitAt, url
 *   - Bulk dismiss
 *   - Row actions: Create Redirect (pre-fills source URL), Dismiss
 *   - Real-time: new 404 entries appear without refresh
 */

import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { ArrowRightIcon, CheckCircleIcon, PlusIcon, XCircleIcon } from "lucide-react";

import { BulkActions } from "@/components/shared/BulkActions";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListTable } from "@/components/shared/ListTable";
import { ListTableToolbar } from "@/components/shared/ListTableToolbar";
import { Pagination } from "@/components/shared/Pagination";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useListTable } from "@/hooks/useListTable";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import type {
  BulkAction,
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  RowAction,
  StatusTab,
} from "@/types/list-table";
import type { Id } from "@backend/convex/_generated/dataModel";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NotFoundRow {
  _id: Id<"notFound">;
  url: string;
  referrer?: string;
  userAgent?: string;
  hitCount: number;
  lastHitAt: number;
  resolved: boolean;
  resolvedBy?: Id<"users">;
  resolvedAt?: number;
  redirectId?: Id<"redirects">;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncateReferrer(referrer: string | undefined): string {
  if (!referrer) return "--";
  try {
    const url = new URL(referrer);
    return url.hostname + url.pathname;
  } catch {
    return referrer.length > 50 ? referrer.substring(0, 50) + "..." : referrer;
  }
}

// ─── Column Definitions ─────────────────────────────────────────────────────

const notFoundColumns: ColumnDef<NotFoundRow>[] = [
  {
    key: "url",
    label: "URL",
    sortable: true,
    hideable: false,
    width: "w-[35%]",
    render: (row) => (
      <div className="min-w-0">
        <span className="text-sm font-medium text-foreground font-mono truncate block">
          {row.url}
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              row.resolved ? "bg-muted-foreground/40" : "bg-warning",
            )}
          />
          <span className="text-[10px] text-muted-foreground">
            {row.resolved ? "Resolved" : "Unresolved"}
          </span>
        </div>
      </div>
    ),
  },
  {
    key: "hitCount",
    label: "Hits",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[80px]",
    align: "center",
    render: (row) => (
      <span
        className={cn(
          "text-xs font-medium",
          row.hitCount >= 100
            ? "text-destructive"
            : row.hitCount >= 10
              ? "text-warning"
              : "text-muted-foreground",
        )}
      >
        {row.hitCount.toLocaleString()}
      </span>
    ),
  },
  {
    key: "lastHitAt",
    label: "Last Hit",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[120px]",
    render: (row) => (
      <span className="text-xs text-muted-foreground" title={formatDateTime(row.lastHitAt)}>
        {formatDate(row.lastHitAt)}
      </span>
    ),
  },
  {
    key: "referrer",
    label: "Referrer",
    sortable: false,
    width: "w-[20%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground truncate block" title={row.referrer}>
        {truncateReferrer(row.referrer)}
      </span>
    ),
  },
];

// ─── Status Tabs ────────────────────────────────────────────────────────────

const notFoundStatusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "unresolved", label: "Unresolved" },
  { key: "resolved", label: "Resolved" },
];

// ─── Bulk Actions ───────────────────────────────────────────────────────────

const notFoundBulkActions: BulkAction[] = [
  {
    key: "dismiss",
    label: "Dismiss Selected",
    requiresConfirmation: true,
    confirmMessage: "Mark the selected 404 entries as resolved without creating redirects?",
  },
];

// ─── Row Actions ────────────────────────────────────────────────────────────

const notFoundRowActions: RowAction<NotFoundRow>[] = [
  {
    key: "redirect",
    label: "Create Redirect",
    type: "button",
    visible: (row) => !row.resolved,
  },
  {
    key: "dismiss",
    label: "Dismiss",
    type: "button",
    separator: true,
    visible: (row) => !row.resolved,
  },
];

// ─── Config ─────────────────────────────────────────────────────────────────

const notFoundListConfig: ListTableConfig<NotFoundRow> = {
  entityName: "404 entry",
  entityNamePlural: "404 entries",
  storageKey: "convexpress-404-log-screen-options",
  columns: notFoundColumns,
  statusTabs: notFoundStatusTabs,
  bulkActions: notFoundBulkActions,
  rowActions: notFoundRowActions,
  defaultSort: { orderBy: "lastHitAt", orderDir: "desc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50, 100],
  getRowId: (row) => row._id,
  primaryColumn: "url",
  showCheckboxes: true,
};

// ─── Sort Key Mapping ───────────────────────────────────────────────────────

function mapSortBy(key: string): "hitCount" | "lastHitAt" | "url" {
  switch (key) {
    case "hitCount": return "hitCount";
    case "url": return "url";
    case "lastHitAt":
    default: return "lastHitAt";
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function NotFoundLogTable() {
  const navigate = useNavigate();
  const [activeStatus, setActiveStatus] = useState("unresolved");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [sortBy, setSortBy] = useState("lastHitAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Bulk dismiss confirmation
  const [bulkDismissConfirm, setBulkDismissConfirm] = useState(false);

  // Mutations
  const dismissMut = useMutation(api.routing.mutations.dismiss404);
  const bulkDismissMut = useMutation(api.routing.mutations.bulkDismiss404);

  // ─── Convex Queries ───────────────────────────────────────────────────────

  const resolvedFilter =
    activeStatus === "unresolved"
      ? false
      : activeStatus === "resolved"
        ? true
        : undefined;

  const logResult = useQuery(api.routing.queries.get404Log, {
    resolved: resolvedFilter,
    sortBy: mapSortBy(sortBy),
    sortOrder: sortDir,
    page,
    perPage,
  });

  const statsResult = useQuery(api.routing.queries.getRedirectStats);

  const isLoading = logResult === undefined;

  // ─── Build paginated result ───────────────────────────────────────────

  const paginatedResult: PaginatedResult<NotFoundRow> = useMemo(() => {
    if (!logResult) {
      return { items: [], total: 0, page: 1, perPage, totalPages: 0 };
    }
    return {
      items: logResult.entries as NotFoundRow[],
      total: logResult.total,
      page: logResult.page,
      perPage: logResult.perPage,
      totalPages: logResult.totalPages,
    };
  }, [logResult, perPage]);

  // ─── Status tab counts ───────────────────────────────────────────────

  const countsMap = useMemo(() => {
    if (!statsResult) return {};
    return {
      all: statsResult.total404s,
      unresolved: statsResult.unresolved404s,
      resolved:
        statsResult.total404s !== undefined && statsResult.unresolved404s !== undefined
          ? statsResult.total404s - statsResult.unresolved404s
          : undefined,
    };
  }, [statsResult]);

  // ─── List table hook ──────────────────────────────────────────────────

  const table = useListTable({
    config: notFoundListConfig,
    data: paginatedResult,
    counts: countsMap,
  });

  // ─── Row actions with handlers ────────────────────────────────────────

  const rowActionsWithHandlers = useMemo<RowAction<NotFoundRow>[]>(
    () =>
      notFoundRowActions.map((action) => {
        if (action.key === "redirect") {
          return {
            ...action,
            onClick: (row: NotFoundRow) => {
              // Navigate to create redirect page with pre-filled source URL
              navigate({
                to: "/tools/redirects/new",
                search: { sourceUrl: row.url, notFoundId: row._id },
              });
            },
          };
        }
        if (action.key === "dismiss") {
          return {
            ...action,
            onClick: async (row: NotFoundRow) => {
              try {
                await dismissMut({ notFoundId: row._id });
                toast.success("404 entry dismissed.");
              } catch {
                toast.error("Failed to dismiss 404 entry.");
              }
            },
          };
        }
        return action;
      }),
    [navigate, dismissMut],
  );

  // ─── Bulk action handler ──────────────────────────────────────────────

  const handleBulkAction = useCallback(
    (actionKey: string) => {
      if (actionKey === "dismiss") {
        if (table.selection.count === 0) {
          toast.warning("No entries selected.");
          return;
        }
        setBulkDismissConfirm(true);
      }
    },
    [table.selection.count],
  );

  const handleBulkDismissConfirm = useCallback(async () => {
    try {
      const ids = Array.from(table.selection.selectedIds) as Id<"notFound">[];
      const result = await bulkDismissMut({ notFoundIds: ids });
      toast.success(`${result.dismissed} entries dismissed.`);
      table.clearSelection();
    } catch {
      toast.error("Failed to dismiss entries.");
    } finally {
      setBulkDismissConfirm(false);
    }
  }, [table, bulkDismissMut]);

  // ─── Event handlers ───────────────────────────────────────────────────

  const handleStatusChange = useCallback(
    (status: string) => {
      setActiveStatus(status);
      setPage(1);
      table.clearSelection();
    },
    [table],
  );

  const handleSortChange = useCallback(
    (sort: { orderBy: string; orderDir: "asc" | "desc" }) => {
      setSortBy(sort.orderBy);
      setSortDir(sort.orderDir);
      setPage(1);
    },
    [],
  );

  // ─── Render ───────────────────────────────────────────────────────────

  if (isLoading && !logResult) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-28" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">404 Log</h1>
          {statsResult && (
            <p className="text-xs text-muted-foreground mt-1">
              {statsResult.total404s} total entries
              {" / "}
              {statsResult.unresolved404s} unresolved
            </p>
          )}
        </div>
        <Link to="/tools/redirects">
          <Button variant="outline" size="sm">
            <ArrowRightIcon className="mr-1.5 size-3" />
            View Redirects
          </Button>
        </Link>
      </div>

      <StatusTabs
        tabs={notFoundStatusTabs.map((tab) => ({
          ...tab,
          count: countsMap[tab.key as keyof typeof countsMap],
        }))}
        activeTab={activeStatus}
        onTabChange={handleStatusChange}
      />

      <ListTableToolbar
        bulkActionsSlot={
          <BulkActions
            actions={notFoundBulkActions}
            selectedCount={table.selection.count}
            onApply={handleBulkAction}
          />
        }
        searchSlot={null}
      />

      <ListTable
        columns={table.visibleColumns}
        rows={paginatedResult.items}
        sort={{ orderBy: sortBy, orderDir: sortDir }}
        onSortChange={handleSortChange}
        getRowId={notFoundListConfig.getRowId}
        selection={table.selection}
        onToggleRow={table.toggleRow}
        onToggleAll={table.toggleAll}
        rowActions={rowActionsWithHandlers}
        primaryColumn="url"
        showCheckboxes
        isLoading={isLoading}
        emptyState={
          <EmptyState
            title="No 404 entries found."
            description={
              activeStatus === "unresolved"
                ? "No unresolved 404 errors. Your site is in good shape!"
                : activeStatus === "resolved"
                  ? "No resolved 404 entries."
                  : "No 404 errors have been logged yet."
            }
            isFiltered={activeStatus !== "all"}
          />
        }
      />

      <div className="mt-4">
        <Pagination
          total={paginatedResult.total}
          page={page}
          perPage={perPage}
          totalPages={paginatedResult.totalPages}
          onPageChange={setPage}
          onPerPageChange={(pp) => {
            setPerPage(pp);
            setPage(1);
          }}
          perPageOptions={notFoundListConfig.perPageOptions}
          entityNamePlural="entries"
        />
      </div>

      {/* Bulk Dismiss Confirmation */}
      <ConfirmDialog
        open={bulkDismissConfirm}
        onClose={() => setBulkDismissConfirm(false)}
        onConfirm={handleBulkDismissConfirm}
        title={`Dismiss ${table.selection.count} 404 entries?`}
        message="These entries will be marked as resolved without creating redirect rules."
        confirmLabel="Dismiss"
      />
    </div>
  );
}
