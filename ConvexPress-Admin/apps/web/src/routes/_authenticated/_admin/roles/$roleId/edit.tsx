/**
 * Edit Role Page - /admin/roles/$roleId/edit
 *
 * Full-page editor for a role's metadata, capabilities, and page access.
 * WordPress equivalent: User Role Editor > Edit Role
 *
 * Sections:
 *   1. Role Metadata (name, slug, description, level, type, status)
 *   2. Capabilities (grouped by domain with toggles)
 *   3. Page Access (admin routes the role can access)
 *
 * Access: Administrator only (requires role.update capability)
 */

import { useCallback, useState, useTransition } from "react";
import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { ArrowLeftIcon, LoaderIcon, ShieldIcon } from "lucide-react";

import { api } from "@backend/convex/_generated/api";

import { CapabilityEditor } from "@/components/roles/capability-editor";
import { PageAccessEditor } from "@/components/roles/page-access-editor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/roles/$roleId/edit",
)({
  component: EditRolePage,
});

function EditRolePage() {
  const { roleId } = useParams({
    from: "/_authenticated/_admin/roles/$roleId/edit",
  });

  const role = useQuery(api.roles.queries.getRole, {
    roleId: roleId as never,
  });

  // Loading state
  if (role === undefined) {
    return (
      <RoutePermissionGuard requiredAccess="/admin/roles/edit">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </RoutePermissionGuard>
    );
  }

  // Not found
  if (role === null) {
    return (
      <RoutePermissionGuard requiredAccess="/admin/roles/edit">
        <div className="py-12 text-center">
          <h1 className="text-lg font-semibold text-foreground mb-2">
            Role Not Found
          </h1>
          <p className="text-sm text-muted-foreground mb-4">
            The role you are looking for does not exist.
          </p>
          <Link
            to="/roles"
            className="text-sm text-primary hover:underline"
          >
            Back to All Roles
          </Link>
        </div>
      </RoutePermissionGuard>
    );
  }

  // key={role._id} ensures local form state resets when navigating between roles,
  // eliminating the useEffect sync-from-props anti-pattern (React 19 pattern: A1 fix)
  return (
    <RoutePermissionGuard requiredAccess="/admin/roles/edit">
      <EditRoleForm role={role as unknown as RoleFormData} key={role._id} />
    </RoutePermissionGuard>
  );
}

// --- Extracted Form Component ---
// Local state is initialized directly from props (no useEffect sync).
// Remounting via key={role._id} handles data changes cleanly.

interface RoleFormData {
  _id: string;
  name: string;
  slug: string;
  description: string;
  level: number;
  type: string;
  status: string;
  isProtected: boolean;
  capabilities: string[];
  pageAccess: string[];
}

