import { canonicalTrashRestorePermit } from "../canonicalDocuments/service";

import { assertPageTreePathAvailable } from "../helpers/pageRouteGuard";

/**
 * Page System - Mutations
 *
 * All write operations for the page lifecycle:
 *   publish          - Publish a draft/pending page
 *   trash            - Soft-delete (move to trash)
 *   restore          - Restore from trash
 *   permanentDelete  - Permanently delete a trashed page
 *   reorder          - Batch update menuOrder for multiple pages
 *   setParent        - Move a page to a new parent (reparenting)
 *
 * Authorization model:
 *   Pages are Administrator/Editor-only content. Authors, Contributors,
 *   and Subscribers have NO page management capabilities.
 *
 *   - `page.update`     required to update pages
 *   - `page.delete`     required to trash/delete pages
 *   - `page.publish`    required to publish pages
 *   - `page.reorder`    required for batch reordering
 *   - `page.set_parent` required for reparenting
 *
 * All mutations emit events via the Event Dispatcher System for audit
 * logging, sitemap regeneration, and other subscribers.
 *
 * Pages live in the shared `posts` table with `type: "page"`.
 */

import { ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";

import { emitEvent } from "../helpers/events";

import { PAGE_EVENTS, SYSTEM } from "../events/constants";
import {
  trashPageArgs,
  restorePageArgs,
  deletePageArgs,
  publishPageArgs,
  reorderPagesArgs,
  setPageParentArgs,
} from "./validators";
import {
  generateUniqueSlug,
  computePagePath,
  computePageDepth,
  validateParent,
  wouldCreateCircle,
  recomputeDescendantPaths,
  getMaxSubtreeDepth,
  MAX_PAGE_DEPTH,
  deletePageMetadata,
} from "./internals";

import { deleteWithMediaReferences, patchWithMediaReferences } from "../media/attachmentGuard";

// New documents are created through canonicalDocuments.create or the canonical HTTP API.

// Metadata and authoring use revision-checked canonicalDocuments mutations.

// ─── Publish ─────────────────────────────────────────────────────────────────

/**
 * Publish a page.
 *
 * Transitions a draft/pending page to published status.
 * Sets publishedAt if not already set.
 *
 * @returns The page ID
 */
export const publish = mutation({
  args: publishPageArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "page.publish");

    const page = await ctx.db.get("posts", args.pageId);
    if (!page || page.type !== "page") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Page not found",
      });
    }

    if (page.status === "publish") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Page is already published",
      });
    }

    const now = Date.now();
    const patch: Record<string, unknown> = {
      status: "publish",
      updatedAt: now,
    };

    // Set publishedAt if not already set
    if (!page.publishedAt) {
      patch.publishedAt = now;
    }

    // Preserve existing visibility (keep "private" if it was private)
    // Only override if currently "public" (default)
    if (page.visibility !== "private" && page.visibility !== "password") {
      patch.visibility = "public";
    }

    await patchWithMediaReferences<"posts">(ctx, "posts", args.pageId, patch);

    await emitEvent(ctx, PAGE_EVENTS.PUBLISHED, SYSTEM.PAGE, {
      pageId: args.pageId,
      title: page.title,
      authorId: user._id,
      url: (page.path as string) ?? `/${page.slug}`,
    });

    return args.pageId;
  },
});

// ─── Trash ───────────────────────────────────────────────────────────────────

/**
 * Move a page to trash (soft delete).
 *
 * The page's status is set to "trash" and trashedAt is recorded.
 * Children are NOT cascaded -- they remain accessible.
 * If the page is the designated front page, that reference is cleared.
 *
 * @returns The page ID
 */
export const trash = mutation({
  args: trashPageArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "page.delete");

    const page = await ctx.db.get("posts", args.pageId);
    if (!page || page.type !== "page") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Page not found",
      });
    }

    // Ownership check note: Page management is restricted to Administrator and
    // Editor roles only (both have page.delete), so the requireCan("page.delete")
    // check above is sufficient. No additional non-owner check is needed.

    if (page.status === "trash") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Page is already in trash",
      });
    }

    const now = Date.now();
    await patchWithMediaReferences<"posts">(ctx, "posts", args.pageId, {
      status: "trash",
      previousStatus: page.status,
      trashedAt: now,
      updatedAt: now,
    });

    // Clear front page references if this was the front page
    await clearFrontPageReferences(ctx, args.pageId);

    await emitEvent(ctx, PAGE_EVENTS.TRASHED, SYSTEM.PAGE, {
      pageId: args.pageId,
      title: page.title,
      authorId: user._id,
    });

    return args.pageId;
  },
});

// ─── Restore ─────────────────────────────────────────────────────────────────

