import { useSearch } from "@tanstack/react-router";
import type { Id } from "@backend/convex/_generated/dataModel";

import { EmptyState } from "@/components/shared/EmptyState";
import { ListTable } from "@/components/shared/ListTable";
import { ListTableToolbar } from "@/components/shared/ListTableToolbar";
import { Pagination } from "@/components/shared/Pagination";
import { ScreenOptions } from "@/components/shared/ScreenOptions";
import { SearchBox } from "@/components/shared/SearchBox";
import { StatusTabs } from "@/components/shared/StatusTabs";
import { useListTable } from "@/hooks/useListTable";
import { useCustomerList } from "@/hooks/commerce/useCustomerList";
import { useCustomerCounts } from "@/hooks/commerce/useCustomerCounts";
import type { CustomerListItem } from "@/lib/commerce/customerTypes";
import type {
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  RowAction,
  StatusTab,
} from "@/types/list-table";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMoney(amount: number, currency = "USD") {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount / 100);
  } catch {
    return `$${(amount / 100).toFixed(2)}`;
  }
}

function formatDate(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString();
}

function customerName(c: CustomerListItem) {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || "Unnamed customer";
}

// ─── Columns ────────────────────────────────────────────────────────────────

const customerColumns: ColumnDef<CustomerListItem>[] = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    hideable: false,
    width: "w-[24%]",
    render: (row) => (
      <div>
        <div className="text-sm font-medium text-foreground">{customerName(row)}</div>
        {row.isGuest && (
          <span className="text-xs text-muted-foreground italic">Guest</span>
        )}
      </div>
    ),
  },
  {
    key: "email",
    label: "Email",
    sortable: true,
    width: "w-[24%]",
    render: (row) => (
      <span className="text-sm text-muted-foreground">{row.email || "—"}</span>
    ),
  },
  {
    key: "phone",
    label: "Phone",
    width: "w-[14%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">{row.phone || "—"}</span>
    ),
  },
  {
    key: "orders",
    label: "Orders",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[10%]",
    align: "right",
    render: (row) => (
      <span className="text-sm text-foreground">{row.totalOrders ?? 0}</span>
    ),
  },
  {
    key: "spent",
    label: "Total Spent",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[14%]",
    align: "right",
    render: (row) => (
      <span className="text-sm font-medium text-foreground">
        {formatMoney(row.totalSpentAmount ?? 0, row.currencyCode || "USD")}
      </span>
    ),
  },
  {
    key: "date",
    label: "Customer Since",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[14%]",
    render: (row) => (
      <span className="text-sm text-muted-foreground">{formatDate(row.createdAt)}</span>
    ),
  },
];

// ─── Status Tabs ────────────────────────────────────────────────────────────

const customerStatusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "with_orders", label: "With Orders" },
  { key: "no_orders", label: "No Orders" },
  { key: "guests", label: "Guests" },
  { key: "registered", label: "Registered" },
];

// ─── Row Actions ────────────────────────────────────────────────────────────

const customerRowActions: RowAction<CustomerListItem>[] = [
  {
    key: "store-credit",
    label: "Store Credit",
    type: "link",
    href: (row) =>
      row.userId
        ? `/commerce/customers/${row.userId}/store-credit`
        : `/commerce/customers/${row._id}`,
    visible: (row) => Boolean(row.userId),
  },
];

// ─── Config ─────────────────────────────────────────────────────────────────

const customerListConfig: ListTableConfig<CustomerListItem> = {
  entityName: "customer",
  entityNamePlural: "customers",
  storageKey: "convexpress-commerce-customers-screen-options",
  columns: customerColumns,
  statusTabs: customerStatusTabs,
  bulkActions: [],
  rowActions: customerRowActions,
  defaultSort: { orderBy: "date", orderDir: "desc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50, 100],
  getRowId: (row) => row._id as unknown as string,
  primaryColumn: "name",
  showCheckboxes: false,
};

// ─── Component ──────────────────────────────────────────────────────────────

export function CustomerListTable() {
  const params = useSearch({ strict: false }) as Record<string, any>;

  const { data: customersData, isLoading } = useCustomerList({
    status: params.status,
    search: params.search,
    orderBy: params.orderBy,
    orderDir: params.orderDir,
    page: params.page,
    perPage: params.perPage,
  });
  const { counts } = useCustomerCounts({ search: params.search });

  const emptyData: PaginatedResult<CustomerListItem> = {
    items: [],
    total: 0,
    page: 1,
    perPage: 20,
    totalPages: 0,
  };

  const table = useListTable({
    config: customerListConfig,
    data: customersData ?? emptyData,
    counts: counts ?? {},
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Customers</h1>
        {table.total > 0 && (
          <span className="text-sm text-muted-foreground">
            {table.total.toLocaleString()} {table.total === 1 ? "customer" : "customers"}
          </span>
        )}
      </div>

      <ScreenOptions
        columns={customerListConfig.columns}
        state={table.screenOptions}
        onChange={table.setScreenOptions}
        perPageOptions={customerListConfig.perPageOptions}
        entityName="customer"
      />

      <StatusTabs
        tabs={table.statusTabs}
        activeTab={table.activeStatus}
        onTabChange={table.setStatus}
      />

      <ListTableToolbar
        bulkActionsSlot={null}
        searchSlot={
          <SearchBox
            value={table.search}
            onChange={table.setSearch}
            entityName="Customers"
          />
        }
      />

      <ListTable
        columns={table.visibleColumns}
        rows={table.rows}
        sort={table.sort}
        onSortChange={table.setSort}
        getRowId={customerListConfig.getRowId}
        selection={table.selection}
        onToggleRow={table.toggleRow}
        onToggleAll={table.toggleAll}
        rowActions={customerRowActions}
        primaryColumn="name"
        showCheckboxes={false}
        isLoading={isLoading}
        getRowLabel={(row) => customerName(row)}
        emptyState={
          <EmptyState
            title="No customers found."
            description={
              table.search
                ? "Try adjusting your search."
                : "Customers will appear here once people sign up or place orders."
            }
            isFiltered={!!table.search || !!table.activeStatus}
          />
        }
      />

      <div className="mt-4">
        <Pagination
          total={table.total}
          page={table.pagination.page}
          perPage={table.pagination.perPage}
          totalPages={table.totalPages}
          onPageChange={table.setPage}
          onPerPageChange={table.setPerPage}
          perPageOptions={customerListConfig.perPageOptions}
          entityNamePlural="customers"
        />
      </div>
    </div>
  );
}
