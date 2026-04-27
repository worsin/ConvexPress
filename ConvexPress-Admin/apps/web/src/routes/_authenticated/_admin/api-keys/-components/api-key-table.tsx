/**
 * API Key Table Component
 *
 * DataTable displaying API keys using the shared useListTable hook pattern.
 * Columns: Name, Key Prefix, Scopes (badges), Status (badge), Last Used,
 * Requests count, Created date, Actions (Revoke).
 *
 * Wired to real Convex queries via useQuery(api.api.queries.listKeys).
 * Uses client-side pagination since the backend returns a flat array.
 */

import { useMemo, useState } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { KeyIcon, BanIcon } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListTable } from "@/components/shared/ListTable";
import { Pagination } from "@/components/shared/Pagination";
import { ScreenOptions } from "@/components/shared/ScreenOptions";
import { SearchBox } from "@/components/shared/SearchBox";
import { StatusTabs } from "@/components/shared/StatusTabs";
import { ListTableToolbar } from "@/components/shared/ListTableToolbar";
import { BulkActions } from "@/components/shared/BulkActions";
import { useListTable } from "@/hooks/useListTable";
import { cn } from "@/lib/utils";
import { API_KEY_STATUS_CONFIG, SCOPE_DESCRIPTIONS } from "@/lib/api/constants";
import { formatRelativeTime } from "@/lib/api/utils";
import type { ApiKey, ApiKeyScope, ApiKeyStatus } from "@/lib/api/types";
import type {
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  RowAction,
  StatusTab,
} from "@/types/list-table";
import { CreateKeyDialog } from "./create-key-dialog";
import { RevokeKeyDialog } from "./revoke-key-dialog";

// --- Helpers ---

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function StatusBadge({ status }: { status: ApiKeyStatus }) {
  const config = API_KEY_STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium",
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}

function ScopeBadge({ scope }: { scope: ApiKeyScope }) {
  return (
    <span
      className="inline-flex items-center px-1 py-0.5 text-[10px] font-mono bg-muted text-muted-foreground"
      title={SCOPE_DESCRIPTIONS[scope] ?? scope}
    >
      {scope}
    </span>
  );
}

// --- Column Definitions ---

const apiKeyColumns: ColumnDef<ApiKey>[] = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    hideable: false,
    width: "w-[18%]",
    render: (row) => (
      <span className="text-xs font-medium text-foreground">{row.name}</span>
    ),
  },
  {
    key: "keyPrefix",
    label: "Key",
    width: "w-[10%]",
    render: (row) => (
      <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 text-muted-foreground">
        {row.keyPrefix}...
      </code>
    ),
  },
  {
    key: "scopes",
    label: "Scopes",
    width: "w-[18%]",
    render: (row) => (
      <div className="flex flex-wrap gap-1 max-w-[200px]">
        {row.scopes.length <= 3 ? (
          row.scopes.map((s) => <ScopeBadge key={s} scope={s} />)
        ) : (
          <>
            <ScopeBadge scope={row.scopes[0]!} />
            <span className="inline-flex items-center px-1 py-0.5 text-[10px] bg-muted text-muted-foreground">
              +{row.scopes.length - 1} more
            </span>
          </>
        )}
      </div>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: "w-[8%]",
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "lastUsed",
    label: "Last Used",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[14%]",
    render: (row) =>
      row.lastUsedAt ? (
        <div>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(row.lastUsedAt)}
          </span>
          {row.lastUsedIp && (
            <span className="block text-[10px] text-muted-foreground/70">
              {row.lastUsedIp}
            </span>
          )}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground/50">Never</span>
      ),
  },
  {
    key: "requests",
    label: "Requests",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[8%]",
    align: "right",
    render: (row) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {row.requestCount.toLocaleString()}
      </span>
    ),
  },
  {
    key: "created",
    label: "Created",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[14%]",
    render: (row) => (
      <div>
        <span className="text-xs text-muted-foreground">
          {formatDate(row.createdAt)}
        </span>
        {row.expiresAt && (
          <span className="block text-[10px] text-muted-foreground/70">
            Expires {formatDate(row.expiresAt)}
          </span>
        )}
      </div>
    ),
  },
];

// --- Status Tabs ---

const apiKeyStatusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "revoked", label: "Revoked" },
  { key: "expired", label: "Expired" },
];

// --- Row Actions ---

const apiKeyRowActions: RowAction<ApiKey>[] = [
  {
    key: "revoke",
    label: "Revoke",
    type: "button",
    destructive: true,
    visible: (row) => row.status === "active",
  },
];

// --- Config ---

const apiKeyListConfig: ListTableConfig<ApiKey> = {
  entityName: "API key",
  entityNamePlural: "API keys",
  storageKey: "convexpress-api-keys-screen-options",
  columns: apiKeyColumns,
  statusTabs: apiKeyStatusTabs,
  bulkActions: [],
  rowActions: apiKeyRowActions,
  defaultSort: { orderBy: "created", orderDir: "desc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50],
  getRowId: (row) => row._id,
  primaryColumn: "name",
  showCheckboxes: false,
};

// --- Client-side sort helper ---

function sortKeys(
  keys: ApiKey[],
  orderBy: string,
  orderDir: "asc" | "desc",
): ApiKey[] {
  const sorted = [...keys];
  const dir = orderDir === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    switch (orderBy) {
      case "name":
        return dir * a.name.localeCompare(b.name);
      case "status":
        return dir * a.status.localeCompare(b.status);
      case "lastUsed":
        return dir * ((a.lastUsedAt ?? 0) - (b.lastUsedAt ?? 0));
      case "requests":
        return dir * (a.requestCount - b.requestCount);
      case "created":
      default:
        return dir * (a.createdAt - b.createdAt);
    }
  });

  return sorted;
}

