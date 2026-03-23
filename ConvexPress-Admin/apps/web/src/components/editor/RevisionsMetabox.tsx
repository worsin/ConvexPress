/**
 * RevisionsMetabox - Revision count and browse link
 *
 * Shows "Browse N revisions" as a clickable link. Only rendered in edit mode
 * when the post has at least 1 revision.
 * Wired to Convex revisions.count query.
 */

import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { History } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { EditorContentType } from "@/types/editor";

interface RevisionsMetaboxProps {
  postId: string;
  contentType: EditorContentType;
}

export function RevisionsMetabox({
  postId,
  contentType,
}: RevisionsMetaboxProps) {
  // Fetch revision count from Convex
  const revisionCountResult = useQuery(api.revisions.queries.count, {
    parentId: postId as Id<"posts">,
  });
  const revisionCount = revisionCountResult ?? 0;

  if (revisionCount === 0) {
    return (
      <p className="text-xs text-muted-foreground">No revisions yet.</p>
    );
  }

  // Both routes exist:
  //   /admin/posts/$postId/revisions
  //   /admin/pages/$pageId/revisions
  // We use separate Link components to get proper type inference without `as any`.
  return (
    <div className="flex items-center gap-1.5">
      <History className="size-3.5 text-muted-foreground" />
      {contentType === "post" ? (
        <Link
          to="/posts/$postId/revisions"
          params={{ postId }}
          className="text-xs text-primary hover:underline cursor-pointer"
        >
          Browse {revisionCount} revision{revisionCount !== 1 ? "s" : ""}
        </Link>
      ) : (
        <Link
          to="/pages/$pageId/revisions"
          params={{ pageId: postId }}
          className="text-xs text-primary hover:underline cursor-pointer"
        >
          Browse {revisionCount} revision{revisionCount !== 1 ? "s" : ""}
        </Link>
      )}
    </div>
  );
}
