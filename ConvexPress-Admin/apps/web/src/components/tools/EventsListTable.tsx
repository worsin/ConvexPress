/**
 * Events List Table
 *
 * Displays event definitions synced from Airtable.
 * Shows: Name, Event Code, Category, Status, Email Notifications, Site Notifications.
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

interface EventRow {
  _id: string;
  name: string;
  eventCode: string;
  category?: string;
  status: string;
  auditStatus?: string;
  completion?: number;
  emailNotificationNames?: string[];
  siteNotificationNames?: string[];
  systemName?: string;
}

const columns: ColumnDef<EventRow>[] = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    hideable: false,
    width: "w-[20%]",
    render: (row) => (
      <span className="text-sm font-medium text-foreground">{row.name}</span>
    ),
  },
  {
    key: "eventCode",
    label: "Event Code",
    sortable: true,
    width: "w-[18%]",
    render: (row) => (
      <code className="text-xs text-muted-foreground">{row.eventCode}</code>
    ),
  },
  {
    key: "category",
    label: "Category",
    width: "w-[12%]",
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
    key: "email",
    label: "Email Notifs",
    width: "w-[15%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {row.emailNotificationNames && row.emailNotificationNames.length > 0
          ? row.emailNotificationNames.length
          : "--"}
      </span>
    ),
  },
  {
    key: "siteNotif",
    label: "Site Notifs",
    width: "w-[15%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {row.siteNotificationNames && row.siteNotificationNames.length > 0
          ? row.siteNotificationNames.length
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

const config: ListTableConfig<EventRow> = {
  entityName: "event",
  entityNamePlural: "events",
  storageKey: "convexpress-tools-events",
  columns,
  statusTabs,
  bulkActions: [],
  rowActions: [],
  defaultSort: { orderBy: "eventCode", orderDir: "asc" },
  defaultPerPage: 50,
  perPageOptions: [20, 50, 100],
  getRowId: (row) => row._id,
  primaryColumn: "name",
  showCheckboxes: false,
};

export function EventsListTable() {
  const searchParams = useSearch({ strict: false }) as Record<
    string,
    string | undefined
  >;

  const events = useQuery(api.eventDefinitions.queries.list, {
    status:
      searchParams.status && searchParams.status !== "all"
        ? searchParams.status
        : undefined,
    search: searchParams.search,
  });

  const eventCounts = useQuery(api.eventDefinitions.queries.counts);

  const data = useMemo<PaginatedResult<EventRow> | undefined>(() => {
    if (events === undefined) return undefined;
    return {
      items: events as EventRow[],
      total: events.length,
      page: 1,
      perPage: 200,
      totalPages: 1,
    };
  }, [events]);

  const table = useListTable({
    config,
    data,
    counts: eventCounts as Record<string, number> | undefined,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Events</h1>
        <AirtableSyncButton
          syncAction={api.airtableSync.actions.syncEvents}
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
            entityName="Events"
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
            title="No events found."
            description='Click "Sync from Airtable" to load event definitions from the blueprint.'
            isFiltered={!!table.search || !!table.activeStatus}
          />
        }
      />
    </div>
  );
}