function EditRoleForm({ role }: { role: RoleFormData }) {
  const navigate = useNavigate();
  const updateRole = useMutation(api.roles.mutations.update);

  // React 19: useTransition for async save (replaces manual isSaving state)
  const [isSaving, startSaveTransition] = useTransition();

  // Local form state initialized directly from props (no useEffect needed)
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [level, setLevel] = useState(role.level);
  const [type, setType] = useState<"internal" | "customer" | "system">(
    role.type as "internal" | "customer" | "system",
  );
  const [status, setStatus] = useState<"active" | "inactive">(
    role.status as "active" | "inactive",
  );
  const [capabilities, setCapabilities] = useState<string[]>([...role.capabilities]);
  const [pageAccess, setPageAccess] = useState<string[]>([...role.pageAccess]);
  const [isDirty, setIsDirty] = useState(false);

  const handleCapabilitiesChange = useCallback((newCaps: string[]) => {
    setCapabilities(newCaps);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    startSaveTransition(async () => {
      try {
        await updateRole({
          roleId: role._id as never,
          name,
          description,
          level,
          type,
          status,
          capabilities,
          pageAccess,
        });
        toast.success(`Role "${name}" updated successfully.`);
        setIsDirty(false);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to update role";
        toast.error(message);
      }
    });
  }, [role._id, updateRole, name, description, level, type, status, capabilities, pageAccess]);

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            to="/roles"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="size-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldIcon className="size-5" />
              Edit Role: {role.name}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {role.isProtected
                ? "Built-in role — capabilities can be modified but the role cannot be deleted."
                : "Custom role — can be modified or deleted."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-destructive">Unsaved changes</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/roles" })}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
          >
            {isSaving && <LoaderIcon className="size-3 animate-spin mr-1" />}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Role Metadata */}
      <section className="border border-border p-4 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">
          Role Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Name */}
          <div>
            <label
              htmlFor="role-name"
              className="block text-xs font-medium text-foreground mb-1"
            >
              Name
            </label>
            <input
              id="role-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setIsDirty(true);
              }}
              className="h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50"
            />
          </div>

          {/* Slug */}
          <div>
            <label
              htmlFor="role-slug"
              className="block text-xs font-medium text-foreground mb-1"
            >
              Slug
            </label>
            <input
              id="role-slug"
              type="text"
              value={role.slug}
              disabled
              className="h-8 w-full border border-border bg-muted/30 px-2.5 text-xs text-muted-foreground cursor-not-allowed"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Slug cannot be changed after creation.
            </p>
          </div>

          {/* Description */}
          <div className="md:col-span-2">
            <label
              htmlFor="role-description"
              className="block text-xs font-medium text-foreground mb-1"
            >
              Description
            </label>
            <textarea
              id="role-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setIsDirty(true);
              }}
              rows={2}
              className="w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50 resize-none"
            />
          </div>

          {/* Level */}
          <div>
            <label
              htmlFor="role-level"
              className="block text-xs font-medium text-foreground mb-1"
            >
              Hierarchy Level
            </label>
            <input
              id="role-level"
              type="number"
              min={1}
              max={100}
              value={level}
              onChange={(e) => {
                setLevel(Number(e.target.value));
                setIsDirty(true);
              }}
              className="h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Higher = more powerful. Admin=100, Editor=80, Author=60, Contributor=40, Subscriber=20.
            </p>
          </div>

          {/* Type */}
          <div>
            <label
              htmlFor="role-type"
              className="block text-xs font-medium text-foreground mb-1"
            >
              Type
            </label>
            <select
              id="role-type"
              value={type}
              onChange={(e) => {
                setType(e.target.value as "internal" | "customer" | "system");
                setIsDirty(true);
              }}
              className="h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50"
            >
              <option value="internal">Internal</option>
              <option value="customer">Customer</option>
              <option value="system">System</option>
            </select>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Internal = admin staff. Customer = site visitors/members.
            </p>
          </div>

          {/* Status */}
          <div>
            <label
              htmlFor="role-status"
              className="block text-xs font-medium text-foreground mb-1"
            >
              Status
            </label>
            <select
              id="role-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as "active" | "inactive");
                setIsDirty(true);
              }}
              className={cn(
                "h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground",
                "focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50",
              )}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {status === "inactive" && (
              <p className="text-[10px] text-destructive mt-0.5">
                Warning: Inactive roles deny all permissions to assigned users.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="border border-border p-4 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">
          Capabilities
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Toggle individual capabilities or entire domain groups. Changes take
          effect for all users with this role immediately after saving.
        </p>
        <CapabilityEditor
          capabilities={capabilities}
          onChange={handleCapabilitiesChange}
        />
      </section>

      {/* Page Access */}
      <section className="border border-border p-4 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">
          Page Access
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Admin routes this role can access. Uses prefix matching (e.g., granting
          "/admin/posts" also grants "/admin/posts/new").
        </p>
        <PageAccessEditor
          pageAccess={pageAccess}
          onChange={(newAccess) => {
            setPageAccess(newAccess);
            setIsDirty(true);
          }}
        />
      </section>

      {/* Bottom Save Bar */}
      <div className="flex items-center justify-end gap-2 py-4 border-t border-border">
        {isDirty && (
          <span className="text-xs text-destructive mr-auto">
            You have unsaved changes.
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/roles" })}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
        >
          {isSaving && <LoaderIcon className="size-3 animate-spin mr-1" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

