/**
 * Webhook Table Component
 *
 * DataTable displaying webhooks using the shared useListTable hook pattern.
 * Columns: Name, Delivery URL (truncated), Event (code + system label), Status (badge),
 * Last Delivery (relative time), Consecutive Failures (n/max), Actions (Test, Pause, Delete).
 *
 * Wired to real Convex queries via useQuery(api.api.queries.listWebhooks).
 * Uses client-side pagination since the backend returns a flat array.
 */

import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import {
  WebhookIcon,
  PauseIcon,
  PlayIcon,
  Trash2Icon,
  AlertTriangleIcon,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ListTable } from "@/components/shared/ListTable";
import { Pagination } from "@/components/shared/Pagination";
import { ScreenOptions } from "@/components/shared/ScreenOptions";
import { SearchBox } from "@/components/shared/SearchBox";
import { StatusTabs } from "@/components/shared/StatusTabs";
import { ListTableToolbar } from "@/components/shared/ListTableToolbar";
import { useListTable } from "@/hooks/useListTable";
import { cn, asId } from "@/lib/utils";
import {
  WEBHOOK_STATUS_CONFIG,
  EVENT_CODE_GROUPS,
} from "@/lib/api/constants";
import { formatRelativeTime } from "@/lib/api/utils";
import type { Webhook, WebhookStatus } from "@/lib/api/types";
import type {
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  RowAction,
  StatusTab,
} from "@/types/list-table";
import { CreateWebhookForm } from "./create-webhook-form";
import { TestWebhookButton } from "./test-webhook-button";
import { DeliveryLogTable } from "./delivery-log-table";

// --- Helpers ---

function truncateUrl(url: string, max = 45): string {
  if (url.length <= max) return url;
  return url.substring(0, max) + "...";
}

function StatusBadge({ status }: { status: WebhookStatus }) {
  const config = WEBHOOK_STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium",
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}

function getEventLabel(code: string): string {
  for (const group of EVENT_CODE_GROUPS) {
    const found = group.events.find((e) => e.code === code);
    if (found) return found.label;
  }
  return code;
}

function getEventSystemLabel(code: string): string {
  if (code === "*") return "Wildcard";
  const prefix = code.split(".")[0];
  if (!prefix) return "";
  const prefixMap: Record<string, string> = {
    post: "Post",
    page: "Page",
    comment: "Comment",
    media: "Media",
    taxonomy: "Taxonomy",
    profile: "User",
    role: "User",
    settings: "System",
    menu: "System",
    api: "System",
  };
  return prefixMap[prefix] ?? prefix;
}

// --- Column Definitions ---

const webhookColumns: ColumnDef<Webhook>[] = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    hideable: false,
    width: "w-[16%]",
    render: (row) => (
      <span className="text-xs font-medium text-foreground">{row.name}</span>
    ),
  },
  {
    key: "deliveryUrl",
    label: "Delivery URL",
    width: "w-[22%]",
    render: (row) => (
      <code
        className="text-[10px] font-mono text-muted-foreground"
        title={row.deliveryUrl}
      >
        {truncateUrl(row.deliveryUrl)}
      </code>
    ),
  },
  {
    key: "event",
    label: "Event",
    width: "w-[18%]",
    render: (row) => (
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center px-1 py-0.5 text-[10px] bg-muted text-muted-foreground">
          {getEventSystemLabel(row.eventCode)}
        </span>
        <span
          className="text-xs text-foreground truncate max-w-[140px]"
          title={`${row.eventCode} - ${getEventLabel(row.eventCode)}`}
        >
          {getEventLabel(row.eventCode)}
        </span>
      </div>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: "w-[8%]",
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "lastDelivery",
    label: "Last Delivery",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[12%]",
    render: (row) =>
      row.lastDeliveryAt ? (
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(row.lastDeliveryAt)}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground/50">Never</span>
      ),
  },
  {
    key: "failures",
    label: "Failures",
    sortable: true,
    width: "w-[8%]",
    align: "center",
    render: (row) => (
      <span
        className={cn(
          "text-xs tabular-nums",
          row.consecutiveFailures === 0
            ? "text-muted-foreground/50"
            : row.consecutiveFailures >= row.maxConsecutiveFailures
              ? "text-destructive font-medium"
              : "text-warning",
        )}
      >
        {row.consecutiveFailures}/{row.maxConsecutiveFailures}
      </span>
    ),
  },
];

