/**
 * PostEditLockNotice - Concurrent editing warning banner
 *
 * Displays a warning when another user is currently editing the same post.
 * Provides "Take Over" and "Go Back" actions.
 * Wired to the dedicated `editorLocks` table via Content Editor System backend.
 */

import { useRouter } from "@tanstack/react-router";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { usePostEditLock } from "@/hooks/posts/usePostEditLock";

interface PostEditLockNoticeProps {
  postId: string;
  currentUserId: string;
}

export function PostEditLockNotice({
  postId,
  currentUserId,
}: PostEditLockNoticeProps) {
  const router = useRouter();

  // Use the refactored hook that talks to the editorLocks table
  const { isLocked, lockHolderName, takeover } = usePostEditLock(
    postId as Id<"posts">,
    currentUserId,
  );

  // If not locked by another user, don't show the notice
  if (!isLocked) {
    return null;
  }

  const displayName = lockHolderName ?? "Another user";

  return (
    <div
      role="alert"
      className="border border-destructive/30 bg-destructive/10 p-4 text-sm mb-4"
    >
      <p className="text-foreground font-medium mb-2">
        {displayName} is currently editing this post.
      </p>
      <p className="text-muted-foreground mb-3">
        If you take over, the other editor will be locked out and could lose
        unsaved changes.
      </p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          onClick={takeover}
        >
          Take Over
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            router.history.back();
          }}
        >
          Go Back
        </Button>
      </div>
    </div>
  );
}
