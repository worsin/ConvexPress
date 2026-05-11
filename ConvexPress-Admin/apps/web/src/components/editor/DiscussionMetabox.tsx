/**
 * DiscussionMetabox - Comment status toggle
 *
 * Simple checkbox to enable/disable comments on the post/page.
 * Checked = "open", unchecked = "closed".
 */

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { CommentStatus } from "@/types/editor";

interface DiscussionMetaboxProps {
  commentStatus: CommentStatus;
  onChange: (status: CommentStatus) => void;
}

export function DiscussionMetabox({
  commentStatus,
  onChange,
}: DiscussionMetaboxProps) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={commentStatus === "open"}
        onCheckedChange={(checked) => {
          onChange(checked ? "open" : "closed");
        }}
        aria-label="Allow comments"
      />
      <Label className="cursor-pointer text-xs font-normal">
        Allow comments
      </Label>
    </div>
  );
}