// --- Status Tabs ---

const webhookStatusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "disabled", label: "Disabled" },
];

// --- Row Actions ---

const webhookRowActions: RowAction<Webhook>[] = [
  {
    key: "test",
    label: "Test",
    type: "button",
  },
  {
    key: "togglePause",
    label: "Pause",
    type: "button",
    visible: (row) => row.status !== "disabled",
  },
  {
    key: "delete",
    label: "Delete",
    type: "button",
    destructive: true,
  },
];

// --- Config ---

const webhookListConfig: ListTableConfig<Webhook> = {
  entityName: "webhook",
  entityNamePlural: "webhooks",
  storageKey: "smithharper-webhooks-screen-options",
  columns: webhookColumns,
  statusTabs: webhookStatusTabs,
  bulkActions: [],
  rowActions: webhookRowActions,
  defaultSort: { orderBy: "name", orderDir: "asc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50],
  getRowId: (row) => row._id,
  primaryColumn: "name",
  showCheckboxes: false,
};

// --- Client-side sort helper ---

function sortWebhooks(
  webhooks: Webhook[],
  orderBy: string,
  orderDir: "asc" | "desc",
): Webhook[] {
  const sorted = [...webhooks];
  const dir = orderDir === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    switch (orderBy) {
      case "name":
        return dir * a.name.localeCompare(b.name);
      case "status":
        return dir * a.status.localeCompare(b.status);
      case "lastDelivery":
        return dir * ((a.lastDeliveryAt ?? 0) - (b.lastDeliveryAt ?? 0));
      case "failures":
        return dir * (a.consecutiveFailures - b.consecutiveFailures);
      default:
        return dir * a.name.localeCompare(b.name);
    }
  });

  return sorted;
}

// --- Component ---

