/**
 * Edit Post - Lazy-loaded component
 *
 * The heavy EditorLayout component is lazy-loaded to reduce initial bundle size.
 */

import { createLazyFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { EditorLayout } from "@/components/editor/EditorLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { usePostMutations } from "@/hooks/posts/usePostMutations";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { EditorFormValues, PostStatus, PostVisibility, CommentStatus } from "@/types/editor";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/posts/$postId/edit",
)({
  component: EditPostPage,
});

function EditPostPage() {
  const { postId } = useParams({
    from: "/_authenticated/_admin/posts/$postId/edit",
  });

  const { restorePost } = usePostMutations();

  // ─── Load post data from Convex ────────────────────────────────────────
  const post = useQuery(api.posts.queries.get, {
    postId: postId as Id<"posts">,
  });

  // ─── Load existing taxonomy assignments ──────────────────────────────
  const postTaxonomies = useQuery(
    api.taxonomies.queries.getByPost,
    post ? { postId: postId as Id<"posts"> } : "skip",
  );

  // post === undefined means still loading; also wait for taxonomies
  if (post === undefined || (post && postTaxonomies === undefined)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-6 w-96" />
            <Skeleton className="h-[400px] w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-[200px] w-full" />
            <Skeleton className="h-[150px] w-full" />
            <Skeleton className="h-[100px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  // post === null means not found
  if (post === null) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-lg font-semibold text-foreground mb-2">
          Post Not Found
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          The post you are looking for does not exist or has been deleted.
        </p>
        <Link
          to="/posts"
          className="text-sm text-primary hover:underline"
        >
          Back to All Posts
        </Link>
      </div>
    );
  }

  // Trashed post
  if (post.status === "trash") {
    return (
      <div className="py-12 text-center">
        <h1 className="text-lg font-semibold text-foreground mb-2">
          Post is in Trash
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          This post has been moved to the trash. Restore it to continue editing.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => {
              restorePost(postId as Id<"posts">, post.title);
            }}
            className="text-sm text-primary hover:underline"
          >
            Restore Post
          </button>
          <Link
            to="/posts"
            className="text-sm text-muted-foreground hover:underline"
          >
            Back to All Posts
          </Link>
        </div>
      </div>
    );
  }

  // ─── Map Convex post data to EditorFormValues ──────────────────────────
  const initialData: Partial<EditorFormValues> = {
    title: post.title,
    slug: post.slug,
    content: post.content ?? "",
    excerpt: post.excerpt ?? "",
    status: post.status as PostStatus,
    visibility: post.visibility as PostVisibility,
    password: post.password ?? "",
    commentStatus: post.commentStatus as CommentStatus,
    isSticky: post.isSticky,
    featuredImageId: post.featuredImageId ?? null,
    authorId: post.authorId as string,
    scheduledFor: post.scheduledAt ? new Date(post.scheduledAt) : null,
    categoryIds: postTaxonomies?.categories?.map((c: { _id: string }) => c._id) ?? [],
    tagIds: postTaxonomies?.tags?.map((t: { _id: string }) => t._id) ?? [],
    menuOrder: post.menuOrder ?? 0,
  };

  return (
    <EditorLayout
      contentType="post"
      mode="edit"
      postId={postId}
      initialData={initialData}
      publishedAt={post.publishedAt ?? null}
    />
  );
}
