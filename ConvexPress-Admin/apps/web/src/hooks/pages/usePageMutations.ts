/**
 * Page System - Mutation Hooks
 *
 * Wraps all Convex page mutations with toast notifications and error handling.
 * Provides a single hook that returns all page mutation functions.
 */

import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import type { Id, Doc } from "@backend/convex/_generated/dataModel";
import { getErrorMessage } from "@/lib/utils";

// Page-specific types derived from Convex schema
type PageStatus = Doc<"posts">["status"];
type PageVisibility = Doc<"posts">["visibility"];
type CommentStatus = Doc<"posts">["commentStatus"];

/**
 * Existing-page lifecycle and metadata mutations with toast feedback.
 * New documents use canonicalDocuments.create in the native creation route.
 *
 * Usage:
 * ```tsx
 * const { trashPage } = usePageMutations();
 * await trashPage(pageId);
 * ```
 */
export function usePageMutations() {
  const updateMutation = useMutation(api.pages.mutations.update);
  const publishMutation = useMutation(api.pages.mutations.publish);
  const trashMutation = useMutation(api.pages.mutations.trash);
  const restoreMutation = useMutation(api.pages.mutations.restore);
  const permanentDeleteMutation = useMutation(api.pages.mutations.permanentDelete);
  const reorderMutation = useMutation(api.pages.mutations.reorder);
  const setParentMutation = useMutation(api.pages.mutations.setParent);

  // ─── Update ─────────────────────────────────────────────────────────────

  async function updatePage(args: {
    pageId: Id<"posts">;
    title?: string;
    content?: string;
    excerpt?: string;
    status?: PageStatus;
    visibility?: PageVisibility;
    password?: string;
    menuOrder?: number;
    pageTemplate?: string;
    featuredImageId?: Id<"media">;
    slug?: string;
    scheduledAt?: number;
    commentStatus?: CommentStatus;
  }) {
    try {
      const result = await updateMutation(args);
      toast.success("Page updated.");
      return result;
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to update page");
      toast.error(message);
      throw error;
    }
  }

  // ─── Publish ────────────────────────────────────────────────────────────

  async function publishPage(pageId: Id<"posts">) {
    try {
      const result = await publishMutation({ pageId });
      toast.success("Page published.");
      return result;
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to publish page");
      toast.error(message);
      throw error;
    }
  }

  // ─── Trash ──────────────────────────────────────────────────────────────

  async function trashPage(pageId: Id<"posts">, title?: string) {
    try {
      const result = await trashMutation({ pageId });
      toast.success(
        title ? `"${title}" moved to Trash.` : "Page moved to Trash.",
      );
      return result;
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to trash page");
      toast.error(message);
      throw error;
    }
  }

  // ─── Restore ────────────────────────────────────────────────────────────

  async function restorePage(pageId: Id<"posts">, title?: string) {
    try {
      const result = await restoreMutation({ pageId });
      toast.success(
        title ? `"${title}" restored.` : "Page restored.",
      );
      return result;
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to restore page");
      toast.error(message);
      throw error;
    }
  }

  // ─── Permanent Delete ───────────────────────────────────────────────────

  async function permanentDeletePage(pageId: Id<"posts">, title?: string) {
    try {
      const result = await permanentDeleteMutation({ pageId });
      toast.success(
        title ? `"${title}" permanently deleted.` : "Page permanently deleted.",
      );
      return result;
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to delete page");
      toast.error(message);
      throw error;
    }
  }

  // ─── Reorder ────────────────────────────────────────────────────────────

  async function reorderPages(items: Array<{
    pageId: Id<"posts">;
    menuOrder: number;
    parentId?: Id<"posts">;
  }>) {
    try {
      const result = await reorderMutation({ items });
      toast.success("Pages reordered.");
      return result;
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to reorder pages");
      toast.error(message);
      throw error;
    }
  }

  // ─── Set Parent ─────────────────────────────────────────────────────────

  async function setPageParent(pageId: Id<"posts">, parentId?: Id<"posts">) {
    try {
      const result = await setParentMutation({ pageId, parentId });
      toast.success("Page parent updated.");
      return result;
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to set page parent");
      toast.error(message);
      throw error;
    }
  }

  return {
    updatePage,
    publishPage,
    trashPage,
    restorePage,
    permanentDeletePage,
    reorderPages,
    setPageParent,
  };
}
