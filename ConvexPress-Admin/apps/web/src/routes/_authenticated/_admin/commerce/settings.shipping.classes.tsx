import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { Layers, Plus, Trash2, Pencil, Check, X } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/settings/shipping/classes",
)({
  component: ShippingClassesPage,
});

function ShippingClassesPage() {
  const classes = useQuery(
    (api as any).shipping.classes.queries.list,
    {},
  ) as any[] | undefined;
  const counts = useQuery(
    (api as any).shipping.classes.queries.countProductsPerClass,
    {},
  ) as Record<string, { productCount: number; variantCount: number }> | undefined;

  const createClass = useMutation((api as any).shipping.classes.mutations.create);
  const updateClass = useMutation((api as any).shipping.classes.mutations.update);
  const removeClass = useMutation((api as any).shipping.classes.mutations.remove);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Class name is required.");
      return;
    }
    try {
      await createClass({
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
      });
      toast.success("Shipping class created.");
      setName("");
      setSlug("");
      setDescription("");
      setShowForm(false);
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to create class.");
    }
  }

  async function handleDelete(classId: string) {
    const count = counts?.[classId];
    const inUse = (count?.productCount ?? 0) + (count?.variantCount ?? 0) > 0;
    let reassignTo: null | undefined = undefined;
    if (inUse) {
      if (
        !confirm(
          `This class is used by ${count?.productCount ?? 0} products and ${count?.variantCount ?? 0} variants. Clear the class from all of them and delete?`,
        )
      ) {
        return;
      }
      reassignTo = null;
    } else if (!confirm("Delete this shipping class?")) {
      return;
    }
    try {
      await removeClass({ classId, reassignTo });
      toast.success("Shipping class deleted.");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to delete class.");
    }
  }

  function startEdit(cls: any) {
    setEditingId(cls._id);
    setEditName(cls.name);
    setEditDescription(cls.description ?? "");
  }

  async function saveEdit(classId: string) {
    try {
      await updateClass({
        classId,
        patch: {
          name: editName.trim(),
          description: editDescription.trim() || undefined,
        },
      });
      toast.success("Class updated.");
      setEditingId(null);
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to update class.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Shipping Classes</h1>
            <p className="text-sm text-muted-foreground">
              Categorize products to charge different shipping rates per class
              (e.g. Fragile, Heavy, Hazmat).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Class
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-lg border border-border bg-card p-4 space-y-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Class Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fragile"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Slug (optional, auto-generated)
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="fragile"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Internal notes about when to use this class"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {classes === undefined ? (
        <p className="text-sm text-muted-foreground">Loading classes...</p>
      ) : classes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <Layers className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            No shipping classes yet.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Slug</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Products</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Variants</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((cls: any) => {
                const count = counts?.[cls._id];
                const isEditing = editingId === cls._id;
                return (
                  <tr key={cls._id} className="border-t border-border">
                    <td className="px-4 py-3 text-foreground">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                        />
                      ) : (
                        <div>
                          <div className="font-medium">{cls.name}</div>
                          {cls.description && (
                            <div className="text-xs text-muted-foreground">{cls.description}</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{cls.slug}</td>
                    <td className="px-4 py-3 text-muted-foreground">{count?.productCount ?? 0}</td>
                    <td className="px-4 py-3 text-muted-foreground">{count?.variantCount ?? 0}</td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => saveEdit(cls._id)}
                            className="rounded-md p-1.5 text-green-600 hover:bg-muted"
                            title="Save"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(cls)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(cls._id)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
