// @ts-nocheck
import { useMutation, useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { PencilIcon, Trash2Icon } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";

export function RecipeListTable() {
  const recipes = useQuery(api.recipes.queries.list, {}) ?? [];
  const counts = useQuery(api.recipes.queries.counts, {});
  const trashRecipe = useMutation(api.recipes.mutations.trashRecipe);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Recipes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage recipe cards, scanned imports, and public recipe pages.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/recipes/categories">
            <Button variant="outline">Categories</Button>
          </Link>
          <Link to="/recipes/new">
            <Button>Add Recipe</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-3xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            All
          </div>
          <div className="mt-2 text-2xl font-semibold">{counts?.all ?? 0}</div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Drafts
          </div>
          <div className="mt-2 text-2xl font-semibold">{counts?.draft ?? 0}</div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Published
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {counts?.published ?? 0}
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Trash
          </div>
          <div className="mt-2 text-2xl font-semibold">{counts?.trash ?? 0}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Recipe</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Categories</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {recipes.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                  No recipes yet.
                </td>
              </tr>
            ) : (
              recipes.map((recipe) => (
                <tr key={recipe._id} className="border-t border-border/70">
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium text-foreground">{recipe.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      /recipes/{recipe.slug}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top capitalize">
                    {recipe.status}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-wrap gap-2">
                      {(recipe.categories ?? []).map((category: any) => (
                        <span
                          key={category._id}
                          className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                        >
                          {category.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-muted-foreground">
                    {recipe.totalMinutes ? `${recipe.totalMinutes} min` : "—"}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex justify-end gap-2">
                      <Link
                        to="/recipes/$recipeId/edit"
                        params={{ recipeId: recipe._id }}
                      >
                        <Button variant="outline" size="xs">
                          <PencilIcon className="mr-1 size-3" />
                          Edit
                        </Button>
                      </Link>
                      {recipe.status !== "trash" && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            void trashRecipe({ recipeId: recipe._id })
                              .then(() => toast.success("Recipe moved to trash."))
                              .catch((error) =>
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Failed to trash recipe",
                                ),
                              )
                          }
                        >
                          <Trash2Icon className="mr-1 size-3" />
                          Trash
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
