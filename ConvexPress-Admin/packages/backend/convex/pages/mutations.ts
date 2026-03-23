/**
 * Page System - Mutations
 *
 * All write operations for the page lifecycle:
 *   create           - Create a new page
 *   update           - Update an existing page (partial patch)
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
 *   - `page.create`     required to create pages
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
import { requireCan , getUserIdentifier } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { PAGE_EVENTS, SYSTEM } from "../events/constants";
import {
  createPageArgs,
  updatePageArgs,
  trashPageArgs,
  restorePageArgs,
  deletePageArgs,
  publishPageArgs,
  reorderPagesArgs,
  setPageParentArgs,
} from "./validators";
import {
  slugify,
  generateUniqueSlug,
  computePagePath,
  computePageDepth,
  validateParent,
  wouldCreateCircle,
  recomputeDescendantPaths,
  getMaxSubtreeDepth,
  MAX_PAGE_DEPTH,
} from "./internals";

// ─── Create ──────────────────────────────────────────────────────────────────

/**
 * Create a new page.
 *
 * Flow:
 *   1. Auth check: require `page.create` capability
 *   2. If publishing directly, additionally require `page.publish`
 *   3. Generate or validate slug (unique within type "page")
 *   4. Validate parent if provided (exists, is page, not trashed)
 *   5. Compute path and depth from parent chain
 *   6. Enforce max depth limit (5 levels)
 *   7. Insert page record
 *   8. Emit `page.created` event
 *
 * @returns The new page's ID
 */
