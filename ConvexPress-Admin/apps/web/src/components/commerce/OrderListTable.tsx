import { useMemo } from "react";
import { Link, useSearch } from "@tanstack/react-router";

import { EmptyState } from "@/components/shared/EmptyState";
import { ListTable } from "@/components/shared/ListTable";
import { ListTableToolbar } from "@/components/shared/ListTableToolbar";
import { Pagination } from "@/components/shared/Pagination";
import { ScreenOptions } from "@/components/shared/ScreenOptions";
import { SearchBox } from "@/components/shared/SearchBox";
import { StatusTabs } from "@/components/shared/StatusTabs";
import { useListTable } from "@/hooks/useListTable";
import { useOrderList } from "@/hooks/commerce/useOrderList";
import { useOrderCounts } from "@/hooks/commerce/useOrderCounts";
import type { OrderListItem, OrderStatus } from "@/lib/commerce/orderTypes";
import type {
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  RowAction,
  StatusTab,
} from "@/types/list-table";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format((amount ?? 0) / 100);
  } catch {
    return `${((amount ?? 0) / 100).toFixed(2)} ${currency}`;
  }
}

function formatDateTime(ts: number) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function customerLabel(o: OrderListItem) {
  if (o.customerName) return o.customerName;
  if (o.customer) {
    const name = [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" ").trim();
    if (name) return name;
    return o.customer.email;
  }
  return o.email || "Guest";
}

const STATUS_TONE: Record<OrderStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-muted text-muted-foreground",
  payment_pending: "bg-warning/10 text-warning",
  processing: "bg-warning/10 text-warning",
  paid: "bg-primary/10 text-primary",
  payment_failed: "bg-destructive/15 text-destructive",
  partially_refunded: "bg-warning/10 text-warning",
  fulfilled: "bg-primary/10 text-primary",
  completed: "bg-primary/15 text-primary",
  cancelled: "bg-destructive/10 text-destructive",
  refunded: "bg-warning/10 text-warning",
  failed: "bg-destructive/15 text-destructive",
};

const SOURCE_LABEL: Record<string, string> = {
  storefront_order: "Storefront",
  form_order: "Form order",
  subscription_signup: "Subscription signup",
  subscription_invoice: "Subscription invoice",
  manual: "Manual",
  api: "API",
};

function sourceLabel(row: OrderListItem) {
  return SOURCE_LABEL[row.sourceType] ?? row.sourceType.replace(/_/g, " ");
}

// ─── Column Definitions ─────────────────────────────────────────────────────