/**
 * Restore a page from trash.
 *
 * The page's status is restored to its previousStatus (the status it had
 * before being trashed). If previousStatus is not available or invalid,
 * falls back to "draft" as a safe default. This matches WordPress behavior
 * where restoring preserves the original status.
 *
 * If the page's parent was permanently deleted while this page
 * was in trash, the page becomes top-level.
 *
 * If a slug conflict exists (another page was created with the same slug
 * while this page was in trash), a suffix is appended to the restored slug.
 *
 * @returns The page ID
 */
export const restore = mutation({
  args: restorePageArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "page.update");

    const page = await ctx.db.get("posts", args.pageId);
    if (!page || page.type !== "page") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Page not found",
      });
    }

    if (page.status !== "trash") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Page is not in trash",
      });
    }

    const now = Date.now();

    // Restore to previous status if available, otherwise default to "draft"
    // This preserves the page's status from before it was trashed (e.g., "publish")
    const restoredStatus = (page.previousStatus as string) ?? "draft";
    // Only restore to valid non-trash statuses
    const validRestoreStatuses = ["draft", "pending", "publish", "private", "future"];
    const finalStatus = validRestoreStatuses.includes(restoredStatus)
      ? restoredStatus
      : "draft";

    const patch: Record<string, unknown> = {
      status: finalStatus,
      previousStatus: undefined,
      trashedAt: undefined,
      updatedAt: now,
    };

    // Check if parent still exists
    if (page.parentId) {
      const parent = await ctx.db.get("posts", page.parentId as Id<"posts">);
      if (!parent || parent.type !== "page" || parent.status === "trash") {
        // Parent no longer valid; make top-level
        patch.parentId = undefined;
        patch.depth = 0;
        patch.path = `/${page.slug}`;
      }
    }

    // Check for slug conflicts
    const slugConflict = await ctx.db
      .query("posts")
      .withIndex("by_type_slug", (q) =>
        q.eq("type", "page").eq("slug", page.slug),
      )
      .unique();

    if (slugConflict && slugConflict._id !== args.pageId) {
      // Slug conflict: generate a new unique slug
      const newSlug = await generateUniqueSlug(ctx, page.slug, args.pageId);
      patch.slug = newSlug;

      // Recompute path with new slug
      const parentId = (patch.parentId !== undefined
        ? patch.parentId
        : page.parentId) as Id<"posts"> | undefined;
      patch.path = await computePagePath(ctx, newSlug, parentId);
    }

    const restorePermit = await canonicalTrashRestorePermit(ctx, page, patch);
    await patchWithMediaReferences<"posts">(ctx, "posts", args.pageId, patch, restorePermit);

    // Emit restored event
    await emitEvent(ctx, PAGE_EVENTS.RESTORED, SYSTEM.PAGE, {
      pageId: args.pageId,
      title: page.title,
      authorId: user._id,
    });

    return args.pageId;
  },
});

// ─── Permanent Delete ────────────────────────────────────────────────────────

/**
 * Permanently delete a page.
 *
 * The page must already be in trash status.
 *
 * When a page is permanently deleted:
 *   1. Children are re-parented to the deleted page's parent (or become top-level)
 *   2. Children's paths and depths are recomputed recursively
 *   3. Front page references are cleared
 *   4. The page record is permanently removed
 *   5. A deletion event is emitted
 *
 * @returns success boolean
 */