export const create = mutation({
  args: createPageArgs,
  handler: async (ctx, args) => {
    // ── Auth & capability checks ──────────────────────────────────────────
    const user = await requireCan(ctx, "page.create");

    const status = args.status ?? "draft";
    const visibility = args.visibility ?? "public";

    // Publishing requires additional capability
    if (status === "publish") {
      await requireCan(ctx, "page.publish");
    }

    // ── Title validation ──────────────────────────────────────────────────
    // Auto-drafts are allowed to have empty titles (they're created on mount
    // before the user types anything). All other statuses require a title.
    const title = args.title.trim();
    if (!title && status !== "auto-draft") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Page title cannot be empty",
      });
    }

    // ── Slug generation ───────────────────────────────────────────────────
    // For auto-drafts with no title, generate a temporary slug
    const slugSource = title || `auto-draft-${Date.now()}`;
    const baseSlug = args.slug ? slugify(args.slug) : slugify(slugSource);
    const slug = await generateUniqueSlug(ctx, baseSlug);

    // ── Parent validation & hierarchy ─────────────────────────────────────
    let parentId: Id<"posts"> | undefined = args.parentId;
    let depth = 0;
    let path = `/${slug}`;

    if (parentId) {
      await validateParent(ctx, parentId);

      depth = await computePageDepth(ctx, parentId) + 1;

      if (depth > MAX_PAGE_DEPTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Maximum page nesting depth is ${MAX_PAGE_DEPTH + 1} levels`,
        });
      }

      path = await computePagePath(ctx, slug, parentId);
    }

    // ── Build the page record ─────────────────────────────────────────────
    const now = Date.now();
    const pageData: Record<string, unknown> = {
      type: "page" as const,
      title,
      slug,
      content: args.content ?? "",
      excerpt: args.excerpt,
      status,
      visibility,
      password: visibility === "password" ? args.password : undefined,
      authorId: user._id,
      commentStatus: "closed" as const,
      parentId,
      menuOrder: args.menuOrder ?? 0,
      pageTemplate: args.pageTemplate ?? "default",
      featuredImageId: args.featuredImageId,
      path,
      depth,
      publishedAt: status === "publish" ? (args.publishedAt ?? now) : undefined,
      scheduledAt: status === "future" ? args.scheduledAt : undefined,
      createdAt: now,
      updatedAt: now,
    };

    // ── Insert record ─────────────────────────────────────────────────────
    // NOTE: The `as any` cast is required because pageData is built dynamically
    // as Record<string, unknown>. This is a known Convex pattern during
    // incremental development where the TypeScript types may not fully match
    // the runtime schema. The validator in createPageArgs ensures type safety
    // at the argument level.
    const pageId = await ctx.db.insert("posts", pageData as any);

    // ── Schedule auto-publish for future-dated pages ──────────────────────
    if (status === "future" && args.scheduledAt) {
      await ctx.scheduler.runAt(
        args.scheduledAt,
        internal.posts.internals.publishScheduled,
        { postId: pageId },
      );
    }

    // NOTE: childCount is NOT stored on the schema. Child counts are derived
    // at query time using the by_type_parent index. No childCount update needed.

    // ── Emit event ────────────────────────────────────────────────────────
    await emitEvent(ctx, PAGE_EVENTS.CREATED, SYSTEM.PAGE, {
      pageId,
      title,
      authorId: user._id,
    });

    return pageId;
  },
});

// ─── Update ──────────────────────────────────────────────────────────────────

/**
 * Update an existing page.
 *
 * Supports partial updates -- only provided fields are changed.
 *
 * Special behaviors:
 *   - If slug changes, path is recomputed for this page AND all descendants
 *   - If status changes to "publish", publishedAt is set (if not already)
 *   - If status changes to "trash", trashedAt is set
 *   - Only emits event if actual changes were made
 *
 * @returns The page ID
 */
export const update = mutation({
  args: updatePageArgs,
  handler: async (ctx, args) => {
    // ── Auth check ────────────────────────────────────────────────────────
    const user = await requireCan(ctx, "page.update");

    // ── Fetch existing page ───────────────────────────────────────────────
    const page = await ctx.db.get("posts", args.pageId);
    if (!page || page.type !== "page") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Page not found",
      });
    }

    // Ownership check note: In WordPress, edit_pages (own) and edit_others_pages
    // (others) are distinct capabilities. In SmithHarper, page management is
    // restricted to Administrator and Editor roles only (both have page.update),
    // so the requireCan("page.update") check above is sufficient for all users
    // who can reach this mutation. No additional non-owner check is needed.

    // ── Additional capability checks ──────────────────────────────────────
    // If publishing, require page.publish
    if (args.status === "publish" && page.status !== "publish") {
      await requireCan(ctx, "page.publish");
    }

    // ── Title validation ──────────────────────────────────────────────────
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Page title cannot be empty",
        });
      }
    }

    // ── Slug uniqueness check ─────────────────────────────────────────────
    let newSlug: string | undefined;
    if (args.slug !== undefined && args.slug !== page.slug) {
      const baseSlug = slugify(args.slug);
      newSlug = await generateUniqueSlug(ctx, baseSlug, args.pageId);
    }

    // ── Build patch object ────────────────────────────────────────────────
    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    const changes: string[] = [];

    if (args.title !== undefined && args.title.trim() !== page.title) {
      patch.title = args.title.trim();
      changes.push("title");
    }

    if (newSlug) {
      patch.slug = newSlug;
      changes.push("slug");
    }

    if (args.content !== undefined && args.content !== page.content) {
      patch.content = args.content;
      changes.push("content");
    }

    if (args.excerpt !== undefined && args.excerpt !== page.excerpt) {
      patch.excerpt = args.excerpt;
      changes.push("excerpt");
    }

    if (args.status !== undefined && args.status !== page.status) {
      patch.status = args.status;
      changes.push("status");

      // Set publishedAt when first publishing
      if (args.status === "publish" && !page.publishedAt) {
        patch.publishedAt = now;
      }

      // Set trashedAt when trashing
      if (args.status === "trash") {
        patch.trashedAt = now;
      }
    }

    if (args.visibility !== undefined && args.visibility !== page.visibility) {
      patch.visibility = args.visibility;
      changes.push("visibility");

      // Handle password for password-protected pages
      if (args.visibility === "password") {
        patch.password = args.password;
      } else {
        patch.password = undefined;
      }
    } else if (args.password !== undefined && args.visibility === "password") {
      patch.password = args.password;
    }

    if (args.menuOrder !== undefined && args.menuOrder !== page.menuOrder) {
      patch.menuOrder = args.menuOrder;
      changes.push("menuOrder");
    }

    if (args.pageTemplate !== undefined && args.pageTemplate !== page.pageTemplate) {
      patch.pageTemplate = args.pageTemplate;
      changes.push("template");
    }

    if (args.featuredImageId !== undefined && args.featuredImageId !== page.featuredImageId) {
      patch.featuredImageId = args.featuredImageId;
      changes.push("featuredImage");
    }

    if (args.commentStatus !== undefined) {
      patch.commentStatus = args.commentStatus;
      changes.push("commentStatus");
    }

    if (args.scheduledAt !== undefined && args.scheduledAt !== page.scheduledAt) {
      patch.scheduledAt = args.scheduledAt;
      changes.push("scheduledAt");
    }

    // ── Schedule auto-publish for future-dated pages ──────────────────────
    // If status is changing to "future" or staying "future" with a new scheduledAt,
    // schedule the auto-publish. The publishScheduled function is a no-op if the
    // page's status has changed by the time it fires.
    const effectiveStatus = (patch.status as string) ?? page.status;
    const effectiveScheduledAt = (patch.scheduledAt as number | undefined) ?? page.scheduledAt;
    if (
      effectiveStatus === "future" &&
      effectiveScheduledAt &&
      (args.status === "future" || args.scheduledAt !== undefined)
    ) {
      await ctx.scheduler.runAt(
        effectiveScheduledAt,
        internal.posts.internals.publishScheduled,
        { postId: args.pageId },
      );
    }

    // ── Handle parentId change (reparenting via update) ───────────────────
    let parentChanged = false;
    if (args.parentId !== undefined && args.parentId !== page.parentId) {
      const oldParentId = page.parentId as Id<"posts"> | undefined;
      const newParentId = args.parentId;

      // Validate new parent if not making top-level
      if (newParentId) {
        await validateParent(ctx, newParentId);

        // Check for circular reference
        if (await wouldCreateCircle(ctx, args.pageId, newParentId)) {
          throw new ConvexError({
            code: "VALIDATION_ERROR",
            message: "Circular parent-child relationship detected",
          });
        }

        const newDepth = await computePageDepth(ctx, newParentId) + 1;
        const subtreeDepth = await getMaxSubtreeDepth(ctx, args.pageId);
        if (newDepth + subtreeDepth > MAX_PAGE_DEPTH) {
          throw new ConvexError({
            code: "VALIDATION_ERROR",
            message: `Maximum page nesting depth is ${MAX_PAGE_DEPTH + 1} levels`,
          });
        }

        patch.parentId = newParentId;
        patch.depth = newDepth;
        patch.path = await computePagePath(ctx, newSlug ?? page.slug, newParentId);
      } else {
        // Making top-level
        patch.parentId = undefined;
        patch.depth = 0;
        patch.path = `/${newSlug ?? page.slug}`;
      }

      changes.push("parent");
      parentChanged = true;

      // NOTE: childCount is NOT stored on the schema. Child counts are derived
      // at query time using the by_type_parent index. No childCount update needed.
    }

    // ── Create revision snapshot BEFORE applying patch ─────────────────────
    // Mirrors Post System behavior: snapshot the current state before changes.
    // Must be synchronous to guarantee snapshot captures pre-update state.
    if (page.status !== "auto-draft" && changes.length > 0) {
      const contentFields = ["title", "content", "excerpt"];
      const hasContentChange = changes.some((f) => contentFields.includes(f));
      if (hasContentChange) {
        await ctx.runMutation(
          internal.revisions.internals.createOnSave,
          {
            parentId: args.pageId,
            parentType: "page" as const,
            title: page.title ?? "",
            content: (page.content as string) ?? "",
            excerpt: page.excerpt as string | undefined,
            authorId: getUserIdentifier(user),
            changedFields: changes.filter((f) => contentFields.includes(f)),
          },
        );
      }
    }

    // ── Apply patch ───────────────────────────────────────────────────────
    if (changes.length > 0 || Object.keys(patch).length > 1) {
      await ctx.db.patch("posts", args.pageId, patch);
    }

    // ── Recompute paths if slug changed (and parent didn't already handle it)
    if (newSlug && !parentChanged) {
      const updatedPath = await computePagePath(
        ctx,
        newSlug,
        page.parentId as Id<"posts"> | undefined,
      );
      await ctx.db.patch("posts", args.pageId, { path: updatedPath });

      // Cascade path updates to all descendants
      const parentPath = updatedPath.substring(0, updatedPath.lastIndexOf("/")) || "";
      await recomputeDescendantPaths(
        ctx,
        args.pageId,
        parentPath,
        (page.depth as number) ?? 0,
      );
    }

    // ── Recompute descendant paths if parent changed ──────────────────────
    if (parentChanged) {
      const newPath = (patch.path as string) ?? page.path ?? `/${page.slug}`;
      const newDepth = (patch.depth as number) ?? page.depth ?? 0;
      const computedParentPath = newPath.substring(0, newPath.lastIndexOf("/")) || "";
      await recomputeDescendantPaths(ctx, args.pageId, computedParentPath, newDepth);
    }

    // ── Emit event (only if there were actual changes) ────────────────────
    if (changes.length > 0) {
      await emitEvent(ctx, PAGE_EVENTS.UPDATED, SYSTEM.PAGE, {
        pageId: args.pageId,
        title: (patch.title as string) ?? page.title,
        authorId: user._id,
        changes,
      });
    }

    return args.pageId;
  },
});

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

    await ctx.db.patch("posts", args.pageId, patch);

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
    await ctx.db.patch("posts", args.pageId, {
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

    await ctx.db.patch("posts", args.pageId, patch);

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
        ? await computePageDepth(ctx, pageParentId) + 1
        : 0;
      const newPath = await computePagePath(ctx, child.slug, pageParentId);

      await ctx.db.patch("posts", child._id, {
        parentId: pageParentId,
        depth: newDepth,
        path: newPath,
        updatedAt: now,
      });

      // Cascade path updates to grandchildren
      const childParentPath = newPath.substring(0, newPath.lastIndexOf("/")) || "";
      await recomputeDescendantPaths(ctx, child._id, childParentPath, newDepth);
    }

    // ── Clear front page references ───────────────────────────────────────
    await clearFrontPageReferences(ctx, args.pageId);

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
    await ctx.db.delete("posts", args.pageId);

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
          const newDepth = await computePageDepth(ctx, item.parentId) + 1;
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

      await ctx.db.patch("posts", item.pageId, patch);

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

      newDepth = await computePageDepth(ctx, newParentId) + 1;

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

    // ── Update the page ───────────────────────────────────────────────────
    await ctx.db.patch("posts", args.pageId, {
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
      await ctx.db.patch("settings", readingSettings._id, {
        values: newValues,
        updatedAt: Date.now(),
      });
    }
  } catch {
    // Settings table may not exist yet during incremental build.
    // This is non-critical; silently continue.
  }
}
