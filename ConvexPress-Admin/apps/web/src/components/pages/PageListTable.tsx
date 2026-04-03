/**
 * Page System - PageListTable
 *
 * WordPress-style hierarchical list table for all pages.
 * Wired to real Convex queries via page hooks.
 *
 * Features:
 *   - Status filter tabs with count badges
 *   - Search by title/slug
 *   - Hierarchy indentation ("--- " per depth level)
 *   - Bulk actions (trash, restore, delete permanently, publish)
 *   - Row actions (edit, quick edit, trash, restore, delete, view)
 *   - Quick Edit inline form
 *   - Pagination
 *   - Screen options (columns, per-page)
 */

import { useCallback, useMemo, useState } from "react";
import { Link, useSearch, useNavigate } from "@tanstack/react-router";
import { MessageSquareIcon } from "lucide-react";
import { toast } from "sonner";

import { BulkActions } from "@/components/shared/BulkActions";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListTable } from "@/components/shared/ListTable";
import { ListTableToolbar } from "@/components/shared/ListTableToolbar";
import { Pagination } from "@/components/shared/Pagination";
import { ScreenOptions } from "@/components/shared/ScreenOptions";
import { SearchBox } from "@/components/shared/SearchBox";
import { StatusTabs } from "@/components/shared/StatusTabs";
import { PageQuickEdit } from "@/components/pages/PageQuickEdit";
import { PageHierarchyIndicator } from "@/components/pages/PageHierarchyIndicator";
import { Button } from "@/components/ui/button";
import { useListTable } from "@/hooks/useListTable";
import { usePages } from "@/hooks/pages/usePages";
import { usePageCounts } from "@/hooks/pages/usePageCounts";
import { usePageMutations } from "@/hooks/pages/usePageMutations";
import type {
  BulkAction,
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  RowAction,
  StatusTab,
} from "@/types/list-table";
import type { Id } from "@backend/convex/_generated/dataModel";

/** Valid page status values for hook (excludes "all") */
type PageStatus = "auto-draft" | "draft" | "pending" | "publish" | "future" | "private" | "trash";

/** Valid order by values for pages */
type PageOrderBy = "title" | "date" | "menuOrder" | "author";

/** Valid order direction */
type OrderDir = "asc" | "desc";

// --- Page Type (from Convex) ---
interface PageRow {
  _id: string;
  title: string;
  slug: string;
  status: string;
  authorId: string;
  author?: {
    _id: string;
    displayName: string;
    email?: string;
  } | null;
  publishedAt?: number;
  updatedAt: number;
  createdAt: number;
  commentCount?: number;
  parentId?: string;
  pageTemplate?: string;
  menuOrder?: number;
  depth?: number;
  path?: string;
}

// --- Column Definitions ---

const pageColumns: ColumnDef<PageRow>[] = [
  {
    key: "title",
    label: "Title",
    sortable: true,
    hideable: false,
    width: "w-[40%]",
    render: (row) => (
      <div>
        <PageHierarchyIndicator depth={row.depth ?? 0} />
        <Link
          to="/pages/$pageId/edit"
          params={{ pageId: row._id }}
          className="text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          {row.title}
        </Link>
        {row.status === "draft" && (
          <span className="ml-1 text-xs text-muted-foreground italic">
            — Draft
          </span>
        )}
        {row.status === "auto-draft" && (
          <span className="ml-1 text-xs text-muted-foreground italic">
            — Auto Draft
          </span>
        )}
        {row.status === "pending" && (
          <span className="ml-1 text-xs text-muted-foreground italic">
            — Pending
          </span>
        )}
        {row.status === "private" && (
          <span className="ml-1 text-xs text-muted-foreground italic">
            — Private
          </span>
        )}
        {row.status === "future" && (
          <span className="ml-1 text-xs text-muted-foreground italic">
            — Scheduled
          </span>
        )}
      </div>
    ),
  },
  {
    key: "author",
    label: "Author",
    sortable: true,
    width: "w-[15%]",
    render: (row) => (
      <span className="text-muted-foreground">
        {row.author?.displayName ?? row.authorId}
      </span>
    ),
  },
  {
    key: "template",
    label: "Template",
    width: "w-[12%]",
    render: (row) => (
      <span className="text-muted-foreground capitalize">
        {row.pageTemplate ?? "default"}
      </span>
    ),
  },
  {
    key: "comments",
    label: "",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-10",
    align: "center",
    renderHeader: () => <MessageSquareIcon className="size-3.5 text-muted-foreground" />,
    render: (row) => (
      <span className="text-muted-foreground">{row.commentCount ?? 0}</span>
    ),
  },
  {
    key: "date",
    label: "Date",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[18%]",
    render: (row) => {
      const timestamp = row.publishedAt || row.updatedAt;
      const formatted = new Date(timestamp).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const statusLabel =
        row.status === "publish"
          ? "Published"
          : row.status === "future"
            ? "Scheduled"
            : "Last Modified";
      return (
        <div>
          <span className="text-muted-foreground">{statusLabel}</span>
          <br />
          <span className="text-foreground">{formatted}</span>
        </div>
      );
    },
  },
];