export function WebhookTable() {
  const webhooks = useQuery(api.api.queries.listWebhooks, {}) as
    | Webhook[]
    | undefined;
  const updateWebhook = useMutation(api.api.mutations.updateWebhook);
  const deleteWebhook = useMutation(api.api.mutations.deleteWebhook);

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Build client-side paginated result from the flat array
  const clientPaginatedData = useMemo<
    | {
        data: PaginatedResult<Webhook>;
        counts: Record<string, number>;
      }
    | undefined
  >(() => {
    if (webhooks === undefined) return undefined;
    return {
      data: {
        items: webhooks,
        total: webhooks.length,
        page: 1,
        perPage: webhooks.length || 20,
        totalPages: 1,
      },
      counts: {
        all: webhooks.length,
        active: webhooks.filter((w) => w.status === "active").length,
        paused: webhooks.filter((w) => w.status === "paused").length,
        disabled: webhooks.filter((w) => w.status === "disabled").length,
      },
    };
  }, [webhooks]);

  // Use the shared hook for state management
  const table = useListTable({
    config: webhookListConfig,
    data: clientPaginatedData?.data,
    counts: clientPaginatedData?.counts,
  });

  // Client-side filtering, searching, sorting, and pagination
  const processedRows = useMemo(() => {
    let items = webhooks ?? [];

    // Status filter
    if (table.activeStatus && table.activeStatus !== "all") {
      items = items.filter((w) => w.status === table.activeStatus);
    }

    // Search filter (by name or delivery URL)
    if (table.search) {
      const q = table.search.toLowerCase();
      items = items.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.deliveryUrl.toLowerCase().includes(q) ||
          w.eventCode.toLowerCase().includes(q),
      );
    }

    // Sort
    items = sortWebhooks(items, table.sort.orderBy, table.sort.orderDir);

    // Pagination
    const total = items.length;
    const perPage = table.pagination.perPage;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(table.pagination.page, totalPages);
    const start = (page - 1) * perPage;
    const paginatedItems = items.slice(start, start + perPage);

    return { items: paginatedItems, total, totalPages, page, perPage };
  }, [webhooks, table.activeStatus, table.search, table.sort, table.pagination]);

  // Disabled webhook count for warning banner
  const disabledCount = useMemo(
    () => (webhooks ?? []).filter((w) => w.status === "disabled").length,
    [webhooks],
  );

  // Action handlers
  const handleTogglePause = async (webhook: Webhook) => {
    const newStatus = webhook.status === "paused" ? "active" : "paused";
    try {
      await updateWebhook({
        webhookId: asId<"webhooks">(webhook._id),
        status: newStatus,
      });
      toast.success(
        `Webhook "${webhook.name}" ${newStatus === "paused" ? "paused" : "resumed"}`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update webhook";
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteWebhook({ webhookId: asId<"webhooks">(deleteTarget._id) });
      toast.success(`Webhook "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete webhook";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Row actions with handlers — we need custom rendering for the actions column
  // because webhooks have Test, Pause/Resume, and Delete inline actions that
  // require special components (TestWebhookButton). So we keep inline actions
  // rendered via the column definition rather than using the shared InlineActions.
  // The useListTable hook still manages state, filtering, pagination, etc.

  // We override the columns to include an actions column with the custom buttons
  const columnsWithActions = useMemo<ColumnDef<Webhook>[]>(
    () => [
      // Override the name column to be clickable for delivery log expansion
      {
        ...webhookColumns[0]!,
        render: (row: Webhook) => (
          <button
            type="button"
            onClick={() =>
              setExpandedId(expandedId === row._id ? null : row._id)
            }
            className="text-xs font-medium text-foreground hover:text-primary transition-colors text-left"
            title="Click to view delivery history"
          >
            {row.name}
          </button>
        ),
      },
      ...webhookColumns.slice(1),
      {
        key: "actions",
        label: "Actions",
        align: "right" as const,
        width: "w-[16%]",
        hideable: false,
        render: (row: Webhook) => (
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
            <TestWebhookButton
              webhookId={row._id}
              webhookName={row.name}
            />

            {row.status !== "disabled" && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleTogglePause(row)}
                title={
                  row.status === "paused"
                    ? "Resume webhook"
                    : "Pause webhook"
                }
              >
                {row.status === "paused" ? (
                  <PlayIcon className="size-3" />
                ) : (
                  <PauseIcon className="size-3" />
                )}
              </Button>
            )}

            <Button
              variant="ghost"
              size="xs"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteTarget(row)}
              title="Delete webhook"
            >
              <Trash2Icon className="size-3" />
            </Button>
          </div>
        ),
      },
    ],
    [expandedId],
  );

  // Build a custom config with the actions column added
  const configWithActions = useMemo<ListTableConfig<Webhook>>(
    () => ({
      ...webhookListConfig,
      columns: columnsWithActions,
    }),
    [columnsWithActions],
  );

  // We need a second useListTable instance for the augmented columns
  // to get correct visibleColumns. Instead, filter manually.
  const visibleColumnsWithActions = useMemo(
    () =>
      columnsWithActions.filter((col) => {
        if (col.hideable === false) return true;
        return table.screenOptions.visibleColumns[col.key] !== false;
      }),
    [columnsWithActions, table.screenOptions.visibleColumns],
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Webhooks</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Send real-time event notifications to external services.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <WebhookIcon className="mr-1 size-3" />
          Create Webhook
        </Button>
      </div>

      {/* Screen Options */}
      <ScreenOptions
        columns={webhookListConfig.columns}
        state={table.screenOptions}
        onChange={table.setScreenOptions}
        perPageOptions={webhookListConfig.perPageOptions}
        entityName="webhook"
      />

      {/* Status Tabs */}
      <StatusTabs
        tabs={table.statusTabs}
        activeTab={table.activeStatus}
        onTabChange={table.setStatus}
      />

      {/* Toolbar */}
      <ListTableToolbar
        bulkActionsSlot={<span />}
        searchSlot={
          <SearchBox
            value={table.search}
            onChange={table.setSearch}
            entityName="Webhooks"
          />
        }
      />

      {/* List Table — using custom rendering for expandable rows */}
      {table.isLoading ? (
        <div className="py-16 text-center text-xs text-muted-foreground">
          Loading webhooks...
        </div>
      ) : processedRows.items.length === 0 ? (
        <EmptyState
          title="No webhooks found"
          description={
            table.activeStatus && table.activeStatus !== "all"
              ? `No ${table.activeStatus} webhooks.`
              : table.search
                ? "Try adjusting your search."
                : "Create your first webhook to send event notifications to external services."
          }
          icon={<WebhookIcon className="size-12 text-muted-foreground/50" />}
          isFiltered={!!table.search || !!table.activeStatus}
          action={
            !table.search && (!table.activeStatus || table.activeStatus === "all") ? (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <WebhookIcon className="mr-1 size-3" />
                Create Webhook
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {visibleColumnsWithActions.map((col) => {
                  const isSorted = table.sort.orderBy === col.key;
                  const alignClass =
                    col.align === "center"
                      ? "text-center"
                      : col.align === "right"
                        ? "text-right"
                        : "text-left";

                  return (
                    <th
                      key={col.key}
                      className={cn(
                        "px-3 py-2 text-xs font-semibold text-muted-foreground",
                        col.width,
                        alignClass,
                      )}
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() =>
                            table.setSort({
                              orderBy: col.key,
                              orderDir:
                                isSorted && table.sort.orderDir === "asc"
                                  ? "desc"
                                  : "asc",
                            })
                          }
                        >
                          {col.label}
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {processedRows.items.map((webhook) => (
                <Fragment key={webhook._id}>
                  <tr
                    className={cn(
                      "group/row border-b border-border transition-colors hover:bg-muted/30",
                      expandedId === webhook._id && "bg-muted/20",
                    )}
                  >
                    {visibleColumnsWithActions.map((col) => {
                      const alignClass =
                        col.align === "center"
                          ? "text-center"
                          : col.align === "right"
                            ? "text-right"
                            : "text-left";
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "px-3 py-2.5 text-xs",
                            col.width,
                            alignClass,
                          )}
                        >
                          {col.render(webhook, 0)}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Expanded delivery history */}
                  {expandedId === webhook._id && (
                    <tr key={`${webhook._id}-deliveries`}>
                      <td
                        colSpan={visibleColumnsWithActions.length}
                        className="p-0 border-b border-border bg-muted/10"
                      >
                        <div className="p-4">
                          <DeliveryLogTable webhookId={webhook._id} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="mt-4">
        <Pagination
          total={processedRows.total}
          page={processedRows.page}
          perPage={processedRows.perPage}
          totalPages={processedRows.totalPages}
          onPageChange={table.setPage}
          onPerPageChange={table.setPerPage}
          perPageOptions={webhookListConfig.perPageOptions}
          entityNamePlural="webhooks"
        />
      </div>

      {/* Disabled webhook warning */}
      {disabledCount > 0 &&
        (!table.activeStatus || table.activeStatus === "all") && (
          <div className="mt-4 border border-warning/30 bg-warning/5 p-3 flex items-start gap-2">
            <AlertTriangleIcon className="size-4 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-warning">
                {disabledCount} webhook
                {disabledCount > 1 ? "s" : ""} disabled
              </p>
              <p className="text-[10px] text-warning/80 mt-0.5">
                Webhooks are automatically disabled after too many consecutive
                delivery failures. Review and re-enable them from the Disabled
                tab.
              </p>
            </div>
          </div>
        )}

      {/* Create dialog */}
      <CreateWebhookForm
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          open={true}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Delete Webhook"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This will also remove all delivery history for this webhook. This action cannot be undone.`}
          confirmLabel="Delete Webhook"
          destructive
          isExecuting={isDeleting}
        />
      )}
    </div>
  );
}
