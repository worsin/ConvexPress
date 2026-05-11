import { cn } from "@/lib/utils";
import type { BlockDocument } from "@/lib/blog/types";

import { BlockContentRenderer } from "./BlockContentRenderer";

interface PostContentProps {
  content: BlockDocument | null;
  className?: string;
}

/**
 * Full post content area. Wraps BlockContentRenderer with
 * appropriate prose-like spacing and styles.
 */
export function PostContent({ content, className }: PostContentProps) {
  if (!content || !content.content || content.content.length === 0) {
    return (
      <div
        data-slot="post-content"
        className={cn("py-8 text-center", className)}
      >
        <p className="text-xs text-muted-foreground">
          This post has no content yet.
        </p>
      </div>
    );
  }

  return (
    <div
      data-slot="post-content"
      className={cn("py-2", className)}
    >
      <BlockContentRenderer content={content} />
    </div>
  );
}
