/**
 * Post System - Mutation Hooks
 *
 * Wraps all Convex post mutations with toast notifications and error handling.
 * Provides a single hook that returns all post mutation functions.
 */

import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import type { Id } from "@backend/convex/_generated/dataModel";

/**
 * Existing-post lifecycle and metadata mutations with toast feedback.
 * New documents use canonicalDocuments.create in the native creation route.
 *
 * Usage:
 * ```tsx
 * const { trashPost } = usePostMutations();
 * await trashPost(postId);
 * ```
 */
export function usePostMutations() {
  const publishMutation = useMutation(api.posts.mutations.publish);
  const unpublishMutation = useMutation(api.posts.mutations.unpublish);
  const trashMutation = useMutation(api.posts.mutations.trash);
  const restoreMutation = useMutation(api.posts.mutations.restore);
  const permanentDeleteMutation = useMutation(api.posts.mutations.permanentDelete);
  const duplicateMutation = useMutation(api.posts.mutations.duplicate);
  const scheduleMutation = useMutation(api.posts.mutations.schedule);
  const bulkTrashMutation = useMutation(api.posts.mutations.bulkTrash);
  const bulkRestoreMutation = useMutation(api.posts.mutations.bulkRestore);
  const bulkDeleteMutation = useMutation(api.posts.mutations.bulkDelete);
  const bulkPublishMutation = useMutation(api.posts.mutations.bulkPublish);
  const setMetaMutation = useMutation(api.posts.mutations.setMeta);
  const deleteMetaMutation = useMutation(api.posts.mutations.deleteMeta);
  const bulkSetMetaMutation = useMutation(api.posts.mutations.bulkSetMeta);

  // ─── Publish ────────────────────────────────────────────────────────────

  async function publishPost(postId: Id<"posts">) {
    try {
      const result = await publishMutation({ postId });
      toast.success("Post published.");
      return result;
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Failed to publish post";
      toast.error(message);
      throw error;
    }
  }

  // ─── Unpublish ──────────────────────────────────────────────────────────

  async function unpublishPost(
    postId: Id<"posts">,
    targetStatus?: "draft" | "pending",
  ) {
    try {
      const result = await unpublishMutation({ postId, targetStatus });
      toast.success("Post reverted to draft.");
      return result;
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Failed to unpublish post";
      toast.error(message);
      throw error;
    }
  }

  // ─── Schedule ───────────────────────────────────────────────────────────

  async function schedulePost(postId: Id<"posts">, scheduledAt: number) {
    try {
      const result = await scheduleMutation({ postId, scheduledAt });
      toast.success("Post scheduled.");
      return result;
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Failed to schedule post";
      toast.error(message);
      throw error;
    }
  }

  // ─── Trash ──────────────────────────────────────────────────────────────

  async function trashPost(postId: Id<"posts">, title?: string) {
    try {
      const result = await trashMutation({ postId });
      toast.success(
        title ? `"${title}" moved to Trash.` : "Post moved to Trash.",
      );
      return result;
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Failed to trash post";
      toast.error(message);
      throw error;
    }
  }

  // ─── Restore ────────────────────────────────────────────────────────────

  async function restorePost(postId: Id<"posts">, title?: string) {
    try {
      const result = await restoreMutation({ postId });
      toast.success(
        title ? `"${title}" restored.` : "Post restored.",
      );
      return result;
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Failed to restore post";
      toast.error(message);
      throw error;
    }
  }

  // ─── Permanent Delete ───────────────────────────────────────────────────

  async function permanentDeletePost(
    postId: Id<"posts">,
    title?: string,
    force?: boolean,
  ) {
    try {
      const result = await permanentDeleteMutation({ postId, force });
      toast.success(
        title ? `"${title}" permanently deleted.` : "Post permanently deleted.",
      );
      return result;
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Failed to delete post";
      toast.error(message);
      throw error;
    }
  }

  // ─── Duplicate ──────────────────────────────────────────────────────────

  async function duplicatePost(postId: Id<"posts">, title?: string, expectedRevision?: number) {
    try {
      const newPostId = await duplicateMutation({
        postId,
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      });
      toast.success(
        title ? `"${title}" duplicated.` : "Post duplicated.",
      );
      return newPostId;
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Failed to duplicate post";
      toast.error(message);
      throw error;
    }
  }

  // ─── Bulk Trash ─────────────────────────────────────────────────────────

  async function bulkTrashPosts(postIds: Id<"posts">[]) {
    try {
      const result = await bulkTrashMutation({ postIds });
      if (result.trashed > 0) {
        toast.success(`${result.trashed} post(s) moved to Trash.`);
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} post(s) could not be trashed.`);
      }
      return result;
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Bulk trash failed";
      toast.error(message);
      throw error;
    }
  }

  // ─── Bulk Restore ───────────────────────────────────────────────────────

  async function bulkRestorePosts(postIds: Id<"posts">[]) {
    try {
      const result = await bulkRestoreMutation({ postIds });
      if (result.restored > 0) {
        toast.success(`${result.restored} post(s) restored.`);
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} post(s) could not be restored.`);
      }
      return result;
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Bulk restore failed";
      toast.error(message);
      throw error;
    }
  }

  // ─── Bulk Delete ────────────────────────────────────────────────────────

  async function bulkDeletePosts(postIds: Id<"posts">[]) {
    try {
      const result = await bulkDeleteMutation({ postIds });
      if (result.deleted > 0) {
        toast.success(`${result.deleted} post(s) permanently deleted.`);
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} post(s) could not be deleted.`);
      }
      return result;
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Bulk delete failed";
      toast.error(message);
      throw error;
    }
  }

  // ─── Bulk Publish ───────────────────────────────────────────────────────

  async function bulkPublishPosts(postIds: Id<"posts">[]) {
    try {
      const result = await bulkPublishMutation({ postIds });
      if (result.published > 0) {
        toast.success(`${result.published} post(s) published.`);
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} post(s) could not be published.`);
      }
      return result;
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Bulk publish failed";
      toast.error(message);
      throw error;
    }
  }

  // ─── PostMeta ───────────────────────────────────────────────────────────

  async function setPostMeta(postId: Id<"posts">, key: string, value: string) {
    try {
      return await setMetaMutation({ postId, key, value });
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Failed to set post meta";
      toast.error(message);
      throw error;
    }
  }

  async function deletePostMeta(postId: Id<"posts">, key: string) {
    try {
      return await deleteMetaMutation({ postId, key });
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Failed to delete post meta";
      toast.error(message);
      throw error;
    }
  }

  async function bulkSetPostMeta(
    postId: Id<"posts">,
    meta: Array<{ key: string; value: string }>,
  ) {
    try {
      return await bulkSetMetaMutation({ postId, meta });
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Failed to set post meta";
      toast.error(message);
      throw error;
    }
  }

  return {
    publishPost,
    unpublishPost,
    schedulePost,
    trashPost,
    restorePost,
    permanentDeletePost,
    duplicatePost,
    bulkTrashPosts,
    bulkRestorePosts,
    bulkDeletePosts,
    bulkPublishPosts,
    setPostMeta,
    deletePostMeta,
    bulkSetPostMeta,
  };
}