// --- Component ---

export function ApiKeyTable() {
  const keys = useQuery(api.api.queries.listKeys, {}) as ApiKey[] | undefined;
  const [showCreate, setShowCreate] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);

  // Build client-side paginated result from the flat array
  const clientPaginatedData = useMemo<
    | {
        data: PaginatedResult<ApiKey>;
        counts: Record<string, number>;
      }
    | undefined
  >(() => {
    if (keys === undefined) return undefined;
    return {
      data: { items: keys, total: keys.length, page: 1, perPage: keys.length || 20, totalPages: 1 },
      counts: {
        all: keys.length,
        active: keys.filter((k) => k.status === "active").length,
        revoked: keys.filter((k) => k.status === "revoked").length,
        expired: keys.filter((k) => k.status === "expired").length,
      },
    };
  }, [keys]);

  // Use the shared hook for state management
  const table = useListTable({
    config: apiKeyListConfig,
    data: clientPaginatedData?.data,
    counts: clientPaginatedData?.counts,
  });

  // Client-side filtering, searching, sorting, and pagination
  const processedRows = useMemo(() => {
    let items = keys ?? [];

    // Status filter
    if (table.activeStatus && table.activeStatus !== "all") {
      items = items.filter((k) => k.status === table.activeStatus);
    }

    // Search filter (by name or key prefix)
    if (table.search) {
      const q = table.search.toLowerCase();
      items = items.filter(
        (k) =>
          k.name.toLowerCase().includes(q) ||
          k.keyPrefix.toLowerCase().includes(q),
      );
    }

    // Sort
    items = sortKeys(items, table.sort.orderBy, table.sort.orderDir);

    // Pagination
    const total = items.length;
    const perPage = table.pagination.perPage;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(table.pagination.page, totalPages);
    const start = (page - 1) * perPage;
    const paginatedItems = items.slice(start, start + perPage);

    return { items: paginatedItems, total, totalPages, page, perPage };
  }, [keys, table.activeStatus, table.search, table.sort, table.pagination]);

  // Row actions with handlers
  const rowActionsWithHandlers = useMemo<RowAction<ApiKey>[]>(
    () =>
      apiKeyRowActions.map((action) => {
        if (action.key === "revoke") {
          return {
            ...action,
            onClick: (row: ApiKey) => setRevokeTarget(row),
          };
        }
        return action;
      }),
    [],
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">API Keys</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage API keys for external application access.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <KeyIcon className="mr-1 size-3" />
          Create New Key
        </Button>
      </div>

      {/* Screen Options */}
      <ScreenOptions
        columns={apiKeyListConfig.columns}
        state={table.screenOptions}
        onChange={table.setScreenOptions}
        perPageOptions={apiKeyListConfig.perPageOptions}
        entityName="API key"
      />

      {/* Status Tabs */}
      <StatusTabs
        tabs={table.statusTabs}
        activeTab={table.activeStatus}
        onTabChange={table.setStatus}
      />

      {/* Toolbar */}
      <ListTableToolbar
        bulkActionsSlot={<span />}
        searchSlot={
          <SearchBox
            value={table.search}
            onChange={table.setSearch}
            entityName="API Keys"
          />
        }
      />

      {/* List Table */}
      <ListTable
        columns={table.visibleColumns}
        rows={processedRows.items}
        sort={table.sort}
        onSortChange={table.setSort}
        getRowId={apiKeyListConfig.getRowId}
        selection={table.selection}
        onToggleRow={table.toggleRow}
        onToggleAll={table.toggleAll}
        rowActions={rowActionsWithHandlers}
        primaryColumn="name"
        showCheckboxes={false}
        isLoading={table.isLoading}
        getRowLabel={(row) => row.name}
        emptyState={
          <EmptyState
            title="No API keys found"
            description={
              table.activeStatus && table.activeStatus !== "all"
                ? `No ${table.activeStatus} API keys.`
                : table.search
                  ? "Try adjusting your search."
                  : "Create your first API key to enable external application access."
            }
            icon={<KeyIcon className="size-12 text-muted-foreground/50" />}
            isFiltered={!!table.search || !!table.activeStatus}
            action={
              !table.search && (!table.activeStatus || table.activeStatus === "all") ? (
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  <KeyIcon className="mr-1 size-3" />
                  Create New Key
                </Button>
              ) : undefined
            }
          />
        }
      />

      {/* Pagination */}
      <div className="mt-4">
        <Pagination
          total={processedRows.total}
          page={processedRows.page}
          perPage={processedRows.perPage}
          totalPages={processedRows.totalPages}
          onPageChange={table.setPage}
          onPerPageChange={table.setPerPage}
          perPageOptions={apiKeyListConfig.perPageOptions}
          entityNamePlural="API keys"
        />
      </div>

      {/* Dialogs */}
      <CreateKeyDialog open={showCreate} onClose={() => setShowCreate(false)} />
      {revokeTarget && (
        <RevokeKeyDialog
          open={true}
          onClose={() => setRevokeTarget(null)}
          keyId={revokeTarget._id}
          keyName={revokeTarget.name}
          keyPrefix={revokeTarget.keyPrefix}
        />
      )}
    </div>
  );
}
