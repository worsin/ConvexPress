/**
 * Content Editor System - Shared Argument Validators
 *
 * Reusable Convex argument validators for editor mutations and queries.
 * Centralizes validation logic so mutations and queries stay clean.
 *
 * Convention: each exported object is an args shape (Record<string, Validator>)
 * ready to spread into a Convex function's `args` field.
 */

import { v } from "convex/values";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum reusable block title length in characters. */
export const MAX_BLOCK_TITLE_LENGTH = 200;

/** Maximum reusable block description length in characters. */
export const MAX_BLOCK_DESCRIPTION_LENGTH = 500;

/** Lock duration in milliseconds (2 minutes). */
export const LOCK_DURATION_MS = 2 * 60 * 1000;

/** Lock renewal interval in milliseconds (30 seconds) - for reference. */
export const LOCK_RENEWAL_INTERVAL_MS = 30 * 1000;

/** Maximum content size for reusable blocks (1MB in characters). */
export const MAX_BLOCK_CONTENT_SIZE = 1_000_000;

// ─── Reusable Block Mutation Args ───────────────────────────────────────────

/**
 * Arguments for creating a new reusable block.
 */
export const createReusableBlockArgs = {
  title: v.string(),
  content: v.string(),
  blockType: v.optional(v.string()),
  category: v.optional(v.string()),
  description: v.optional(v.string()),
  isPublished: v.optional(v.boolean()),
};

/**
 * Arguments for updating an existing reusable block.
 *
 * All fields except blockId are optional - only provided fields are updated.
 */
export const updateReusableBlockArgs = {
  blockId: v.id("reusableBlocks"),
  title: v.optional(v.string()),
  content: v.optional(v.string()),
  blockType: v.optional(v.string()),
  category: v.optional(v.string()),
  description: v.optional(v.string()),
  isPublished: v.optional(v.boolean()),
  isLocked: v.optional(v.boolean()),
};

/**
 * Arguments for deleting a reusable block.
 */
export const deleteReusableBlockArgs = {
  blockId: v.id("reusableBlocks"),
};

/**
 * Arguments for duplicating a reusable block.
 */
export const duplicateReusableBlockArgs = {
  blockId: v.id("reusableBlocks"),
};

// ─── Edit Lock Mutation Args ────────────────────────────────────────────────

/**
 * Arguments for acquiring an edit lock on a post.
 */
export const acquireLockArgs = {
  postId: v.id("posts"),
};

/**
 * Arguments for releasing an edit lock on a post.
 */
export const releaseLockArgs = {
  postId: v.id("posts"),
};

/**
 * Arguments for renewing an edit lock (heartbeat).
 */
export const renewLockArgs = {
  postId: v.id("posts"),
};

// ─── Reusable Block Query Args ──────────────────────────────────────────────

/**
 * Arguments for listing reusable blocks.
 *
 * Supports filtering by published status, author, and search.
 */
export const listReusableBlocksArgs = {
  publishedOnly: v.optional(v.boolean()),
  createdBy: v.optional(v.id("users")),
  search: v.optional(v.string()),
  blockType: v.optional(v.string()),
};

/**
 * Arguments for getting a single reusable block.
 */
export const getReusableBlockArgs = {
  blockId: v.id("reusableBlocks"),
};

// ─── Edit Lock Query Args ───────────────────────────────────────────────────

/**
 * Arguments for checking if a post is locked.
 */
export const getLockArgs = {
  postId: v.id("posts"),
};

// ─── Internal Function Args ─────────────────────────────────────────────────

/**
 * Arguments for incrementing usage count on a reusable block.
 */
export const incrementUsageCountArgs = {
  blockId: v.id("reusableBlocks"),
  delta: v.number(), // +1 when inserted, -1 when removed
};
