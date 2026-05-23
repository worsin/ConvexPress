/**
 * Post System - Shared Argument Validators
 *
 * Reusable Convex argument validators for post mutations and queries.
 * Centralizes validation logic so mutations and queries stay clean.
 *
 * Convention: each exported object is an args shape (Record<string, Validator>)
 * ready to spread into a Convex function's `args` field.
 */

import { v } from "convex/values";
import {
  postStatusValidator,
  postVisibilityValidator,
  commentStatusValidator,
  postTypeValidator,
} from "../schema/posts";
import {
  blocksValidator,
  contentModeValidator,
} from "../blocks/validators";

// ─── Re-exports for convenience ──────────────────────────────────────────────

export {
  postStatusValidator,
  postVisibilityValidator,
  commentStatusValidator,
  postTypeValidator,
};

// ─── Structured Content Validators ─────────────────────────────────────────

export const heroValidator = v.optional(v.object({
  title: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  content: v.optional(v.string()),
  imageId: v.optional(v.id("media")),
  videoUrl: v.optional(v.string()),
  ctaText: v.optional(v.string()),
  ctaUrl: v.optional(v.string()),
}));

export const topicValidator = v.object({
  title: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  content: v.optional(v.string()),
  imageId: v.optional(v.id("media")),
  videoUrl: v.optional(v.string()),
});

export const topicsValidator = v.optional(v.array(topicValidator));

export const summaryValidator = v.optional(v.object({
  title: v.optional(v.string()),
  content: v.optional(v.string()),
}));

/** Maximum number of topic sections per post/page. */
export const MAX_TOPICS = 5;

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum title length in characters. */
export const MAX_TITLE_LENGTH = 500;

/** Maximum excerpt length in characters. */
export const MAX_EXCERPT_LENGTH = 1000;

/** Maximum slug length in characters. */
export const MAX_SLUG_LENGTH = 200;

/** Default items per page for admin listings. */
export const DEFAULT_PER_PAGE_ADMIN = 20;

/** Default items per page for website listings. */
export const DEFAULT_PER_PAGE_WEBSITE = 10;

/** Maximum items per page. */
export const MAX_PER_PAGE = 100;

/** Maximum bulk operation size. */
export const MAX_BULK_SIZE = 100;

/** Trash auto-purge after 30 days (in milliseconds). */
export const TRASH_PURGE_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Mutation Args ──────────────────────────────────────────────────────────

/**
 * Arguments for creating a new post.
 *
 * Status defaults to "auto-draft" if not specified.
 * The slug is auto-generated from the title.
 */
export const createPostArgs = {
  title: v.optional(v.string()),
  content: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  status: v.optional(postStatusValidator),
  visibility: v.optional(postVisibilityValidator),
  password: v.optional(v.string()),
  commentStatus: v.optional(commentStatusValidator),
  featuredImageId: v.optional(v.id("media")),
  isSticky: v.optional(v.boolean()),
  scheduledAt: v.optional(v.number()),
  layoutId: v.optional(v.string()),
  hideHeader: v.optional(v.boolean()),
  hideFooter: v.optional(v.boolean()),
  // Taxonomy IDs - passed to Taxonomy System after creation
  categoryIds: v.optional(v.array(v.id("terms"))),
  tagIds: v.optional(v.array(v.id("terms"))),
  // Structured content fields
  hero: heroValidator,
  topics: topicsValidator,
  summary: summaryValidator,
  sources: v.optional(v.string()),
  tableOfContents: v.optional(v.string()),
  pagePrompt: v.optional(v.string()),
  // Composition block fields (posts default to article mode, but can opt in)
  contentMode: v.optional(contentModeValidator),
  blocks: v.optional(blocksValidator),
  blocksVersion: v.optional(v.number()),
  blocksRevision: v.optional(v.number()),
};

/**
 * Arguments for updating an existing post.
 *
 * All fields except postId are optional - only provided fields are updated.
 */
export const updatePostArgs = {
  postId: v.id("posts"),
  title: v.optional(v.string()),
  content: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  status: v.optional(postStatusValidator),
  visibility: v.optional(postVisibilityValidator),
  password: v.optional(v.string()),
  commentStatus: v.optional(commentStatusValidator),
  featuredImageId: v.optional(v.id("media")),
  isSticky: v.optional(v.boolean()),
  slug: v.optional(v.string()),
  menuOrder: v.optional(v.number()),
  authorId: v.optional(v.id("users")),
  scheduledAt: v.optional(v.number()),
  layoutId: v.optional(v.string()),
  hideHeader: v.optional(v.boolean()),
  hideFooter: v.optional(v.boolean()),
  // Taxonomy IDs - update category/tag assignments
  categoryIds: v.optional(v.array(v.id("terms"))),
  tagIds: v.optional(v.array(v.id("terms"))),
  // Structured content fields
  hero: heroValidator,
  topics: topicsValidator,
  summary: summaryValidator,
  sources: v.optional(v.string()),
  tableOfContents: v.optional(v.string()),
  pagePrompt: v.optional(v.string()),
  // Composition block fields (posts default to article mode, but can opt in)
  contentMode: v.optional(contentModeValidator),
  blocks: v.optional(blocksValidator),
  blocksVersion: v.optional(v.number()),
  blocksRevision: v.optional(v.number()),
};

