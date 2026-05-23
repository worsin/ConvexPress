/**
 * Email Notifications List Table
 *
 * Displays email template definitions from Convex.
 * Shows: Name, Subject Template, Recipient Type, Priority, Status.
 *
 * The sync button updates metadata from Airtable without
 * overwriting admin-customized email content.
 */

import { useMemo } from "react";
import { useQuery } from "convex-helpers/react/cache";

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

interface EmailRow {
  _id: string;
  name: string;
  slug: string;
  subjectTemplate: string;
  recipientType: string;
  priority: string;
  isActive: boolean;
  eventCode?: string;
  category: string;
  totalSent: number;
}

const columns: ColumnDef<EmailRow>[] = [
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
    key: "subject",
    label: "Subject Template",
    width: "w-[25%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground truncate block max-w-xs">
        {row.subjectTemplate}
      </span>
    ),
  },
  {
    key: "recipientType",
    label: "Recipient",
    width: "w-[12%]",
    render: (row) => (
      <span className="text-muted-foreground capitalize">
        {row.recipientType}
      </span>
    ),
  },
  {
    key: "priority",
    label: "Priority",
    width: "w-[10%]",
    render: (row) => (
      <span className="text-muted-foreground capitalize">{row.priority}</span>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: "w-[10%]",
    render: (row) => (
      <span className="text-muted-foreground">
        {row.isActive ? "Active" : "Inactive"}
      </span>
    ),
  },
  {
    key: "category",
    label: "Category",
    width: "w-[11%]",
    render: (row) => (
      <span className="text-muted-foreground capitalize">{row.category}</span>
    ),
  },
  {
    key: "sent",
    label: "Sent",
    width: "w-[10%]",
    align: "center",
    render: (row) => (
      <span className="text-muted-foreground">{row.totalSent}</span>
    ),
  },
];

const statusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
];

const config: ListTableConfig<EmailRow> = {
  entityName: "email notification",
  entityNamePlural: "email notifications",
  storageKey: "convexpress-tools-email-notifications",
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

export function EmailNotificationsListTable() {
  const templates = useQuery(api.emails.queries.listTemplates, {});

  const data = useMemo<PaginatedResult<EmailRow> | undefined>(() => {
    if (templates === undefined) return undefined;
    const items = Array.isArray(templates) ? templates : [];
    return {
      items: items as EmailRow[],
      total: items.length,
      page: 1,
      perPage: 200,
      totalPages: 1,
    };
  }, [templates]);

  const counts = useMemo(() => {
    if (!data) return undefined;
    const c: Record<string, number> = { all: data.items.length };
    for (const item of data.items) {
      const status = item.isActive ? "active" : "inactive";
      c[status] = (c[status] ?? 0) + 1;
    }
    return c;
  }, [data]);

  const table = useListTable({ config, data, counts });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">
          Email Notifications
        </h1>
        <AirtableSyncButton
          syncAction={api.airtableSync.actions.syncEmailNotifications}
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
            entityName="Email Notifications"
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
            title="No email notifications found."
            description="Email templates will appear here after sync or seed."
            isFiltered={!!table.search || !!table.activeStatus}
          />
        }
      />
    </div>
  );
}
