import { useCallback, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
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
import { useDiscountList } from "@/hooks/commerce/useDiscountList";
import { useDiscountCounts } from "@/hooks/commerce/useDiscountCounts";
import { useDiscountMutations } from "@/hooks/commerce/useDiscountMutations";
import type {
  DiscountListItem,
  DiscountStatus,
  DiscountType,
} from "@/lib/commerce/discountTypes";
import type {
  BulkAction,
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  RowAction,
  StatusTab,
} from "@/types/list-table";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatAmount(type: DiscountType, amount: number) {
  if (type === "percent") return `${amount}%`;
  if (type === "free_shipping") return "Free shipping";
  return `$${(amount / 100).toFixed(2)}`;
}

function formatDate(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString();
}

function discountWindow(d: DiscountListItem) {
  const now = Date.now();
  if (d.startsAt && d.startsAt > now) return "Scheduled";
  if (d.endsAt && d.endsAt < now) return "Expired";
  return null;
}

const STATUS_TONE: Record<DiscountStatus, string> = {
  active: "bg-primary/10 text-primary",
  inactive: "bg-muted text-muted-foreground",
};

// ─── Columns ────────────────────────────────────────────────────────────────

const discountColumns: ColumnDef<DiscountListItem>[] = [
  {
    key: "code",
    label: "Code",
    sortable: true,
    hideable: false,
    width: "w-[20%]",
    render: (row) => {
      const window = discountWindow(row);
      return (
        <div>
          <div className="text-sm font-mono font-medium text-foreground">{row.code}</div>
          {row.description && (
            <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              {row.description}
            </div>
          )}
          {window && (
            <span className="mt-0.5 inline-block text-xs italic text-warning">{window}</span>
          )}
        </div>
      );
    },
  },
  {
    key: "type",
    label: "Type",
    width: "w-[14%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground capitalize">
        {row.discountType.replace("_", " ")}
      </span>
    ),
  },
  {
    key: "amount",
    label: "Amount",
    sortable: true,
    width: "w-[12%]",
    align: "right",
    render: (row) => (
      <span className="text-sm font-medium text-foreground">
        {formatAmount(row.discountType, row.amount)}
      </span>
    ),
  },
  {
    key: "usage",
    label: "Usage",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[12%]",
    align: "right",
    render: (row) => {
      const used = row.usageCount ?? 0;
      const limit = row.usageLimit;
      return (
        <span className="text-xs text-muted-foreground">
          {used}
          {typeof limit === "number" ? ` / ${limit}` : ""}
        </span>
      );
    },
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
    key: "ends",
    label: "Ends",
    sortable: true,
    width: "w-[14%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">{formatDate(row.endsAt)}</span>
    ),
  },
  {
    key: "date",
    label: "Updated",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[16%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">{formatDate(row.updatedAt)}</span>
    ),
  },
];

// ─── Status Tabs ────────────────────────────────────────────────────────────

const discountStatusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "scheduled", label: "Scheduled" },
  { key: "expired", label: "Expired" },
];

// ─── Bulk Actions ───────────────────────────────────────────────────────────

const discountBulkActions: BulkAction[] = [
  { key: "activate", label: "Activate" },
  { key: "deactivate", label: "Deactivate" },
  {
    key: "delete",
    label: "Delete Permanently",
    requiresConfirmation: true,
    confirmMessage:
      "You are about to permanently delete the selected discount codes. This action cannot be undone.",
    destructive: true,
  },
];

// ─── Row Actions ────────────────────────────────────────────────────────────

const discountRowActions: RowAction<DiscountListItem>[] = [
  {
    key: "toggle",
    label: "Toggle status",
    type: "button",
  },
  {
    key: "delete",
    label: "Delete",
    type: "button",
    destructive: true,
  },
];

// ─── Config ─────────────────────────────────────────────────────────────────

