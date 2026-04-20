// @ts-nocheck
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function RecipeCategoryManager() {
  const categories = useQuery(api.recipes.queries.listCategories, {}) ?? [];
  const createCategory = useMutation(api.recipes.mutations.createCategory);
  const deleteCategory = useMutation(api.recipes.mutations.deleteCategory);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#d97706");
  const [isSaving, setIsSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Category name is required.");
      return;
    }

    setIsSaving(true);
    try {
      await createCategory({
        name,
        description,
        color,
      });
      setName("");
      setDescription("");
      toast.success("Recipe category created.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create category",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Recipe Categories
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize recipes for navigation, filtering, and public archive pages.
          </p>
        </div>
        <Link to="/recipes">
          <Button variant="outline">Back to Recipes</Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.2fr]">
        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Add Category</h2>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Breakfast"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                placeholder="Bright, quick recipes for the morning."
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Accent color</label>
              <Input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-10 w-24 p-1"
              />
            </div>
            <Button onClick={() => void handleCreate()} disabled={isSaving}>
              {isSaving ? "Saving..." : "Create Category"}
            </Button>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Recipes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={4}>
                    No recipe categories yet.
                  </td>
                </tr>
              ) : (
                categories.map((category) => (
                  <tr key={category._id} className="border-t border-border/70">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: category.color ?? "#d97706" }}
                        />
                        <div>
                          <div className="font-medium">{category.name}</div>
                          {category.description && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {category.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {category.slug}
                    </td>
                    <td className="px-4 py-4">{category.recipeCount}</td>
                    <td className="px-4 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          void deleteCategory({ categoryId: category._id })
                            .then(() => toast.success("Category deleted."))
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
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
