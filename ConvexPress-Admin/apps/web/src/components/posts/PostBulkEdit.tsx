/**
 * Post Bulk Edit Panel
 *
 * Allows editing common fields on multiple selected posts at once.
 * Fields: Status, Comment Status, Sticky.
 * Applies changes via the Convex posts.update mutation for each selected post.
 */

import { useCallback, useState } from "react";
import type { Id } from "@backend/convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { usePostMutations } from "@/hooks/posts/usePostMutations";
import { toast } from "sonner";

interface PostBulkEditProps {
  /** IDs of the selected posts. */
  selectedIds: string[];
  /** Close the bulk edit panel. */
  onClose: () => void;
  /** Clear selection after successful edit. */
  onClearSelection: () => void;
}

/**
 * Bulk edit panel for multiple posts.
 *
 * Shows dropdowns and checkboxes for fields that can be changed in bulk.
 * Only changes fields that the user explicitly modifies (uses "-- No Change --" defaults).
 */
export function PostBulkEdit({
  selectedIds,
  onClose,
  onClearSelection,
}: PostBulkEditProps) {
  const [status, setStatus] = useState("");
  const [commentStatus, setCommentStatus] = useState("");
  const [isSticky, setIsSticky] = useState<boolean | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { updatePost } = usePostMutations();

  const handleApply = useCallback(async () => {
    if (selectedIds.length === 0) return;

    // Build the patch - only include fields that were changed
    const patch: Record<string, unknown> = {};
    if (status) patch.status = status;
    if (commentStatus) patch.commentStatus = commentStatus;
    if (isSticky !== null) patch.isSticky = isSticky;

    if (Object.keys(patch).length === 0) {
      toast.error("No changes selected.");
      return;
    }

    setIsSaving(true);
    let successCount = 0;
    let errorCount = 0;

    for (const id of selectedIds) {
      try {
        await updatePost({
          postId: id as Id<"posts">,
          ...patch,
        });
        successCount++;
      } catch {
        errorCount++;
      }
    }

    setIsSaving(false);

    if (successCount > 0) {
      toast.success(`${successCount} post(s) updated.`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} post(s) could not be updated.`);
    }

    onClearSelection();
    onClose();
  }, [selectedIds, status, commentStatus, isSticky, updatePost, onClose, onClearSelection]);

  return (
    <div className="border border-border bg-card rounded-none mb-4">
      <div className="border-b border-border bg-muted/50 px-4 py-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">
          Bulk Edit ({selectedIds.length} post{selectedIds.length !== 1 ? "s" : ""} selected)
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {/* Status */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-8 w-full rounded-none border border-input bg-transparent px-2 text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            >
              <option value="">-- No Change --</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending Review</option>
              <option value="publish">Published</option>
              <option value="private">Private</option>
            </select>
          </div>

          {/* Comment Status */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Comments
            </label>
            <select
              value={commentStatus}
              onChange={(e) => setCommentStatus(e.target.value)}
              className="h-8 w-full rounded-none border border-input bg-transparent px-2 text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            >
              <option value="">-- No Change --</option>
              <option value="open">Allow</option>
              <option value="closed">Do not allow</option>
            </select>
          </div>

          {/* Sticky */}
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={isSticky === true}
                onCheckedChange={(checked) =>
                  setIsSticky(checked === true ? true : checked === false ? false : null)
                }
              />
              Make sticky
            </label>
          </div>
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
          <Button size="sm" onClick={handleApply} disabled={isSaving}>
            {isSaving ? "Updating..." : "Update"}
          </Button>
        </div>
      </div>
    </div>
  );
}
