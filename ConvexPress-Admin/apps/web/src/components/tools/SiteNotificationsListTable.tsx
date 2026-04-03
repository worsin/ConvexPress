/**
 * Site Notifications List Table
 *
 * Displays site notification definitions synced from Airtable.
 * Shows: Name, Type, Recipient, Status, Persistent, Event Codes.
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

interface SiteNotifRow {
  _id: string;
  name: string;
  notificationType: string;
  status: string;
  persistent: boolean;
  recipientType?: string;
  eventCodes?: string[];
  systemName?: string;
  auditStatus?: string;
}

const columns: ColumnDef<SiteNotifRow>[] = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    hideable: false,
    width: "w-[25%]",
    render: (row) => (
      <span className="text-sm font-medium text-foreground">{row.name}</span>
    ),
  },
  {
    key: "type",
    label: "Type",
    width: "w-[12%]",
    render: (row) => (
      <span className="text-muted-foreground">{row.notificationType}</span>
    ),
  },
  {
    key: "recipient",
    label: "Recipient",
    width: "w-[12%]",
    render: (row) => (
      <span className="text-muted-foreground">
        {row.recipientType ?? "--"}
      </span>
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
    key: "persistent",
    label: "Persistent",
    width: "w-[10%]",
    align: "center",
    render: (row) =>
      row.persistent ? (
        <CheckIcon className="size-3.5 text-foreground mx-auto" />
      ) : (
        <XIcon className="size-3.5 text-muted-foreground/50 mx-auto" />
      ),
  },
  {
    key: "events",
    label: "Events",
    width: "w-[20%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {row.eventCodes && row.eventCodes.length > 0
          ? row.eventCodes.join(", ")
          : "--"}
      </span>
    ),
  },
  {
    key: "system",
    label: "System",
    width: "w-[11%]",
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
  { key: "Draft", label: "Draft" },
  { key: "Inactive", label: "Inactive" },
];

const config: ListTableConfig<SiteNotifRow> = {
  entityName: "site notification",
  entityNamePlural: "site notifications",
  storageKey: "convexpress-tools-site-notifications",
  columns,
  statusTabs,
  bulkActions: [],
  rowActions: [],
  defaultSort: { orderBy: "name", orderDir: "asc" },
  defaultPerPage: 50,
  perPageOptions: [20, 50],
  getRowId: (row) => row._id,
  primaryColumn: "name",
  showCheckboxes: false,
};

export function SiteNotificationsListTable() {
  const searchParams = useSearch({ strict: false }) as Record<
    string,
    string | undefined
  >;

  const notifs = useQuery(api.siteNotificationDefinitions.queries.list, {
    status:
      searchParams.status && searchParams.status !== "all"
        ? searchParams.status
        : undefined,
    search: searchParams.search,
  });

  const notifCounts = useQuery(
    api.siteNotificationDefinitions.queries.counts,
  );

  const data = useMemo<PaginatedResult<SiteNotifRow> | undefined>(() => {
    if (notifs === undefined) return undefined;
    return {
      items: notifs as SiteNotifRow[],
      total: notifs.length,
      page: 1,
      perPage: 200,
      totalPages: 1,
    };
  }, [notifs]);

  const table = useListTable({
    config,
    data,
    counts: notifCounts as Record<string, number> | undefined,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">
          Site Notifications
        </h1>
        <AirtableSyncButton
          syncAction={api.airtableSync.actions.syncSiteNotifications}
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
            entityName="Site Notifications"
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
            title="No site notifications found."
            description='Click "Sync from Airtable" to load notification definitions from the blueprint.'
            isFiltered={!!table.search || !!table.activeStatus}
          />
        }
      />
    </div>
  );
}
