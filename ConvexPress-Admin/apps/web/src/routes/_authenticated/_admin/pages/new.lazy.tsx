/**
 * Add New Page - Lazy-loaded component
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

export const Route = createLazyFileRoute("/_authenticated/_admin/pages/new")({
  component: AddNewPagePage,
});

function AddNewPagePage() {
  const [pageId, setPageId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const createdRef = useRef(false);
  const createDocument = useMutation(api.canonicalDocuments.create);
  const navigate = useNavigate();

  useEffect(() => {
    // Prevent double-creation in StrictMode
    if (createdRef.current) return;
    createdRef.current = true;

    async function createAutoDraft() {
      try {
        const {postId: newPageId} = await createDocument({type: "page", title: "Untitled page"});
        if (newPageId) {
          setPageId(newPageId);
          await navigate({to:"/pages/$pageId/edit",params:{pageId:newPageId},search:{},replace:true});
          setIsCreating(false);
        }
      } catch (err: unknown) {
        const e = err as { data?: { message?: string }; message?: string };
        setError(e?.data?.message ?? e?.message ?? "Failed to create page");
        setIsCreating(false);
      }
    }

    createAutoDraft();
  }, [createDocument, navigate]);

  if (isCreating) {
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
            <Skeleton className="h-[100px] w-full" />
            <Skeleton className="h-[100px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !pageId) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-lg font-semibold text-foreground mb-2">
          Could Not Create Page
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          {error ?? "An unknown error occurred."}
        </p>
        <button
          type="button"
          onClick={() => navigate({ to: "/pages" })}
          className="text-sm text-primary hover:underline"
        >
          Back to All Pages
        </button>
      </div>
    );
  }

  return <NativeCanonicalEditor postId={pageId as Id<"posts">} />;
}
