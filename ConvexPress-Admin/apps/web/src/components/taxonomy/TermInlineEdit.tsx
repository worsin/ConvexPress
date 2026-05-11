/**
 * TermInlineEdit - Inline edit row for terms
 *
 * Replaces a term row in the list table with name/slug input fields
 * plus Update/Cancel buttons. Calls the appropriate update mutation.
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useMutation } from "convex/react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TermData {
  _id: string;
  name: string;
  slug: string;
  taxonomy: "category" | "post_tag";
  description?: string;
}

interface TermInlineEditProps {
  term: TermData;
  onClose: () => void;
}

export function TermInlineEdit({ term, onClose }: TermInlineEditProps) {
  const [name, setName] = useState(term.name);
  const [slug, setSlug] = useState(term.slug);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateCategory = useMutation(
    api.taxonomies.mutations.updateCategory,
  );
  const updateTag = useMutation(api.taxonomies.mutations.updateTag);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedName = name.trim();
      const trimmedSlug = slug.trim();

      if (!trimmedName) {
        toast.error("Name is required.");
        return;
      }

      setIsSubmitting(true);
      try {
        if (term.taxonomy === "category") {
          await updateCategory({
            termId: term._id as Id<"terms">,
            name: trimmedName !== term.name ? trimmedName : undefined,
            slug: trimmedSlug !== term.slug ? trimmedSlug : undefined,
          });
        } else {
          await updateTag({
            termId: term._id as Id<"terms">,
            name: trimmedName !== term.name ? trimmedName : undefined,
            slug: trimmedSlug !== term.slug ? trimmedSlug : undefined,
          });
        }
        toast.success(
          `${term.taxonomy === "category" ? "Category" : "Tag"} updated.`,
        );
        onClose();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to update.";
        toast.error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [name, slug, term, updateCategory, updateTag, onClose],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor={`inline-name-${term._id}`} className="text-xs">
            Name
          </Label>
          <Input
            id={`inline-name-${term._id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`inline-slug-${term._id}`} className="text-xs">
            Slug
          </Label>
          <Input
            id={`inline-slug-${term._id}`}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="xs" disabled={isSubmitting}>
          {isSubmitting ? "Updating..." : "Update"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
