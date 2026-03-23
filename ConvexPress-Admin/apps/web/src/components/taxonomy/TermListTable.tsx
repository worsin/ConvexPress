/**
 * TermListTable - Shared list table for categories and tags
 *
 * Columns: Checkbox, Name (hierarchy-indented for categories), Description
 * (truncated 100 chars), Slug, Count (links to filtered posts list).
 * Row actions: Edit (inline), Quick Edit, Delete, View.
 * Default category shows "(default)" suffix with delete disabled.
 * Search box, sorting by Name/Description/Slug/Count, pagination (20 per page).
 * Bulk actions bar (Delete).
 */

import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMutation } from "convex/react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { BulkActions } from "@/components/shared/BulkActions";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListTable } from "@/components/shared/ListTable";
import { ListTableToolbar } from "@/components/shared/ListTableToolbar";
import { Pagination } from "@/components/shared/Pagination";
import { SearchBox } from "@/components/shared/SearchBox";
import { TermInlineEdit } from "./TermInlineEdit";
import { useListTable } from "@/hooks/useListTable";
import type {
  BulkAction,
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  RowAction,
} from "@/types/list-table";

// --- Term type matching what the query returns ---
interface TermRow {
  _id: string;
  name: string;
  slug: string;
  taxonomy: "category" | "post_tag";
  parentId?: string;
  description?: string;
  count: number;
  isDefault: boolean;
  depth: number;
  createdAt: number;
  updatedAt: number;
}

interface TermListTableProps {
  /** The taxonomy type for this list. */
  taxonomy: "category" | "post_tag";
  /** The query result for terms. undefined = loading. */
  data:
    | {
        terms: TermRow[];
        total: number;
        page: number;
        perPage: number;
        totalPages: number;
      }
    | undefined;
}

// --- Column Definitions ---