export const permanentDelete = mutation({
  args: deletePageArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "page.delete");

    const page = await ctx.db.get("posts", args.pageId);
    if (!page || page.type !== "page") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Page not found",
      });
    }

    // Ownership check note: Page management is restricted to Administrator and
    // Editor roles only (both have page.delete), so the requireCan("page.delete")
    // check above is sufficient. No additional non-owner check is needed.

    if (page.status !== "trash") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Page must be in trash before permanent deletion. Move to trash first.",
      });
    }

    const pageParentId = page.parentId as Id<"posts"> | undefined;

    // NOTE: childCount is NOT stored on the schema. Child counts are derived
    // at query time using the by_type_parent index. No childCount update needed.

    // ── Re-parent children ────────────────────────────────────────────────
    const children = await ctx.db
      .query("posts")
      .withIndex("by_type_parent", (q) =>
        q.eq("type", "page").eq("parentId", args.pageId),
      )
      .collect();

    const now = Date.now();

    for (const child of children) {
      const newDepth = pageParentId
        ? await computePageDepth(ctx, pageParentId)
        : 0;
      const newPath = await computePagePath(ctx, child.slug, pageParentId);

      await patchWithMediaReferences<"posts">(ctx, "posts", child._id, {
        parentId: pageParentId,
        depth: newDepth,
        path: newPath,
        updatedAt: now,
      });

      // Cascade path updates to grandchildren
      const childParentPath = newPath.substring(0, newPath.lastIndexOf("/")) || "";
      await recomputeDescendantPaths(ctx, child._id, childParentPath, newDepth);
    }

    await deletePageMetadata(ctx, args.pageId);

    // ── Clear front page references ───────────────────────────────────────
    await clearFrontPageReferences(ctx, args.pageId);

    // Pages can carry topics for related-content discovery. Remove those
    // relationships before deleting their source, using the bounded cascade.
    await ctx.runMutation(internal.taxonomies.internals.deleteRelationshipsForPost, {
      postId: args.pageId,
    });

    // ── Delete all revisions (synchronous to ensure cleanup before page deletion)
    await ctx.runMutation(
      internal.revisions.internals.deleteByParent,
      { parentId: args.pageId },
    );

    // ── Capture event data before deletion ────────────────────────────────
    const eventPayload = {
      pageId: args.pageId,
      title: page.title,
      authorId: user._id,
      permanent: true,
    };

    // ── Delete the record ─────────────────────────────────────────────────
    await deleteWithMediaReferences<"posts">(ctx, "posts", args.pageId);

    // ── Emit event ────────────────────────────────────────────────────────
    await emitEvent(ctx, PAGE_EVENTS.DELETED, SYSTEM.PAGE, eventPayload);

    return { success: true };
  },
});

// ─── Reorder ─────────────────────────────────────────────────────────────────

/**
 * Batch update menuOrder for multiple pages.
 *
 * Used for drag-and-drop reordering in the admin "All Pages" list.
 * Each item specifies a page ID and its new menuOrder.
 *
 * Optionally supports reparenting via the parentId field on each item.
 *
 * @returns true on success
 */
export const reorder = mutation({
  args: reorderPagesArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "page.reorder");

    const now = Date.now();

    for (const item of args.items) {
      const page = await ctx.db.get("posts", item.pageId);
      if (!page || page.type !== "page") {
        // Skip invalid entries silently
        continue;
      }

      const patch: Record<string, unknown> = {
        menuOrder: item.menuOrder,
        updatedAt: now,
      };

      // Handle optional reparenting during reorder
      if (item.parentId !== undefined && item.parentId !== page.parentId) {
        // Validate new parent
        if (item.parentId) {
          await validateParent(ctx, item.parentId);

          // Check for circular reference
          if (await wouldCreateCircle(ctx, item.pageId, item.parentId)) {
            continue; // Skip this item silently
          }

          // Check depth limit
          const newDepth = await computePageDepth(ctx, item.parentId);
          const subtreeDepth = await getMaxSubtreeDepth(ctx, item.pageId);
          if (newDepth + subtreeDepth > MAX_PAGE_DEPTH) {
            continue; // Skip: would exceed depth limit
          }

          patch.parentId = item.parentId;
          patch.depth = newDepth;
          patch.path = await computePagePath(ctx, page.slug, item.parentId);
        } else {
          // Making top-level
          patch.parentId = undefined;
          patch.depth = 0;
          patch.path = `/${page.slug}`;
        }
      }

      if (typeof patch.path === "string") await assertPageTreePathAvailable(ctx, item.pageId, patch.path, page.path ?? `/${page.slug}`);
      await patchWithMediaReferences<"posts">(ctx, "posts", item.pageId, patch);

      // If parent changed, recompute descendant paths
      // NOTE: childCount is NOT stored on the schema. Child counts are derived
      // at query time using the by_type_parent index. No childCount update needed.
      if (patch.parentId !== undefined || (item.parentId === undefined && page.parentId)) {
        const newPath = (patch.path as string) ?? page.path ?? `/${page.slug}`;
        const newDepth = (patch.depth as number) ?? page.depth ?? 0;
        const parentPath = newPath.substring(0, newPath.lastIndexOf("/")) || "";
        await recomputeDescendantPaths(ctx, item.pageId, parentPath, newDepth);
      }
    }

    // ── Emit reorder event for audit/sitemap/SEO subscribers ──────────────
    await emitEvent(ctx, PAGE_EVENTS.REORDERED, SYSTEM.PAGE, {
      count: args.items.length,
      authorId: user._id,
      pageIds: args.items.map((item) => item.pageId),
    });

    return true;
  },
});

// ─── Set Parent ──────────────────────────────────────────────────────────────

/**
 * Set a page's parent (reparenting).
 *
 * Pass parentId as undefined to make the page top-level.
 *
 * Validates:
 *   - No self-parenting
 *   - No circular references
 *   - Parent exists and is a valid page
 *   - Parent is not in trash
 *   - Depth limit not exceeded (including subtree)
 *
 * @returns The page ID
 */
