/**
 * Capabilities List Table
 *
 * Displays capability/action definitions synced from Airtable.
 * Shows: Name, Action Code, Category, Status, Audit Status, Roles.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useSearch } from "@tanstack/react-router";

import { api } from "@backend/convex/_generated/api";

import { AirtableSyncButton } from "@/components/shared/AirtableSyncButton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListTable } from "@/components/shared/ListTable";
import { ListTableToolbar } from "@/components/shared/ListTableToolbar";
import { SearchBox } from "@/components/shared/SearchBox";
import { StatusTabs } from "@/components/shared/StatusTabs";
import { useListTable } from "@/hooks/useListTable";
import type {
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  StatusTab,
} from "@/types/list-table";

interface CapabilityRow {
  _id: string;
  name: string;
  actionCode: string;
  category?: string;
  status: string;
  auditStatus?: string;
  completion?: number;
  roleNames?: string[];
  eventCodes?: string[];
  systemName?: string;
}

const columns: ColumnDef<CapabilityRow>[] = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    hideable: false,
    width: "w-[22%]",
    render: (row) => (
      <span className="text-sm font-medium text-foreground">{row.name}</span>
    ),
  },
  {
    key: "actionCode",
    label: "Action Code",
    sortable: true,
    width: "w-[18%]",
    render: (row) => (
      <code className="text-xs text-muted-foreground">{row.actionCode}</code>
    ),
  },
  {
    key: "category",
    label: "Category",
    width: "w-[14%]",
    render: (row) => (
      <span className="text-muted-foreground">{row.category ?? "--"}</span>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: "w-[10%]",
    render: (row) => (
      <span className="text-muted-foreground">{row.status}</span>
    ),
  },
  {
    key: "auditStatus",
    label: "Audit",
    width: "w-[10%]",
    render: (row) => (
      <span className="text-muted-foreground">
        {row.auditStatus ?? "--"}
      </span>
    ),
  },
  {
    key: "roles",
    label: "Roles",
    width: "w-[18%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {row.roleNames && row.roleNames.length > 0
          ? row.roleNames.join(", ")
          : "--"}
      </span>
    ),
  },
  {
    key: "system",
    label: "System",
    width: "w-[8%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {row.systemName ?? "--"}
      </span>
    ),
  },
];

const statusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "Active", label: "Active" },
  { key: "Planned", label: "Planned" },
  { key: "Inactive", label: "Inactive" },
];

const config: ListTableConfig<CapabilityRow> = {
  entityName: "capability",
  entityNamePlural: "capabilities",
  storageKey: "convexpress-tools-capabilities",
  columns,
  statusTabs,
  bulkActions: [],
  rowActions: [],
  defaultSort: { orderBy: "actionCode", orderDir: "asc" },
  defaultPerPage: 50,
  perPageOptions: [20, 50, 100],
  getRowId: (row) => row._id,
  primaryColumn: "name",
  showCheckboxes: false,
};

export function CapabilitiesListTable() {
  const searchParams = useSearch({ strict: false }) as Record<
    string,
    string | undefined
  >;

  const capabilities = useQuery(api.capabilities.queries.list, {
    status:
      searchParams.status && searchParams.status !== "all"
        ? searchParams.status
        : undefined,
    search: searchParams.search,
  });

  const capCounts = useQuery(api.capabilities.queries.counts);

  const data = useMemo<PaginatedResult<CapabilityRow> | undefined>(() => {
    if (capabilities === undefined) return undefined;
    return {
      items: capabilities as CapabilityRow[],
      total: capabilities.length,
      page: 1,
      perPage: 200,
      totalPages: 1,
    };
  }, [capabilities]);

  const table = useListTable({
    config,
    data,
    counts: capCounts as Record<string, number> | undefined,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Capabilities</h1>
        <AirtableSyncButton
          syncAction={api.airtableSync.actions.syncCapabilities}
        />
      </div>

      <StatusTabs
        tabs={table.statusTabs}
        activeTab={table.activeStatus}
        onTabChange={table.setStatus}
      />

      <ListTableToolbar
        searchSlot={
          <SearchBox
            value={table.search}
            onChange={table.setSearch}
            entityName="Capabilities"
          />
        }
      />

      <ListTable
        columns={table.visibleColumns}
        rows={table.rows}
        sort={table.sort}
        onSortChange={table.setSort}
        getRowId={config.getRowId}
        selection={table.selection}
        onToggleRow={table.toggleRow}
        onToggleAll={table.toggleAll}
        rowActions={[]}
        primaryColumn="name"
        showCheckboxes={false}
        isLoading={table.isLoading}
        emptyState={
          <EmptyState
            title="No capabilities found."
            description='Click "Sync from Airtable" to load capabilities from the blueprint.'
            isFiltered={!!table.search || !!table.activeStatus}
          />
        }
      />
    </div>
  );
}
