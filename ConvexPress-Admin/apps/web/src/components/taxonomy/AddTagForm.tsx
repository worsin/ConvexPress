/**
 * AddTagForm - Left-panel form for creating tags
 *
 * Form fields: Name (required, 1-200 chars), Slug (optional, auto-generated),
 * Description textarea (optional, max 5000 chars). No parent dropdown.
 * On success: clears form, shows toast.
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useMutation } from "convex/react";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AddTagForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTag = useMutation(api.taxonomies.mutations.createTag);

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
        await createTag({
          name: trimmedName,
          slug: slug.trim() || undefined,
          description: description.trim() || undefined,
        });
        toast.success("Tag created.");
        setName("");
        setSlug("");
        setDescription("");
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to create tag.";
        setError(message);
        toast.error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [name, slug, description, createTag],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">Add New Tag</h2>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Name */}
      <div className="space-y-1">
        <Label htmlFor="tag-name" className="text-xs">
          Name
        </Label>
        <Input
          id="tag-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tag name"
          maxLength={200}
          required
        />
        <p className="text-xs text-muted-foreground">
          The name is how it appears on your site.
        </p>
      </div>

      {/* Slug */}
      <div className="space-y-1">
        <Label htmlFor="tag-slug" className="text-xs">
          Slug
        </Label>
        <Input
          id="tag-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="tag-slug"
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">
          The "slug" is the URL-friendly version of the name. It is usually all
          lowercase and contains only letters, numbers, and hyphens.
        </p>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <Label htmlFor="tag-desc" className="text-xs">
          Description
        </Label>
        <textarea
          id="tag-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tag description (optional)"
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
        {isSubmitting ? "Adding..." : "Add New Tag"}
      </Button>
    </form>
  );
}
