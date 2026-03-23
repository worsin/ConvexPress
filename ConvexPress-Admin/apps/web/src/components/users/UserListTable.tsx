/**
 * User List Table
 *
 * WordPress-style list table for the Users > All Users page.
 * Wired to real Convex queries: profiles.queries.listUsers + profiles.queries.counts.
 *
 * Features:
 *   - Status tabs (All / Active / Inactive / Banned)
 *   - Search by name/email
 *   - Sort by displayName, email, createdAt, postCount
 *   - Bulk delete with content disposition
 *   - Row actions: Edit, Delete, View
 *   - Real-time: new registrations and status changes appear without refresh
 */

import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
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
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/users/avatar";
import { UserStatusBadge } from "@/components/users/user-status-badge";
import { DeleteUserDialog } from "@/components/users/delete-user-dialog";
import { BulkChangeRoleDialog } from "@/components/users/BulkChangeRoleDialog";
import { useListTable } from "@/hooks/useListTable";
import { useBulkDeleteUsers } from "@/hooks/users/useUserMutations";
import { formatDate } from "@/lib/users/constants";
import type {
  BulkAction,
  ColumnDef,
  ListTableConfig,
  PaginatedResult,
  RowAction,
  StatusTab,
} from "@/types/list-table";
import type { UserWithRole } from "@/lib/users/types";
import type { Id } from "@backend/convex/_generated/dataModel";

// --- Column Definitions ---

const userColumns: ColumnDef<UserWithRole>[] = [
  {
    key: "username",
    label: "Username",
    sortable: true,
    hideable: false,
    width: "w-[25%]",
    render: (row) => (
      <div className="flex items-center gap-2">
        <Avatar user={row} size="md" />
        <div className="min-w-0">
          <Link
            to="/users/$userId/edit"
            params={{ userId: row._id }}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block"
          >
            {row.displayName || row.username || row.email.split("@")[0]}
          </Link>
          {row.status !== "active" && (
            <UserStatusBadge status={row.status} className="mt-0.5" />
          )}
        </div>
      </div>
    ),
  },
  {
    key: "email",
    label: "Email",
    sortable: true,
    width: "w-[25%]",
    render: (row) => (
      <a
        href={`mailto:${row.email}`}
        className="text-primary hover:underline text-xs"
      >
        {row.email}
      </a>
    ),
  },
  {
    key: "role",
    label: "Role",
    sortable: false,
    width: "w-[15%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground capitalize">
        {row.roleName ?? "No Role"}
      </span>
    ),
  },
  {
    key: "posts",
    label: "Posts",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[10%]",
    align: "center",
    render: (row) => {
      const count = row.postCount ?? 0;
      if (count === 0) {
        return <span className="text-muted-foreground text-xs">0</span>;
      }
      return (
        <Link
          to="/posts"
          search={{ authorId: row._id }}
          className="text-primary hover:underline text-xs"
        >
          {count}
        </Link>
      );
    },
  },
  {
    key: "createdAt",
    label: "Registered",
    sortable: true,
    defaultSortDir: "desc",
    width: "w-[15%]",
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {formatDate(row.createdAt)}
      </span>
    ),
  },
];

// --- Status Tabs ---

const userStatusTabs: StatusTab[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "banned", label: "Banned" },
];

// --- Bulk Actions ---

const userBulkActions: BulkAction[] = [
  {
    key: "changeRole",
    label: "Change Role",
    requiresConfirmation: false,
    capability: "profile.update_role",
  },
  {
    key: "delete",
    label: "Delete",
    requiresConfirmation: true,
    confirmMessage:
      "You are about to delete the selected users. This action cannot be undone.",
    destructive: true,
    capability: "profile.delete_user",
  },
];

// --- Row Actions ---

const userRowActions: RowAction<UserWithRole>[] = [
  {
    key: "edit",
    label: "Edit",
    type: "link",
    href: (row) => `/users/${row._id}/edit`,
  },
  {
    key: "delete",
    label: "Delete",
    type: "button",
    destructive: true,
    capability: "profile.delete_user",
  },
  {
    key: "view",
    label: "View",
    type: "link",
    href: (row) => `/author/${row.slug ?? row._id}`,
  },
];

// --- Config ---

const userListConfig: ListTableConfig<UserWithRole> = {
  entityName: "user",
  entityNamePlural: "users",
  storageKey: "smithharper-users-screen-options",
  columns: userColumns,
  statusTabs: userStatusTabs,
  bulkActions: userBulkActions,
  rowActions: userRowActions,
  defaultSort: { orderBy: "createdAt", orderDir: "desc" },
  defaultPerPage: 20,
  perPageOptions: [10, 20, 50, 100],
  getRowId: (row) => row._id,
  primaryColumn: "username",
  showCheckboxes: true,
};

// --- Map sort keys from list table to Convex query ---

function mapOrderBy(
  key: string,
): "displayName" | "email" | "createdAt" | "postCount" {
  switch (key) {
    case "username":
      return "displayName";
    case "email":
      return "email";
    case "posts":
      return "postCount";
    case "createdAt":
      return "createdAt";
    default:
      return "createdAt";
  }
}

// --- Component ---

