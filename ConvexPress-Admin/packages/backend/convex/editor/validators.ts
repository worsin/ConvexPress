/** Shared edit-lock argument validators. */
import { v } from "convex/values";
export const LOCK_DURATION_MS = 2 * 60 * 1000;
export const LOCK_RENEWAL_INTERVAL_MS = 30 * 1000;

// ─── Edit Lock Mutation Args ────────────────────────────────────────────────

/**
 * Arguments for acquiring an edit lock on a post.
 */
export const acquireLockArgs: { postId: import("convex/values").VId<import("../_generated/dataModel").Id<"posts">> } = {
  postId: v.id("posts"),
};

/**
 * Arguments for releasing an edit lock on a post.
 */
export const releaseLockArgs: { postId: import("convex/values").VId<import("../_generated/dataModel").Id<"posts">> } = {
  postId: v.id("posts"),
};

/**
 * Arguments for renewing an edit lock (heartbeat).
 */
export const renewLockArgs: { postId: import("convex/values").VId<import("../_generated/dataModel").Id<"posts">> } = {
  postId: v.id("posts"),
};

// ─── Edit Lock Query Args ───────────────────────────────────────────────────

/**
 * Arguments for checking if a post is locked.
 */
export const getLockArgs: { postId: import("convex/values").VId<import("../_generated/dataModel").Id<"posts">> } = {
  postId: v.id("posts"),
};
