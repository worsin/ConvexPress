/**
 * Add New Post - Lazy-loaded component
 *
 * Creates an auto-draft via the Convex posts.create mutation on mount
 * and initializes the EditorLayout with empty form values and the new postId.
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { EditorLayout } from "@/components/editor/EditorLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect, useRef } from "react";
import { usePostMutations } from "@/hooks/posts/usePostMutations";

export const Route = createLazyFileRoute("/_authenticated/_admin/posts/new")({
  component: AddNewPostPage,
});

function AddNewPostPage() {
  const [postId, setPostId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const createdRef = useRef(false);

  const { createPost } = usePostMutations();

  useEffect(() => {
    // Prevent double-creation in StrictMode
    if (createdRef.current) return;
    createdRef.current = true;

    const createAutoDraft = async () => {
      try {
        const newPostId = await createPost({ status: "auto-draft" });
        setPostId(newPostId as string);
        setIsCreating(false);
      } catch (err: unknown) {
        const e = err as { data?: { message?: string }; message?: string };
        setError(e?.data?.message ?? e?.message ?? "Failed to create post");
        setIsCreating(false);
      }
    };

    createAutoDraft();
  }, [createPost]);

  if (error) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-lg font-semibold text-foreground mb-2">
          Error Creating Post
        </h1>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
      </div>
    );
  }

  if (isCreating || !postId) {
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

  return (
    <EditorLayout
      contentType="post"
      mode="new"
      postId={postId}
    />
  );
}
