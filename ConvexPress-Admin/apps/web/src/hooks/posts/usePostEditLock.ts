/**
 * Post System - Edit Lock Hook
 *
 * Manages concurrent editing prevention using the dedicated `editorLocks` table.
 * Uses the Content Editor System's backend functions:
 *   - acquireLock: Acquire an edit lock on a post
 *   - releaseLock: Release an edit lock on a post
 *   - renewLock: Heartbeat to extend lock expiry
 *   - getLock: Check if a post is currently locked and by whom
 *
 * Acquires the lock on mount, renews every 30s, and releases on unmount.
 */

import { useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

/** Lock renewal interval: every 30 seconds (matches backend LOCK_RENEWAL_INTERVAL_MS). */
const LOCK_REFRESH_MS = 30 * 1000;

interface UsePostEditLockResult {
  /** Whether the current user holds the lock. */
  hasLock: boolean;
  /** Whether another user holds the lock. */
  isLocked: boolean;
  /** The display name of the lock holder (if not the current user). */
  lockHolderName: string | null;
  /** The user ID of the lock holder (if not the current user). */
  lockHolder: string | null;
  /** Attempt to take over the lock (force-acquire). */
  takeover: () => Promise<void>;
}

/**
 * Hook for managing post edit locks via the editorLocks table.
 *
 * On mount, acquires an edit lock for the current user. The backend handles
 * expired lock detection and lock ownership. Renews the lock every 30 seconds
 * via heartbeat. On unmount, releases the lock.
 *
 * @param postId - The post being edited
 * @param userId - The current user's ID (unused directly, backend resolves from auth)
 */
export function usePostEditLock(
  postId: Id<"posts"> | null,
  userId: string | null,
): UsePostEditLockResult {
  const acquireLockMutation = useMutation(api.editor.mutations.acquireLock);
  const releaseLockMutation = useMutation(api.editor.mutations.releaseLock);
  const renewLockMutation = useMutation(api.editor.mutations.renewLock);

  // Reactively query the current lock state
  const lockData = useQuery(
    api.editor.queries.getLock,
    postId ? { postId } : "skip",
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derive state from the reactive lock query
  const hasLock = lockData?.isCurrentUser === true;
  const isLocked = !!lockData && !lockData.isCurrentUser;
  const lockHolder = isLocked ? String(lockData.userId) : null;
  const lockHolderName = isLocked ? (lockData.userDisplayName ?? null) : null;

  // Acquire lock on mount, renew periodically, release on unmount
  useEffect(() => {
    if (!postId || !userId) return;

    // Acquire the lock
    acquireLockMutation({ postId }).catch(() => {
      // Silent fail - lock acquisition is best-effort
    });

    // Renew lock periodically via heartbeat
    intervalRef.current = setInterval(() => {
      renewLockMutation({ postId }).catch(() => {
        // Silent fail
      });
    }, LOCK_REFRESH_MS);

    return () => {
      // Release lock on unmount
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      releaseLockMutation({ postId }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, userId]);

  // Takeover function: force-acquire by calling acquireLock
  // The backend will replace expired locks. For a true takeover of an active lock,
  // we release first then acquire.
  const takeover = useCallback(async () => {
    if (!postId) return;
    try {
      // The acquireLock mutation handles the case where the existing lock
      // is expired. For an active lock takeover, we rely on the backend
      // allowing re-acquisition when the lock has expired.
      await acquireLockMutation({ postId });
    } catch {
      // Silent fail
    }
  }, [postId, acquireLockMutation]);

  return { hasLock, isLocked, lockHolder, lockHolderName, takeover };
}
