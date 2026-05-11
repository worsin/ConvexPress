import { useCallback, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import type { Id } from "@backend/convex/_generated/dataModel";

import { BulkActions } from "@/components/shared/BulkActions";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
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
import { useOrderMutations } from "@/hooks/commerce/useOrderMutations";
import type { OrderListItem, OrderStatus } from "@/lib/commerce/orderTypes";
import type {
  BulkAction,
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
    }).format(amount);
  } catch {
    return `${(amount ?? 0).toFixed(2)} ${currency}`;
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
  if (o.customer) {
    const name = [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" ").trim();
    if (name) return name;
    return o.customer.email;
  }
  return o.email || "Guest";
}

const STATUS_TONE: Record<OrderStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  processing: "bg-primary/10 text-primary",
  paid: "bg-primary/10 text-primary",
  fulfilled: "bg-primary/10 text-primary",
  completed: "bg-primary/15 text-primary",
  cancelled: "bg-destructive/10 text-destructive",
  refunded: "bg-warning/10 text-warning",
  failed: "bg-destructive/15 text-destructive",
};

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
          {row.itemTotalQuantity} {row.itemTotalQuantity === 1 ? "item" : "items"}
        </div>
      </div>
    ),
  },
  {
    key: "customer",
    label: "Customer",
    sortable: true,
    width: "w-[24%]",
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
    width: "w-[12%]",
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
    width: "w-[10%]",
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
  { key: "pending", label: "Pending" },
  { key: "processing", label: "Processing" },
  { key: "paid", label: "Paid" },
  { key: "fulfilled", label: "Fulfilled" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "refunded", label: "Refunded" },
  { key: "failed", label: "Failed" },
];

// ─── Bulk Actions ───────────────────────────────────────────────────────────

const orderBulkActions: BulkAction[] = [
  { key: "mark-processing", label: "Mark as Processing" },
  { key: "mark-paid", label: "Mark as Paid" },
  { key: "mark-fulfilled", label: "Mark as Fulfilled" },
  { key: "mark-completed", label: "Mark as Completed" },
  {
    key: "cancel",
    label: "Cancel Orders",
    requiresConfirmation: true,
    confirmMessage:
      "Cancel the selected orders? Inventory will not be auto-restored — handle that separately if needed.",
    destructive: true,
  },
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
  bulkActions: orderBulkActions,
  rowActions: orderRowActions,
  defaultSort: { orderBy: "date", orderDir: "desc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50, 100],
  getRowId: (row) => row._id,
  primaryColumn: "orderNumber",
  showCheckboxes: true,
};

// ─── Component ──────────────────────────────────────────────────────────────

export function OrderListTable() {
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    destructive: boolean;
  }>({ open: false, title: "", message: "", onConfirm: () => {}, destructive: false });

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
  });
  const { counts: countsData } = useOrderCounts({ search: params.search });

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

  const { bulkUpdateOrderStatus, bulkCancelOrders } = useOrderMutations();

  // ─── Bulk Action Handler ───────────────────────────────────────────────
  const handleBulkAction = useCallback(
    (actionKey: string) => {
      const selectedIds = Array.from(tableWithData.selection.selectedIds) as Id<"commerce_orders">[];
      if (selectedIds.length === 0) return;

      const statusMap: Record<string, string> = {
        "mark-processing": "processing",
        "mark-paid": "paid",
        "mark-fulfilled": "fulfilled",
        "mark-completed": "completed",
      };

      if (actionKey in statusMap) {
        const newStatus = statusMap[actionKey];
        void bulkUpdateOrderStatus(selectedIds, newStatus).then(() =>
          tableWithData.clearSelection(),
        );
        return;
      }

      if (actionKey === "cancel") {
        setConfirmDialog({
          open: true,
          title: "Cancel orders?",
          message: `You are about to cancel ${selectedIds.length} ${
            selectedIds.length === 1 ? "order" : "orders"
          }. This action cannot be undone via this dialog.`,
          onConfirm: async () => {
            await bulkCancelOrders(selectedIds);
            tableWithData.clearSelection();
            setConfirmDialog((prev) => ({ ...prev, open: false }));
          },
          destructive: true,
        });
      }
    },
    [tableWithData, bulkUpdateOrderStatus, bulkCancelOrders],
  );

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
        bulkActionsSlot={
          <BulkActions
            actions={orderBulkActions}
            selectedCount={tableWithData.selection.count}
            onApply={handleBulkAction}
          />
        }
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
        showCheckboxes
        isLoading={ordersLoading}
        getRowLabel={(row) => row.orderNumber || row._id}
        emptyState={
          <EmptyState
            title="No orders found."
            description={
              tableWithData.search
                ? "Try adjusting your search or filters."
                : "Orders will appear here once customers check out."
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

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.destructive ? "Cancel orders" : "Confirm"}
        destructive={confirmDialog.destructive}
      />
    </div>
  );
}
