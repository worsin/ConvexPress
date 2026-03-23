/**
 * Content Editor System - Queries
 *
 * All read operations for the Content Editor backend:
 *   listReusableBlocks - List reusable blocks with filters and search
 *   getReusableBlock   - Get a single reusable block by ID
 *   getLock            - Check if a post is currently locked and by whom
 *   getMyLocks         - Get all locks held by the current user
 *
 * Authorization:
 *   - All queries require authentication (editor features are behind auth)
 *   - Reusable block listing shows all published blocks to any authenticated user
 *     (Authors and Contributors can insert them, even if they can't create new ones)
 *   - Lock queries are available to any authenticated user
 */

import { ConvexError } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { getCurrentUser } from "../helpers/permissions";
import {
  listReusableBlocksArgs,
  getReusableBlockArgs,
  getLockArgs,
} from "./validators";

// ─── List Reusable Blocks ───────────────────────────────────────────────────

/**
 * List reusable blocks with optional filters.
 *
 * Used by:
 *   - Block inserter panel "Reusable" category (publishedOnly=true)
 *   - Admin reusable blocks management page (publishedOnly=false)
 *
 * Returns all matching blocks sorted by title ascending.
 * Not paginated (expected to be a small set, typically < 100 blocks).
 *
 * Real-time: Convex subscription updates the inserter when blocks
 * are created, updated, or deleted.
 */
export const listReusableBlocks = query({
  args: listReusableBlocksArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // ── Search query ────────────────────────────────────────────────────
    if (args.search && args.search.trim()) {
      const searchResults = await ctx.db
        .query("reusableBlocks")
        .withSearchIndex("search_reusableBlocks", (q) => {
          let sq = q.search("title", args.search!);
          if (args.publishedOnly !== false) {
            sq = sq.eq("isPublished", true);
          }
          if (args.createdBy) {
            sq = sq.eq("createdBy", args.createdBy);
          }
          return sq;
        })
        .collect();

      // Denormalize creator info
      const blocksWithCreators = await denormalizeCreators(ctx, searchResults);
      return blocksWithCreators;
    }

    // ── Index-based query ───────────────────────────────────────────────
    let allBlocks;

    if (args.publishedOnly !== false) {
      // Default: only published blocks (for the block inserter)
      allBlocks = await ctx.db
        .query("reusableBlocks")
        .withIndex("by_published", (q) => q.eq("isPublished", true))
        .collect();
    } else if (args.createdBy) {
      // Filter by creator
      allBlocks = await ctx.db
        .query("reusableBlocks")
        .withIndex("by_createdBy", (q) => q.eq("createdBy", args.createdBy!))
        .collect();
    } else if (args.blockType) {
      // Filter by block type
      allBlocks = await ctx.db
        .query("reusableBlocks")
        .withIndex("by_blockType", (q) => q.eq("blockType", args.blockType!))
        .collect();
    } else {
      // All blocks (admin listing)
      allBlocks = await ctx.db
        .query("reusableBlocks")
        .collect();
    }

    // Apply additional filters that weren't handled by index
    let filtered = allBlocks;

    if (args.createdBy && args.publishedOnly !== false) {
      // If we queried by published index but also need to filter by creator
      filtered = filtered.filter(
        (b) => b.createdBy.toString() === args.createdBy!.toString(),
      );
    }

    if (args.blockType && !args.createdBy && args.publishedOnly === false) {
      // If we got all blocks but need to filter by blockType
      filtered = filtered.filter((b) => b.blockType === args.blockType);
    }

    // Sort by title ascending (alphabetical)
    filtered.sort((a, b) => a.title.localeCompare(b.title));

    // Denormalize creator info
    const blocksWithCreators = await denormalizeCreators(ctx, filtered);
    return blocksWithCreators;
  },
});

// ─── Get Single Reusable Block ──────────────────────────────────────────────

/**
 * Get a single reusable block by ID.
 *
 * Used by:
 *   - The ReusableBlock TipTap node extension to resolve content for rendering
 *   - The reusable block edit screen (admin)
 *
 * Returns null if not found.
 */
export const getReusableBlock = query({
  args: getReusableBlockArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const block = await ctx.db.get("reusableBlocks", args.blockId);
    if (!block) return null;

    // Denormalize creator info
    const creator = await ctx.db.get("users", block.createdBy);
    return {
      ...block,
      creator: creator
        ? {
            _id: creator._id,
            displayName: creator.displayName ?? creator.email,
            email: creator.email,
          }
        : null,
    };
  },
});

// ─── Get Lock ───────────────────────────────────────────────────────────────

/**
 * Check if a post is currently locked and by whom.
 *
 * Used by the editor UI to show "This post is being edited by {user}"
 * warning when opening a post that has an active lock.
 *
 * Returns null if the post is not locked (or lock has expired).
 * Expired locks are returned as null (the cleanup cron will delete them).
 */
export const getLock = query({
  args: getLockArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const lock = await ctx.db
      .query("editorLocks")
      .withIndex("by_postId", (q) => q.eq("postId", args.postId))
      .first();

    if (!lock) return null;

    // Check if expired
    const now = Date.now();
    if (lock.expiresAt <= now) {
      // Lock has expired but hasn't been cleaned up yet
      return null;
    }

    return {
      postId: lock.postId,
      userId: lock.userId,
      userDisplayName: lock.userDisplayName,
      lockedAt: lock.lockedAt,
      expiresAt: lock.expiresAt,
      isCurrentUser: lock.userId === user._id,
    };
  },
});

// ─── Get My Locks ───────────────────────────────────────────────────────────

/**
 * Get all locks held by the current user.
 *
 * Used for cleanup on page unload (beforeunload event) to release
 * any locks the user holds before navigating away.
 *
 * Returns only non-expired locks.
 */
export const getMyLocks = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const locks = await ctx.db
      .query("editorLocks")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const now = Date.now();

    // Filter out expired locks
    return locks
      .filter((lock) => lock.expiresAt > now)
      .map((lock) => ({
        postId: lock.postId,
        lockedAt: lock.lockedAt,
        expiresAt: lock.expiresAt,
      }));
  },
});

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Denormalize creator information for a list of reusable blocks.
 * Fetches user records and attaches basic creator info.
 */
async function denormalizeCreators(
  ctx: QueryCtx,
  blocks: Doc<"reusableBlocks">[],
) {
  return Promise.all(
    blocks.map(async (block) => {
      const creator = await ctx.db.get("users", block.createdBy);
      return {
        ...block,
        creator: creator
          ? {
              _id: creator._id,
              displayName: creator.displayName ?? creator.email,
              email: creator.email,
            }
          : null,
      };
    }),
  );
}
