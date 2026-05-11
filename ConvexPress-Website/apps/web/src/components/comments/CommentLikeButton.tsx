/**
 * CommentLikeButton - Like/unlike toggle with optimistic update.
 *
 * Uses the `comments.mutations.like` Convex mutation.
 * Shows a heart icon with like count. Toggles between liked/unliked.
 *
 * Uses local state for optimistic UI but syncs with server-side
 * data from the Convex reactive query when props change.
 */

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";

interface CommentLikeButtonProps {
  commentId: string;
  likeCount: number;
  isLiked: boolean;
}

export function CommentLikeButton({
  commentId,
  likeCount: serverLikeCount,
  isLiked: serverIsLiked,
}: CommentLikeButtonProps) {
  // Optimistic local state - initialized from server props
  const [isLiked, setIsLiked] = useState(serverIsLiked);
  const [likeCount, setLikeCount] = useState(serverLikeCount);
  const [isToggling, setIsToggling] = useState(false);

  // Sync local state with server-side updates from Convex reactive queries
  // (e.g., when another user likes the same comment and the subscription updates)
  useEffect(() => {
    if (!isToggling) {
      setIsLiked(serverIsLiked);
      setLikeCount(serverLikeCount);
    }
  }, [serverIsLiked, serverLikeCount, isToggling]);

  const likeMutation = useMutation(api.comments.mutations.like);

  async function handleToggle() {
    if (isToggling) return;

    // Optimistic update
    const prevIsLiked = isLiked;
    const prevCount = likeCount;
    setIsLiked(!isLiked);
    setLikeCount(isLiked ? Math.max(0, likeCount - 1) : likeCount + 1);

    setIsToggling(true);
    try {
      const result = await likeMutation({
        commentId: commentId as Id<"comments">,
      });
      // Sync with server result
      setIsLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch {
      // Revert on error
      setIsLiked(prevIsLiked);
      setLikeCount(prevCount);
    } finally {
      setIsToggling(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isToggling}
      className={cn(
        "flex items-center gap-1 text-xs transition-colors",
        isLiked
          ? "text-destructive"
          : "text-muted-foreground hover:text-foreground",
      )}
      aria-label={isLiked ? "Unlike comment" : "Like comment"}
    >
      <Heart
        className={cn("size-3", isLiked && "fill-current")}
        aria-hidden="true"
      />
      {likeCount > 0 && <span>{likeCount}</span>}
    </button>
  );
}
