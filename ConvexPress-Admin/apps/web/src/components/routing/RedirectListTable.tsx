/**
 * Redirect List Table
 *
 * WordPress-style list table for the Tools > Redirects page.
 * Wired to real Convex queries: routing.queries.getRedirects + getRedirectStats.
 *
 * Features:
 *   - Status tabs (All / Manual / Slug Change / Permalink Change / Import)
 *   - Search by source/target URL
 *   - Sort by sourceUrl, hitCount, createdAt, lastHitAt
 *   - Bulk delete, bulk enable, bulk disable
 *   - Row actions: Edit, Disable/Enable, Delete
 *   - Real-time: redirect changes appear without refresh
 */

import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  ArrowRightIcon,
  CircleIcon,
  CircleOffIcon,
  ExternalLinkIcon,
  PlusIcon,
} from "lucide-react";

import { BulkActions } from "@/components/shared/BulkActions";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListTable } from "@/components/shared/ListTable";
import { ListTableToolbar } from "@/components/shared/ListTableToolbar";
import { Pagination } from "@/components/shared/Pagination";
import { SearchBox } from "@/components/shared/SearchBox";
import { StatusTabs } from "@/components/shared/StatusTabs";
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

interface RedirectRow {
  _id: Id<"redirects">;
  sourceUrl: string;
  targetUrl: string;
  statusCode: number;
  source: string;
  matchType: string;
  enabled: boolean;
  hitCount: number;
  lastHitAt?: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sourceLabel(source: string): string {
  switch (source) {
    case "manual": return "Manual";
    case "slug_change": return "Slug Change";
    case "permalink_change": return "Permalink Change";
    case "import": return "Import";
    default: return source;
  }
}

function matchTypeLabel(matchType: string): string {
  switch (matchType) {
    case "exact": return "Exact";
    case "prefix": return "Prefix";
    case "regex": return "Regex";
    default: return matchType;
  }
}

// ─── Column Definitions ─────────────────────────────────────────────────────

const redirectColumns: ColumnDef<RedirectRow>[] = [
  {
    key: "sourceUrl",
    label: "Source URL",
    sortable: true,
    hideable: false,
    width: "w-[25%]",
    render: (row) => (
      <div className="min-w-0">
        <Link
          to="/tools/redirects/$redirectId/edit"
          params={{ redirectId: row._id }}
          className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block font-mono"
        >
          {row.sourceUrl}
        </Link>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              row.enabled ? "bg-success" : "bg-muted-foreground/40",
            )}
          />
          <span className="text-[10px] text-muted-foreground">
            {row.enabled ? "Active" : "Disabled"}
          </span>
        </div>
      </div>
    ),
  },
  {
    key: "targetUrl",
    label: "Target URL",
    sortable: false,
    width: "w-[25%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground font-mono truncate block">
        {row.targetUrl}
      </span>
    ),
  },
  {
    key: "statusCode",
    label: "Code",
    sortable: false,
    width: "w-[60px]",
    align: "center",
    render: (row) => (
      <span className="text-xs font-medium text-foreground">{row.statusCode}</span>
    ),
  },
  {
    key: "source",
    label: "Type",
    sortable: false,
    width: "w-[100px]",
    render: (row) => (
      <div className="space-y-0.5">
        <span className="text-xs text-muted-foreground">{sourceLabel(row.source)}</span>
        <span className="text-[10px] text-muted-foreground/60 block">
          {matchTypeLabel(row.matchType)}
        </span>
      </div>
    ),
  },
  {
    key: "hitCount",
    label: "Hits",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[70px]",
    align: "center",
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {row.hitCount.toLocaleString()}
      </span>
    ),
  },
  {
    key: "lastHitAt",
    label: "Last Hit",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[110px]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">{formatDate(row.lastHitAt)}</span>
    ),
  },
  {
    key: "createdAt",
    label: "Created",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[110px]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">{formatDate(row.createdAt)}</span>
    ),
  },
];

// ─── Status Tabs ────────────────────────────────────────────────────────────

const redirectStatusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "manual", label: "Manual" },
  { key: "slug_change", label: "Slug Changes" },
  { key: "permalink_change", label: "Permalink Changes" },
  { key: "import", label: "Imported" },
];

// ─── Bulk Actions ───────────────────────────────────────────────────────────

