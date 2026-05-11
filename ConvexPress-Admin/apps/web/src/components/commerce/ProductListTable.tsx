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
import { Button } from "@/components/ui/button";
import { useListTable } from "@/hooks/useListTable";
import { useProductList } from "@/hooks/commerce/useProductList";
import { useProductCounts } from "@/hooks/commerce/useProductCounts";
import { useProductMutations } from "@/hooks/commerce/useProductMutations";
import type { ProductListItem, ProductStatus } from "@/lib/commerce/productTypes";
import type {
  BulkAction,
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  RowAction,
  StatusTab,
} from "@/types/list-table";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMoney(amount: number | undefined, currency = "USD") {
  if (amount === undefined || !Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount / 100);
  } catch {
    return `$${(amount / 100).toFixed(2)}`;
  }
}

function formatDateTime(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const STATUS_TONE: Record<ProductStatus, string> = {
  draft: "text-muted-foreground italic",
  publish: "text-foreground",
  private: "text-warning",
  trash: "text-destructive",
};

// ─── Columns ────────────────────────────────────────────────────────────────

const productColumns: ColumnDef<ProductListItem>[] = [
  {
    key: "title",
    label: "Name",
    sortable: true,
    hideable: false,
    width: "w-[34%]",
    render: (row) => (
      <div>
        <Link
          to="/commerce/products/$productId"
          params={{ productId: row._id }}
          className="text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          {row.title || "(no title)"}
        </Link>
        {row.status === "draft" && (
          <span className="ml-2 text-xs text-muted-foreground italic">— Draft</span>
        )}
        {row.status === "private" && (
          <span className="ml-2 text-xs text-warning italic">— Private</span>
        )}
      </div>
    ),
  },
  {
    key: "sku",
    label: "SKU",
    sortable: true,
    width: "w-[14%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground font-mono">{row.sku || "—"}</span>
    ),
  },
  {
    key: "type",
    label: "Type",
    width: "w-[10%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground capitalize">{row.productType ?? "simple"}</span>
    ),
  },
  {
    key: "stock",
    label: "Stock",
    width: "w-[10%]",
    render: (row) => {
      if (!row.trackInventory) {
        return <span className="text-xs text-muted-foreground">In stock</span>;
      }
      const qty = row.stockQuantity ?? 0;
      const tone = qty > 0 ? "text-foreground" : "text-destructive";
      return <span className={`text-xs ${tone}`}>{qty} in stock</span>;
    },
  },
  {
    key: "price",
    label: "Price",
    width: "w-[12%]",
    align: "right",
    render: (row) => (
      <span className="text-sm text-foreground">
        {formatMoney(row.displayPrice, row.currencyCode || "USD")}
      </span>
    ),
  },
  {
    key: "categories",
    label: "Categories",
    width: "w-[12%]",
    render: (row) => {
      const cats = row.categories ?? [];
      if (cats.length === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="text-muted-foreground text-xs">
          {cats.map((c) => c.name).join(", ")}
        </span>
      );
    },
  },
  {
    key: "date",
    label: "Date",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[14%]",
    render: (row) => (
      <div>
        <span className="text-xs text-muted-foreground">Updated</span>
        <br />
        <span className="text-foreground">{formatDateTime(row.updatedAt)}</span>
      </div>
    ),
  },
];

// ─── Status Tabs ────────────────────────────────────────────────────────────

const productStatusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "publish", label: "Published" },
  { key: "draft", label: "Drafts" },
  { key: "private", label: "Private" },
  { key: "trash", label: "Trash" },
];

// ─── Bulk Actions ───────────────────────────────────────────────────────────

const productBulkActions: BulkAction[] = [
  { key: "publish", label: "Publish", visibleOnStatus: ["draft", "private"] },
  { key: "draft", label: "Move to Draft", visibleOnStatus: ["publish", "private"] },
  { key: "trash", label: "Move to Trash" },
  { key: "restore", label: "Restore", visibleOnStatus: ["trash"] },
  {
    key: "delete",
    label: "Delete Permanently",
    requiresConfirmation: true,
    confirmMessage:
      "You are about to permanently delete the selected products. This will also remove their variants. This action cannot be undone.",
    destructive: true,
    visibleOnStatus: ["trash"],
  },
];

// ─── Row Actions ────────────────────────────────────────────────────────────

const productRowActions: RowAction<ProductListItem>[] = [
  {
    key: "edit",
    label: "Edit",
    type: "link",
    href: (row) => `/commerce/products/${row._id}`,
    visible: (row) => row.status !== "trash",
  },
  {
    key: "trash",
    label: "Trash",
    type: "button",
    destructive: true,
    visible: (row) => row.status !== "trash",
  },
  {
    key: "restore",
    label: "Restore",
    type: "button",
    visible: (row) => row.status === "trash",
  },
  {
    key: "delete",
    label: "Delete Permanently",
    type: "button",
    destructive: true,
    visible: (row) => row.status === "trash",
  },
  {
    key: "view",
    label: "View",
    type: "link",
    href: (row) => `/products/${row.slug}`,
    visible: (row) => row.status === "publish",
  },
];

// ─── Config ─────────────────────────────────────────────────────────────────