export const setParent = mutation({
  args: setPageParentArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "page.set_parent");

    const page = await ctx.db.get("posts", args.pageId);
    if (!page || page.type !== "page") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Page not found",
      });
    }

    const oldParentId = page.parentId as Id<"posts"> | undefined;
    const newParentId = args.parentId;

    // No change
    if (oldParentId === newParentId) {
      return args.pageId;
    }

    // ── Self-parenting check ──────────────────────────────────────────────
    if (newParentId && newParentId === args.pageId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "A page cannot be its own parent",
      });
    }

    // ── Circular reference check ──────────────────────────────────────────
    if (newParentId && await wouldCreateCircle(ctx, args.pageId, newParentId)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Circular parent-child relationship detected",
      });
    }

    // ── Validate new parent ───────────────────────────────────────────────
    let newDepth = 0;
    let newPath = `/${page.slug}`;

    if (newParentId) {
      await validateParent(ctx, newParentId);

      newDepth = await computePageDepth(ctx, newParentId);

      // Check depth limit including subtree
      const subtreeDepth = await getMaxSubtreeDepth(ctx, args.pageId);
      if (newDepth + subtreeDepth > MAX_PAGE_DEPTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Maximum page nesting depth is ${MAX_PAGE_DEPTH + 1} levels`,
        });
      }

      newPath = await computePagePath(ctx, page.slug, newParentId);
    }

    const now = Date.now();

    // NOTE: childCount is NOT stored on the schema. Child counts are derived
    // at query time using the by_type_parent index. No childCount update needed.

    await assertPageTreePathAvailable(ctx, args.pageId, newPath, page.path ?? `/${page.slug}`);

    // ── Update the page ───────────────────────────────────────────────────
    await patchWithMediaReferences<"posts">(ctx, "posts", args.pageId, {
      parentId: newParentId,
      depth: newDepth,
      path: newPath,
      updatedAt: now,
    });

    // ── Recompute descendant paths ────────────────────────────────────────
    const parentPath = newPath.substring(0, newPath.lastIndexOf("/")) || "";
    await recomputeDescendantPaths(ctx, args.pageId, parentPath, newDepth);

    // ── Emit event for audit/sitemap/SEO subscribers ──────────────────────
    await emitEvent(ctx, PAGE_EVENTS.UPDATED, SYSTEM.PAGE, {
      pageId: args.pageId,
      title: page.title,
      authorId: user._id,
      changes: ["parent"],
      oldParentId: oldParentId ?? null,
      newParentId: newParentId ?? null,
    });

    return args.pageId;
  },
});

// ─── Helpers (private to mutations) ──────────────────────────────────────────

/**
 * Clear front page references in reading settings when a page is
 * trashed or permanently deleted.
 *
 * If the deleted page was designated as the static front page
 * (`homepageId` in reading settings), reset `homepageDisplays` to
 * "latest_posts" and clear `homepageId`.
 *
 * Similarly clears `postsPageId` if the deleted page was the blog index.
 *
 * Legacy keys (`showOnFront`, `pageOnFront`, `pageForPosts`) are also
 * cleaned up when present to avoid stale data across older installs.
 */
async function clearFrontPageReferences(
  ctx: MutationCtx,
  pageId: Id<"posts">,
): Promise<void> {
  try {
    const readingSettings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "reading"))
      .unique();

    if (!readingSettings || !readingSettings.values) return;

    const values = readingSettings.values as {
      homepageDisplays?: "latest_posts" | "static_page";
      homepageId?: string | null;
      postsPageId?: string | null;
      // Legacy keys (older settings payloads).
      showOnFront?: "posts" | "page";
      pageOnFront?: string;
      pageForPosts?: string;
      postsPerPage?: number;
    };

    let needsUpdate = false;
    const newValues = { ...values };

    const currentHomepageId = values.homepageId ?? values.pageOnFront;
    if (currentHomepageId === pageId) {
      newValues.homepageDisplays = "latest_posts";
      newValues.homepageId = null;
      newValues.showOnFront = "posts";
      newValues.pageOnFront = undefined;
      needsUpdate = true;
    }

    const currentPostsPageId = values.postsPageId ?? values.pageForPosts;
    if (currentPostsPageId === pageId) {
      newValues.postsPageId = null;
      newValues.pageForPosts = undefined;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await patchWithMediaReferences<"settings">(ctx, "settings", readingSettings._id, {
        values: newValues,
        updatedAt: Date.now(),
      });
    }
  } catch {
    // Settings table may not exist yet during incremental build.
    // This is non-critical; silently continue.
  }
}
