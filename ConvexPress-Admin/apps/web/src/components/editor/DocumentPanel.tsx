/**
 * DocumentPanel - Document settings tab in the sidebar
 *
 * In SmithHarper, the document panel content is primarily handled by the
 * existing metabox components (PublishBox, CategoriesMetabox, TagsMetabox, etc.)
 * which are rendered directly in the EditorLayout sidebar.
 *
 * This component serves as a wrapper/summary for when a tabbed sidebar
 * layout is used instead of the traditional WordPress metabox layout.
 * It provides a quick overview of the document's current state.
 */

import type { PostStatus, PostVisibility, EditorContentType } from "@/types/editor";

interface DocumentPanelProps {
  contentType: EditorContentType;
  status: PostStatus;
  visibility: PostVisibility;
  authorName?: string;
  categoryCount: number;
  tagCount: number;
  hasFeaturedImage: boolean;
  publishedAt?: string;
}

export function DocumentPanel({
  contentType,
  status,
  visibility,
  authorName,
  categoryCount,
  tagCount,
  hasFeaturedImage,
  publishedAt,
}: DocumentPanelProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-foreground">
        {contentType === "post" ? "Post" : "Page"} Settings
      </h3>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status</span>
          <span className="text-foreground capitalize">{formatStatus(status)}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">Visibility</span>
          <span className="text-foreground capitalize">{visibility}</span>
        </div>

        {authorName && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Author</span>
            <span className="text-foreground">{authorName}</span>
          </div>
        )}

        {contentType === "post" && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Categories</span>
              <span className="text-foreground">{categoryCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tags</span>
              <span className="text-foreground">{tagCount}</span>
            </div>
          </>
        )}

        <div className="flex justify-between">
          <span className="text-muted-foreground">Featured Image</span>
          <span className="text-foreground">
            {hasFeaturedImage ? "Set" : "None"}
          </span>
        </div>

        {publishedAt && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Published</span>
            <span className="text-foreground">{publishedAt}</span>
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Use the sidebar metaboxes to modify these settings.
      </p>
    </div>
  );
}

function formatStatus(status: PostStatus): string {
  switch (status) {
    case "auto-draft":
      return "Auto Draft";
    case "draft":
      return "Draft";
    case "pending":
      return "Pending Review";
    case "publish":
      return "Published";
    case "future":
      return "Scheduled";
    case "private":
      return "Private";
    case "trash":
      return "Trashed";
    default:
      return status;
  }
}
