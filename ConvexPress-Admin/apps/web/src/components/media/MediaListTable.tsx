/**
 * Media Library List Table
 *
 * WordPress-style media library with grid/list view toggle.
 * Wired to real Convex queries: api.media.queries.list + api.media.queries.counts.
 * No mock data. No trash (media deletion is permanent).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  FileIcon,
  GridIcon,
  ImageIcon,
  ListIcon,
  MusicIcon,
  VideoIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
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
import { MediaGrid } from "@/components/media/MediaGrid";
import { Button } from "@/components/ui/button";
import { useListTable } from "@/hooks/useListTable";
import type {
  BulkAction,
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  RowAction,
  StatusTab,
} from "@/types/list-table";

// ─── Media Item Type (matches Convex media table shape) ──────────────────────

interface MediaItem {
  _id: string;
  _creationTime: number;
  title: string;
  fileName: string;
  slug: string;
  description?: string;
  caption?: string;
  altText?: string;
  storageId: string;
  url: string;
  mimeType: string;
  fileSize: number;
  mediaType: "image" | "video" | "audio" | "document" | "archive" | "other";
  width?: number;
  height?: number;
  status: "processing" | "active" | "failed";
  processingError?: string;
  uploadedBy: string;
  /** Denormalized uploader display name (resolved by the enrichment step below) */
  uploaderName?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/"))
    return <ImageIcon className="size-4 text-muted-foreground" />;
  if (mimeType.startsWith("video/"))
    return <VideoIcon className="size-4 text-muted-foreground" />;
  if (mimeType.startsWith("audio/"))
    return <MusicIcon className="size-4 text-muted-foreground" />;
  return <FileIcon className="size-4 text-muted-foreground" />;
}

// Map status tab keys to mediaType filter values
function getMediaTypeFilter(
  status: string | undefined,
): "image" | "video" | "audio" | "document" | undefined {
  switch (status) {
    case "images":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "documents":
      return "document";
    default:
      return undefined;
  }
}

// ─── Column Definitions ──────────────────────────────────────────────────────

