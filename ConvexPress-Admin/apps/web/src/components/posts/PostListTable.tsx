import { useCallback, useMemo, useState, memo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { MessageSquareIcon } from "lucide-react";
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
import { PostFilterBar } from "@/components/posts/PostFilterBar";
import { PostBulkEdit } from "@/components/posts/PostBulkEdit";
import { PostQuickEdit } from "@/components/posts/PostQuickEdit";
import { Button } from "@/components/ui/button";
import { useListTable } from "@/hooks/useListTable";
import { usePostMutations } from "@/hooks/posts/usePostMutations";
import { usePostList } from "@/hooks/posts/usePostList";
import { usePostCounts } from "@/hooks/posts/usePostCounts";
import { usePostFilters } from "@/hooks/posts/usePostFilters";
import { formatPostDate, getDateLabel, getRelevantDate } from "@/lib/posts/utils";
import type { PostWithAuthor } from "@/lib/posts/types";
import type {
  BulkAction,
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  RowAction,
  StatusTab,
} from "@/types/list-table";

// --- Taxonomy Cell Components ---
// These use useQuery to resolve term names per row. Convex batches
// identical queries efficiently, so this pattern works well for list tables.

const PostCategoriesCell = memo(function PostCategoriesCell({
  postId,
}: {
  postId: string;
}) {
  const terms = useQuery(api.taxonomies.queries.getByPost, {
    postId: postId as Id<"posts">,
    taxonomy: "category",
  });

  if (terms === undefined) {
    return <span className="text-muted-foreground">...</span>;
  }

  const categories = terms.categories ?? [];
  if (categories.length === 0) {
    return <span className="text-muted-foreground">Uncategorized</span>;
  }

  return (
    <span className="text-muted-foreground">
      {categories.map((cat: { name: string }, i: number) => (
        <span key={i}>
          {i > 0 && ", "}
          <span className="hover:text-foreground transition-colors cursor-pointer">
            {cat.name}
          </span>
        </span>
      ))}
    </span>
  );
});

const PostTagsCell = memo(function PostTagsCell({
  postId,
}: {
  postId: string;
}) {
  const terms = useQuery(api.taxonomies.queries.getByPost, {
    postId: postId as Id<"posts">,
    taxonomy: "post_tag",
  });

  if (terms === undefined) {
    return <span className="text-muted-foreground">...</span>;
  }

  const tags = terms.tags ?? [];
  if (tags.length === 0) {
    return <span className="text-muted-foreground">--</span>;
  }

  return (
    <span className="text-muted-foreground">
      {tags.map((tag: { name: string }, i: number) => (
        <span key={i}>
          {i > 0 && ", "}
          <span className="hover:text-foreground transition-colors cursor-pointer">
            {tag.name}
          </span>
        </span>
      ))}
    </span>
  );
});

// --- Column Definitions ---

const postColumns: ColumnDef<PostWithAuthor>[] = [
  {
    key: "title",
    label: "Title",
    sortable: true,
    hideable: false,
    width: "w-[40%]",
    render: (row) => (
      <div>
        <Link
          to="/posts/$postId/edit"
          params={{ postId: row._id }}
          className="text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          {row.title || "(no title)"}
        </Link>
        {row.isSticky && (
          <span className="ml-2 text-xs text-muted-foreground">
            -- Sticky
          </span>
        )}
        {row.status === "draft" && (
          <span className="ml-1 text-xs text-muted-foreground italic">
            -- Draft
          </span>
        )}
        {row.status === "pending" && (
          <span className="ml-1 text-xs text-muted-foreground italic">
            -- Pending
          </span>
        )}
        {row.status === "future" && (
          <span className="ml-1 text-xs text-muted-foreground italic">
            -- Scheduled
          </span>
        )}
        {row.status === "private" && (
          <span className="ml-1 text-xs text-muted-foreground italic">
            -- Private
          </span>
        )}
      </div>
    ),
  },
  {
    key: "author",
    label: "Author",
    sortable: true,
    width: "w-[12%]",
    render: (row) => (
      <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        {row.author?.displayName ?? "Unknown"}
      </span>
    ),
  },
  {
    key: "categories",
    label: "Categories",
    width: "w-[14%]",
    render: (row) => <PostCategoriesCell postId={row._id} />,
  },
  {
    key: "tags",
    label: "Tags",
    width: "w-[14%]",
    render: (row) => <PostTagsCell postId={row._id} />,
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
      <span className="text-muted-foreground">{row.commentCount}</span>
    ),
  },
  {
    key: "date",
    label: "Date",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[16%]",
    render: (row) => {
      const date = getRelevantDate(row);
      const formatted = formatPostDate(date);
      const statusLabel = getDateLabel(row.status);
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

const postStatusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "publish", label: "Published" },
  { key: "draft", label: "Drafts" },
  { key: "pending", label: "Pending" },
  { key: "future", label: "Scheduled" },
  { key: "private", label: "Private" },
  { key: "trash", label: "Trash" },
];

// --- Bulk Actions ---

const postBulkActions: BulkAction[] = [
  { key: "edit", label: "Edit" },
  { key: "trash", label: "Move to Trash" },
  {
    key: "delete",
    label: "Delete Permanently",
    requiresConfirmation: true,
    confirmMessage:
      "You are about to permanently delete the selected posts. This action cannot be undone.",
    destructive: true,
    visibleOnStatus: ["trash"],
  },
  { key: "publish", label: "Publish", visibleOnStatus: ["draft", "pending"] },
  {
    key: "restore",
    label: "Restore",
    visibleOnStatus: ["trash"],
  },
];

// --- Row Actions ---

const postRowActions: RowAction<PostWithAuthor>[] = [
  {
    key: "edit",
    label: "Edit",
    type: "link",
    href: (row) => `/posts/${row._id}/edit`,
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
    href: (row) => `/blog/${row.slug}`,
    visible: (row) => row.status === "publish",
  },
  {
    key: "preview",
    label: "Preview",
    type: "link",
    href: (row) => `/blog/${row.slug}?preview=true`,
    visible: (row) => row.status !== "publish" && row.status !== "trash",
  },
];

// --- Config ---

const postListConfig: ListTableConfig<PostWithAuthor> = {
  entityName: "post",
  entityNamePlural: "posts",
  storageKey: "convexpress-posts-screen-options",
  columns: postColumns,
  statusTabs: postStatusTabs,
  bulkActions: postBulkActions,
  rowActions: postRowActions,
  defaultSort: { orderBy: "date", orderDir: "desc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50, 100],
  getRowId: (row) => row._id,
  primaryColumn: "title",
  showCheckboxes: true,
};

// --- Component ---

export function PostListTable() {
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    destructive: boolean;
  }>({ open: false, title: "", message: "", onConfirm: () => {}, destructive: false });

  // ─── URL Filter State ──────────────────────────────────────────────────
  const { filters, setDateRange, setCategoryId } = usePostFilters();

  // ─── Convex Queries ────────────────────────────────────────────────────
  const { data: postsData, isLoading: postsLoading } = usePostList(filters);
  const { counts: countsData } = usePostCounts();

  // ─── Mutations ─────────────────────────────────────────────────────────
  const {
    trashPost,
    restorePost,
    permanentDeletePost,
    bulkTrashPosts,
    bulkRestorePosts,
    bulkDeletePosts,
    bulkPublishPosts,
  } = usePostMutations();

  // ─── Fallback data while loading ───────────────────────────────────────
  const emptyData: PaginatedResult<PostWithAuthor> = {
    items: [],
    total: 0,
    page: 1,
    perPage: 20,
    totalPages: 0,
  };

  const table = useListTable({
    config: postListConfig,
    data: postsData ?? emptyData,
    counts: countsData ?? {},
  });

  // ─── Row Actions with Handlers ─────────────────────────────────────────
  const rowActionsWithHandlers = useMemo<RowAction<PostWithAuthor>[]>(
    () =>
      postRowActions.map((action) => {
        if (action.key === "quick-edit") {
          return {
            ...action,
            onClick: (row: PostWithAuthor) => setQuickEditId(row._id),
          };
        }
        if (action.key === "trash") {
          return {
            ...action,
            onClick: (row: PostWithAuthor) => {
              trashPost(row._id as Id<"posts">, row.title);
            },
          };
        }
        if (action.key === "restore") {
          return {
            ...action,
            onClick: (row: PostWithAuthor) => {
              restorePost(row._id as Id<"posts">, row.title);
            },
          };
        }
        if (action.key === "delete") {
          return {
            ...action,
            onClick: (row: PostWithAuthor) => {
              setConfirmDialog({
                open: true,
                title: "Delete permanently?",
                message: `This will permanently delete "${row.title}". This action cannot be undone.`,
                onConfirm: async () => {
                  await permanentDeletePost(row._id as Id<"posts">, row.title);
                  setConfirmDialog((prev) => ({ ...prev, open: false }));
                },
                destructive: true,
              });
            },
          };
        }
        return action;
      }),
    [trashPost, restorePost, permanentDeletePost],
  );

  // ─── Bulk Action Handler ───────────────────────────────────────────────
  const handleBulkAction = useCallback(
    (actionKey: string) => {
      const action = postBulkActions.find((a) => a.key === actionKey);
      if (!action) return;

      const selectedIds = Array.from(table.selection.selectedIds) as Id<"posts">[];
      if (selectedIds.length === 0) return;

      // Handle "edit" action - show bulk edit panel (H7 fix)
      if (actionKey === "edit") {
        setShowBulkEdit(true);
        return;
      }

      if (action.requiresConfirmation) {
        setConfirmDialog({
          open: true,
          title: `${action.label}?`,
          message:
            action.confirmMessage ||
            `Are you sure you want to ${action.label.toLowerCase()} ${table.selection.count} items?`,
          onConfirm: async () => {
            if (actionKey === "delete") {
              await bulkDeletePosts(selectedIds);
            } else if (actionKey === "trash") {
              await bulkTrashPosts(selectedIds);
            }
            table.clearSelection();
            setConfirmDialog((prev) => ({ ...prev, open: false }));
          },
          destructive: action.destructive || false,
        });
      } else {
        const executeBulk = async () => {
          if (actionKey === "trash") {
            await bulkTrashPosts(selectedIds);
          } else if (actionKey === "restore") {
            await bulkRestorePosts(selectedIds);
          } else if (actionKey === "publish") {
            await bulkPublishPosts(selectedIds);
          }
          table.clearSelection();
        };
        executeBulk();
      }
    },
    [table, bulkTrashPosts, bulkRestorePosts, bulkDeletePosts, bulkPublishPosts],
  );

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Posts</h1>
        <Link to="/posts/new">
          <Button size="sm">Add New Post</Button>
        </Link>
      </div>

      {/* Screen Options */}
      <ScreenOptions
        columns={postListConfig.columns}
        state={table.screenOptions}
        onChange={table.setScreenOptions}
        perPageOptions={postListConfig.perPageOptions}
        entityName="post"
      />

      {/* Status Tabs */}
      <StatusTabs
        tabs={table.statusTabs}
        activeTab={table.activeStatus}
        onTabChange={table.setStatus}
      />

      {/* Toolbar */}
      <ListTableToolbar
        bulkActionsSlot={
          <BulkActions
            actions={postBulkActions}
            selectedCount={table.selection.count}
            onApply={handleBulkAction}
          />
        }
        filtersSlot={
          <PostFilterBar
            dateRange={filters.dateRange}
            categoryId={filters.categoryId}
            onFilter={(filterValues) => {
              // Update URL query params with the selected filters (H6 fix)
              setDateRange(filterValues.dateRange);
              setCategoryId(filterValues.categoryId);
            }}
          />
        }
        searchSlot={
          <SearchBox
            value={table.search}
            onChange={table.setSearch}
            entityName="Posts"
          />
        }
      />

      {/* Bulk Edit Panel (H7 fix) */}
      {showBulkEdit && table.selection.count > 0 && (
        <PostBulkEdit
          selectedIds={Array.from(table.selection.selectedIds)}
          onClose={() => setShowBulkEdit(false)}
          onClearSelection={() => {
            table.clearSelection();
            setShowBulkEdit(false);
          }}
        />
      )}

      {/* List Table */}
      <ListTable
        columns={table.visibleColumns}
        rows={table.rows}
        sort={table.sort}
        onSortChange={table.setSort}
        getRowId={postListConfig.getRowId}
        selection={table.selection}
        onToggleRow={table.toggleRow}
        onToggleAll={table.toggleAll}
        rowActions={rowActionsWithHandlers}
        primaryColumn="title"
        showCheckboxes
        isLoading={postsLoading}
        getRowLabel={(row) => row.title || "(no title)"}
        quickEditId={quickEditId}
        quickEditRender={(row, onClose) => (
          <PostQuickEdit
            post={row}
            onClose={() => {
              setQuickEditId(null);
              onClose();
            }}
          />
        )}
        emptyState={
          <EmptyState
            title="No posts found."
            description={
              table.search
                ? "Try adjusting your search or filters."
                : "Create your first post to get started."
            }
            isFiltered={!!table.search || !!table.activeStatus}
            action={
              !table.search && !table.activeStatus ? (
                <Link to="/posts/new">
                  <Button size="sm">Add New Post</Button>
                </Link>
              ) : undefined
            }
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
          perPageOptions={postListConfig.perPageOptions}
          entityNamePlural="posts"
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
        confirmLabel={confirmDialog.destructive ? "Delete" : "Confirm"}
        destructive={confirmDialog.destructive}
      />
    </div>
  );
}
