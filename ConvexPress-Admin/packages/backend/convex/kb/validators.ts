/**
 * Knowledge Base System - Shared Argument Validators
 *
 * Reusable Convex argument validators for KB mutations and queries.
 * Centralizes validation logic so mutations and queries stay clean.
 */

import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  kbArticleStatusValidator,
  kbRelationTypeValidator,
  kbCollectionTypeValidator,
  kbTemplateCategoryValidator,
  kbWorkflowStepTypeValidator,
  kbArticleWorkflowStatusValidator,
  kbCommentVoteTypeValidator,
  kbSearchSourceValidator,
  kbWorkflowStepValidator,
} from "../schema/kb";

// ─── Re-exports for convenience ──────────────────────────────────────────────

export {
  kbArticleStatusValidator,
  kbRelationTypeValidator,
  kbCollectionTypeValidator,
  kbTemplateCategoryValidator,
  kbWorkflowStepTypeValidator,
  kbArticleWorkflowStatusValidator,
  kbCommentVoteTypeValidator,
  kbSearchSourceValidator,
  kbWorkflowStepValidator,
};

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum title length in characters. */
export const MAX_KB_TITLE_LENGTH = 500;

/** Maximum excerpt length in characters. */
export const MAX_KB_EXCERPT_LENGTH = 1000;

/** Maximum slug length in characters. */
export const MAX_KB_SLUG_LENGTH = 200;

/** Default items per page for admin listings. */
export const DEFAULT_KB_PER_PAGE_ADMIN = 20;

/** Default items per page for website listings. */
export const DEFAULT_KB_PER_PAGE_WEBSITE = 20;

/** Maximum items per page. */
export const MAX_KB_PER_PAGE = 100;

/** Maximum keywords per article. */
export const MAX_KEYWORDS = 20;

/** Session-based page view deduplication window (30 minutes). */
export const PAGE_VIEW_DEDUP_WINDOW_MS = 30 * 60 * 1000;

// ─── Article Mutation Args ──────────────────────────────────────────────────

export const createArticleArgs = {
  title: v.string(),
  excerpt: v.optional(v.string()),
  content: v.optional(v.string()),
  contentPlainText: v.optional(v.string()),
  categoryId: v.optional(v.id("kb_categories")),
  parentArticleId: v.optional(v.id("kb_articles")),
  metaTitle: v.optional(v.string()),
  metaDescription: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  keywords: v.optional(v.array(v.string())),
  featuredImageId: v.optional(v.id("media")),
  templateId: v.optional(v.id("kb_templates")),
};

export const updateArticleArgs = {
  articleId: v.id("kb_articles"),
  title: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  content: v.optional(v.string()),
  contentPlainText: v.optional(v.string()),
  categoryId: v.optional(v.id("kb_categories")),
  parentArticleId: v.optional(v.id("kb_articles")),
  metaTitle: v.optional(v.string()),
  metaDescription: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  keywords: v.optional(v.array(v.string())),
  featuredImageId: v.optional(v.id("media")),
  sortOrder: v.optional(v.number()),
};

export const publishArticleArgs = {
  articleId: v.id("kb_articles"),
  scheduledAt: v.optional(v.number()),
};

export const unpublishArticleArgs = {
  articleId: v.id("kb_articles"),
};

export const archiveArticleArgs = {
  articleId: v.id("kb_articles"),
};

export const removeArticleArgs = {
  articleId: v.id("kb_articles"),
};

export const toggleFeaturedArgs = {
  articleId: v.id("kb_articles"),
};

export const createVersionArgs = {
  articleId: v.id("kb_articles"),
  changeSummary: v.string(),
};

// ─── Article Query Args ─────────────────────────────────────────────────────

export const listArticlesArgs = {
  paginationOpts: paginationOptsValidator,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  status: v.optional(kbArticleStatusValidator),
  categoryId: v.optional(v.id("kb_categories")),
  authorId: v.optional(v.id("users")),
  search: v.optional(v.string()),
};

/** Convenience alias used directly in the admin list query. */
export const paginatedListArgs = {
  paginationOpts: paginationOptsValidator,
  status: v.optional(kbArticleStatusValidator),
  categoryId: v.optional(v.id("kb_categories")),
  authorId: v.optional(v.id("users")),
  search: v.optional(v.string()),
};