function getTermColumns(
  taxonomy: "category" | "post_tag",
): ColumnDef<TermRow>[] {
  return [
    {
      key: "name",
      label: "Name",
      sortable: true,
      hideable: false,
      width: "w-[30%]",
      render: (row) => {
        const indent =
          taxonomy === "category" && row.depth > 0
            ? "—".repeat(row.depth) + " "
            : "";
        return (
          <div>
            <span className="text-sm font-medium text-foreground">
              {indent}
              {row.name}
            </span>
            {row.isDefault && (
              <span className="ml-1 text-xs text-muted-foreground italic">
                (default)
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "description",
      label: "Description",
      sortable: true,
      width: "w-[30%]",
      render: (row) => (
        <span className="text-muted-foreground">
          {row.description
            ? row.description.length > 100
              ? `${row.description.slice(0, 100)}...`
              : row.description
            : "—"}
        </span>
      ),
    },
    {
      key: "slug",
      label: "Slug",
      sortable: true,
      width: "w-[20%]",
      render: (row) => (
        <span className="text-muted-foreground">{row.slug}</span>
      ),
    },
    {
      key: "count",
      label: "Count",
      sortable: true,
      defaultSortDir: "desc",
      width: "w-[10%]",
      align: "center",
      render: (row) => (
        <Link
          to="/posts"
          search={{
            categoryId: taxonomy === "category" ? row._id : undefined,
          }}
          className="text-primary hover:underline"
        >
          {row.count}
        </Link>
      ),
    },
  ];
}

// --- Bulk Actions ---

const termBulkActions: BulkAction[] = [
  {
    key: "delete",
    label: "Delete",
    requiresConfirmation: true,
    confirmMessage:
      "Are you sure you want to delete the selected items? Posts assigned to these terms will be reassigned as needed.",
    destructive: true,
  },
];

// --- Row Actions ---

function getTermRowActions(
  taxonomy: "category" | "post_tag",
): RowAction<TermRow>[] {
  return [
    {
      key: "quick-edit",
      label: "Quick Edit",
      type: "button",
    },
    {
      key: "delete",
      label: "Delete",
      type: "button",
      destructive: true,
      visible: (row) => !row.isDefault,
    },
    {
      key: "view",
      label: "View",
      type: "link",
      href: (row) =>
        taxonomy === "category"
          ? `/category/${row.slug}`
          : `/tag/${row.slug}`,
    },
  ];
}

// --- Component ---

export function TermListTable({ taxonomy, data }: TermListTableProps) {
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    destructive: boolean;
    isExecuting: boolean;
  }>({
    open: false,
    title: "",
    message: "",
    onConfirm: () => {},
    destructive: false,
    isExecuting: false,
  });

  const deleteCategory = useMutation(
    api.taxonomies.mutations.deleteCategory,
  );
  const deleteTag = useMutation(api.taxonomies.mutations.deleteTag);

  const entityName = taxonomy === "category" ? "category" : "tag";
  const entityNamePlural = taxonomy === "category" ? "categories" : "tags";

  const columns = useMemo(() => getTermColumns(taxonomy), [taxonomy]);
  const baseRowActions = useMemo(() => getTermRowActions(taxonomy), [taxonomy]);

  const config: ListTableConfig<TermRow> = useMemo(
    () => ({
      entityName,
      entityNamePlural,
      storageKey: `smithharper-${entityNamePlural}-screen-options`,
      columns,
      statusTabs: [],
      bulkActions: termBulkActions,
      rowActions: baseRowActions,
      defaultSort: { orderBy: "name", orderDir: "asc" },
      defaultPerPage: 20,
      perPageOptions: [10, 20, 50, 100],
      getRowId: (row) => row._id,
      primaryColumn: "name",
      showCheckboxes: true,
    }),
    [entityName, entityNamePlural, columns, baseRowActions],
  );

  const paginatedData: PaginatedResult<TermRow> | undefined = data
    ? {
        items: data.terms,
        total: data.total,
        page: data.page,
        perPage: data.perPage,
        totalPages: data.totalPages,
      }
    : undefined;

  const table = useListTable({
    config,
    data: paginatedData,
    counts: undefined,
  });

  const handleDeleteTerm = useCallback(
    async (termId: string, termName: string) => {
      setConfirmDialog((prev) => ({ ...prev, isExecuting: true }));
      try {
        if (taxonomy === "category") {
          await deleteCategory({ termId: termId as Id<"terms"> });
        } else {
          await deleteTag({ termId: termId as Id<"terms"> });
        }
        toast.success(`"${termName}" deleted.`);
        setConfirmDialog((prev) => ({ ...prev, open: false, isExecuting: false }));
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to delete.";
        toast.error(message);
        setConfirmDialog((prev) => ({ ...prev, isExecuting: false }));
      }
    },
    [taxonomy, deleteCategory, deleteTag],
  );

  // Augment row actions with handlers
  const rowActionsWithHandlers = useMemo<RowAction<TermRow>[]>(
    () =>
      baseRowActions.map((action) => {
        if (action.key === "quick-edit") {
          return {
            ...action,
            onClick: (row: TermRow) => setQuickEditId(row._id),
          };
        }
        if (action.key === "delete") {
          return {
            ...action,
            onClick: (row: TermRow) => {
              setConfirmDialog({
                open: true,
                title: `Delete "${row.name}"?`,
                message:
                  taxonomy === "category"
                    ? `Deleting this category will reassign its posts to the default category. This action cannot be undone.`
                    : `Deleting this tag will remove it from all posts. This action cannot be undone.`,
                onConfirm: () => handleDeleteTerm(row._id, row.name),
                destructive: true,
                isExecuting: false,
              });
            },
          };
        }
        return action;
      }),
    [baseRowActions, taxonomy, handleDeleteTerm],
  );

  const handleBulkAction = useCallback(
    (actionKey: string) => {
      if (actionKey === "delete") {
        const action = termBulkActions.find((a) => a.key === "delete");
        setConfirmDialog({
          open: true,
          title: `Delete ${table.selection.count} ${entityNamePlural}?`,
          message:
            action?.confirmMessage ??
            `Are you sure you want to delete ${table.selection.count} items?`,
          onConfirm: async () => {
            setConfirmDialog((prev) => ({ ...prev, isExecuting: true }));
            try {
              const ids = Array.from(table.selection.selectedIds);
              // Pre-filter default category from bulk deletion
              const deletableIds = taxonomy === "category"
                ? ids.filter((id) => {
                    const row = data?.terms.find((t: TermRow) => t._id === id);
                    return row ? !row.isDefault : true;
                  })
                : ids;
              for (const id of deletableIds) {
                if (taxonomy === "category") {
                  await deleteCategory({ termId: id as Id<"terms"> });
                } else {
                  await deleteTag({ termId: id as Id<"terms"> });
                }
              }
              toast.success(
                `${ids.length} ${entityNamePlural} deleted.`,
              );
              table.clearSelection();
              setConfirmDialog((prev) => ({
                ...prev,
                open: false,
                isExecuting: false,
              }));
            } catch (err: unknown) {
              const message =
                err instanceof Error ? err.message : "Bulk delete failed.";
              toast.error(message);
              setConfirmDialog((prev) => ({ ...prev, isExecuting: false }));
            }
          },
          destructive: true,
          isExecuting: false,
        });
      }
    },
    [table, taxonomy, entityNamePlural, deleteCategory, deleteTag],
  );

  return (
    <div>
      {/* Toolbar */}
      <ListTableToolbar
        bulkActionsSlot={
          <BulkActions
            actions={termBulkActions}
            selectedCount={table.selection.count}
            onApply={handleBulkAction}
          />
        }
        searchSlot={
          <SearchBox
            value={table.search}
            onChange={table.setSearch}
            entityName={taxonomy === "category" ? "Categories" : "Tags"}
          />
        }
      />

      {/* List Table */}
      <ListTable
        columns={table.visibleColumns}
        rows={table.rows}
        sort={table.sort}
        onSortChange={table.setSort}
        getRowId={config.getRowId}
        selection={table.selection}
        onToggleRow={table.toggleRow}
        onToggleAll={table.toggleAll}
        rowActions={rowActionsWithHandlers}
        primaryColumn="name"
        showCheckboxes
        isLoading={table.isLoading}
        quickEditId={quickEditId}
        quickEditRender={(row, onClose) => (
          <TermInlineEdit
            term={row}
            onClose={() => {
              setQuickEditId(null);
              onClose();
            }}
          />
        )}
        emptyState={
          <EmptyState
            title={`No ${entityNamePlural} found.`}
            description={
              table.search
                ? "Try adjusting your search."
                : `Create your first ${entityName} to get started.`
            }
            isFiltered={!!table.search}
          />
        }
      />

      {/* Pagination */}
      <div className="mt-4">
        <Pagination
          total={table.total}
          page={table.pagination.page}
          perPage={table.pagination.perPage}
          totalPages={table.totalPages}
          onPageChange={table.setPage}
          onPerPageChange={table.setPerPage}
          perPageOptions={config.perPageOptions}
          entityNamePlural={entityNamePlural}
        />
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() =>
          setConfirmDialog((prev) => ({ ...prev, open: false }))
        }
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel="Delete"
        destructive={confirmDialog.destructive}
        isExecuting={confirmDialog.isExecuting}
      />
    </div>
  );
}
