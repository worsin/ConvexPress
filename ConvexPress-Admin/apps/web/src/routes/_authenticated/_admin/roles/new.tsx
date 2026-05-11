/**
 * Add New Role Page - /admin/roles/new
 *
 * Full-page form for creating a new custom role.
 * Access: Administrator only (requires role.create capability)
 */

import { useCallback, useState, useTransition } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { ArrowLeftIcon, LoaderIcon, PlusIcon } from "lucide-react";

import { api } from "@backend/convex/_generated/api";

import { CapabilityEditor } from "@/components/roles/capability-editor";
import { PageAccessEditor } from "@/components/roles/page-access-editor";
import { Button } from "@/components/ui/button";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/roles/new",
)({
  component: NewRolePage,
});

function NewRolePage() {
  const navigate = useNavigate();
  const createRole = useMutation(api.roles.mutations.create);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState(30);
  const [type, setType] = useState<"internal" | "customer" | "system">("customer");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [pageAccess, setPageAccess] = useState<string[]>([]);

  // React 19: useTransition for async create (replaces manual isSaving state)
  const [isSaving, startCreateTransition] = useTransition();

  // Auto-generate slug from name
  const handleNameChange = useCallback((value: string) => {
    setName(value);
    // Only auto-generate slug if the user hasn't manually edited it
    const autoSlug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setSlug(autoSlug);
  }, []);

  const handleCreate = useCallback(() => {
    if (!name.trim()) {
      toast.error("Role name is required.");
      return;
    }
    if (!slug.trim()) {
      toast.error("Role slug is required.");
      return;
    }

    startCreateTransition(async () => {
      try {
        await createRole({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim(),
          level,
          type,
          capabilities,
          pageAccess,
        });
        toast.success(`Role "${name}" created successfully.`);
        navigate({ to: "/roles" });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to create role";
        toast.error(message);
      }
    });
  }, [name, slug, description, level, type, capabilities, pageAccess, createRole, navigate]);

  return (
    <RoutePermissionGuard requiredAccess="/admin/roles/new">
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
              <PlusIcon className="size-5" />
              Add New Role
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Create a custom role with specific capabilities and page access.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/roles" })}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={isSaving || !name.trim() || !slug.trim()}
          >
            {isSaving && <LoaderIcon className="size-3 animate-spin mr-1" />}
            Create Role
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
              Name <span className="text-destructive">*</span>
            </label>
            <input
              id="role-name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., Moderator"
              className="h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50"
            />
          </div>

          {/* Slug */}
          <div>
            <label
              htmlFor="role-slug"
              className="block text-xs font-medium text-foreground mb-1"
            >
              Slug <span className="text-destructive">*</span>
            </label>
            <input
              id="role-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g., moderator"
              className="h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Unique identifier. Lowercase letters, numbers, and hyphens only.
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
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description of this role's purpose"
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
              max={99}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              1-99. Higher = more powerful. 100 is reserved for Administrator.
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
              onChange={(e) => setType(e.target.value as "internal" | "customer" | "system")}
              className={cn(
                "h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground",
                "focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50",
              )}
            >
              <option value="customer">Customer</option>
              <option value="internal">Internal</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="border border-border p-4 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">
          Capabilities
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Select the capabilities this role should have. You can toggle individual
          capabilities or entire domain groups.
        </p>
        <CapabilityEditor
          capabilities={capabilities}
          onChange={setCapabilities}
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
          onChange={setPageAccess}
        />
      </section>

      {/* Bottom Action Bar */}
      <div className="flex items-center justify-end gap-2 py-4 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/roles" })}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={isSaving || !name.trim() || !slug.trim()}
        >
          {isSaving && <LoaderIcon className="size-3 animate-spin mr-1" />}
          Create Role
        </Button>
      </div>
      </div>
    </RoutePermissionGuard>
  );
}