export const getArticleByIdArgs = {
  articleId: v.id("kb_articles"),
};

export const getArticleBySlugArgs = {
  slug: v.string(),
};

export const listPublishedArticlesArgs = {
  paginationOpts: paginationOptsValidator,
  categoryId: v.optional(v.id("kb_categories")),
};

/** Convenience alias used directly in the public listPublished query. */
export const paginatedPublishedArgs = {
  paginationOpts: paginationOptsValidator,
  categoryId: v.optional(v.id("kb_categories")),
};

export const getPopularArticlesArgs = {
  limit: v.optional(v.number()),
};

export const getRecentArticlesArgs = {
  limit: v.optional(v.number()),
};

export const getFeaturedArticlesArgs = {
  limit: v.optional(v.number()),
};

export const getVersionsArgs = {
  articleId: v.id("kb_articles"),
};

// ─── Category Args ──────────────────────────────────────────────────────────

export const createCategoryArgs = {
  name: v.string(),
  description: v.optional(v.string()),
  icon: v.optional(v.string()),
  parentId: v.optional(v.id("kb_categories")),
};

export const updateCategoryArgs = {
  categoryId: v.id("kb_categories"),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  icon: v.optional(v.string()),
  parentId: v.optional(v.id("kb_categories")),
  isPublished: v.optional(v.boolean()),
};

export const reorderCategoryArgs = {
  categoryId: v.id("kb_categories"),
  newOrder: v.number(),
};

export const removeCategoryArgs = {
  categoryId: v.id("kb_categories"),
};

export const getCategoryBySlugArgs = {
  slug: v.string(),
};

// ─── Tag Args ───────────────────────────────────────────────────────────────

export const createTagArgs = {
  name: v.string(),
  description: v.optional(v.string()),
  color: v.optional(v.string()),
};

export const updateTagArgs = {
  tagId: v.id("kb_tags"),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  color: v.optional(v.string()),
};

export const removeTagArgs = {
  tagId: v.id("kb_tags"),
};

export const addTagToArticleArgs = {
  articleId: v.id("kb_articles"),
  tagId: v.id("kb_tags"),
};

export const removeTagFromArticleArgs = {
  articleId: v.id("kb_articles"),
  tagId: v.id("kb_tags"),
};

export const getTagBySlugArgs = {
  slug: v.string(),
};

// ─── Collection Args ────────────────────────────────────────────────────────

export const createCollectionArgs = {
  name: v.string(),
  description: v.optional(v.string()),
  coverImageId: v.optional(v.id("media")),
  type: kbCollectionTypeValidator,
  isPublic: v.optional(v.boolean()),
};

export const updateCollectionArgs = {
  collectionId: v.id("kb_collections"),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  coverImageId: v.optional(v.id("media")),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  type: v.optional(kbCollectionTypeValidator),
  isPublic: v.optional(v.boolean()),
};

export const removeCollectionArgs = {
  collectionId: v.id("kb_collections"),
};

export const addArticleToCollectionArgs = {
  collectionId: v.id("kb_collections"),
  articleId: v.id("kb_articles"),
};

export const removeArticleFromCollectionArgs = {
  collectionId: v.id("kb_collections"),
  articleId: v.id("kb_articles"),
};

export const reorderCollectionArticlesArgs = {
  collectionId: v.id("kb_collections"),
  articleId: v.id("kb_articles"),
  newOrder: v.number(),
};

export const getCollectionByIdArgs = {
  collectionId: v.id("kb_collections"),
};

export const getCollectionBySlugArgs = {
  slug: v.string(),
};

// ─── Template Args ──────────────────────────────────────────────────────────

export const createTemplateArgs = {
  name: v.string(),
  description: v.optional(v.string()),
  content: v.string(),
  category: kbTemplateCategoryValidator,
  isDefault: v.optional(v.boolean()),
};

export const updateTemplateArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  templateId: v.id("kb_templates"),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  content: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  category: v.optional(kbTemplateCategoryValidator),
  isDefault: v.optional(v.boolean()),
  isActive: v.optional(v.boolean()),
};

export const removeTemplateArgs = {
  templateId: v.id("kb_templates"),
};