export function UserListTable() {
  // Delete dialog state
  const [deleteDialogUser, setDeleteDialogUser] = useState<UserWithRole | null>(
    null,
  );

  // Bulk delete state
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const bulkDeleteUsers = useBulkDeleteUsers();

  // Bulk change role state
  const [bulkChangeRoleOpen, setBulkChangeRoleOpen] = useState(false);

  // --- Convex Queries ---
  // Use a preliminary useListTable pass to get URL-driven state, then feed that into queries.
  // We need to build a two-pass approach: first parse URL state, then query, then useListTable with data.

  // We'll use useListTable with undefined data first to read URL state, then query with that state
  const tablePreview = useListTable({
    config: userListConfig,
    data: undefined,
    counts: undefined,
  });

  const usersResult = useQuery(api.profiles.queries.listUsers, {
    status:
      !tablePreview.activeStatus || tablePreview.activeStatus === "all"
        ? undefined
        : (tablePreview.activeStatus as "active" | "inactive" | "banned"),
    search: tablePreview.search || undefined,
    page: tablePreview.pagination.page,
    perPage: tablePreview.pagination.perPage,
    orderBy: mapOrderBy(tablePreview.sort.orderBy),
    orderDir: tablePreview.sort.orderDir,
  });

  const countsResult = useQuery(api.profiles.queries.counts, {});

  // --- Build paginated result for useListTable ---
  const paginatedResult: PaginatedResult<UserWithRole> | undefined = useMemo(() => {
    if (!usersResult) return undefined;
    return {
      items: usersResult.users as UserWithRole[],
      total: usersResult.total,
      page: usersResult.page,
      perPage: usersResult.perPage,
      totalPages: usersResult.totalPages,
    };
  }, [usersResult]);

  // --- Build counts for status tabs ---
  const countsMap = useMemo(() => {
    if (!countsResult) return undefined;
    return {
      all: countsResult.total,
      active: countsResult.active,
      inactive: countsResult.inactive,
      banned: countsResult.banned,
    };
  }, [countsResult]);

  // --- List table hook (with real data) ---
  const table = useListTable({
    config: userListConfig,
    data: paginatedResult,
    counts: countsMap,
  });

  // --- Row actions with handlers ---
  const rowActionsWithHandlers = useMemo<RowAction<UserWithRole>[]>(
    () =>
      userRowActions.map((action) => {
        if (action.key === "delete") {
          return {
            ...action,
            onClick: (row: UserWithRole) => {
              setDeleteDialogUser(row);
            },
          };
        }
        return action;
      }),
    [],
  );

  // --- Bulk action handler ---
  const handleBulkAction = useCallback(
    (actionKey: string) => {
      if (table.selection.count === 0) {
        toast.warning("No users selected.");
        return;
      }

      if (actionKey === "delete") {
        setBulkDeleteConfirm(true);
      } else if (actionKey === "changeRole") {
        setBulkChangeRoleOpen(true);
      }
    },
    [table.selection.count],
  );

  const handleBulkDeleteConfirm = useCallback(async () => {
    const selectedIds = Array.from(table.selection.selectedIds) as Id<"users">[];
    const success = await bulkDeleteUsers({
      userIds: selectedIds,
      deleteContent: true, // Default for bulk: delete content
    });
    if (success) {
      table.clearSelection();
    }
    setBulkDeleteConfirm(false);
  }, [table, bulkDeleteUsers]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <Link to="/users/new">
          <Button size="sm">Add New User</Button>
        </Link>
      </div>

      <ScreenOptions
        columns={userListConfig.columns}
        state={table.screenOptions}
        onChange={table.setScreenOptions}
        perPageOptions={userListConfig.perPageOptions}
        entityName="user"
      />

      <StatusTabs
        tabs={table.statusTabs}
        activeTab={table.activeStatus}
        onTabChange={table.setStatus}
      />

      <ListTableToolbar
        bulkActionsSlot={
          <BulkActions
            actions={userBulkActions}
            selectedCount={table.selection.count}
            onApply={handleBulkAction}
          />
        }
        searchSlot={
          <SearchBox
            value={table.search}
            onChange={table.setSearch}
            entityName="Users"
          />
        }
      />

      <ListTable
        columns={table.visibleColumns}
        rows={table.rows}
        sort={table.sort}
        onSortChange={table.setSort}
        getRowId={userListConfig.getRowId}
        selection={table.selection}
        onToggleRow={table.toggleRow}
        onToggleAll={table.toggleAll}
        rowActions={rowActionsWithHandlers}
        primaryColumn="username"
        showCheckboxes
        isLoading={table.isLoading}
        getRowLabel={(row) => row.displayName || row.email}
        emptyState={
          <EmptyState
            title="No users found."
            description={
              table.search
                ? "Try adjusting your search or filters."
                : "No users have registered yet."
            }
            isFiltered={!!table.search || (!!table.activeStatus && table.activeStatus !== "all")}
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
          perPageOptions={userListConfig.perPageOptions}
          entityNamePlural="users"
        />
      </div>

      {/* Delete User Dialog (single user) */}
      {deleteDialogUser && (
        <DeleteUserDialog
          open={!!deleteDialogUser}
          onClose={() => setDeleteDialogUser(null)}
          user={deleteDialogUser}
          onDeleted={() => setDeleteDialogUser(null)}
        />
      )}

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        onConfirm={handleBulkDeleteConfirm}
        title="Delete selected users?"
        message={`You are about to permanently delete ${table.selection.count} users and all their content. This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
      />

      {/* Bulk Change Role Dialog */}
      <BulkChangeRoleDialog
        open={bulkChangeRoleOpen}
        onClose={() => setBulkChangeRoleOpen(false)}
        userIds={Array.from(table.selection.selectedIds) as Id<"users">[]}
        onComplete={() => table.clearSelection()}
      />
    </div>
  );
}
