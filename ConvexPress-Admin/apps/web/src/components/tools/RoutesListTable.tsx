/**
 * Routes List Table
 *
 * Displays route definitions synced from Airtable.
 * Shows: Name, Path, Layout, App, Auth Required, Status, Roles.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useSearch } from "@tanstack/react-router";
import { CheckIcon, XIcon } from "lucide-react";

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

interface RouteRow {
  _id: string;
  name: string;
  path: string;
  layout?: string;
  authRequired: boolean;
  routeType: string;
  status: string;
  app?: string;
  completion?: number;
  roleNames?: string[];
  systemName?: string;
}

const columns: ColumnDef<RouteRow>[] = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    hideable: false,
    width: "w-[18%]",
    render: (row) => (
      <span className="text-sm font-medium text-foreground">{row.name}</span>
    ),
  },
  {
    key: "path",
    label: "Path",
    sortable: true,
    width: "w-[22%]",
    render: (row) => (
      <code className="text-xs text-muted-foreground">{row.path}</code>
    ),
  },
  {
    key: "layout",
    label: "Layout",
    width: "w-[10%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {row.layout ?? "--"}
      </span>
    ),
  },
  {
    key: "app",
    label: "App",
    width: "w-[10%]",
    render: (row) => (
      <span className="text-muted-foreground">{row.app ?? "--"}</span>
    ),
  },
  {
    key: "auth",
    label: "Auth",
    width: "w-[7%]",
    align: "center",
    render: (row) =>
      row.authRequired ? (
        <CheckIcon className="size-3.5 text-foreground mx-auto" />
      ) : (
        <XIcon className="size-3.5 text-muted-foreground/50 mx-auto" />
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
    key: "roles",
    label: "Roles",
    width: "w-[23%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {row.roleNames && row.roleNames.length > 0
          ? row.roleNames.join(", ")
          : "--"}
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

const config: ListTableConfig<RouteRow> = {
  entityName: "route",
  entityNamePlural: "routes",
  storageKey: "smithharper-tools-routes",
  columns,
  statusTabs,
  bulkActions: [],
  rowActions: [],
  defaultSort: { orderBy: "path", orderDir: "asc" },
  defaultPerPage: 50,
  perPageOptions: [20, 50, 100],
  getRowId: (row) => row._id,
  primaryColumn: "name",
  showCheckboxes: false,
};

export function RoutesListTable() {
  const searchParams = useSearch({ strict: false }) as Record<
    string,
    string | undefined
  >;

  const routes = useQuery(api.routeDefinitions.queries.list, {
    status:
      searchParams.status && searchParams.status !== "all"
        ? searchParams.status
        : undefined,
    app: searchParams.app,
    search: searchParams.search,
  });

  const routeCounts = useQuery(api.routeDefinitions.queries.counts);

  const data = useMemo<PaginatedResult<RouteRow> | undefined>(() => {
    if (routes === undefined) return undefined;
    return {
      items: routes as RouteRow[],
      total: routes.length,
      page: 1,
      perPage: 200,
      totalPages: 1,
    };
  }, [routes]);

  const table = useListTable({
    config,
    data,
    counts: routeCounts as Record<string, number> | undefined,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Routes</h1>
        <AirtableSyncButton
          syncAction={api.airtableSync.actions.syncRoutes}
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
            entityName="Routes"
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
            title="No routes found."
            description='Click "Sync from Airtable" to load route definitions from the blueprint.'
            isFiltered={!!table.search || !!table.activeStatus}
          />
        }
      />
    </div>
  );
}
