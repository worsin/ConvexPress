/**
 * Role List Table
 *
 * WordPress-style list table displaying all roles with:
 * - Role name (clickable, navigates to edit page)
 * - Type (internal/customer)
 * - Level (hierarchy number)
 * - Users (count of assigned users)
 * - Capabilities (count)
 *
 * Wired to real Convex data via `api.roles.queries.listRoles`.
 */

import { useMemo, useState, useTransition } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { AirtableSyncButton } from "@/components/shared/AirtableSyncButton";
import { ListTable } from "@/components/shared/ListTable";
import { ListTableToolbar } from "@/components/shared/ListTableToolbar";
import { SearchBox } from "@/components/shared/SearchBox";
import { Button } from "@/components/ui/button";
import { useListTable } from "@/hooks/useListTable";
import type {
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  RowAction,
  StatusTab,
} from "@/types/list-table";

// --- Row Type ---

interface RoleRow {
  _id: string;
  name: string;
  slug: string;
  description: string;
  level: number;
  type: string;
  status: string;
  isDefault: boolean;
  isProtected: boolean;
  capabilities: string[];
  pageAccess: string[];
  userCount: number;
}

// --- Column Definitions ---

const roleColumns: ColumnDef<RoleRow>[] = [
  {
    key: "name",
    label: "Role",
    sortable: true,
    hideable: false,
    width: "w-[25%]",
    render: (row) => (
      <div className="flex items-center gap-2">
        <Link
          to="/roles/$roleId/edit"
          params={{ roleId: row._id }}
          className="text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          {row.name}
        </Link>
        {row.isDefault && (
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5">
            Default
          </span>
        )}
        {row.isProtected && (
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5">
            Built-in
          </span>
        )}
      </div>
    ),
  },
  {
    key: "type",
    label: "Type",
    sortable: true,
    width: "w-[12%]",
    render: (row) => (
      <span className="text-muted-foreground capitalize">{row.type}</span>
    ),
  },
  {
    key: "level",
    label: "Level",
    sortable: true,
    width: "w-[10%]",
    align: "center",
    render: (row) => (
      <span className="text-muted-foreground font-mono text-xs">
        {row.level}
      </span>
    ),
  },
  {
    key: "users",
    label: "Users",
    sortable: true,
    width: "w-[12%]",
    align: "center",
    render: (row) => {
      if (row.userCount === 0) {
        return <span className="text-muted-foreground">0</span>;
      }
      return (
        <Link
          to="/users"
          search={{ status: row.slug }}
          className="text-primary hover:underline"
        >
          {row.userCount}
        </Link>
      );
    },
  },
  {
    key: "capabilities",
    label: "Capabilities",
    width: "w-[15%]",
    align: "center",
    render: (row) => (
      <span className="text-muted-foreground">
        {row.capabilities.length}
      </span>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: "w-[10%]",
    render: (row) => (
      <span
        className={
          row.status === "active"
            ? "text-primary capitalize"
            : "text-muted-foreground capitalize"
        }
      >
        {row.status}
      </span>
    ),
  },
];

// --- Status Tabs ---

const roleStatusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "internal", label: "Internal" },
  { key: "customer", label: "Customer" },
];

// --- Row Actions ---

const roleRowActions: RowAction<RoleRow>[] = [
  {
    key: "edit",
    label: "Edit",
    type: "link",
    href: (row) => `/roles/${row._id}/edit`,
  },
  {
    key: "delete",
    label: "Delete",
    type: "button",
    destructive: true,
    capability: "role.delete",
    visible: (row) => !row.isProtected,
  },
];

// --- Config ---

const roleListConfig: ListTableConfig<RoleRow> = {
  entityName: "role",
  entityNamePlural: "roles",
  storageKey: "smithharper-roles-screen-options",
  columns: roleColumns,
  statusTabs: roleStatusTabs,
  bulkActions: [],
  rowActions: roleRowActions,
  defaultSort: { orderBy: "level", orderDir: "desc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50],
  getRowId: (row) => row._id,
  primaryColumn: "name",
  showCheckboxes: false,
};

// --- Component ---

export function RoleListTable() {
  const roles = useQuery(api.roles.queries.listRoles);
  const deleteRole = useMutation(api.roles.mutations.remove);

  // React 19: useTransition for async delete (replaces manual isExecuting state)
  const [isDeleting, startDeleteTransition] = useTransition();

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

  // Filter by type when status tab is used
  const filteredRoles = useMemo(() => {
    if (!roles) return undefined;
    return roles as RoleRow[];
  }, [roles]);

  const data = useMemo<PaginatedResult<RoleRow> | undefined>(() => {
    if (!filteredRoles) return undefined;
    return {
      items: filteredRoles,
      total: filteredRoles.length,
      page: 1,
      perPage: 50,
      totalPages: 1,
    };
  }, [filteredRoles]);

  const counts = useMemo(() => {
    if (!roles) return undefined;
    const all = roles.length;
    const internal = roles.filter(
      (r: { type: string }) => r.type === "internal",
    ).length;
    const customer = roles.filter(
      (r: { type: string }) => r.type === "customer",
    ).length;
    return { all, internal, customer };
  }, [roles]);

  const table = useListTable({ config: roleListConfig, data, counts });

  const rowActionsWithHandlers = useMemo<RowAction<RoleRow>[]>(
    () =>
      roleRowActions.map((action) => {
        if (action.key === "delete") {
          return {
            ...action,
            onClick: (row: RoleRow) => {
              if (row.isProtected) {
                toast.error("Cannot delete a built-in role.");
                return;
              }
              if (row.userCount > 0) {
                toast.error(
                  `Cannot delete "${row.name}" because ${row.userCount} user(s) are still assigned to it. Reassign them first.`,
                );
                return;
              }
              setConfirmDialog({
                open: true,
                title: `Delete "${row.name}"?`,
                message: `This will permanently delete the "${row.name}" role. This action cannot be undone.`,
                onConfirm: () => {
                  startDeleteTransition(async () => {
                    try {
                      await deleteRole({ roleId: row._id as never });
                      toast.success(`Role "${row.name}" deleted.`);
                    } catch (err: unknown) {
                      const message =
                        err instanceof Error ? err.message : "Delete failed";
                      toast.error(message);
                    } finally {
                      setConfirmDialog((prev) => ({
                        ...prev,
                        open: false,
                      }));
                    }
                  });
                },
                destructive: true,
              });
            },
          };
        }
        return action;
      }),
    [deleteRole, startDeleteTransition],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">
          Roles & Capabilities
        </h1>
        <div className="flex items-center gap-2">
          <AirtableSyncButton
            syncAction={api.airtableSync.actions.syncRoles}
          />
          <Link to="/roles/new">
            <Button size="sm">Add New Role</Button>
          </Link>
        </div>
      </div>

      <ListTableToolbar
        searchSlot={
          <SearchBox
            value={table.search}
            onChange={table.setSearch}
            entityName="Roles"
          />
        }
      />

      <ListTable
        columns={table.visibleColumns}
        rows={table.rows}
        sort={table.sort}
        onSortChange={table.setSort}
        getRowId={roleListConfig.getRowId}
        selection={table.selection}
        onToggleRow={table.toggleRow}
        onToggleAll={table.toggleAll}
        rowActions={rowActionsWithHandlers}
        primaryColumn="name"
        showCheckboxes={false}
        isLoading={table.isLoading}
        emptyState={
          <EmptyState
            title="No roles found."
            description="Roles will appear here once they are seeded. Check that the seed migration has been run."
            isFiltered={!!table.search}
          />
        }
      />

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
        isExecuting={isDeleting}
      />
    </div>
  );
}
