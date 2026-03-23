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
 * Hook providing all post mutation functions with toast feedback.
 *
 * Usage:
 * ```tsx
 * const { createPost, updatePost, trashPost, ... } = usePostMutations();
 * await createPost({ status: "auto-draft" });
 * ```
 */
export function usePostMutations() {
  const createMutation = useMutation(api.posts.mutations.create);
  const updateMutation = useMutation(api.posts.mutations.update);
  const publishMutation = useMutation(api.posts.mutations.publish);
  const unpublishMutation = useMutation(api.posts.mutations.unpublish);
  const trashMutation = useMutation(api.posts.mutations.trash);
  const restoreMutation = useMutation(api.posts.mutations.restore);
  const permanentDeleteMutation = useMutation(api.posts.mutations.permanentDelete);
  const duplicateMutation = useMutation(api.posts.mutations.duplicate);
  const scheduleMutation = useMutation(api.posts.mutations.schedule);
  const autosaveMutation = useMutation(api.posts.mutations.autosave);
  const bulkTrashMutation = useMutation(api.posts.mutations.bulkTrash);
  const bulkRestoreMutation = useMutation(api.posts.mutations.bulkRestore);
  const bulkDeleteMutation = useMutation(api.posts.mutations.bulkDelete);
  const bulkPublishMutation = useMutation(api.posts.mutations.bulkPublish);
  const setMetaMutation = useMutation(api.posts.mutations.setMeta);
  const deleteMetaMutation = useMutation(api.posts.mutations.deleteMeta);
  const bulkSetMetaMutation = useMutation(api.posts.mutations.bulkSetMeta);

  // ─── Create ─────────────────────────────────────────────────────────────

  async function createPost(args: {
    title?: string;
    content?: string;
    excerpt?: string;
    status?: string;
    visibility?: string;
    password?: string;
    commentStatus?: string;
    featuredImageId?: Id<"media">;
    isSticky?: boolean;
    scheduledAt?: number;
    categoryIds?: Id<"terms">[];
    tagIds?: Id<"terms">[];
  }) {
    try {
      // Build properly typed args for the Convex mutation
      const mutationArgs: Record<string, unknown> = { ...args };
      const postId = await createMutation(mutationArgs as Parameters<typeof createMutation>[0]);
      if (args.status && args.status !== "auto-draft") {
        toast.success("Post created.");
      }
      return postId;
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Failed to create post";
      toast.error(message);
      throw error;
    }
  }

  // ─── Update ─────────────────────────────────────────────────────────────

  async function updatePost(args: {
    postId: Id<"posts">;
    title?: string;
    content?: string;
    excerpt?: string;
    status?: string;
    visibility?: string;
    password?: string;
    commentStatus?: string;
    featuredImageId?: Id<"media">;
    isSticky?: boolean;
    slug?: string;
    menuOrder?: number;
    authorId?: Id<"users">;
    scheduledAt?: number;
    categoryIds?: Id<"terms">[];
    tagIds?: Id<"terms">[];
  }) {
    try {
      // Build properly typed args for the Convex mutation
      const mutationArgs: Record<string, unknown> = { ...args };
      const result = await updateMutation(mutationArgs as Parameters<typeof updateMutation>[0]);
      toast.success("Post updated.");
      return result;
    } catch (error: unknown) {
      const err = error as { data?: { message?: string }; message?: string };
      const message = err?.data?.message ?? err?.message ?? "Failed to update post";
      toast.error(message);
      throw error;
    }
  }

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

  async function duplicatePost(postId: Id<"posts">, title?: string) {
    try {
      const newPostId = await duplicateMutation({ postId });
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

  // ─── Autosave ───────────────────────────────────────────────────────────

  async function autosavePost(args: {
    postId: Id<"posts">;
    title?: string;
    content?: string;
  }) {
    try {
      return await autosaveMutation(args);
    } catch {
      // Autosave failures are silent per the knowledge doc
      return { autosavedAt: 0 };
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
    createPost,
    updatePost,
    publishPost,
    unpublishPost,
    schedulePost,
    trashPost,
    restorePost,
    permanentDeletePost,
    duplicatePost,
    autosavePost,
    bulkTrashPosts,
    bulkRestorePosts,
    bulkDeletePosts,
    bulkPublishPosts,
    setPostMeta,
    deletePostMeta,
    bulkSetPostMeta,
  };
}