export const getTemplateByIdArgs = {
  templateId: v.id("kb_templates"),
};

// ─── Comment Args ───────────────────────────────────────────────────────────

export const listCommentsByArticleArgs = {
  articleId: v.id("kb_articles"),
};

export const createCommentArgs = {
  articleId: v.id("kb_articles"),
  parentId: v.optional(v.id("kb_comments")),
  content: v.string(),
};

export const updateCommentArgs = {
  commentId: v.id("kb_comments"),
  content: v.string(),
};

export const deleteCommentArgs = {
  commentId: v.id("kb_comments"),
};

export const voteCommentArgs = {
  commentId: v.id("kb_comments"),
  voteType: kbCommentVoteTypeValidator,
};

export const removeVoteArgs = {
  commentId: v.id("kb_comments"),
};

export const getCommentCountArgs = {
  articleId: v.id("kb_articles"),
};

// ─── Feedback Args ──────────────────────────────────────────────────────────

export const submitHelpfulArgs = {
  articleId: v.id("kb_articles"),
  sessionId: v.string(),
  isHelpful: v.boolean(),
  comment: v.optional(v.string()),
};

export const submitRatingArgs = {
  articleId: v.id("kb_articles"),
  sessionId: v.string(),
  rating: v.number(),
  comment: v.optional(v.string()),
};

export const getArticleFeedbackStatsArgs = {
  articleId: v.id("kb_articles"),
};

export const getUserFeedbackArgs = {
  articleId: v.id("kb_articles"),
  sessionId: v.string(),
};

// ─── Bookmark Args ──────────────────────────────────────────────────────────

export const toggleBookmarkArgs = {
  articleId: v.id("kb_articles"),
  notes: v.optional(v.string()),
};

export const isBookmarkedArgs = {
  articleId: v.id("kb_articles"),
};

// ─── Progress Args ──────────────────────────────────────────────────────────

export const getProgressArgs = {
  articleId: v.id("kb_articles"),
};

export const trackProgressArgs = {
  articleId: v.id("kb_articles"),
  progressPercent: v.number(),
  scrollPosition: v.number(),
  readTime: v.number(),
  completedRead: v.optional(v.boolean()),
};

// ─── Workflow Args ──────────────────────────────────────────────────────────

export const createWorkflowArgs = {
  name: v.string(),
  description: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  steps: v.array(kbWorkflowStepValidator),
  isDefault: v.optional(v.boolean()),
};

export const updateWorkflowArgs = {
  workflowId: v.id("kb_workflows"),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  steps: v.optional(v.array(kbWorkflowStepValidator)),
  isDefault: v.optional(v.boolean()),
  isActive: v.optional(v.boolean()),
};

export const removeWorkflowArgs = {
  workflowId: v.id("kb_workflows"),
};

export const startWorkflowArgs = {
  articleId: v.id("kb_articles"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  workflowId: v.optional(v.id("kb_workflows")),
};

export const approveStepArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  articleWorkflowId: v.id("kb_articleWorkflows"),
};

export const rejectStepArgs = {
  articleWorkflowId: v.id("kb_articleWorkflows"),
  reason: v.optional(v.string()),
};

// ─── Analytics Args ─────────────────────────────────────────────────────────

export const trackPageViewArgs = {
  articleId: v.id("kb_articles"),
  sessionId: v.string(),
  referrer: v.optional(v.string()),
  userAgent: v.optional(v.string()),
};

export const updateDurationArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  pageViewId: v.id("kb_pageViews"),
  duration: v.number(),
};

export const trackSearchArgs = {
  query: v.string(),
  resultCount: v.number(),
  clickedArticleId: v.optional(v.id("kb_articles")),
  source: kbSearchSourceValidator,
};

export const getDashboardStatsArgs = {
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
};

export const getArticleAnalyticsArgs = {
  articleId: v.id("kb_articles"),
};

export const getSearchAnalyticsArgs = {
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  limit: v.optional(v.number()),
};

// ─── Search Args ────────────────────────────────────────────────────────────

export const searchArticlesArgs = {
  query: v.string(),
  categoryId: v.optional(v.id("kb_categories")),
  limit: v.optional(v.number()),
};
