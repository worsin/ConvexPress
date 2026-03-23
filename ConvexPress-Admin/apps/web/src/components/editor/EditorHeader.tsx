/**
 * EditorHeader - Top header bar for the editor page
 *
 * Displays page title (Add New Post / Edit Post / etc.), "View Post" link
 * when published, and the AutosaveStatusBadge.
 */

import { ExternalLink } from "lucide-react";
import { AutosaveStatusBadge } from "./AutosaveStatusBadge";
import type { EditorContentType, PostStatus, AutosaveState } from "@/types/editor";

interface EditorHeaderProps {
  contentType: EditorContentType;
  mode: "new" | "edit";
  postId?: string;
  status?: PostStatus;
  autosaveState: AutosaveState;
}

function getPageTitle(
  contentType: EditorContentType,
  mode: "new" | "edit",
): string {
  if (contentType === "post") {
    return mode === "new" ? "Add New Post" : "Edit Post";
  }
  return mode === "new" ? "Add New Page" : "Edit Page";
}

export function EditorHeader({
  contentType,
  mode,
  postId,
  status,
  autosaveState,
}: EditorHeaderProps) {
  const title = getPageTitle(contentType, mode);
  const isPublished = status === "publish";

  return (
    <div className="border-b border-border bg-background px-6 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>

        {isPublished && postId && (
          <a
            href={
              contentType === "post"
                ? `/blog/${postId}`
                : `/${postId}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View {contentType === "post" ? "Post" : "Page"}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </div>

      <div className="flex items-center gap-4">
        <AutosaveStatusBadge state={autosaveState} />
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Ctrl+S to save
        </span>
      </div>
    </div>
  );
}
