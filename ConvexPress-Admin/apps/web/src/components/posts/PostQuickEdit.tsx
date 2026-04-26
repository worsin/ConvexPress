import { useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { usePostMutations } from "@/hooks/posts/usePostMutations";
import type { PostWithAuthor, PostStatus } from "@/lib/posts/types";

interface PostQuickEditProps {
  /** The post to edit. */
  post: PostWithAuthor;
  /** Close the Quick Edit form. */
  onClose: () => void;
}

interface AuthorOption {
  _id: Id<"users">;
  displayName?: string;
  email: string;
}

interface AuthorListResult {
  users?: AuthorOption[];
}

interface TermSummary {
  name: string;
}

/**
 * Inline Quick Edit form for posts. Replaces the row when active.
 * Fields: Title, Slug, Status, Date, Author, Categories, Tags, Allow Comments, Sticky.
 *
 * Calls the real Convex posts.update mutation on save.
 */
export function PostQuickEdit({ post, onClose }: PostQuickEditProps) {
  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [status, setStatus] = useState(post.status);
  const [publishDate, setPublishDate] = useState(
    post.publishedAt
      ? new Date(post.publishedAt).toISOString().split("T")[0]
      : "",
  );
  const [authorId, setAuthorId] = useState<string>(post.authorId ?? "");
  const [allowComments, setAllowComments] = useState(post.commentStatus === "open");
  const [isSticky, setIsSticky] = useState(post.isSticky);
  const [isSaving, setIsSaving] = useState(false);

  const { updatePost } = usePostMutations();

  // Fetch authors for the Author dropdown
  const authorsResult = useQuery(api.profiles.queries.listUsers, {
    page: 1,
    perPage: 100,
    orderBy: "displayName",
    orderDir: "asc",
  }) as AuthorListResult | undefined;

  const authors = useMemo(() => {
    if (!authorsResult) return [];
    return (authorsResult.users ?? []).map((u) => ({
      _id: u._id,
      displayName: u.displayName || u.email,
    }));
  }, [authorsResult]);

  // Fetch categories for this post
  const postCategories = useQuery(api.taxonomies.queries.getByPost, {
    postId: post._id as Id<"posts">,
    taxonomy: "category",
  }) as { categories?: TermSummary[] } | undefined;

  // Fetch tags for this post
  const postTags = useQuery(api.taxonomies.queries.getByPost, {
    postId: post._id as Id<"posts">,
    taxonomy: "post_tag",
  }) as { tags?: TermSummary[] } | undefined;

  const categoryNames = useMemo(() => {
    if (!postCategories) return "Loading...";
    const cats = postCategories.categories ?? [];
    return cats.length > 0 ? cats.map((c) => c.name).join(", ") : "Uncategorized";
  }, [postCategories]);

  const tagNames = useMemo(() => {
    if (!postTags) return "Loading...";
    const tags = postTags.tags ?? [];
    return tags.length > 0 ? tags.map((t) => t.name).join(", ") : "No tags";
  }, [postTags]);

  const handleUpdate = useCallback(async () => {
    setIsSaving(true);
    try {
      const updateArgs: Record<string, unknown> = {
        postId: post._id as Id<"posts">,
        title,
        slug,
        status,
        commentStatus: allowComments ? "open" : "closed",
        isSticky,
      };

      // Include date if changed
      if (publishDate) {
        updateArgs.publishedAt = new Date(publishDate).getTime();
      }

      // Include author if changed
      if (authorId && authorId !== post.authorId) {
        updateArgs.authorId = authorId;
      }

      await updatePost(updateArgs as Parameters<typeof updatePost>[0]);
      onClose();
    } catch {
      // Error toast is handled by usePostMutations
    } finally {
      setIsSaving(false);
    }
  }, [title, slug, status, publishDate, authorId, allowComments, isSticky, onClose, post._id, post.authorId, updatePost]);

  return (
    <div className="border border-border bg-card rounded-none">
      <div className="border-b border-border bg-muted/50 px-4 py-2">
        <h3 className="text-xs font-semibold text-foreground">Quick Edit</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Title + Slug row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Slug
            </label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        {/* Status + Date row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PostStatus)}
              className="h-8 w-full rounded-none border border-input bg-transparent px-2 text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            >
              <option value="draft">Draft</option>
              <option value="pending">Pending Review</option>
              <option value="publish">Published</option>
              <option value="private">Private</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Date
            </label>
            <Input
              type="date"
              value={publishDate}
              onChange={(e) => setPublishDate(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        {/* Author row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Author
            </label>
            <select
              value={authorId}
              onChange={(e) => setAuthorId(e.target.value)}
              className="h-8 w-full rounded-none border border-input bg-transparent px-2 text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            >
              {!authorsResult && (
                <option value="">Loading...</option>
              )}
              {authors.map((author) => (
                <option key={author._id} value={author._id}>
                  {author.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            {/* Categories/Tags display (read-only in Quick Edit; full editing on the edit page) */}
            <label className="text-xs text-muted-foreground mb-1 block">
              Categories
            </label>
            <div className="h-8 flex items-center px-2 border border-input bg-transparent text-xs text-muted-foreground truncate">
              {categoryNames}
            </div>
          </div>
        </div>

        {/* Tags display */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Tags
          </label>
          <div className="h-8 flex items-center px-2 border border-input bg-transparent text-xs text-muted-foreground truncate">
            {tagNames}
          </div>
        </div>

        {/* Checkbox options */}
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox
              checked={allowComments}
              onCheckedChange={(checked) => setAllowComments(!!checked)}
            />
            Allow Comments
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox
              checked={isSticky}
              onCheckedChange={(checked) => setIsSticky(!!checked)}
            />
            Make this post sticky
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleUpdate} disabled={isSaving}>
            {isSaving ? "Updating..." : "Update"}
          </Button>
        </div>
      </div>
    </div>
  );
}