/**
 * Arguments for publishing a post.
 */
export const publishPostArgs = {
  postId: v.id("posts"),
};

/**
 * Arguments for unpublishing a post (revert to draft or pending).
 */
export const unpublishPostArgs = {
  postId: v.id("posts"),
  targetStatus: v.optional(
    v.union(v.literal("draft"), v.literal("pending")),
  ),
};

/**
 * Arguments for trashing a post.
 */
export const trashPostArgs = {
  postId: v.id("posts"),
};

/**
 * Arguments for restoring a post from trash.
 */
export const restorePostArgs = {
  postId: v.id("posts"),
};

/**
 * Arguments for permanently deleting a post.
 */
export const deletePostArgs = {
  postId: v.id("posts"),
  force: v.optional(v.boolean()),
};

/**
 * Arguments for duplicating a post.
 */
export const duplicatePostArgs = {
  postId: v.id("posts"),
};

/**
 * Arguments for scheduling a post for future publication.
 */
export const schedulePostArgs = {
  postId: v.id("posts"),
  scheduledAt: v.number(),
};

/**
 * Arguments for autosaving post content.
 */
export const autosavePostArgs = {
  postId: v.id("posts"),
  title: v.optional(v.string()),
  content: v.optional(v.string()),
};

/**
 * Arguments for bulk trash operation.
 */
export const bulkTrashArgs = {
  postIds: v.array(v.id("posts")),
};

/**
 * Arguments for bulk restore operation.
 */
export const bulkRestoreArgs = {
  postIds: v.array(v.id("posts")),
};

/**
 * Arguments for bulk delete operation.
 */
export const bulkDeleteArgs = {
  postIds: v.array(v.id("posts")),
};

/**
 * Arguments for bulk publish operation.
 */
export const bulkPublishArgs = {
  postIds: v.array(v.id("posts")),
};

// ─── Query Args ─────────────────────────────────────────────────────────────

/**
 * Arguments for listing posts with filters and pagination.
 *
 * Supports the admin "All Posts" list table as well as the website blog index.
 */
export const listPostsArgs = {
  type: v.optional(postTypeValidator),
  status: v.optional(postStatusValidator),
  authorId: v.optional(v.id("users")),
  search: v.optional(v.string()),
  // Date range filters (timestamp ms)
  dateFrom: v.optional(v.number()),
  dateTo: v.optional(v.number()),
  // Taxonomy filters
  categoryId: v.optional(v.id("terms")),
  tagId: v.optional(v.id("terms")),
  // Sticky filter
  isSticky: v.optional(v.boolean()),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
  orderBy: v.optional(
    v.union(
      v.literal("publishedAt"),
      v.literal("updatedAt"),
      v.literal("title"),
      v.literal("createdAt"),
      v.literal("commentCount"),
    ),
  ),
  orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
};

/**
 * Arguments for getting a single post.
 */
export const getPostArgs = {
  postId: v.optional(v.id("posts")),
  slug: v.optional(v.string()),
  type: v.optional(postTypeValidator),
};

/**
 * Arguments for counts query.
 */
export const countsArgs = {
  type: v.optional(postTypeValidator),
};

// ─── PostMeta Args ──────────────────────────────────────────────────────────

/**
 * Arguments for setting a meta value (upsert).
 */
export const setMetaArgs = {
  postId: v.id("posts"),
  key: v.string(),
  value: v.string(),
};

/**
 * Arguments for deleting a meta value.
 */
export const deleteMetaArgs = {
  postId: v.id("posts"),
  key: v.string(),
};

/**
 * Arguments for bulk setting meta values.
 */
export const bulkSetMetaArgs = {
  postId: v.id("posts"),
  meta: v.array(
    v.object({
      key: v.string(),
      value: v.string(),
    }),
  ),
};

/**
 * Arguments for getting all meta for a post.
 */
export const getMetaByPostArgs = {
  postId: v.id("posts"),
};

/**
 * Arguments for getting a specific meta value.
 */
export const getMetaByKeyArgs = {
  postId: v.id("posts"),
  key: v.string(),
};
