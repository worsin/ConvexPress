/**
 * KB Categories Route - /admin/kb/categories
 *
 * Category management: list, create, update, delete.
 * Wired to api.kb.categories.*
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Plus, Pencil, Trash2, X, Check, Folder } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/kb/categories")({
  component: KBCategoriesPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type EditingCategory = {
  id: string;
  parentId: string;
  name: string;
  description: string;
  icon: string;
};

type NewCategory = {
  name: string;
  description: string;
  icon: string;
  parentId: string;
};

const EMPTY_NEW: NewCategory = {
  name: "",
  description: "",
  icon: "",
  parentId: "",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

function KBCategoriesPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <KBCategoriesContent />
    </RoutePermissionGuard>
  );
}

function KBCategoriesContent() {
  const { can } = useAuth();
  const canView = can("kb.view");
  const canManage = can("kb.manageCategories");
  const categoriesResult = useQuery(api.kb.categories.list, canView ? {} : "skip");
  const categories = (categoriesResult ?? []) as Array<{
    _id: string;
    parentId?: string;
    deletionJobId?: Id<"kb_category_deletions">;
    name: string;
    slug: string;
    description?: string;
    icon?: string;
    articleCount?: number;
    isActive?: boolean;
    isPublished?: boolean;
  }>;
  const createCategory = useMutation(api.kb.categories.create);
  const updateCategory = useMutation(api.kb.categories.update);
  const removeCategory = useMutation(api.kb.categories.remove);

  const [showCreate, setShowCreate] = useState(false);
  const [newCat, setNewCat] = useState<NewCategory>(EMPTY_NEW);
  const [editing, setEditing] = useState<EditingCategory | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleCreate() {
    if (!newCat.name.trim()) {
      toast.error("Category name is required");
      return;
    }
    setIsSaving(true);
    try {
      await createCategory({
        name: newCat.name.trim(),
        description: newCat.description || undefined,
        icon: newCat.icon || undefined,
        parentId: (newCat.parentId as Id<"kb_categories">) || undefined,
      });
      toast.success("Category created");
      setNewCat(EMPTY_NEW);
      setShowCreate(false);
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed to create category");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editing) return;
    setIsSaving(true);
    try {
      await updateCategory({
        categoryId: editing.id as Id<"kb_categories">,
        name: editing.name.trim(),
        description: editing.description,
        icon: editing.icon,
        parentId: (editing.parentId as Id<"kb_categories">) || null,
      });
      toast.success("Category updated");
      setEditing(null);
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed to update category");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(categoryId: string) {
    try {
      await removeCategory({ categoryId: categoryId as Id<"kb_categories"> });
      toast.success("Category deletion started. Articles retain their existing access rules.");
      setConfirmDelete(null);
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed to delete category");
    }
  }

  if (!canView) return <p role="status">You do not have access to knowledge-base categories.</p>;

  if (categoriesResult === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">KB Categories</h1>
        <button
          disabled={!canManage}
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Category
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">New Category</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={newCat.name}
                aria-label="New category name"
                onChange={(e) => setNewCat((p) => ({ ...p, name: e.target.value }))}
                placeholder="Category name"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">
                Icon (emoji or name)
              </label>
              <input
                type="text"
                value={newCat.icon}
                aria-label="New category icon"
                onChange={(e) => setNewCat((p) => ({ ...p, icon: e.target.value }))}
                placeholder="e.g. 📚 or book"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-foreground/70 mb-1">
                Description
              </label>
              <input
                type="text"
                value={newCat.description}
                aria-label="New category description"
                onChange={(e) => setNewCat((p) => ({ ...p, description: e.target.value }))}
                placeholder="Short description"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">
                Parent Category
              </label>
              <select
                value={newCat.parentId}
                aria-label="New category parent"
                onChange={(e) => setNewCat((p) => ({ ...p, parentId: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-card"
              >
                <option value="">— None (top-level) —</option>
                {categories.filter((cat) => cat.isActive !== false).map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void handleCreate()}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              {isSaving ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewCat(EMPTY_NEW); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Category List */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-foreground/60">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Name</th>
              <th className="px-4 py-2.5 text-left font-medium">Slug</th>
              <th className="px-4 py-2.5 text-left font-medium">Articles</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {categories.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No categories yet. Create one above.
                </td>
              </tr>
            ) : (
              categories.map((cat) => (
                <tr key={cat._id} className="hover:bg-muted/30 transition-colors">
                  {editing && editing.id === cat._id ? (
                    <>
                      <td className="px-4 py-2" colSpan={4}>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            aria-label="Category name"
                            value={editing.name}
                            onChange={(e) => setEditing((p) => p && { ...p, name: e.target.value })}
                            className="flex-1 px-2 py-1 text-sm border border-border rounded-md bg-background"
                          />
                          <input
                            type="text"
                            aria-label="Category description"
                            value={editing.description}
                            onChange={(e) => setEditing((p) => p && { ...p, description: e.target.value })}
                            placeholder="Description"
                            className="flex-1 px-2 py-1 text-sm border border-border rounded-md bg-background"
                          />
                          <input
                            type="text"
                            aria-label="Category icon"
                            value={editing.icon}
                            onChange={(e) => setEditing((p) => p && { ...p, icon: e.target.value })}
                            placeholder="Icon"
                            className="w-20 px-2 py-1 text-sm border border-border rounded-md bg-background"
                          />
                          <select
                            aria-label="Parent category"
                            value={editing.parentId}
                            onChange={(e) => setEditing((previous) => previous && { ...previous, parentId: e.target.value })}
                            className="max-w-48 px-2 py-1 text-sm border border-border rounded-md bg-background"
                          >
                            <option value="">No parent</option>
                            {categories.filter((candidate) => candidate._id !== editing.id && candidate.isActive !== false).map((candidate) => (
                              <option key={candidate._id} value={candidate._id}>{candidate.name}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => void handleUpdate()}
                            disabled={isSaving}
                            aria-label="Save changes"
                            className="p-1 rounded hover:bg-primary/10 text-primary transition-colors disabled:opacity-50"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            aria-label="Cancel editing"
                            className="p-1 rounded hover:bg-muted transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {cat.icon ? (
                            <span className="text-base">{cat.icon}</span>
                          ) : (
                            <Folder className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="font-medium">{cat.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-foreground/60 font-mono text-xs">
                        {cat.slug}
                      </td>
                      <td className="px-4 py-2.5 text-foreground/60">
                        {cat.articleCount}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={[
                            "text-xs px-2 py-0.5 rounded-full border",
                            cat.isPublished
                              ? "border-success/30 bg-success/10 text-success"
                              : "border-border bg-muted text-foreground/50",
                          ].join(" ")}
                        >
                          {cat.deletionJobId ? "Deleting" : cat.isPublished ? "Published" : "Hidden"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {cat.deletionJobId ? <CategoryDeletionProgress jobId={cat.deletionJobId} categoryId={cat._id as Id<"kb_categories">} canManage={canManage} /> : confirmDelete === cat._id ? (
                          <div className="flex justify-end items-center gap-2">
                            <span className="max-w-xs text-xs text-destructive">Delete this category? Articles move to Uncategorized and keep their access restrictions.</span>
                            <button
                              onClick={() => void handleDelete(cat._id)}
                              className="text-xs px-2 py-1 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs px-2 py-1 border border-border rounded hover:bg-muted transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <button
                              disabled={!canManage}
                              onClick={() => setEditing({ id: cat._id, parentId: cat.parentId ?? "", name: cat.name, description: cat.description ?? "", icon: cat.icon ?? "" })}
                              aria-label={`Edit ${cat.name}`}
                              className="p-1 rounded hover:bg-muted transition-colors text-foreground/60 hover:text-foreground"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              disabled={!canManage}
                              onClick={() => setConfirmDelete(cat._id)}
                              aria-label={`Delete ${cat.name}`}
                              className="p-1 rounded hover:bg-destructive/10 text-foreground/60 hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryDeletionProgress({ jobId, categoryId, canManage }: { jobId: Id<"kb_category_deletions">; categoryId: Id<"kb_categories">; canManage: boolean }) {
  const status = useQuery(api.kb.categoryDeletion.status, { jobId });
  const resume = useMutation(api.kb.categories.remove);
  const [working, setWorking] = useState(false);
  return <div className="space-y-1 text-right text-xs" role="status">
    <p>{status ? `${status.childrenMoved} child categories · ${status.articlesMoved} articles moved` : "Preparing deletion…"}</p>
    {status?.message && <p className="max-w-sm text-muted-foreground">{status.message}</p>}
    <button type="button" disabled={!canManage || working} className="rounded border border-border px-2 py-1 disabled:opacity-50" onClick={async () => {
      setWorking(true);
      try { await resume({ categoryId }); }
      catch { toast.error("Could not continue deletion. Check your access and try again."); }
      finally { setWorking(false); }
    }}>Continue deletion</button>
  </div>;
}
