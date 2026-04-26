import { getErrorMessage, asId } from "@/lib/utils";
import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";

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
import { CommentInlineReply } from "./CommentInlineReply";
import { CommentQuickEdit } from "./CommentQuickEdit";
import type {
  BulkAction,
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  RowAction,
  StatusTab,
} from "@/types/list-table";

// --- Comment Type from Convex ---
interface CommentRow {
  _id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  content: string;
  status: string;
  postId: string;
  postTitle: string;
  postSlug?: string;
  createdAt: number;
  updatedAt: number;
  likeCount: number;
  flagCount: number;
  depth: number;
  parentId?: string;
  isEdited: boolean;
  moderatedBy?: string;
  moderatedAt?: number;
}

// --- Column Definitions ---

const commentColumns: ColumnDef<CommentRow>[] = [
  {
    key: "author",
    label: "Author",
    sortable: false,
    hideable: false,
    width: "w-[20%]",
    render: (row) => (
      <div className="flex items-center gap-2">
        {row.authorAvatarUrl ? (
          <img
            src={row.authorAvatarUrl}
            alt={row.authorName}
            className="size-8 rounded-none object-cover shrink-0"
          />
        ) : (
          <div className="flex size-8 items-center justify-center rounded-none bg-muted text-xs font-medium text-muted-foreground shrink-0">
            {row.authorName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">
            {row.authorName}
          </div>
        </div>
      </div>
    ),
  },
  {
    key: "comment",
    label: "Comment",
    sortable: false,
    hideable: false,
    width: "w-[40%]",
    render: (row) => {
      const truncated =
        row.content.length > 120
          ? `${row.content.substring(0, 120)}...`
          : row.content;
      return (
        <div>
          <p className="text-xs text-foreground">{truncated}</p>
          <div className="mt-1 text-xs text-muted-foreground">
            In Response To:{" "}
            <Link
              to="/posts/$postId/edit"
              params={{ postId: row.postId }}
              className="text-primary hover:underline"
            >
              {row.postTitle}
            </Link>
          </div>
          {row.isEdited && (
            <span className="text-[10px] text-muted-foreground italic">
              (edited)
            </span>
          )}
        </div>
      );
    },
  },
  {
    key: "status",
    label: "Status",
    sortable: false,
    width: "w-[10%]",
    render: (row) => {
      const statusStyles: Record<string, string> = {
        approved: "bg-primary/10 text-primary",
        pending: "bg-primary/20 text-primary",
        spam: "bg-destructive/10 text-destructive",
        trash: "bg-destructive/10 text-destructive",
      };
      return (
        <span
          className={`inline-flex items-center rounded-none px-1.5 py-0.5 text-[10px] font-medium ${statusStyles[row.status] ?? "bg-muted text-muted-foreground"}`}
        >
          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
        </span>
      );
    },
  },
  {
    key: "submittedOn",
    label: "Submitted On",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[18%]",
    render: (row) => {
      const date = new Date(row.createdAt);
      const formatted = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const time = date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      return (
        <div>
          <span className="text-foreground">{formatted}</span>
          <br />
          <span className="text-muted-foreground">at {time}</span>
        </div>
      );
    },
  },
];

// --- Status Tabs ---

const commentStatusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "spam", label: "Spam" },
  { key: "trash", label: "Trash" },
];

// --- Bulk Actions ---

const commentBulkActions: BulkAction[] = [
  { key: "approve", label: "Approve", visibleOnStatus: ["pending", "all"] },
  {
    key: "unapprove",
    label: "Unapprove",
    visibleOnStatus: ["approved", "all"],
  },
  { key: "spam", label: "Mark as Spam" },
  { key: "trash", label: "Move to Trash" },
  {
    key: "delete",
    label: "Delete Permanently",
    requiresConfirmation: true,
    confirmMessage:
      "You are about to permanently delete the selected comments. This action cannot be undone.",
    destructive: true,
    visibleOnStatus: ["trash", "spam"],
  },
];

// --- Row Actions ---

const commentRowActions: RowAction<CommentRow>[] = [
  {
    key: "approve",
    label: "Approve",
    type: "button",
    visible: (row) => row.status === "pending" || row.status === "spam",
  },
  {
    key: "unapprove",
    label: "Unapprove",
    type: "button",
    visible: (row) => row.status === "approved",
  },
  {
    key: "reply",
    label: "Reply",
    type: "button",
    visible: (row) => row.status !== "trash" && row.status !== "spam",
  },
  {
    key: "quick-edit",
    label: "Quick Edit",
    type: "button",
    visible: (row) => row.status !== "trash",
  },
  {
    key: "edit",
    label: "Edit",
    type: "link",
    href: (row) => `/comments/${row._id}/edit`,
    visible: (row) => row.status !== "trash",
  },
  {
    key: "spam",
    label: "Spam",
    type: "button",
    destructive: true,
    visible: (row) => row.status !== "spam" && row.status !== "trash",
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
    visible: (row) => row.status === "trash" || row.status === "spam",
  },
];

// --- Config ---

const commentListConfig: ListTableConfig<CommentRow> = {
  entityName: "comment",
  entityNamePlural: "comments",
  storageKey: "convexpress-comments-screen-options",
  columns: commentColumns,
  statusTabs: commentStatusTabs,
  bulkActions: commentBulkActions,
  rowActions: commentRowActions,
  defaultSort: { orderBy: "submittedOn", orderDir: "desc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50, 100],
  getRowId: (row) => row._id,
  primaryColumn: "comment",
  showCheckboxes: true,
};

// --- Props ---

interface CommentListTableProps {
  defaultStatus?: string;
}

// --- Component ---

export function CommentListTable({ defaultStatus }: CommentListTableProps) {
  // --- Inline states ---
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [quickEditingId, setQuickEditingId] = useState<string | null>(null);

  // --- Confirm dialog ---
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

  // --- Convex mutations ---
  const approveMutation = useMutation(api.comments.mutations.approve);
  const rejectMutation = useMutation(api.comments.mutations.reject);
  const spamMutation = useMutation(api.comments.mutations.spam);
  const trashMutation = useMutation(api.comments.mutations.trash);
  const restoreMutation = useMutation(api.comments.mutations.restore);
  const permanentDeleteMutation = useMutation(
    api.comments.mutations.permanentDelete,
  );
  const bulkApproveMutation = useMutation(
    api.comments.mutations.bulkApprove,
  );
  const bulkSpamMutation = useMutation(api.comments.mutations.bulkSpam);
  const bulkTrashMutation = useMutation(api.comments.mutations.bulkTrash);
  const bulkDeleteMutation = useMutation(
    api.comments.mutations.bulkDelete,
  );

  // --- Convex queries ---
  const countsResult = useQuery(api.comments.queries.counts, {});

  // Build counts map from query result
  const counts: Record<string, number> = useMemo(() => {
    if (!countsResult) {
      return { all: 0, mine: 0, pending: 0, approved: 0, spam: 0, trash: 0 };
    }
    return {
      all: countsResult.all,
      mine: countsResult.mine,
      pending: countsResult.pending,
      approved: countsResult.approved,
      spam: countsResult.spam,
      trash: countsResult.trash,
    };
  }, [countsResult]);

  // Use a preview useListTable to read URL-driven state for building query args
  const tablePreview = useListTable({
    config: commentListConfig,
    data: undefined,
    counts,
  });

  // Derive effective status (respecting defaultStatus prop for pre-filtered routes)
  const effectiveStatus = tablePreview.activeStatus || defaultStatus;

  // Query comments with URL-driven table state.
  // When "mine" tab is active, pass mine=true instead of a status filter.
  const isMineTab = effectiveStatus === "mine";
  const listResult = useQuery(api.comments.queries.list, {
    status: isMineTab
      ? undefined
      : ((effectiveStatus as
          | "approved"
          | "pending"
          | "spam"
          | "trash"
          | undefined) || undefined),
    mine: isMineTab || undefined,
    search: tablePreview.search || undefined,
    page: tablePreview.pagination.page,
    perPage: tablePreview.pagination.perPage,
    orderBy: "createdAt",
    orderDir: "desc",
  });

  // Map query result to PaginatedResult
  const paginatedData: PaginatedResult<CommentRow> | undefined = useMemo(() => {
    if (!listResult) return undefined;
    return {
      items: listResult.comments as CommentRow[],
      total: listResult.total,
      page: listResult.page,
      perPage: listResult.perPage,
      totalPages: listResult.totalPages,
    };
  }, [listResult]);

  const table = useListTable({
    config: commentListConfig,
    data: paginatedData,
    counts,
  });

  // --- Row action handlers ---
  const rowActionsWithHandlers = useMemo<RowAction<CommentRow>[]>(
    () =>
      commentRowActions.map((action) => {
        if (action.key === "approve") {
          return {
            ...action,
            onClick: async (row: CommentRow) => {
              try {
                await approveMutation({
                  commentId: asId<"comments">(row._id),
                });
                toast.success(`Comment by ${row.authorName} approved.`);
              } catch (error: unknown) {
                toast.error(getErrorMessage(error, "Failed to approve comment"));
              }
            },
          };
        }
        if (action.key === "unapprove") {
          return {
            ...action,
            onClick: async (row: CommentRow) => {
              try {
                await rejectMutation({
                  commentId: asId<"comments">(row._id),
                });
                toast.success(`Comment by ${row.authorName} unapproved.`);
              } catch (error: unknown) {
                toast.error(getErrorMessage(error, "Failed to unapprove comment"));
              }
            },
          };
        }
        if (action.key === "reply") {
          return {
            ...action,
            type: "button" as const,
            onClick: (row: CommentRow) => {
              setReplyingTo(
                replyingTo === row._id ? null : row._id,
              );
              setQuickEditingId(null);
            },
          };
        }
        if (action.key === "quick-edit") {
          return {
            ...action,
            onClick: (row: CommentRow) => {
              setQuickEditingId(
                quickEditingId === row._id ? null : row._id,
              );
              setReplyingTo(null);
            },
          };
        }
        if (action.key === "spam") {
          return {
            ...action,
            onClick: async (row: CommentRow) => {
              try {
                await spamMutation({
                  commentId: asId<"comments">(row._id),
                });
                toast.success(
                  `Comment by ${row.authorName} marked as spam.`,
                );
              } catch (error: unknown) {
                toast.error(getErrorMessage(error, "Failed to mark as spam"));
              }
            },
          };
        }
        if (action.key === "trash") {
          return {
            ...action,
            onClick: async (row: CommentRow) => {
              try {
                await trashMutation({
                  commentId: asId<"comments">(row._id),
                });
                toast.success(
                  `Comment by ${row.authorName} moved to trash.`,
                );
              } catch (error: unknown) {
                toast.error(getErrorMessage(error, "Failed to trash comment"));
              }
            },
          };
        }
        if (action.key === "restore") {
          return {
            ...action,
            onClick: async (row: CommentRow) => {
              try {
                await restoreMutation({
                  commentId: asId<"comments">(row._id),
                });
                toast.success(
                  `Comment by ${row.authorName} restored.`,
                );
              } catch (error: unknown) {
                toast.error(getErrorMessage(error, "Failed to restore comment"));
              }
            },
          };
        }
        if (action.key === "delete") {
          return {
            ...action,
            onClick: (row: CommentRow) => {
              setConfirmDialog({
                open: true,
                title: "Delete permanently?",
                message: `This will permanently delete this comment by ${row.authorName}. This action cannot be undone.`,
                onConfirm: async () => {
                  setConfirmDialog((prev) => ({
                    ...prev,
                    isExecuting: true,
                  }));
                  try {
                    await permanentDeleteMutation({
                      commentId: asId<"comments">(row._id),
                    });
                    toast.success("Comment permanently deleted.");
                  } catch (error: unknown) {
                    toast.error(getErrorMessage(error, "Failed to delete comment"));
                  } finally {
                    setConfirmDialog((prev) => ({
                      ...prev,
                      open: false,
                      isExecuting: false,
                    }));
                  }
                },
                destructive: true,
                isExecuting: false,
              });
            },
          };
        }
        return action;
      }),
    [
      replyingTo,
      quickEditingId,
      approveMutation,
      rejectMutation,
      spamMutation,
      trashMutation,
      restoreMutation,
      permanentDeleteMutation,
    ],
  );

  // --- Bulk action handler ---
  const handleBulkAction = useCallback(
    async (actionKey: string) => {
      const action = commentBulkActions.find((a) => a.key === actionKey);
      if (!action) return;

      const selectedIds = Array.from(table.selection.selectedIds).map((id) =>
        asId<"comments">(id),
      );

      if (selectedIds.length === 0) {
        toast.error("No comments selected.");
        return;
      }

      const executeBulk = async () => {
        try {
          if (actionKey === "approve") {
            const result = await bulkApproveMutation({
              commentIds: selectedIds,
            });
            toast.success(
              `${result.approved} comment(s) approved.${result.skipped > 0 ? ` ${result.skipped} skipped.` : ""}`,
            );
          } else if (actionKey === "unapprove") {
            // Unapprove = reject each one
            let rejected = 0;
            for (const id of selectedIds) {
              try {
                await rejectMutation({ commentId: id });
                rejected++;
              } catch {
                /* skip failures */
              }
            }
            toast.success(`${rejected} comment(s) unapproved.`);
          } else if (actionKey === "spam") {
            const result = await bulkSpamMutation({
              commentIds: selectedIds,
            });
            toast.success(
              `${result.spammed} comment(s) marked as spam.${result.skipped > 0 ? ` ${result.skipped} skipped.` : ""}`,
            );
          } else if (actionKey === "trash") {
            const result = await bulkTrashMutation({
              commentIds: selectedIds,
            });
            toast.success(
              `${result.trashed} comment(s) moved to trash.${result.skipped > 0 ? ` ${result.skipped} skipped.` : ""}`,
            );
          } else if (actionKey === "delete") {
            const result = await bulkDeleteMutation({
              commentIds: selectedIds,
            });
            toast.success(
              `${result.deleted} comment(s) permanently deleted.${result.skipped > 0 ? ` ${result.skipped} skipped.` : ""}`,
            );
          }
          table.clearSelection();
        } catch (error: unknown) {
          toast.error(getErrorMessage(error, "Bulk action failed"));
        }
      };

      if (action.requiresConfirmation) {
        setConfirmDialog({
          open: true,
          title: `${action.label}?`,
          message:
            action.confirmMessage ||
            `Are you sure you want to ${action.label.toLowerCase()} ${table.selection.count} items?`,
          onConfirm: async () => {
            setConfirmDialog((prev) => ({
              ...prev,
              isExecuting: true,
            }));
            await executeBulk();
            setConfirmDialog((prev) => ({
              ...prev,
              open: false,
              isExecuting: false,
            }));
          },
          destructive: action.destructive || false,
          isExecuting: false,
        });
      } else {
        await executeBulk();
      }
    },
    [
      table,
      bulkApproveMutation,
      rejectMutation,
      bulkSpamMutation,
      bulkTrashMutation,
      bulkDeleteMutation,
    ],
  );

  // Note: "mine" status is handled in the query call above via isMineTab
  // All state changes are URL-driven via useListTable — no dual state needed.

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Comments</h1>
      </div>

      <ScreenOptions
        columns={commentListConfig.columns}
        state={table.screenOptions}
        onChange={table.setScreenOptions}
        perPageOptions={commentListConfig.perPageOptions}
        entityName="comment"
      />

      <StatusTabs
        tabs={table.statusTabs}
        activeTab={table.activeStatus}
        onTabChange={table.setStatus}
      />

      {/* Empty Trash button - visible only on the Trash tab when there are trashed comments */}
      {effectiveStatus === "trash" && (counts.trash ?? 0) > 0 && (
        <div className="mb-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-destructive hover:text-destructive/80 border border-destructive/30 hover:border-destructive/50 bg-destructive/5 hover:bg-destructive/10 rounded-none transition-colors"
            onClick={() => {
              setConfirmDialog({
                open: true,
                title: "Empty Trash?",
                message: `This will permanently delete all ${counts.trash} trashed comment(s). This action cannot be undone.`,
                onConfirm: async () => {
                  setConfirmDialog((prev) => ({
                    ...prev,
                    isExecuting: true,
                  }));
                  try {
                    // Fetch all trashed comment IDs and bulk delete them
                    const trashResult = await Promise.resolve(listResult);
                    if (trashResult && trashResult.comments.length > 0) {
                      const trashIds = trashResult.comments.map(
                        (c: CommentRow) => c._id,
                      );
                      const result = await bulkDeleteMutation({
                        commentIds: trashIds,
                      });
                      toast.success(
                        `${result.deleted} comment(s) permanently deleted.`,
                      );
                    }
                  } catch (error: unknown) {
                toast.error(getErrorMessage(error, "Failed to empty trash"));
              } finally {
                    setConfirmDialog((prev) => ({
                      ...prev,
                      open: false,
                      isExecuting: false,
                    }));
                  }
                },
                destructive: true,
                isExecuting: false,
              });
            }}
          >
            <Trash2Icon className="size-3.5" />
            Empty Trash
          </button>
        </div>
      )}

      <ListTableToolbar
        bulkActionsSlot={
          <BulkActions
            actions={commentBulkActions}
            selectedCount={table.selection.count}
            onApply={handleBulkAction}
            currentStatus={table.activeStatus || "all"}
          />
        }
        searchSlot={
          <SearchBox
            value={table.search}
            onChange={table.setSearch}
            entityName="Comments"
          />
        }
      />

      <ListTable
        columns={table.visibleColumns}
        rows={table.rows}
        sort={table.sort}
        onSortChange={table.setSort}
        getRowId={commentListConfig.getRowId}
        selection={table.selection}
        onToggleRow={table.toggleRow}
        onToggleAll={table.toggleAll}
        rowActions={rowActionsWithHandlers}
        primaryColumn="comment"
        showCheckboxes
        isLoading={table.isLoading || listResult === undefined}
        getRowLabel={(row) => `comment by ${row.authorName}`}
        emptyState={
          <EmptyState
            title="No comments found."
            description={
              table.search
                ? "Try adjusting your search or filters."
                : "No comments have been submitted yet."
            }
            isFiltered={!!table.search || !!table.activeStatus}
          />
        }
        quickEditId={replyingTo ?? quickEditingId}
        quickEditRender={(row, onClose) => {
          if (replyingTo === row._id) {
            return (
              <CommentInlineReply
                commentId={row._id}
                authorName={row.authorName}
                onClose={() => {
                  setReplyingTo(null);
                  onClose();
                }}
              />
            );
          }
          if (quickEditingId === row._id) {
            return (
              <CommentQuickEdit
                commentId={row._id}
                currentContent={row.content}
                currentStatus={row.status}
                onClose={() => {
                  setQuickEditingId(null);
                  onClose();
                }}
              />
            );
          }
          return null;
        }}
        onQuickEditClose={() => {
          setReplyingTo(null);
          setQuickEditingId(null);
        }}
      />

      <div className="mt-4">
        <Pagination
          total={table.total}
          page={table.pagination.page}
          perPage={table.pagination.perPage}
          totalPages={table.totalPages}
          onPageChange={table.setPage}
          onPerPageChange={table.setPerPage}
          perPageOptions={commentListConfig.perPageOptions}
          entityNamePlural="comments"
        />
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        onClose={() =>
          setConfirmDialog((prev) => ({ ...prev, open: false }))
        }
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.destructive ? "Delete" : "Confirm"}
        destructive={confirmDialog.destructive}
        isExecuting={confirmDialog.isExecuting}
      />
    </div>
  );
}
