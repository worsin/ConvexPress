import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { PencilIcon, Trash2Icon } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function GalleryCategoryManager() {
  const categories = useQuery(api.gallery.queries.listCategories, {}) ?? [];
  const createCategory = useMutation(api.gallery.mutations.createCategory);
  const updateCategory = useMutation(api.gallery.mutations.updateCategory);
  const deleteCategory = useMutation(api.gallery.mutations.deleteCategory);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<Id<"gallery_categories"> | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Category name is required.");
      return;
    }

    try {
      if (editingId) {
        await updateCategory({
          categoryId: editingId,
          name,
          description,
        });
        toast.success("Category updated.");
      } else {
        await createCategory({ name, description });
        toast.success("Category created.");
      }
      reset();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save category",
      );
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Gallery Categories
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Organize albums for archive pages and editorial filtering.
        </p>
      </div>

      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="gallery-category-name">
              Category name
            </label>
            <Input
              id="gallery-category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Travel"
            />
          </div>
          <div className="grid gap-2">
            <label
              className="text-sm font-medium"
              htmlFor="gallery-category-description"
            >
              Description
            </label>
            <Textarea
              id="gallery-category-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Used for destination galleries and travel journals."
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void handleSubmit()}>
              {editingId ? "Update Category" : "Add Category"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Albums</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={3}>
                  No categories yet.
                </td>
              </tr>
            ) : (
              categories.map((category: any) => (
                <tr key={category._id} className="border-t border-border/70">
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium text-foreground">{category.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {category.slug}
                    </div>
                    {category.description && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {category.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top text-muted-foreground">
                    {category.albumCount ?? 0}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setEditingId(category._id);
                          setName(category.name);
                          setDescription(category.description ?? "");
                        }}
                      >
                        <PencilIcon className="mr-1 size-3" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          void deleteCategory({ categoryId: category._id })
                            .then(() => {
                              toast.success("Category deleted.");
                              if (editingId === category._id) {
                                reset();
                              }
                            })
                            .catch((error) =>
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Failed to delete category",
                              ),
                            )
                        }
                      >
                        <Trash2Icon className="mr-1 size-3" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
