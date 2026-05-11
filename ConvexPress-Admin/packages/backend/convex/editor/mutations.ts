/**
 * Content Editor System - Mutations
 *
 * All write operations for the Content Editor backend:
 *
 * Reusable Blocks:
 *   createReusableBlock   - Create a new reusable block
 *   updateReusableBlock   - Update an existing reusable block
 *   deleteReusableBlock   - Delete a reusable block
 *   duplicateReusableBlock - Clone a reusable block
 *
 * Edit Locks:
 *   acquireLock           - Acquire an edit lock on a post
 *   releaseLock           - Release an edit lock on a post
 *   renewLock             - Heartbeat to extend lock expiry
 *
 * Authorization model:
 *   - Reusable block CRUD requires post.create / post.update / post.delete capabilities
 *     (effectively Administrator and Editor roles, level 80+)
 *   - Edit locks require authentication only (any editor-capable user)
 */

import { ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import {
  createReusableBlockArgs,
  updateReusableBlockArgs,
  deleteReusableBlockArgs,
  duplicateReusableBlockArgs,
  acquireLockArgs,
  releaseLockArgs,
  renewLockArgs,
  MAX_BLOCK_TITLE_LENGTH,
  MAX_BLOCK_DESCRIPTION_LENGTH,
  MAX_BLOCK_CONTENT_SIZE,
  LOCK_DURATION_MS,
} from "./validators";

// ═══════════════════════════════════════════════════════════════════════════
// REUSABLE BLOCK MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Create Reusable Block ──────────────────────────────────────────────────

/**
 * Create a new reusable block.
 *
 * Only Administrators and Editors can create reusable blocks (post.create
 * capability). Authors and Contributors can insert existing reusable blocks
 * but cannot create new ones.
 *
 * @returns The new reusable block document ID
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createReusableBlock = mutation({
  args: createReusableBlockArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.create");

    // ── Validate title ──────────────────────────────────────────────────
    const title = args.title.trim();
    if (!title) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Title is required",
      });
    }
    if (title.length > MAX_BLOCK_TITLE_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Title must be ${MAX_BLOCK_TITLE_LENGTH} characters or fewer`,
      });
    }

    // ── Validate content ────────────────────────────────────────────────
    if (!args.content || !args.content.trim()) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Content is required",
      });
    }
    if (args.content.length > MAX_BLOCK_CONTENT_SIZE) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Content exceeds maximum size",
      });
    }

    // Validate JSON format
    try {
      JSON.parse(args.content);
    } catch {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Content must be valid JSON (TipTap document format)",
      });
    }

    // ── Validate description ────────────────────────────────────────────
    if (args.description && args.description.length > MAX_BLOCK_DESCRIPTION_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Description must be ${MAX_BLOCK_DESCRIPTION_LENGTH} characters or fewer`,
      });
    }

    // ── Check for circular reference (reusableBlock node referencing itself) ─
    // This is validated on the frontend too, but defense-in-depth:
    // A new block can't reference itself (it doesn't have an ID yet), so
    // circular reference is only a concern on update. No check needed here.

    // ── Insert reusable block ───────────────────────────────────────────
    const now = Date.now();
    const blockId = await ctx.db.insert("reusableBlocks", {
      title,
      content: args.content,
      blockType: args.blockType,
      category: args.category,
      description: args.description,
      isPublished: args.isPublished ?? true,
      isLocked: false,
      usageCount: 0,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return blockId;
  },
});

// ─── Update Reusable Block ──────────────────────────────────────────────────

/**
 * Update an existing reusable block.
 *
 * Changes propagate to all posts referencing this block since they resolve
 * by ID at render time. Only Administrators and Editors can update.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateReusableBlock = mutation({
  args: updateReusableBlockArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.update");

    // ── Fetch existing block ────────────────────────────────────────────
    const block = await ctx.db.get("reusableBlocks", args.blockId);
    if (!block) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Reusable block not found",
      });
    }

    // ── Check if locked ─────────────────────────────────────────────────
    if (block.isLocked) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "This reusable block is locked and cannot be edited",
      });
    }

    // ── Build patch ─────────────────────────────────────────────────────
    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };

    // Title
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Title cannot be empty",
        });
      }
      if (title.length > MAX_BLOCK_TITLE_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Title must be ${MAX_BLOCK_TITLE_LENGTH} characters or fewer`,
        });
      }
      patch.title = title;
    }

    // Content
    if (args.content !== undefined) {
      if (!args.content.trim()) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Content cannot be empty",
        });
      }
      if (args.content.length > MAX_BLOCK_CONTENT_SIZE) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Content exceeds maximum size",
        });
      }

      // Validate JSON format
      try {
        JSON.parse(args.content);
      } catch {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Content must be valid JSON (TipTap document format)",
        });
      }

      // ── Check for circular reference ────────────────────────────────
      // Ensure the content doesn't contain a reusableBlock node referencing
      // this block's own ID (would cause infinite recursion at render time)
      try {
        const doc = JSON.parse(args.content);
        if (containsSelfReference(doc, args.blockId)) {
          throw new ConvexError({
            code: "VALIDATION_ERROR",
            message: "A reusable block cannot contain a reference to itself (circular reference)",
          });
        }
      } catch (e: unknown) {
        // Re-throw ConvexErrors, ignore JSON parse errors (already validated above)
        if (e instanceof ConvexError) throw e;
      }

      patch.content = args.content;
    }

    // Description
    if (args.description !== undefined) {
      if (args.description.length > MAX_BLOCK_DESCRIPTION_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Description must be ${MAX_BLOCK_DESCRIPTION_LENGTH} characters or fewer`,
        });
      }
      patch.description = args.description;
    }

    // Optional fields
    if (args.blockType !== undefined) {
      patch.blockType = args.blockType;
    }
    if (args.category !== undefined) {
      patch.category = args.category;
    }
    if (args.isPublished !== undefined) {
      patch.isPublished = args.isPublished;
    }
    if (args.isLocked !== undefined) {
      patch.isLocked = args.isLocked;
    }

    // ── Apply patch ─────────────────────────────────────────────────────
    await ctx.db.patch("reusableBlocks", args.blockId, patch);

    return args.blockId;
  },
});

// ─── Delete Reusable Block ──────────────────────────────────────────────────

/**
 * Delete a reusable block.
 *
 * When deleted, all posts referencing this block will have a broken reference.
 * The ReusableBlock node in the editor should gracefully render a "Block not found"
 * placeholder when it cannot resolve its blockId.
 *
 * Only Administrators and Editors can delete reusable blocks.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deleteReusableBlock = mutation({
  args: deleteReusableBlockArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.delete");

    const block = await ctx.db.get("reusableBlocks", args.blockId);
    if (!block) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Reusable block not found",
      });
    }

    // ── Check if locked ─────────────────────────────────────────────────
    if (block.isLocked) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "This reusable block is locked and cannot be deleted",
      });
    }

    // ── Delete the block ────────────────────────────────────────────────
    await ctx.db.delete("reusableBlocks", args.blockId);

    return { success: true };
  },
});

// ─── Duplicate Reusable Block ───────────────────────────────────────────────

/**
 * Clone a reusable block as a new block.
 *
 * Creates a copy with "(Copy)" appended to the title.
 * The new block starts with usageCount 0 and is published.
 *
 * @returns The new reusable block document ID
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const duplicateReusableBlock = mutation({
  args: duplicateReusableBlockArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.create");

    const sourceBlock = await ctx.db.get("reusableBlocks", args.blockId);
    if (!sourceBlock) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Source reusable block not found",
      });
    }

    const now = Date.now();
    const newTitle = `${sourceBlock.title} (Copy)`;

    const newBlockId = await ctx.db.insert("reusableBlocks", {
      title: newTitle,
      content: sourceBlock.content,
      blockType: sourceBlock.blockType,
      category: sourceBlock.category,
      description: sourceBlock.description,
      isPublished: true,
      isLocked: false,
      usageCount: 0,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return newBlockId;
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// EDIT LOCK MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Acquire Lock ───────────────────────────────────────────────────────────

/**
 * Acquire an edit lock on a post.
 *
 * If the post is already locked by another user and the lock hasn't expired,
 * the lock acquisition fails and returns the current lock holder's info.
 *
 * If the post is locked by the current user, the lock is renewed.
 * If the post is locked by another user but the lock has expired, the old
 * lock is replaced.
 *
 * @returns { acquired: true } or { acquired: false, lockedBy: { userId, displayName, lockedAt } }
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const acquireLock = mutation({
  args: acquireLockArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // Verify the post exists
    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    const now = Date.now();
    const expiresAt = now + LOCK_DURATION_MS;

    // Check for existing lock
    const existingLock = await ctx.db
      .query("editorLocks")
      .withIndex("by_postId", (q: ConvexQueryBuilder) => q.eq("postId", args.postId))
      .first();

    if (existingLock) {
      // If locked by the current user, renew
      if (existingLock.userId === user._id) {
        await ctx.db.patch("editorLocks", existingLock._id, {
          expiresAt,
        });
        return { acquired: true };
      }

      // If locked by another user and not expired, reject
      if (existingLock.expiresAt > now) {
        return {
          acquired: false,
          lockedBy: {
            userId: existingLock.userId,
            displayName: existingLock.userDisplayName,
            lockedAt: existingLock.lockedAt,
          },
        };
      }

      // Lock has expired - replace it
      await ctx.db.delete("editorLocks", existingLock._id);
    }

    // Create new lock
    const displayName = user.displayName ?? user.firstName ?? user.email;
    await ctx.db.insert("editorLocks", {
      postId: args.postId,
      userId: user._id,
      userDisplayName: displayName,
      lockedAt: now,
      expiresAt,
    });

    return { acquired: true };
  },
});

// ─── Release Lock ───────────────────────────────────────────────────────────

/**
 * Release an edit lock on a post.
 *
 * Called when a user navigates away from the editor.
 * Only the lock holder can release their own lock.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const releaseLock = mutation({
  args: releaseLockArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const existingLock = await ctx.db
      .query("editorLocks")
      .withIndex("by_postId", (q: ConvexQueryBuilder) => q.eq("postId", args.postId))
      .first();

    if (!existingLock) {
      // No lock to release - idempotent
      return { released: true };
    }

    // Only the lock holder can release their own lock
    if (existingLock.userId !== user._id) {
      // Don't throw - just return false. The other user's lock is not our concern.
      return { released: false, reason: "Lock held by another user" };
    }

    await ctx.db.delete("editorLocks", existingLock._id);
    return { released: true };
  },
});

// ─── Renew Lock ─────────────────────────────────────────────────────────────

/**
 * Renew (heartbeat) an edit lock on a post.
 *
 * Called every 30 seconds by the editor UI to keep the lock alive.
 * Extends the lock expiry by 2 minutes from now.
 *
 * If the lock has been stolen (expired and another user acquired it),
 * this returns { renewed: false } and the editor UI should show a
 * warning that another user has taken over editing.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const renewLock = mutation({
  args: renewLockArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const existingLock = await ctx.db
      .query("editorLocks")
      .withIndex("by_postId", (q: ConvexQueryBuilder) => q.eq("postId", args.postId))
      .first();

    if (!existingLock) {
      // Lock was released or expired and cleaned up
      return { renewed: false, reason: "No lock found" };
    }

    if (existingLock.userId !== user._id) {
      // Another user has acquired the lock
      return {
        renewed: false,
        reason: "Lock held by another user",
        lockedBy: {
          userId: existingLock.userId,
          displayName: existingLock.userDisplayName,
        },
      };
    }

    // Renew the lock
    const now = Date.now();
    await ctx.db.patch("editorLocks", existingLock._id, {
      expiresAt: now + LOCK_DURATION_MS,
    });

    return { renewed: true };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recursively check if a TipTap document contains a reusableBlock node
 * referencing the given blockId (circular reference detection).
 */
interface TipTapNode {
  type?: string;
  attrs?: {
    id?: string;
    blockId?: string;
  };
  content?: TipTapNode[];
}

function containsSelfReference(node: TipTapNode, blockId: string): boolean {
  if (!node || typeof node !== "object") return false;

  // Check if this node is a reusableBlock referencing the given ID
  if (node.type === "reusableBlock" && node.attrs?.blockId === blockId) {
    return true;
  }

  // Recurse into content array
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (containsSelfReference(child, blockId)) {
        return true;
      }
    }
  }

  return false;
}
