/**
 * KB Tags Route - /admin/kb/tags
 *
 * Tag management: list, create, update, delete.
 * Wired to api.kb.tags.*
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Check, Tag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/kb/tags")({
  component: KBTagsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type NewTag = { name: string; description: string; color: string };
type EditingTag = { id: string; name: string; description: string; color: string };

const EMPTY_NEW: NewTag = { name: "", description: "", color: "" };
const DEFAULT_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#14b8a6"];

// ─── Page ─────────────────────────────────────────────────────────────────────

function KBTagsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <KBTagsContent />
    </RoutePermissionGuard>
  );
}

function KBTagsContent() {
  const tagsResult = useQuery(api.kb.tags.list);
  const tags = tagsResult ?? [];
  const createTag = useMutation(api.kb.tags.create);
  const updateTag = useMutation(api.kb.tags.update);
  const removeTag = useMutation(api.kb.tags.remove);

  const [showCreate, setShowCreate] = useState(false);
  const [newTag, setNewTag] = useState<NewTag>(EMPTY_NEW);
  const [editing, setEditing] = useState<EditingTag | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleCreate() {
    if (!newTag.name.trim()) {
      toast.error("Tag name is required");
      return;
    }
    setIsSaving(true);
    try {
      await createTag({
        name: newTag.name.trim(),
        description: newTag.description || undefined,
        color: newTag.color || undefined,
      });
      toast.success("Tag created");
      setNewTag(EMPTY_NEW);
      setShowCreate(false);
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed to create tag");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editing) return;
    setIsSaving(true);
    try {
      await updateTag({
        tagId: editing.id as Id<"kb_tags">,
        name: editing.name.trim(),
        description: editing.description || undefined,
        color: editing.color || undefined,
      });
      toast.success("Tag updated");
      setEditing(null);
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed to update tag");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(tagId: string) {
    try {
      await removeTag({ tagId: tagId as Id<"kb_tags"> });
      toast.success("Tag deleted");
      setConfirmDelete(null);
    } catch (err: unknown) {
      toast.error((err as { data?: { message?: string } })?.data?.message ?? "Failed to delete tag");
    }
  }

  if (tagsResult === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="h-48 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">KB Tags</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Tag
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">New Tag</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">Name *</label>
              <input
                type="text"
                value={newTag.name}
                onChange={(e) => setNewTag((p) => ({ ...p, name: e.target.value }))}
                placeholder="Tag name"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newTag.color || "#6366f1"}
                  onChange={(e) => setNewTag((p) => ({ ...p, color: e.target.value }))}
                  className="h-8 w-10 rounded border border-border bg-background cursor-pointer"
                />
                <div className="flex flex-wrap gap-1">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewTag((p) => ({ ...p, color: c }))}
                      className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ backgroundColor: c, borderColor: newTag.color === c ? "currentColor" : "transparent" }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-foreground/70 mb-1">Description</label>
              <input
                type="text"
                value={newTag.description}
                onChange={(e) => setNewTag((p) => ({ ...p, description: e.target.value }))}
                placeholder="Short description"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background"
              />
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
              onClick={() => { setShowCreate(false); setNewTag(EMPTY_NEW); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tag List */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-foreground/60">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Tag</th>
              <th className="px-4 py-2.5 text-left font-medium">Slug</th>
              <th className="px-4 py-2.5 text-left font-medium">Articles</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tags.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No tags yet. Create one above.
                </td>
              </tr>
            ) : (
              tags.map((tag) => (
                <tr key={tag._id} className="hover:bg-muted/30 transition-colors">
                  {editing?.id === tag._id ? (
                    <>
                      <td className="px-4 py-2" colSpan={3}>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editing.name}
                            onChange={(e) => setEditing((p) => p && { ...p, name: e.target.value })}
                            className="flex-1 px-2 py-1 text-sm border border-border rounded-md bg-background"
                          />
                          <input
                            type="text"
                            value={editing.description}
                            onChange={(e) => setEditing((p) => p && { ...p, description: e.target.value })}
                            placeholder="Description"
                            className="flex-1 px-2 py-1 text-sm border border-border rounded-md bg-background"
                          />
                          <input
                            type="color"
                            value={editing.color || "#6366f1"}
                            onChange={(e) => setEditing((p) => p && { ...p, color: e.target.value })}
                            className="h-7 w-10 rounded border border-border bg-background cursor-pointer"
                          />
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
                          {tag.color ? (
                            <span
                              className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: tag.color }}
                            />
                          ) : (
                            <Tag className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="font-medium">{tag.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-foreground/60 font-mono text-xs">{tag.slug}</td>
                      <td className="px-4 py-2.5 text-foreground/60">{tag.articleCount}</td>
                      <td className="px-4 py-2.5 text-right">
                        {confirmDelete === tag._id ? (
                          <div className="flex justify-end items-center gap-2">
                            <span className="text-xs text-destructive">Delete?</span>
                            <button
                              onClick={() => void handleDelete(tag._id)}
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
                              onClick={() => setEditing({ id: tag._id, name: tag.name, description: tag.description ?? "", color: tag.color ?? "" })}
                              aria-label={`Edit ${tag.name}`}
                              className="p-1 rounded hover:bg-muted transition-colors text-foreground/60 hover:text-foreground"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(tag._id)}
                              aria-label={`Delete ${tag.name}`}
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