const redirectBulkActions: BulkAction[] = [
  {
    key: "delete",
    label: "Delete Permanently",
    requiresConfirmation: true,
    confirmMessage: "You are about to permanently delete the selected redirects.",
    destructive: true,
    capability: "routing.delete_redirect",
  },
];

// ─── Row Actions ────────────────────────────────────────────────────────────

const redirectRowActions: RowAction<RedirectRow>[] = [
  {
    key: "edit",
    label: "Edit",
    type: "link",
    href: (row) => `/tools/redirects/${row._id}/edit`,
  },
  {
    key: "toggle",
    label: "Disable",
    type: "button",
    separator: true,
  },
  {
    key: "delete",
    label: "Delete",
    type: "button",
    destructive: true,
    separator: true,
    capability: "routing.delete_redirect",
  },
];

// ─── Config ─────────────────────────────────────────────────────────────────

const redirectListConfig: ListTableConfig<RedirectRow> = {
  entityName: "redirect",
  entityNamePlural: "redirects",
  storageKey: "convexpress-redirects-screen-options",
  columns: redirectColumns,
  statusTabs: redirectStatusTabs,
  bulkActions: redirectBulkActions,
  rowActions: redirectRowActions,
  defaultSort: { orderBy: "createdAt", orderDir: "desc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50, 100],
  getRowId: (row) => row._id,
  primaryColumn: "sourceUrl",
  showCheckboxes: true,
};

// ─── Sort Key Mapping ───────────────────────────────────────────────────────

function mapSortBy(key: string): "sourceUrl" | "hitCount" | "createdAt" | "lastHitAt" {
  switch (key) {
    case "sourceUrl": return "sourceUrl";
    case "hitCount": return "hitCount";
    case "lastHitAt": return "lastHitAt";
    case "createdAt":
    default: return "createdAt";
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RedirectListTable() {
  const [activeStatus, setActiveStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    redirectId?: Id<"redirects">;
    bulk?: boolean;
  }>({ open: false });

  // Mutations
  const deleteRedirect = useMutation(api.routing.mutations.deleteRedirect);
  const updateRedirectMut = useMutation(api.routing.mutations.updateRedirect);

  // ─── Convex Queries ───────────────────────────────────────────────────────

  type RedirectSource = "manual" | "slug_change" | "permalink_change" | "import";
  const sourceFilter: RedirectSource | undefined = activeStatus !== "all"
    ? (activeStatus as RedirectSource)
    : undefined;

  const redirectsResult = useQuery(api.routing.queries.getRedirects, {
    source: sourceFilter,
    search: searchTerm || undefined,
    sortBy: mapSortBy(sortBy),
    sortOrder: sortDir,
    page,
    perPage,
  });

  const statsResult = useQuery(api.routing.queries.getRedirectStats);

  const isLoading = redirectsResult === undefined;

  // ─── Build paginated result for useListTable ────────────────────────────

  const paginatedResult: PaginatedResult<RedirectRow> = useMemo(() => {
    if (!redirectsResult) {
      return { items: [], total: 0, page: 1, perPage, totalPages: 0 };
    }
    return {
      items: redirectsResult.redirects as RedirectRow[],
      total: redirectsResult.total,
      page: redirectsResult.page,
      perPage: redirectsResult.perPage,
      totalPages: redirectsResult.totalPages,
    };
  }, [redirectsResult, perPage]);

  // ─── Build counts for status tabs ──────────────────────────────────────

  const countsMap = useMemo<Record<string, number>>(() => {
    if (!statsResult) return {} as Record<string, number>;
    return {
      all: statsResult.totalRedirects ?? 0,
    };
  }, [statsResult]);

  // ─── List table hook ──────────────────────────────────────────────────

  const table = useListTable({
    config: redirectListConfig,
    data: paginatedResult,
    counts: countsMap,
  });

  // ─── Row actions with handlers ────────────────────────────────────────

  const rowActionsWithHandlers = useMemo<RowAction<RedirectRow>[]>(
    () =>
      redirectRowActions.map((action) => {
        if (action.key === "toggle") {
          return {
            ...action,
            label: "Toggle",
            onClick: async (row: RedirectRow) => {
              try {
                await updateRedirectMut({
                  redirectId: row._id,
                  enabled: !row.enabled,
                });
                toast.success(
                  row.enabled ? "Redirect disabled." : "Redirect enabled.",
                );
              } catch {
                toast.error("Failed to update redirect.");
              }
            },
            visible: () => true,
          };
        }
        if (action.key === "delete") {
          return {
            ...action,
            onClick: (row: RedirectRow) => {
              setDeleteConfirm({ open: true, redirectId: row._id });
            },
          };
        }
        return action;
      }),
    [updateRedirectMut],
  );

  // ─── Bulk action handler ──────────────────────────────────────────────

  const handleBulkAction = useCallback(
    (actionKey: string) => {
      if (actionKey === "delete") {
        if (table.selection.count === 0) {
          toast.warning("No redirects selected.");
          return;
        }
        setDeleteConfirm({ open: true, bulk: true });
      }
    },
    [table.selection.count],
  );

  const handleDeleteConfirm = useCallback(async () => {
    try {
      if (deleteConfirm.bulk) {
        const ids = Array.from(table.selection.selectedIds);
        for (const id of ids) {
          await deleteRedirect({ redirectId: id as Id<"redirects"> });
        }
        toast.success(`${ids.length} redirect(s) deleted.`);
        table.clearSelection();
      } else if (deleteConfirm.redirectId) {
        await deleteRedirect({ redirectId: deleteConfirm.redirectId });
        toast.success("Redirect deleted.");
      }
    } catch {
      toast.error("Failed to delete redirect(s).");
    } finally {
      setDeleteConfirm({ open: false });
    }
  }, [deleteConfirm, deleteRedirect, table]);

  // ─── Event handlers ───────────────────────────────────────────────────

  const handleStatusChange = useCallback(
    (status: string) => {
      setActiveStatus(status);
      setPage(1);
      table.clearSelection();
    },
    [table],
  );

  const handleSearchChange = useCallback((search: string) => {
    setSearchTerm(search);
    setPage(1);
  }, []);

  const handleSortChange = useCallback(
    (sort: { orderBy: string; orderDir: "asc" | "desc" }) => {
      setSortBy(sort.orderBy);
      setSortDir(sort.orderDir);
      setPage(1);
    },
    [],
  );

  // ─── Render ───────────────────────────────────────────────────────────

  if (isLoading && !redirectsResult) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-36" />
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
          <h1 className="text-2xl font-bold text-foreground">Redirects</h1>
          {statsResult && (
            <p className="text-xs text-muted-foreground mt-1">
              {statsResult.activeRedirects} active of {statsResult.totalRedirects} total
              {" / "}
              {statsResult.totalHits.toLocaleString()} total hits
              {statsResult.unresolved404s > 0 && (
                <>
                  {" / "}
                  <Link to="/tools/404-log" className="text-primary hover:underline">
                    {statsResult.unresolved404s} unresolved 404s
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
        <Link to="/tools/redirects/new">
          <Button size="sm">
            <PlusIcon className="mr-1.5 size-3" />
            Add New Redirect
          </Button>
        </Link>
      </div>

      <StatusTabs
        tabs={redirectStatusTabs.map((tab) => ({
          ...tab,
          count: countsMap[tab.key as keyof typeof countsMap],
        }))}
        activeTab={activeStatus}
        onTabChange={handleStatusChange}
      />

      <ListTableToolbar
        bulkActionsSlot={
          <BulkActions
            actions={redirectBulkActions}
            selectedCount={table.selection.count}
            onApply={handleBulkAction}
          />
        }
        searchSlot={
          <SearchBox
            value={searchTerm}
            onChange={handleSearchChange}
            entityName="Redirects"
          />
        }
      />

      <ListTable
        columns={table.visibleColumns}
        rows={paginatedResult.items}
        sort={{ orderBy: sortBy, orderDir: sortDir }}
        onSortChange={handleSortChange}
        getRowId={redirectListConfig.getRowId}
        selection={table.selection}
        onToggleRow={table.toggleRow}
        onToggleAll={table.toggleAll}
        rowActions={rowActionsWithHandlers}
        primaryColumn="sourceUrl"
        showCheckboxes
        isLoading={isLoading}
        emptyState={
          <EmptyState
            title="No redirects found."
            description={
              searchTerm
                ? "Try adjusting your search or filters."
                : "No redirect rules have been created yet."
            }
            isFiltered={!!searchTerm || activeStatus !== "all"}
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
          perPageOptions={redirectListConfig.perPageOptions}
          entityNamePlural="redirects"
        />
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={handleDeleteConfirm}
        title={
          deleteConfirm.bulk
            ? `Delete ${table.selection.count} redirect(s)?`
            : "Delete redirect?"
        }
        message="This action cannot be undone. The redirect rule will be permanently removed."
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