// --- Status Tabs ---

const pageStatusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "publish", label: "Published" },
  { key: "draft", label: "Drafts" },
  { key: "pending", label: "Pending" },
  { key: "private", label: "Private" },
  { key: "future", label: "Scheduled" },
  { key: "trash", label: "Trash" },
];

// --- Bulk Actions ---

const pageBulkActions: BulkAction[] = [
  { key: "trash", label: "Move to Trash" },
  {
    key: "delete",
    label: "Delete Permanently",
    requiresConfirmation: true,
    confirmMessage:
      "You are about to permanently delete the selected pages. This action cannot be undone.",
    destructive: true,
    visibleOnStatus: ["trash"],
  },
  { key: "publish", label: "Publish", visibleOnStatus: ["draft", "pending"] },
  { key: "restore", label: "Restore", visibleOnStatus: ["trash"] },
];

// --- Row Actions ---

const pageRowActions: RowAction<PageRow>[] = [
  {
    key: "edit",
    label: "Edit",
    type: "link",
    href: (row) => `/pages/${row._id}/edit`,
    visible: (row) => row.status !== "trash",
  },
  {
    key: "quick-edit",
    label: "Quick Edit",
    type: "button",
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
    href: (row) => row.path ?? `/${row.slug}`,
    visible: (row) => row.status === "publish",
  },
];

// --- Config ---

