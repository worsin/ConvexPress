/**
 * Add New Post - Lazy-loaded component
 *
 * Creates a draft and opens its stable edit URL in the block workspace.
 */

import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { NativeCanonicalEditor } from "@/components/blocks/canonical-editor/NativeCanonicalEditor";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";

export const Route = createLazyFileRoute("/_authenticated/_admin/posts/new")({
  component: AddNewPostPage,
});

function AddNewPostPage() {
  const [postId, setPostId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const createdRef = useRef(false);

  const createDocument = useMutation(api.canonicalDocuments.create);
  const navigate = useNavigate();

  useEffect(() => {
    // Prevent double-creation in StrictMode
    if (createdRef.current) return;
    createdRef.current = true;

    const createAutoDraft = async () => {
      try {
        const {postId: newPostId} = await createDocument({type: "post", title: "Untitled post"});
        setPostId(newPostId as string);
        await navigate({to:"/posts/$postId/edit",params:{postId:newPostId as string},search:{},replace:true});
        setIsCreating(false);
      } catch (err: unknown) {
        const e = err as { data?: { message?: string }; message?: string };
        setError(e?.data?.message ?? e?.message ?? "Failed to create post");
        setIsCreating(false);
      }
    };

    createAutoDraft();
  }, [createDocument, navigate]);

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

  return <NativeCanonicalEditor postId={postId as Id<"posts">} />;
}