const mediaColumns: ColumnDef<MediaItem>[] = [
  {
    key: "file",
    label: "File",
    sortable: true,
    hideable: false,
    width: "w-[35%]",
    render: (row) => (
      <div className="flex items-center gap-3">
        <div className="size-12 shrink-0 rounded-none border border-border overflow-hidden bg-muted/50 flex items-center justify-center">
          {row.mediaType === "image" && row.url ? (
            <img
              src={row.url}
              alt={row.altText || row.title}
              className="size-full object-cover"
            />
          ) : (
            getFileIcon(row.mimeType)
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">
            {row.title}
          </div>
          <div className="text-xs text-muted-foreground">
            {row.fileName} -- {formatFileSize(row.fileSize)}
          </div>
        </div>
      </div>
    ),
  },
  {
    key: "author",
    label: "Author",
    sortable: false,
    width: "w-[15%]",
    render: (row) => (
      <span className="text-muted-foreground">
        {row.uploaderName || "Unknown"}
      </span>
    ),
  },
  {
    key: "mediaType",
    label: "Type",
    sortable: false,
    width: "w-[15%]",
    render: (row) => (
      <span className="text-muted-foreground capitalize">{row.mediaType}</span>
    ),
  },
  {
    key: "date",
    label: "Date",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[15%]",
    render: (row) => {
      const formatted = new Date(row.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      return <span className="text-foreground">{formatted}</span>;
    },
  },
];

// ─── Status Tabs (no Trash -- media deletion is permanent) ───────────────────

const mediaStatusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "images", label: "Images" },
  { key: "audio", label: "Audio" },
  { key: "video", label: "Video" },
  { key: "documents", label: "Documents" },
  { key: "mine", label: "Mine" },
  { key: "unattached", label: "Unattached" },
];

// ─── Bulk Actions (no trash/restore -- permanent delete only) ────────────────

const mediaBulkActions: BulkAction[] = [
  {
    key: "delete",
    label: "Delete Permanently",
    requiresConfirmation: true,
    confirmMessage:
      "You are about to permanently delete the selected media files. This action cannot be undone.",
    destructive: true,
  },
];

// ─── Row Actions ─────────────────────────────────────────────────────────────

const mediaRowActions: RowAction<MediaItem>[] = [
  {
    key: "edit",
    label: "Edit",
    type: "link",
    href: (row) => `/media/${row._id}/edit`,
  },
  {
    key: "delete",
    label: "Delete Permanently",
    type: "button",
    destructive: true,
  },
  {
    key: "view",
    label: "View",
    type: "link",
    href: (row) => row.url,
  },
  {
    key: "copyUrl",
    label: "Copy URL",
    type: "button",
  },
];

// ─── Config ──────────────────────────────────────────────────────────────────

const mediaListConfig: ListTableConfig<MediaItem> = {
  entityName: "media",
  entityNamePlural: "media",
  storageKey: "convexpress-media-screen-options",
  columns: mediaColumns,
  statusTabs: mediaStatusTabs,
  bulkActions: mediaBulkActions,
  rowActions: mediaRowActions,
  defaultSort: { orderBy: "date", orderDir: "desc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50, 100],
  getRowId: (row) => row._id,
  primaryColumn: "file",
  showCheckboxes: true,
};

// ─── Component ───────────────────────────────────────────────────────────────

export function MediaListTable() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    destructive: boolean;
  }>({
    open: false,
    title: "",
    message: "",
    onConfirm: () => {},
    destructive: false,
  });

  // ── Read URL search params for building Convex query args ─────────────
  const searchParams = useSearch({ strict: false }) as Record<
    string,
    string | number | undefined
  >;
  const activeStatusFromUrl = searchParams.status as string | undefined;
  const searchFromUrl = (searchParams.search as string) || "";

  // ── Convex Queries ──────────────────────────────────────────────────────
  const counts = useQuery(api.media.queries.counts);
  const currentUser = useQuery(api.users.getCurrentUser);

  // Map counts to the shape expected by useListTable
  const countsMap = useMemo(() => {
    if (!counts) return undefined;
    return {
      all: counts.all,
      images: counts.images,
      audio: counts.audio,
      video: counts.video,
      documents: counts.documents,
      mine: counts.mine,
      unattached: counts.unattached,
    };
  }, [counts]);

  // ── Derive Convex query params from URL state ─────────────────────────
  const mediaTypeFilter = getMediaTypeFilter(activeStatusFromUrl);
  const numItems = viewMode === "grid" ? 40 : 20;

  // Track pagination cursors: page number -> cursor string
  // Convex uses cursor-based pagination; we map page numbers to cursors.
  const [cursorMap, setCursorMap] = useState<Record<number, string>>({});
  const currentPage = (searchParams.page as number) || 1;
  const currentCursor = currentPage === 1 ? null : (cursorMap[currentPage] ?? null);

  // For "mine" tab, pass the current user's ID as uploadedBy filter
  const uploadedByFilter = activeStatusFromUrl === "mine" && currentUser
    ? (currentUser._id as Id<"users">)
    : undefined;

  // H4/M8: For "unattached" tab, pass the unattached filter
  const unattachedFilter = activeStatusFromUrl === "unattached" ? true : undefined;

  // Wire search, filter, and pagination into the Convex query
  const mediaResult = useQuery(api.media.queries.list, {
    mediaType: mediaTypeFilter,
    uploadedBy: uploadedByFilter,
    unattached: unattachedFilter,
    search: searchFromUrl || undefined,
    paginationOpts: {
      numItems,
      cursor: currentCursor,
    },
  });

  // Store the continueCursor for the next page when results arrive
  useEffect(() => {
    if (mediaResult && mediaResult.continueCursor && !mediaResult.isDone) {
      const nextPage = currentPage + 1;
      setCursorMap((prev) => {
        if (prev[nextPage] === mediaResult.continueCursor) return prev;
        return { ...prev, [nextPage]: mediaResult.continueCursor };
      });
    }
  }, [mediaResult, currentPage]);

  // Reset cursor map when filters/search change (go back to page 1)
  const prevFilterKey = useRef(`${activeStatusFromUrl}|${searchFromUrl}`);
  useEffect(() => {
    const key = `${activeStatusFromUrl}|${searchFromUrl}`;
    if (key !== prevFilterKey.current) {
      prevFilterKey.current = key;
      setCursorMap({});
    }
  }, [activeStatusFromUrl, searchFromUrl]);

  // ── Resolve uploader names for visible media items ────────────────────
  // M7 fix: The backend list query now denormalizes uploader names directly.
  // We use backend-provided uploaderName, falling back to current user info.
  const enrichedItems = useMemo<MediaItem[]>(() => {
    if (!mediaResult) return [];
    const items = (mediaResult.page ?? []) as MediaItem[];

    return items.map((item) => ({
      ...item,
      // Use backend-provided uploaderName (from M7 enrichment in queries.ts)
      uploaderName: item.uploaderName || "Unknown",
    }));
  }, [mediaResult]);

  // Transform Convex result to PaginatedResult
  const data = useMemo<PaginatedResult<MediaItem> | undefined>(() => {
    if (mediaResult === undefined) return undefined;
    return {
      items: enrichedItems,
      total: enrichedItems.length + (mediaResult.isDone ? 0 : numItems),
      page: currentPage,
      perPage: numItems,
      totalPages: mediaResult.isDone ? currentPage : currentPage + 1,
    };
  }, [mediaResult, enrichedItems, numItems, currentPage]);

  const table = useListTable({
    config: mediaListConfig,
    data,
    counts: countsMap,
  });

  // ── Mutations ───────────────────────────────────────────────────────────
  const deleteMedia = useMutation(api.media.mutations.remove);
  const bulkDeleteMedia = useMutation(api.media.mutations.bulkDelete);

  // ── Row Actions with Handlers ───────────────────────────────────────────
  const rowActionsWithHandlers = useMemo<RowAction<MediaItem>[]>(
    () =>
      mediaRowActions.map((action) => {
        if (action.key === "delete") {
          return {
            ...action,
            onClick: (row: MediaItem) => {
              setConfirmDialog({
                open: true,
                title: "Delete Permanently?",
                message: `You are about to permanently delete "${row.title}". This action cannot be undone.`,
                onConfirm: async () => {
                  try {
                    await deleteMedia({
                      mediaId: row._id as Id<"media">,
                    });
                    toast.success(`"${row.title}" permanently deleted.`);
                  } catch (err) {
                    toast.error(
                      `Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`,
                    );
                  }
                  setConfirmDialog((prev) => ({ ...prev, open: false }));
                },
                destructive: true,
              });
            },
          };
        }
        if (action.key === "copyUrl") {
          return {
            ...action,
            onClick: (row: MediaItem) => {
              navigator.clipboard.writeText(row.url);
              toast.success("URL copied to clipboard.");
            },
          };
        }
        return action;
      }),
    [deleteMedia],
  );

  // ── Bulk Actions Handler ────────────────────────────────────────────────
  const handleBulkAction = useCallback(
    (actionKey: string) => {
      const action = mediaBulkActions.find((a) => a.key === actionKey);
      if (!action) return;

      if (action.requiresConfirmation) {
        setConfirmDialog({
          open: true,
          title: `${action.label}?`,
          message:
            action.confirmMessage ||
            `Are you sure you want to ${action.label.toLowerCase()} ${table.selection.count} items?`,
          onConfirm: async () => {
            try {
              const ids = Array.from(table.selection.selectedIds) as Id<"media">[];
              const result = await bulkDeleteMedia({ mediaIds: ids });
              toast.success(
                `${result.deleted} media items permanently deleted.`,
              );
              if (result.errors.length > 0) {
                toast.error(
                  `${result.errors.length} items could not be deleted.`,
                );
              }
            } catch (err) {
              toast.error(
                `Bulk delete failed: ${err instanceof Error ? err.message : "Unknown error"}`,
              );
            }
            table.clearSelection();
            setConfirmDialog((prev) => ({ ...prev, open: false }));
          },
          destructive: action.destructive || false,
        });
      }
    },
    [table, bulkDeleteMedia],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Media Library</h1>
        <Link
          to="/media/upload"
          activeProps={{}}
        >
          <Button size="sm">Add New</Button>
        </Link>
      </div>

      <ScreenOptions
        columns={mediaListConfig.columns}
        state={table.screenOptions}
        onChange={table.setScreenOptions}
        perPageOptions={mediaListConfig.perPageOptions}
        entityName="media"
      />

      {/* Status Tabs + View Toggle */}
      <div className="flex items-center justify-between">
        <StatusTabs
          tabs={table.statusTabs}
          activeTab={table.activeStatus}
          onTabChange={table.setStatus}
        />
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon-xs"
            onClick={() => setViewMode("list")}
            aria-label="List view"
          >
            <ListIcon className="size-3.5" />
          </Button>
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon-xs"
            onClick={() => setViewMode("grid")}
            aria-label="Grid view"
          >
            <GridIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      <ListTableToolbar
        bulkActionsSlot={
          <BulkActions
            actions={mediaBulkActions}
            selectedCount={table.selection.count}
            onApply={handleBulkAction}
          />
        }
        searchSlot={
          <SearchBox
            value={table.search}
            onChange={table.setSearch}
            entityName="Media"
          />
        }
      />

      {/* View Content */}
      {viewMode === "list" ? (
        <ListTable
          columns={table.visibleColumns}
          rows={table.rows}
          sort={table.sort}
          onSortChange={table.setSort}
          getRowId={mediaListConfig.getRowId}
          selection={table.selection}
          onToggleRow={table.toggleRow}
          onToggleAll={table.toggleAll}
          rowActions={rowActionsWithHandlers}
          primaryColumn="file"
          showCheckboxes
          isLoading={table.isLoading}
          getRowLabel={(row) => row.title || row.fileName}
          emptyState={
            <EmptyState
              title="No media found."
              description={
                table.search
                  ? "Try adjusting your search or filters."
                  : "Upload your first media file to get started."
              }
              isFiltered={!!table.search || !!table.activeStatus}
              action={
                !table.search && !table.activeStatus ? (
                  <Link
                    to="/media/upload"
                    activeProps={{}}
                  >
                    <Button size="sm">Add New</Button>
                  </Link>
                ) : undefined
              }
            />
          }
        />
      ) : (
        <MediaGrid
          items={table.rows as MediaItem[]}
          isLoading={table.isLoading}
          selectedIds={table.selection.selectedIds}
          onToggle={table.toggleRow}
          onOpen={(item) => {
            navigate({
              to: "/media/$mediaId/edit",
              params: { mediaId: item._id },
            });
          }}
        />
      )}

      <div className="mt-4">
        <Pagination
          total={table.total}
          page={table.pagination.page}
          perPage={table.pagination.perPage}
          totalPages={table.totalPages}
          onPageChange={table.setPage}
          onPerPageChange={table.setPerPage}
          perPageOptions={mediaListConfig.perPageOptions}
          entityNamePlural="media items"
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