const orderColumns: ColumnDef<OrderListItem>[] = [
  {
    key: "orderNumber",
    label: "Order",
    sortable: true,
    hideable: false,
    width: "w-[16%]",
    render: (row) => (
      <div>
        <Link
          to="/commerce/orders/$orderId"
          params={{ orderId: row._id }}
          className="text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          {row.orderNumber || row._id}
        </Link>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {sourceLabel(row)} · {row.itemTotalQuantity || row.lineCount}{" "}
          {(row.itemTotalQuantity || row.lineCount) === 1 ? "line" : "lines"}
        </div>
      </div>
    ),
  },
  {
    key: "source",
    label: "Source",
    width: "w-[14%]",
    render: (row) => (
      <div>
        <div className="text-sm text-foreground">{sourceLabel(row)}</div>
        {row.sourceLabel ? (
          <div className="text-xs text-muted-foreground">{row.sourceLabel}</div>
        ) : null}
      </div>
    ),
  },
  {
    key: "customer",
    label: "Customer",
    sortable: true,
    width: "w-[22%]",
    render: (row) => (
      <div>
        <div className="text-sm text-foreground">{customerLabel(row)}</div>
        <div className="text-xs text-muted-foreground">{row.email}</div>
      </div>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: "w-[14%]",
    render: (row) => (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          STATUS_TONE[row.status] ?? "bg-muted text-muted-foreground"
        }`}
      >
        {row.status}
      </span>
    ),
  },
  {
    key: "payment",
    label: "Payment",
    width: "w-[12%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">{row.paymentStatus || "—"}</span>
    ),
  },
  {
    key: "fulfillment",
    label: "Fulfillment",
    width: "w-[10%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">{row.fulfillmentStatus || "—"}</span>
    ),
  },
  {
    key: "total",
    label: "Total",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[12%]",
    align: "right",
    render: (row) => (
      <span className="text-sm font-medium text-foreground">
        {formatMoney(row.totalAmount, row.currencyCode)}
      </span>
    ),
  },
  {
    key: "date",
    label: "Date",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[16%]",
    render: (row) => (
      <div>
        <span className="text-xs text-muted-foreground">Created</span>
        <br />
        <span className="text-foreground">{formatDateTime(row.createdAt)}</span>
      </div>
    ),
  },
];

// ─── Status Tabs ────────────────────────────────────────────────────────────

const orderStatusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "payment_pending", label: "Payment Pending" },
  { key: "paid", label: "Paid" },
  { key: "payment_failed", label: "Payment Failed" },
  { key: "partially_refunded", label: "Partial Refund" },
  { key: "refunded", label: "Refunded" },
  { key: "fulfilled", label: "Fulfilled" },
  { key: "cancelled", label: "Cancelled" },
];

// ─── Row Actions ────────────────────────────────────────────────────────────

const orderRowActions: RowAction<OrderListItem>[] = [
  {
    key: "view",
    label: "View",
    type: "link",
    href: (row) => `/commerce/orders/${row._id}`,
  },
];

// ─── Config ─────────────────────────────────────────────────────────────────

const orderListConfig: ListTableConfig<OrderListItem> = {
  entityName: "order",
  entityNamePlural: "orders",
  storageKey: "convexpress-commerce-orders-screen-options",
  columns: orderColumns,
  statusTabs: orderStatusTabs,
  bulkActions: [],
  rowActions: orderRowActions,
  defaultSort: { orderBy: "date", orderDir: "desc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50, 100],
  getRowId: (row) => row._id,
  primaryColumn: "orderNumber",
  showCheckboxes: false,
};

// ─── Component ──────────────────────────────────────────────────────────────

export function OrderListTable() {
  // Read URL search params directly so the data query and useListTable
  // see the exact same source of truth.
  const params = useSearch({ strict: false }) as Record<string, any>;

  const { data: ordersData, isLoading: ordersLoading } = useOrderList({
    status: params.status,
    search: params.search,
    orderBy: params.orderBy,
    orderDir: params.orderDir,
    page: params.page,
    perPage: params.perPage,
    sourceType: params.sourceType,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  const { counts: countsData } = useOrderCounts({
    search: params.search,
    sourceType: params.sourceType,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const emptyData: PaginatedResult<OrderListItem> = {
    items: [],
    total: 0,
    page: 1,
    perPage: 20,
    totalPages: 0,
  };

  const tableWithData = useListTable({
    config: orderListConfig,
    data: ordersData ?? emptyData,
    counts: countsData ?? {},
  });

  const rowActionsMemo = useMemo<RowAction<OrderListItem>[]>(() => orderRowActions, []);

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Orders</h1>
        <div className="text-sm text-muted-foreground">
          {tableWithData.total > 0 && (
            <span>
              {tableWithData.total.toLocaleString()} {tableWithData.total === 1 ? "order" : "orders"}
            </span>
          )}
        </div>
      </div>

      {/* Screen Options */}
      <ScreenOptions
        columns={orderListConfig.columns}
        state={tableWithData.screenOptions}
        onChange={tableWithData.setScreenOptions}
        perPageOptions={orderListConfig.perPageOptions}
        entityName="order"
      />

      {/* Status Tabs */}
      <StatusTabs
        tabs={tableWithData.statusTabs}
        activeTab={tableWithData.activeStatus}
        onTabChange={tableWithData.setStatus}
      />

      {/* Toolbar */}
      <ListTableToolbar
        searchSlot={
          <SearchBox
            value={tableWithData.search}
            onChange={tableWithData.setSearch}
            entityName="Orders"
          />
        }
      />

      {/* List Table */}
      <ListTable
        columns={tableWithData.visibleColumns}
        rows={tableWithData.rows}
        sort={tableWithData.sort}
        onSortChange={tableWithData.setSort}
        getRowId={orderListConfig.getRowId}
        selection={tableWithData.selection}
        onToggleRow={tableWithData.toggleRow}
        onToggleAll={tableWithData.toggleAll}
        rowActions={rowActionsMemo}
        primaryColumn="orderNumber"
        showCheckboxes={false}
        isLoading={ordersLoading}
        getRowLabel={(row) => row.orderNumber || row._id}
        emptyState={
          <EmptyState
            title="No orders found."
            description={
              tableWithData.search
                ? "Try adjusting your search or filters."
                : "Purchases will appear here once customers check out, pay a form, or subscribe."
            }
            isFiltered={!!tableWithData.search || !!tableWithData.activeStatus}
          />
        }
      />

      {/* Pagination */}
      <div className="mt-4">
        <Pagination
          total={tableWithData.total}
          page={tableWithData.pagination.page}
          perPage={tableWithData.pagination.perPage}
          totalPages={tableWithData.totalPages}
          onPageChange={tableWithData.setPage}
          onPerPageChange={tableWithData.setPerPage}
          perPageOptions={orderListConfig.perPageOptions}
          entityNamePlural="orders"
        />
      </div>
    </div>
  );
}
