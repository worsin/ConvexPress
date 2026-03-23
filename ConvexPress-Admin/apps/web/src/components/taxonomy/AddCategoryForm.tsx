/**
 * AddCategoryForm - Left-panel form for creating categories
 *
 * Form fields: Name (required, 1-200 chars), Slug (optional, auto-generated),
 * Parent Category dropdown (from getCategoryTree), Description textarea
 * (optional, max 5000 chars). On success: clears form, shows toast.
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ParentCategorySelect } from "./ParentCategorySelect";

export function AddCategoryForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCategory = useMutation(api.taxonomies.mutations.createCategory);
  const categoryTree = useQuery(api.taxonomies.queries.getCategoryTree);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmedName = name.trim();
      if (!trimmedName) {
        setError("Name is required.");
        return;
      }
      if (trimmedName.length > 200) {
        setError("Name must be 200 characters or fewer.");
        return;
      }

      setIsSubmitting(true);
      try {
        await createCategory({
          name: trimmedName,
          slug: slug.trim() || undefined,
          parentId: parentId || undefined,
          description: description.trim() || undefined,
        });
        toast.success("Category created.");
        setName("");
        setSlug("");
        setParentId("");
        setDescription("");
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to create category.";
        setError(message);
        toast.error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [name, slug, parentId, description, createCategory],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">
        Add New Category
      </h2>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Name */}
      <div className="space-y-1">
        <Label htmlFor="cat-name" className="text-xs">
          Name
        </Label>
        <Input
          id="cat-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          maxLength={200}
          required
        />
        <p className="text-xs text-muted-foreground">
          The name is how it appears on your site.
        </p>
      </div>

      {/* Slug */}
      <div className="space-y-1">
        <Label htmlFor="cat-slug" className="text-xs">
          Slug
        </Label>
        <Input
          id="cat-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="category-slug"
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">
          The "slug" is the URL-friendly version of the name. It is usually all
          lowercase and contains only letters, numbers, and hyphens.
        </p>
      </div>

      {/* Parent Category */}
      <div className="space-y-1">
        <Label htmlFor="cat-parent" className="text-xs">
          Parent Category
        </Label>
        <ParentCategorySelect
          value={parentId}
          onChange={setParentId}
          categoryTree={categoryTree}
        />
        <p className="text-xs text-muted-foreground">
          Categories, unlike tags, can have a hierarchy. You might have a Jazz
          category, and under that have children categories for Bebop and Big
          Band.
        </p>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <Label htmlFor="cat-desc" className="text-xs">
          Description
        </Label>
        <textarea
          id="cat-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Category description (optional)"
          maxLength={5000}
          rows={4}
          className="w-full rounded-none border border-input bg-transparent px-3 py-2 text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 resize-y"
        />
        <p className="text-xs text-muted-foreground">
          The description is not prominent by default; however, some themes may
          show it.
        </p>
      </div>

      <Button type="submit" size="sm" disabled={isSubmitting}>
        {isSubmitting ? "Adding..." : "Add New Category"}
      </Button>
    </form>
  );
}