const discountListConfig: ListTableConfig<DiscountListItem> = {
  entityName: "discount",
  entityNamePlural: "discounts",
  storageKey: "convexpress-commerce-discounts-screen-options",
  columns: discountColumns,
  statusTabs: discountStatusTabs,
  bulkActions: discountBulkActions,
  rowActions: discountRowActions,
  defaultSort: { orderBy: "date", orderDir: "desc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50, 100],
  getRowId: (row) => row._id as unknown as string,
  primaryColumn: "code",
  showCheckboxes: true,
};

// ─── Component ──────────────────────────────────────────────────────────────

export function DiscountListTable() {
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    destructive: boolean;
  }>({ open: false, title: "", message: "", onConfirm: () => {}, destructive: false });

  const params = useSearch({ strict: false }) as Record<string, any>;

  const { data: discountsData, isLoading } = useDiscountList({
    status: params.status,
    search: params.search,
    discountType: params.discountType,
    orderBy: params.orderBy,
    orderDir: params.orderDir,
    page: params.page,
    perPage: params.perPage,
  });
  const { counts } = useDiscountCounts({ search: params.search });

  const emptyData: PaginatedResult<DiscountListItem> = {
    items: [],
    total: 0,
    page: 1,
    perPage: 20,
    totalPages: 0,
  };

  const table = useListTable({
    config: discountListConfig,
    data: discountsData ?? emptyData,
    counts: counts ?? {},
  });

  const { bulkActivate, bulkDeactivate, bulkDeleteDiscounts, toggleStatus, deleteOne } =
    useDiscountMutations();

  const rowActionsWithHandlers = useMemo<RowAction<DiscountListItem>[]>(
    () =>
      discountRowActions.map((action) => {
        if (action.key === "toggle") {
          return {
            ...action,
            label: "Toggle status",
            onClick: (row) => void toggleStatus(row._id, row.status),
          };
        }
        if (action.key === "delete") {
          return {
            ...action,
            onClick: (row) =>
              setConfirmDialog({
                open: true,
                title: "Delete discount?",
                message: `Permanently delete code "${row.code}"? This cannot be undone.`,
                onConfirm: async () => {
                  await deleteOne(row._id);
                  setConfirmDialog((prev) => ({ ...prev, open: false }));
                },
                destructive: true,
              }),
          };
        }
        return action;
      }),
    [toggleStatus, deleteOne],
  );

  const handleBulkAction = useCallback(
    (actionKey: string) => {
      const selectedIds = Array.from(table.selection.selectedIds) as Id<"commerce_discount_codes">[];
      if (selectedIds.length === 0) return;
      if (actionKey === "activate") {
        void bulkActivate(selectedIds).then(() => table.clearSelection());
      } else if (actionKey === "deactivate") {
        void bulkDeactivate(selectedIds).then(() => table.clearSelection());
      } else if (actionKey === "delete") {
        setConfirmDialog({
          open: true,
          title: "Delete discounts?",
          message: `Permanently delete ${selectedIds.length} ${
            selectedIds.length === 1 ? "discount" : "discounts"
          }? This cannot be undone.`,
          onConfirm: async () => {
            await bulkDeleteDiscounts(selectedIds);
            table.clearSelection();
            setConfirmDialog((prev) => ({ ...prev, open: false }));
          },
          destructive: true,
        });
      }
    },
    [table, bulkActivate, bulkDeactivate, bulkDeleteDiscounts],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Discount Codes</h1>
        {table.total > 0 && (
          <span className="text-sm text-muted-foreground">
            {table.total.toLocaleString()} {table.total === 1 ? "code" : "codes"}
          </span>
        )}
      </div>

      <ScreenOptions
        columns={discountListConfig.columns}
        state={table.screenOptions}
        onChange={table.setScreenOptions}
        perPageOptions={discountListConfig.perPageOptions}
        entityName="discount"
      />

      <StatusTabs
        tabs={table.statusTabs}
        activeTab={table.activeStatus}
        onTabChange={table.setStatus}
      />

      <ListTableToolbar
        bulkActionsSlot={
          <BulkActions
            actions={discountBulkActions}
            selectedCount={table.selection.count}
            onApply={handleBulkAction}
          />
        }
        searchSlot={
          <SearchBox
            value={table.search}
            onChange={table.setSearch}
            entityName="Discounts"
          />
        }
      />

      <ListTable
        columns={table.visibleColumns}
        rows={table.rows}
        sort={table.sort}
        onSortChange={table.setSort}
        getRowId={discountListConfig.getRowId}
        selection={table.selection}
        onToggleRow={table.toggleRow}
        onToggleAll={table.toggleAll}
        rowActions={rowActionsWithHandlers}
        primaryColumn="code"
        showCheckboxes
        isLoading={isLoading}
        getRowLabel={(row) => row.code}
        emptyState={
          <EmptyState
            title="No discount codes found."
            description={
              table.search
                ? "Try adjusting your search or filters."
                : "Create your first discount code to offer promotions."
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
          perPageOptions={discountListConfig.perPageOptions}
          entityNamePlural="codes"
        />
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.destructive ? "Delete" : "Confirm"}
        destructive={confirmDialog.destructive}
      />
    </div>
  );
}