const pageListConfig: ListTableConfig<PageRow> = {
  entityName: "page",
  entityNamePlural: "pages",
  storageKey: "convexpress-pages-screen-options",
  columns: pageColumns,
  statusTabs: pageStatusTabs,
  bulkActions: pageBulkActions,
  rowActions: pageRowActions,
  defaultSort: { orderBy: "date", orderDir: "desc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50, 100],
  getRowId: (row) => row._id,
  primaryColumn: "title",
  showCheckboxes: true,
};

// --- Component ---

export function PageListTable() {
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    destructive: boolean;
  }>({ open: false, title: "", message: "", onConfirm: () => {}, destructive: false });

  // Get search params from route
  const search = useSearch({ from: "/_authenticated/_admin/pages/" });

  // Convex queries
  // Convert "all" status to undefined for the hook (all statuses)
  const statusFilter = search.status === "all" ? undefined : (search.status as PageStatus);
  // Convert orderBy - hook doesn't support "modifiedDate", fall back to "date"
  const orderByFilter = search.orderBy === "modifiedDate" ? "date" : (search.orderBy as PageOrderBy | undefined);

  const { pages, pagination, isLoading } = usePages({
    status: statusFilter,
    search: search.search,
    page: search.page,
    perPage: search.perPage,
    orderBy: orderByFilter ?? "menuOrder",
    orderDir: search.orderDir as OrderDir,
    authorId: search.authorId,
  });
  const { counts } = usePageCounts();
  const { trashPage, restorePage, permanentDeletePage, publishPage } = usePageMutations();

  // Map Convex results to PaginatedResult format
  const data: PaginatedResult<PageRow> = useMemo(
    () => ({
      items: pages as PageRow[],
      total: pagination.total,
      page: pagination.page,
      perPage: pagination.perPage,
      totalPages: pagination.totalPages,
    }),
    [pages, pagination],
  );

  const table = useListTable({
    config: pageListConfig,
    data: isLoading ? undefined : data,
    counts: counts as Record<string, number>,
  });

  // Row actions with real mutation handlers
  const rowActionsWithHandlers = useMemo<RowAction<PageRow>[]>(
    () =>
      pageRowActions.map((action) => {
        if (action.key === "quick-edit") {
          return {
            ...action,
            onClick: (row: PageRow) => setQuickEditId(row._id),
          };
        }
        if (action.key === "trash") {
          return {
            ...action,
            onClick: async (row: PageRow) => {
              await trashPage(row._id as Id<"posts">, row.title);
            },
          };
        }
        if (action.key === "restore") {
          return {
            ...action,
            onClick: async (row: PageRow) => {
              await restorePage(row._id as Id<"posts">, row.title);
            },
          };
        }
        if (action.key === "delete") {
          return {
            ...action,
            onClick: (row: PageRow) => {
              setConfirmDialog({
                open: true,
                title: "Delete permanently?",
                message: `This will permanently delete "${row.title}". This action cannot be undone.`,
                onConfirm: async () => {
                  await permanentDeletePage(row._id as Id<"posts">, row.title);
                  setConfirmDialog((prev) => ({ ...prev, open: false }));
                },
                destructive: true,
              });
            },
          };
        }
        return action;
      }),
    [trashPage, restorePage, permanentDeletePage],
  );

  const handleBulkAction = useCallback(
    async (actionKey: string) => {
      const action = pageBulkActions.find((a) => a.key === actionKey);
      if (!action) return;

      const selectedIds = Array.from(table.selection.selectedIds);

      if (action.requiresConfirmation) {
        setConfirmDialog({
          open: true,
          title: `${action.label}?`,
          message:
            action.confirmMessage ||
            `Are you sure you want to ${action.label.toLowerCase()} ${table.selection.count} items?`,
          onConfirm: async () => {
            for (const id of selectedIds) {
              if (actionKey === "delete") {
                await permanentDeletePage(id as Id<"posts">);
              }
            }
            toast.success(`${action.label} applied to ${selectedIds.length} pages.`);
            table.clearSelection();
            setConfirmDialog((prev) => ({ ...prev, open: false }));
          },
          destructive: action.destructive || false,
        });
      } else {
        for (const id of selectedIds) {
          if (actionKey === "trash") {
            await trashPage(id as Id<"posts">);
          } else if (actionKey === "restore") {
            await restorePage(id as Id<"posts">);
          } else if (actionKey === "publish") {
            await publishPage(id as Id<"posts">);
          }
        }
        toast.success(`${action.label} applied to ${selectedIds.length} pages.`);
        table.clearSelection();
      }
    },
    [table, trashPage, restorePage, permanentDeletePage, publishPage],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Pages</h1>
        <Link to="/pages/new">
          <Button size="sm">Add New Page</Button>
        </Link>
      </div>

      <ScreenOptions
        columns={pageListConfig.columns}
        state={table.screenOptions}
        onChange={table.setScreenOptions}
        perPageOptions={pageListConfig.perPageOptions}
        entityName="page"
      />

      <StatusTabs
        tabs={table.statusTabs}
        activeTab={table.activeStatus}
        onTabChange={table.setStatus}
      />

      <ListTableToolbar
        bulkActionsSlot={
          <BulkActions
            actions={pageBulkActions}
            selectedCount={table.selection.count}
            onApply={handleBulkAction}
          />
        }
        searchSlot={
          <SearchBox
            value={table.search}
            onChange={table.setSearch}
            entityName="Pages"
          />
        }
      />

      <ListTable
        columns={table.visibleColumns}
        rows={table.rows}
        sort={table.sort}
        onSortChange={table.setSort}
        getRowId={pageListConfig.getRowId}
        selection={table.selection}
        onToggleRow={table.toggleRow}
        onToggleAll={table.toggleAll}
        rowActions={rowActionsWithHandlers}
        primaryColumn="title"
        showCheckboxes
        isLoading={isLoading}
        getRowLabel={(row) => row.title || "(no title)"}
        quickEditId={quickEditId}
        quickEditRender={(row, onClose) => (
          <PageQuickEdit
            page={row}
            onClose={() => {
              setQuickEditId(null);
              onClose();
            }}
          />
        )}
        emptyState={
          <EmptyState
            title="No pages found."
            description={
              table.search
                ? "Try adjusting your search or filters."
                : "Create your first page to get started."
            }
            isFiltered={!!table.search || !!table.activeStatus}
            action={
              !table.search && !table.activeStatus ? (
                <Link to="/pages/new">
                  <Button size="sm">Add New Page</Button>
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
          perPageOptions={pageListConfig.perPageOptions}
          entityNamePlural="pages"
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
