/**
 * FieldGroupList - Custom Fields list table
 *
 * WordPress-style list table displaying all field groups with:
 * - Status tabs (All, Active, Inactive)
 * - Search filter
 * - Bulk actions (Delete, Activate, Deactivate)
 * - Row hover actions (Edit, Duplicate, Export JSON, Delete)
 * - Real-time updates via Convex subscription
 */

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  CopyIcon,
  DownloadIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { SearchBox } from "@/components/shared/SearchBox";
import { StatusTabs } from "@/components/shared/StatusTabs";
import { cn, getErrorMessage } from "@/lib/utils";
import type { StatusTab } from "@/types/list-table";

type FieldGroupSearchParams = {
  status?: "active" | "inactive" | "all";
  search?: string;
};

export function FieldGroupList() {
  const navigate = useNavigate();
  const searchParams = useSearch({
    from: "/_authenticated/_admin/custom-fields/",
  });

  // --- Convex queries ---
  const groups = useQuery(api.customFields.queries.listGroups, {
    status: (searchParams.status as "active" | "inactive" | "all") ?? "all",
    search: searchParams.search,
  });
  const groupCounts = useQuery(api.customFields.queries.counts);

  // --- Mutations ---
  const deleteGroupMutation = useMutation(
    api.customFields.mutations.deleteGroup,
  );
  const updateGroupMutation = useMutation(
    api.customFields.mutations.updateGroup,
  );
  const duplicateGroupMutation = useMutation(
    api.customFields.mutations.duplicateGroup,
  );
  const exportGroupMutation = useMutation(
    api.customFields.mutations.exportGroup,
  );
  const importGroupMutation = useMutation(
    api.customFields.mutations.importGroup,
  );

  // --- Refs ---
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Local state ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isExecuting, startExecuteTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(searchParams.search ?? "");

  // --- Status tabs ---
  const statusTabs: StatusTab[] = useMemo(
    () => [
      {
        key: "all",
        label: "All",
        count: groupCounts?.groups ?? 0,
      },
      {
        key: "active",
        label: "Active",
        count: groupCounts?.activeGroups ?? 0,
      },
      {
        key: "inactive",
        label: "Inactive",
        count: (groupCounts?.groups ?? 0) - (groupCounts?.activeGroups ?? 0),
      },
    ],
    [groupCounts],
  );

  // --- Handlers ---
  const handleStatusChange = useCallback(
    (status: string) => {
      navigate({
        to: "/custom-fields",
        search: {
          ...searchParams,
          status: (status || undefined) as FieldGroupSearchParams["status"],
        } as FieldGroupSearchParams,
      });
    },
    [navigate, searchParams],
  );

  const handleSearch = useCallback(
    (value: string) => {
      setSearchValue(value);
      navigate({
        to: "/custom-fields",
        search: {
          ...searchParams,
          search: value || undefined,
        } as FieldGroupSearchParams,
      });
    },
    [navigate, searchParams],
  );

  const handleToggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    if (!groups) return;
    setSelectedIds((prev) => {
      if (prev.size === groups.length) {
        return new Set();
      }
      return new Set(groups.map((g) => g._id));
    });
  }, [groups]);

  const handleDelete = useCallback(
    (groupId: string) => {
      startExecuteTransition(async () => {
        try {
          await deleteGroupMutation({
            groupId: groupId as Id<"fieldGroups">,
            deleteValues: true,
          });
          toast.success("Field group deleted");
          setDeleteTarget(null);
        } catch (error: unknown) {
          console.error("Failed to delete field group:", error);
          toast.error("Failed to delete field group");
        }
      });
    },
    [deleteGroupMutation],
  );

  const handleBulkDelete = useCallback(() => {
    startExecuteTransition(async () => {
      try {
        for (const id of selectedIds) {
          await deleteGroupMutation({
            groupId: id as Id<"fieldGroups">,
            deleteValues: true,
          });
        }
        toast.success(`${selectedIds.size} field group(s) deleted`);
        setSelectedIds(new Set());
        setBulkDeleteOpen(false);
      } catch (error: unknown) {
        console.error("Failed to delete field groups:", error);
        toast.error("Failed to delete some field groups");
      }
    });
  }, [deleteGroupMutation, selectedIds]);

  const handleBulkActivate = useCallback(async () => {
    try {
      for (const id of selectedIds) {
        await updateGroupMutation({
          groupId: id as Id<"fieldGroups">,
          isActive: true,
        });
      }
      toast.success(`${selectedIds.size} field group(s) activated`);
      setSelectedIds(new Set());
    } catch (error: unknown) {
      console.error("Failed to activate field groups:", error);
      toast.error("Failed to activate field groups");
    }
  }, [updateGroupMutation, selectedIds]);

  const handleBulkDeactivate = useCallback(async () => {
    try {
      for (const id of selectedIds) {
        await updateGroupMutation({
          groupId: id as Id<"fieldGroups">,
          isActive: false,
        });
      }
      toast.success(`${selectedIds.size} field group(s) deactivated`);
      setSelectedIds(new Set());
    } catch (error: unknown) {
      console.error("Failed to deactivate field groups:", error);
      toast.error("Failed to deactivate field groups");
    }
  }, [updateGroupMutation, selectedIds]);

  const handleDuplicate = useCallback(
    async (groupId: string) => {
      try {
        const newId = await duplicateGroupMutation({
          groupId: groupId as Id<"fieldGroups">,
        });
        toast.success("Field group duplicated (inactive)");
      } catch (error: unknown) {
        console.error("Failed to duplicate field group:", error);
        toast.error("Failed to duplicate field group");
      }
    },
    [duplicateGroupMutation],
  );

  const handleExport = useCallback(
    async (groupId: string, title: string) => {
      try {
        const json = await exportGroupMutation({
          groupId: groupId as Id<"fieldGroups">,
        });
        // Download as JSON file
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `field-group-${title.toLowerCase().replace(/\s+/g, "-")}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Field group exported");
      } catch (error: unknown) {
        console.error("Failed to export field group:", error);
        toast.error("Failed to export field group");
      }
    },
    [exportGroupMutation],
  );

  const handleImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Reset input so the same file can be re-selected
      event.target.value = "";

      if (!file.name.endsWith(".json")) {
        toast.error("Please select a JSON file");
        return;
      }

      try {
        const text = await file.text();

        // Validate it's valid JSON before sending to backend
        try {
          JSON.parse(text);
        } catch {
          toast.error("Invalid JSON file");
          return;
        }

        const newGroupId = await importGroupMutation({ data: text });
        toast.success("Field group imported successfully (inactive by default)");

        // Navigate to the imported group's edit page
        navigate({
          to: "/custom-fields/$groupId/edit",
          params: { groupId: newGroupId },
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error, "Failed to import field group");
        console.error("Failed to import field group:", error);
        toast.error(message);
      }
    },
    [importGroupMutation, navigate],
  );

  const handleToggleActive = useCallback(
    async (groupId: string, currentActive: boolean) => {
      try {
        await updateGroupMutation({
          groupId: groupId as Id<"fieldGroups">,
          isActive: !currentActive,
        });
        toast.success(
          currentActive ? "Field group deactivated" : "Field group activated",
        );
      } catch (error: unknown) {
        console.error("Failed to update field group:", error);
        toast.error("Failed to update field group");
      }
    },
    [updateGroupMutation],
  );

  // --- Loading ---
  const isLoading = groups === undefined;

  // --- Location rules summary ---
  function locationSummary(
    rules: Array<Array<{ param: string; operator: string; value: string }>>,
  ): string {
    if (!rules || rules.length === 0) return "No rules";
    const firstGroup = rules[0];
    if (!firstGroup || firstGroup.length === 0) return "No rules";
    const first = firstGroup[0];
    const paramLabel =
      first.param === "post_type"
        ? "Post Type"
        : first.param === "page_template"
          ? "Page Template"
          : first.param === "current_user_role"
            ? "User Role"
            : first.param;
    const opLabel = first.operator === "==" ? "is" : "is not";
    let summary = `${paramLabel} ${opLabel} ${first.value}`;
    if (firstGroup.length > 1) {
      summary += ` +${firstGroup.length - 1} more`;
    }
    if (rules.length > 1) {
      summary += ` (${rules.length} groups)`;
    }
    return summary;
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Custom Fields</h1>
        <div className="flex items-center gap-2">
          {/* Hidden file input for import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="size-3.5" />
            Import
          </Button>
          <Link to="/custom-fields/new">
            <Button size="sm">
              <PlusIcon className="size-3.5" />
              Add New
            </Button>
          </Link>
        </div>
      </div>

      {/* Status Tabs */}
      <StatusTabs
        tabs={statusTabs}
        activeTab={searchParams.status}
        onTabChange={handleStatusChange}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <select
              className="h-7 rounded-none border border-border bg-background px-2 text-xs"
              defaultValue=""
              onChange={(e) => {
                const action = e.target.value;
                if (action === "delete") setBulkDeleteOpen(true);
                if (action === "activate") handleBulkActivate();
                if (action === "deactivate") handleBulkDeactivate();
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                Bulk Actions ({selectedIds.size})
              </option>
              <option value="activate">Activate</option>
              <option value="deactivate">Deactivate</option>
              <option value="delete">Delete</option>
            </select>
          </div>
        )}

        <div className="ml-auto">
          <SearchBox
            value={searchValue}
            onChange={setSearchValue}
            onSearch={handleSearch}
            placeholder="Search field groups..."
          />
        </div>
      </div>

      {/* Table */}
      <div className="border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="w-8 px-2 py-2">
                <input
                  type="checkbox"
                  checked={
                    groups !== undefined &&
                    groups.length > 0 &&
                    selectedIds.size === groups.length
                  }
                  onChange={handleToggleAll}
                  className="size-3.5"
                />
              </th>
              <th className="px-3 py-2 text-left font-medium text-foreground">
                Title
              </th>
              <th className="px-3 py-2 text-left font-medium text-foreground">
                Key
              </th>
              <th className="w-16 px-3 py-2 text-center font-medium text-foreground">
                Fields
              </th>
              <th className="px-3 py-2 text-left font-medium text-foreground">
                Location
              </th>
              <th className="w-20 px-3 py-2 text-center font-medium text-foreground">
                Status
              </th>
              <th className="w-16 px-3 py-2 text-center font-medium text-foreground">
                Order
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              // Skeleton rows
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="px-2 py-3">
                    <div className="h-3.5 w-3.5 bg-muted animate-pulse" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="h-4 w-40 bg-muted animate-pulse" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="h-4 w-28 bg-muted animate-pulse" />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="mx-auto h-4 w-6 bg-muted animate-pulse" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="h-4 w-36 bg-muted animate-pulse" />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="mx-auto h-4 w-12 bg-muted animate-pulse" />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="mx-auto h-4 w-6 bg-muted animate-pulse" />
                  </td>
                </tr>
              ))
            ) : groups && groups.length > 0 ? (
              groups.map((group) => (
                <tr
                  key={group._id}
                  className="group/row border-b border-border hover:bg-muted/20 transition-colors"
                >
                  {/* Checkbox */}
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(group._id)}
                      onChange={() => handleToggleRow(group._id)}
                      className="size-3.5"
                    />
                  </td>

                  {/* Title + inline actions */}
                  <td className="px-3 py-2">
                    <div>
                      <Link
                        to="/custom-fields/$groupId/edit"
                        params={{ groupId: group._id }}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {group.title}
                      </Link>
                      {/* Row hover actions */}
                      <div className="opacity-0 group-hover/row:opacity-100 transition-opacity flex items-center gap-0 text-xs leading-none mt-1">
                        <Link
                          to="/custom-fields/$groupId/edit"
                          params={{ groupId: group._id }}
                          className="text-primary hover:underline"
                        >
                          Edit
                        </Link>
                        <span className="text-muted-foreground/50 px-1">|</span>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(group._id)}
                          className="text-primary hover:underline"
                        >
                          Duplicate
                        </button>
                        <span className="text-muted-foreground/50 px-1">|</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleExport(group._id, group.title)
                          }
                          className="text-primary hover:underline"
                        >
                          Export JSON
                        </button>
                        <span className="text-muted-foreground/50 px-1">|</span>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              id: group._id,
                              title: group.title,
                            })
                          }
                          className="text-destructive hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* Key */}
                  <td className="px-3 py-2">
                    <code className="text-xs text-muted-foreground">
                      {group.key}
                    </code>
                  </td>

                  {/* Field count */}
                  <td className="px-3 py-2 text-center text-muted-foreground">
                    {group.fieldCount}
                  </td>

                  {/* Location summary */}
                  <td className="px-3 py-2 text-muted-foreground">
                    {locationSummary(group.locationRules)}
                  </td>

                  {/* Status badge */}
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleActive(group._id, group.isActive)
                      }
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 text-xs font-medium transition-colors",
                        group.isActive
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {group.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>

                  {/* Menu order */}
                  <td className="px-3 py-2 text-center text-muted-foreground">
                    {group.menuOrder}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    icon={<PlusIcon className="size-8 text-muted-foreground" />}
                    title="No field groups found"
                    description={
                      searchParams.search
                        ? "Try adjusting your search or filters."
                        : "Create your first field group to add custom fields to posts and pages."
                    }
                    action={
                      !searchParams.search ? (
                        <Link to="/custom-fields/new">
                          <Button size="sm">
                            <PlusIcon className="size-3.5" />
                            Add New Field Group
                          </Button>
                        </Link>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer count */}
      {groups && groups.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Showing {groups.length} field group{groups.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Single Delete Confirm */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        title="Delete Field Group"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This will also delete all field definitions and stored values.`}
        confirmLabel="Delete"
        destructive
        isExecuting={isExecuting}
      />

      {/* Bulk Delete Confirm */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="Delete Field Groups"
        message={`Are you sure you want to delete ${selectedIds.size} field group(s)? This will also delete all field definitions and stored values.`}
        confirmLabel="Delete All"
        destructive
        isExecuting={isExecuting}
      />
    </div>
  );
}
