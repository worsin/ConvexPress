/**
 * Page System - Shared Argument Validators
 *
 * Reusable Convex argument validators for page mutations and queries.
 * Centralizes validation logic so mutations and queries stay clean.
 *
 * Pages share the `posts` table with blog posts, discriminated by `type: "page"`.
 * All page validators reference the `posts` table via `v.id("posts")`.
 *
 * Convention: each exported object is an args shape (Record<string, Validator>)
 * ready to spread into a Convex function's `args` field.
 */

import { v } from "convex/values";
import {
  heroValidator,
  topicsValidator,
  summaryValidator,
} from "../posts/validators";
import {
  blocksValidator,
  contentModeValidator,
} from "../blocks/validators";

// ─── Shared Validators ───────────────────────────────────────────────────────

/**
 * Valid page statuses.
 * Same statuses as posts: auto-draft, draft, pending, publish, private, trash, future.
 * "auto-draft" is for auto-saved drafts that have never been manually saved.
 */
export const pageStatusValidator = v.union(
  v.literal("auto-draft"),
  v.literal("draft"),
  v.literal("pending"),
  v.literal("publish"),
  v.literal("private"),
  v.literal("trash"),
  v.literal("future"),
);

/**
 * Valid page visibility options.
 */
export const pageVisibilityValidator = v.union(
  v.literal("public"),
  v.literal("private"),
  v.literal("password"),
);

/**
 * Known page template identifiers.
 * These match the templates defined in the frontend PAGE_TEMPLATES config.
 * Additional templates can be added without schema changes since
 * the field is stored as a plain string.
 */
export const pageTemplateValidator = v.union(
  v.literal("default"),
  v.literal("full-width"),
  v.literal("sidebar-left"),
  v.literal("sidebar-right"),
  v.literal("no-sidebar"),
  v.literal("landing"),
  v.literal("blank"),
);

/**
 * Valid comment status values for pages.
 */
export const commentStatusValidator = v.union(
  v.literal("open"),
  v.literal("closed"),
);

// ─── Mutation Args ──────────────────────────────────────────────────────────

/**
 * Arguments for creating a new page.
 *
 * Only `title` is required. All other fields have sensible defaults:
 *   - status defaults to "draft"
 *   - visibility defaults to "public"
 *   - menuOrder defaults to 0
 *   - pageTemplate defaults to "default"
 *   - parentId defaults to undefined (top-level page)
 */
export const createPageArgs = {
  title: v.string(),
  content: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  status: v.optional(v.union(
    v.literal("auto-draft"),
    v.literal("draft"),
    v.literal("pending"),
    v.literal("publish"),
    v.literal("private"),
    v.literal("future"),
  )),
  parentId: v.optional(v.id("posts")),
  menuOrder: v.optional(v.number()),
  pageTemplate: v.optional(v.string()),
  featuredImageId: v.optional(v.id("media")),
  commentStatus: v.optional(commentStatusValidator),
  visibility: v.optional(pageVisibilityValidator),
  password: v.optional(v.string()),
  slug: v.optional(v.string()),
  publishedAt: v.optional(v.number()),
  scheduledAt: v.optional(v.number()),
  layoutId: v.optional(v.string()),
  hideHeader: v.optional(v.boolean()),
  hideFooter: v.optional(v.boolean()),
  // Structured content fields
  hero: heroValidator,
  topics: topicsValidator,
  summary: summaryValidator,
  sources: v.optional(v.string()),
  tableOfContents: v.optional(v.string()),
  pagePrompt: v.optional(v.string()),
  // Composition block fields
  contentMode: v.optional(contentModeValidator),
  blocks: v.optional(blocksValidator),
  blocksVersion: v.optional(v.number()),
  blocksRevision: v.optional(v.number()),
};

// Note: createPageArgs already includes "auto-draft" in the status union.
// The create mutation must allow empty titles when status is "auto-draft".

/**
 * Arguments for updating an existing page.
 *
 * All fields except pageId are optional -- only provided fields are updated.
 * The mutation handler builds a partial patch object from provided fields.
 */
