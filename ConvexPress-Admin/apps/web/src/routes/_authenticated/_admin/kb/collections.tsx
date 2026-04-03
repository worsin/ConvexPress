/**
 * KB Collections Route - /admin/kb/collections
 *
 * Collection management: list, create, update, delete.
 * Wired to api.kb.collections.*
 *
 * Collection types:
 *   - manual: hand-picked articles in any order
 *   - series: sequential articles (part 1, 2, 3…)
 *   - learningPath: structured curriculum with prerequisites
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Check, BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/kb/collections")({
  component: KBCollectionsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type CollectionType = "manual" | "series" | "learningPath";

type NewCollection = {
  name: string;
  description: string;
  type: CollectionType;
  isPublic: boolean;
};

type EditingCollection = {
  id: string;
  name: string;
  description: string;
  type: CollectionType;
  isPublic: boolean;
};

const EMPTY_NEW: NewCollection = {
  name: "",
  description: "",
  type: "manual",
  isPublic: true,
};

const TYPE_LABELS: Record<CollectionType, string> = {
  manual: "Manual",
  series: "Series",
  learningPath: "Learning Path",
};

const TYPE_COLORS: Record<CollectionType, string> = {
  manual: "bg-muted text-foreground/70 border-border",
  series: "bg-primary/10 text-primary border-primary/20",
  learningPath: "bg-success/10 text-success border-success/20",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

function KBCollectionsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <KBCollectionsContent />
    </RoutePermissionGuard>
  );
}

function KBCollectionsContent() {
  const collections = useQuery(api.kb.collections.list) ?? [];
  const createCollection = useMutation(api.kb.collections.create);
  const updateCollection = useMutation(api.kb.collections.update);
  const removeCollection = useMutation(api.kb.collections.remove);

  const [showCreate, setShowCreate] = useState(false);
  const [newCol, setNewCol] = useState<NewCollection>(EMPTY_NEW);
  const [editing, setEditing] = useState<EditingCollection | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleCreate() {
    if (!newCol.name.trim()) {
      toast.error("Collection name is required");
      return;
    }
    setIsSaving(true);
    try {
      await createCollection({
        name: newCol.name.trim(),
        description: newCol.description || undefined,
        type: newCol.type,
        isPublic: newCol.isPublic,
      });
      toast.success("Collection created");
      setNewCol(EMPTY_NEW);
      setShowCreate(false);
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to create collection");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editing) return;
    setIsSaving(true);
    try {
      await updateCollection({
        collectionId: editing.id as any,
        name: editing.name.trim(),
        description: editing.description || undefined,
        type: editing.type,
        isPublic: editing.isPublic,
      });
      toast.success("Collection updated");
      setEditing(null);
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to update collection");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(collectionId: string) {
    try {
      await removeCollection({ collectionId: collectionId as any });
      toast.success("Collection deleted");
      setConfirmDelete(null);
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to delete collection");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">KB Collections</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Collection
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">New Collection</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={newCol.name}
                onChange={(e) => setNewCol((p) => ({ ...p, name: e.target.value }))}
                placeholder="Collection name"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground/70 mb-1">
                Type
              </label>
              <select
                value={newCol.type}
                onChange={(e) => setNewCol((p) => ({ ...p, type: e.target.value as CollectionType }))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-card"
              >
                <option value="manual">Manual</option>
                <option value="series">Series</option>
                <option value="learningPath">Learning Path</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-foreground/70 mb-1">
                Description
              </label>
              <input
                type="text"
                value={newCol.description}
                onChange={(e) => setNewCol((p) => ({ ...p, description: e.target.value }))}
                placeholder="Short description"
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background"
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="new-col-public"
                checked={newCol.isPublic}
                onChange={(e) => setNewCol((p) => ({ ...p, isPublic: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="new-col-public" className="text-sm text-foreground/70 cursor-pointer">
                Public (visible on website)
              </label>
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
              onClick={() => { setShowCreate(false); setNewCol(EMPTY_NEW); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Collection List */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-foreground/60">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Name</th>
              <th className="px-4 py-2.5 text-left font-medium">Type</th>
              <th className="px-4 py-2.5 text-left font-medium">Articles</th>
              <th className="px-4 py-2.5 text-left font-medium">Visibility</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {collections.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No collections yet. Create one above.
                </td>
              </tr>
            ) : (
              collections.map((col: any) => (
                <tr key={col._id} className="hover:bg-muted/30 transition-colors">
                  {editing?.id === col._id ? (
                    <>
                      <td className="px-4 py-2" colSpan={4}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            type="text"
                            value={editing.name}
                            onChange={(e) => setEditing((p) => p && { ...p, name: e.target.value })}
                            className="flex-1 min-w-32 px-2 py-1 text-sm border border-border rounded-md bg-background"
                          />
                          <input
                            type="text"
                            value={editing.description}
                            onChange={(e) => setEditing((p) => p && { ...p, description: e.target.value })}
                            placeholder="Description"
                            className="flex-1 min-w-40 px-2 py-1 text-sm border border-border rounded-md bg-background"
                          />
                          <select
                            value={editing.type}
                            onChange={(e) => setEditing((p) => p && { ...p, type: e.target.value as CollectionType })}
                            className="px-2 py-1 text-sm border border-border rounded-md bg-card"
                          >
                            <option value="manual">Manual</option>
                            <option value="series">Series</option>
                            <option value="learningPath">Learning Path</option>
                          </select>
                          <label className="flex items-center gap-1.5 text-sm text-foreground/70 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editing.isPublic}
                              onChange={(e) => setEditing((p) => p && { ...p, isPublic: e.target.checked })}
                              className="h-4 w-4 rounded border-border"
                            />
                            Public
                          </label>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => void handleUpdate()}
                            disabled={isSaving}
                            className="p-1 rounded hover:bg-primary/10 text-primary transition-colors disabled:opacity-50"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setEditing(null)}
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
                          <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <span className="font-medium">{col.name}</span>
                            {col.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{col.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[col.type as CollectionType] ?? TYPE_COLORS.manual}`}>
                          {TYPE_LABELS[col.type as CollectionType] ?? col.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-foreground/60">
                        {col.articleCount ?? 0}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={[
                            "text-xs px-2 py-0.5 rounded-full border",
                            col.isPublic
                              ? "border-success/30 bg-success/10 text-success"
                              : "border-border bg-muted text-foreground/50",
                          ].join(" ")}
                        >
                          {col.isPublic ? "Public" : "Private"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {confirmDelete === col._id ? (
                          <div className="flex justify-end items-center gap-2">
                            <span className="text-xs text-destructive">Delete?</span>
                            <button
                              onClick={() => void handleDelete(col._id)}
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
                              onClick={() =>
                                setEditing({
                                  id: col._id,
                                  name: col.name,
                                  description: col.description ?? "",
                                  type: col.type ?? "manual",
                                  isPublic: col.isPublic ?? true,
                                })
                              }
                              className="p-1 rounded hover:bg-muted transition-colors text-foreground/60 hover:text-foreground"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(col._id)}
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