const productListConfig: ListTableConfig<ProductListItem> = {
  entityName: "product",
  entityNamePlural: "products",
  storageKey: "convexpress-commerce-products-screen-options",
  columns: productColumns,
  statusTabs: productStatusTabs,
  bulkActions: productBulkActions,
  rowActions: productRowActions,
  defaultSort: { orderBy: "date", orderDir: "desc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50, 100],
  getRowId: (row) => row._id,
  primaryColumn: "title",
  showCheckboxes: true,
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ProductListTable() {
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    destructive: boolean;
  }>({ open: false, title: "", message: "", onConfirm: () => {}, destructive: false });

  const params = useSearch({ strict: false }) as Record<string, any>;

  const { data: productsData, isLoading: productsLoading } = useProductList({
    status: params.status,
    search: params.search,
    productType: params.productType,
    orderBy: params.orderBy,
    orderDir: params.orderDir,
    page: params.page,
    perPage: params.perPage,
  });
  const { counts: countsData } = useProductCounts({ search: params.search });

  const emptyData: PaginatedResult<ProductListItem> = {
    items: [],
    total: 0,
    page: 1,
    perPage: 20,
    totalPages: 0,
  };

  const table = useListTable({
    config: productListConfig,
    data: productsData ?? emptyData,
    counts: countsData ?? {},
  });

  const {
    bulkUpdateProductStatus,
    bulkTrashProducts,
    bulkRestoreProducts,
    bulkDeleteProducts,
  } = useProductMutations();

  const rowActionsWithHandlers = useMemo<RowAction<ProductListItem>[]>(
    () =>
      productRowActions.map((action) => {
        if (action.key === "trash") {
          return {
            ...action,
            onClick: (row) => void bulkTrashProducts([row._id as Id<"commerce_products">]),
          };
        }
        if (action.key === "restore") {
          return {
            ...action,
            onClick: (row) => void bulkRestoreProducts([row._id as Id<"commerce_products">]),
          };
        }
        if (action.key === "delete") {
          return {
            ...action,
            onClick: (row) =>
              setConfirmDialog({
                open: true,
                title: "Delete permanently?",
                message: `This will permanently delete "${row.title}" and its variants. This action cannot be undone.`,
                onConfirm: async () => {
                  await bulkDeleteProducts([row._id as Id<"commerce_products">]);
                  setConfirmDialog((prev) => ({ ...prev, open: false }));
                },
                destructive: true,
              }),
          };
        }
        return action;
      }),
    [bulkTrashProducts, bulkRestoreProducts, bulkDeleteProducts],
  );

  const handleBulkAction = useCallback(
    (actionKey: string) => {
      const selectedIds = Array.from(table.selection.selectedIds) as Id<"commerce_products">[];
      if (selectedIds.length === 0) return;

      const statusMap: Record<string, string> = {
        publish: "publish",
        draft: "draft",
      };

      if (actionKey in statusMap) {
        void bulkUpdateProductStatus(selectedIds, statusMap[actionKey]).then(() =>
          table.clearSelection(),
        );
        return;
      }

      if (actionKey === "trash") {
        void bulkTrashProducts(selectedIds).then(() => table.clearSelection());
        return;
      }

      if (actionKey === "restore") {
        void bulkRestoreProducts(selectedIds).then(() => table.clearSelection());
        return;
      }

      if (actionKey === "delete") {
        const action = productBulkActions.find((a) => a.key === "delete")!;
        setConfirmDialog({
          open: true,
          title: "Delete permanently?",
          message: action.confirmMessage ?? "This action cannot be undone.",
          onConfirm: async () => {
            await bulkDeleteProducts(selectedIds);
            table.clearSelection();
            setConfirmDialog((prev) => ({ ...prev, open: false }));
          },
          destructive: true,
        });
      }
    },
    [
      table,
      bulkUpdateProductStatus,
      bulkTrashProducts,
      bulkRestoreProducts,
      bulkDeleteProducts,
    ],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Products</h1>
        <Link to="/commerce/products/new">
          <Button size="sm">Add New Product</Button>
        </Link>
      </div>

      <ScreenOptions
        columns={productListConfig.columns}
        state={table.screenOptions}
        onChange={table.setScreenOptions}
        perPageOptions={productListConfig.perPageOptions}
        entityName="product"
      />

      <StatusTabs
        tabs={table.statusTabs}
        activeTab={table.activeStatus}
        onTabChange={table.setStatus}
      />

      <ListTableToolbar
        bulkActionsSlot={
          <BulkActions
            actions={productBulkActions}
            selectedCount={table.selection.count}
            onApply={handleBulkAction}
          />
        }
        searchSlot={
          <SearchBox
            value={table.search}
            onChange={table.setSearch}
            entityName="Products"
          />
        }
      />

      <ListTable
        columns={table.visibleColumns}
        rows={table.rows}
        sort={table.sort}
        onSortChange={table.setSort}
        getRowId={productListConfig.getRowId}
        selection={table.selection}
        onToggleRow={table.toggleRow}
        onToggleAll={table.toggleAll}
        rowActions={rowActionsWithHandlers}
        primaryColumn="title"
        showCheckboxes
        isLoading={productsLoading}
        getRowLabel={(row) => row.title || "(no title)"}
        emptyState={
          <EmptyState
            title="No products found."
            description={
              table.search
                ? "Try adjusting your search or filters."
                : "Add your first product to get started."
            }
            isFiltered={!!table.search || !!table.activeStatus}
            action={
              !table.search && !table.activeStatus ? (
                <Link to="/commerce/products/new">
                  <Button size="sm">Add New Product</Button>
                </Link>
              ) : undefined
            }
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
          perPageOptions={productListConfig.perPageOptions}
          entityNamePlural="products"
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