export const updatePageArgs = {
  pageId: v.id("posts"),
  title: v.optional(v.string()),
  content: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  status: v.optional(v.union(
    v.literal("auto-draft"),
    v.literal("draft"),
    v.literal("pending"),
    v.literal("publish"),
    v.literal("private"),
    v.literal("trash"),
    v.literal("future"),
  )),
  parentId: v.optional(v.union(v.id("posts"), v.null())),
  menuOrder: v.optional(v.number()),
  pageTemplate: v.optional(v.string()),
  featuredImageId: v.optional(v.id("media")),
  commentStatus: v.optional(commentStatusValidator),
  visibility: v.optional(pageVisibilityValidator),
  password: v.optional(v.string()),
  slug: v.optional(v.string()),
  scheduledAt: v.optional(v.number()),
  layoutId: v.optional(v.string()),
  hideHeader: v.optional(v.boolean()),
  hideFooter: v.optional(v.boolean()),
  // Structured content fields
  hero: heroValidator,
  topics: topicsValidator,
  summary: summaryValidator,
  sources: v.optional(v.string()),
  tableOfContents: v.optional(v.string()),
  pagePrompt: v.optional(v.string()),
  // Composition block fields
  contentMode: v.optional(contentModeValidator),
  blocks: v.optional(blocksValidator),
  blocksVersion: v.optional(v.number()),
  blocksRevision: v.optional(v.number()),
};

/**
 * Arguments for trashing a page (soft delete).
 */
export const trashPageArgs = {
  pageId: v.id("posts"),
};

/**
 * Arguments for restoring a page from trash.
 */
export const restorePageArgs = {
  pageId: v.id("posts"),
};

/**
 * Arguments for permanently deleting a page.
 * The page must already be in trash status.
 */
export const deletePageArgs = {
  pageId: v.id("posts"),
};

/**
 * Arguments for publishing a page.
 */
export const publishPageArgs = {
  pageId: v.id("posts"),
};

/**
 * Arguments for listing pages with filters and pagination.
 *
 * Supports the admin "All Pages" list table with status tabs,
 * search bar, parent filtering, template filtering, sorting, and pagination.
 */
export const listPagesArgs = {
  status: v.optional(v.union(
    v.literal("auto-draft"),
    v.literal("draft"),
    v.literal("pending"),
    v.literal("publish"),
    v.literal("private"),
    v.literal("trash"),
    v.literal("future"),
  )),
  parentId: v.optional(v.id("posts")),
  search: v.optional(v.string()),
  pageTemplate: v.optional(v.string()),
  authorId: v.optional(v.string()),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
  orderBy: v.optional(v.union(
    v.literal("title"),
    v.literal("date"),
    v.literal("menuOrder"),
    v.literal("author"),
  )),
  orderDir: v.optional(v.union(
    v.literal("asc"),
    v.literal("desc"),
  )),
};

/**
 * Arguments for getting a single page.
 * Supports lookup by ID, slug, or path.
 */
export const getPageArgs = {
  pageId: v.optional(v.id("posts")),
  slug: v.optional(v.string()),
  path: v.optional(v.string()),
};

/**
 * Arguments for getting the hierarchical page tree.
 * Optional status filter (admin sees all, website sees published only).
 */
export const getPageTreeArgs = {
  status: v.optional(v.union(
    v.literal("publish"),
    v.literal("all"),
  )),
};

/**
 * Arguments for batch reordering pages.
 * Each item specifies a page ID and its new menuOrder,
 * optionally with a new parentId for drag-and-drop reparenting.
 */
export const reorderPagesArgs = {
  items: v.array(v.object({
    pageId: v.id("posts"),
    menuOrder: v.number(),
    parentId: v.optional(v.id("posts")),
  })),
};

/**
 * Arguments for setting a page's parent (reparenting).
 * Pass parentId as undefined to make a page top-level.
 */
export const setPageParentArgs = {
  pageId: v.id("posts"),
  parentId: v.optional(v.id("posts")),
};

/**
 * Arguments for getting children of a specific page.
 */
export const getChildrenArgs = {
  pageId: v.id("posts"),
  status: v.optional(v.union(
    v.literal("publish"),
    v.literal("all"),
  )),
};

/**
 * Arguments for getting breadcrumbs for a page.
 */
export const getBreadcrumbsArgs = {
  pageId: v.id("posts"),
};

/**
 * Arguments for getting a page by its URL path (website routing).
 */
export const getPageByPathArgs = {
  path: v.string(),
};
