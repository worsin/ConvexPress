/**
 * Knowledge Base System - Schema
 *
 * 19 tables supporting a full-featured enterprise knowledge base:
 *   - kb_articles          - Primary article storage
 *   - kb_articleVersions   - Article version history
 *   - kb_categories        - Hierarchical categories
 *   - kb_tags              - Flat tag taxonomy
 *   - kb_articleTags       - Article-tag junction table
 *   - kb_relatedArticles   - Article-to-article relationships
 *   - kb_collections       - Curated article collections / learning paths
 *   - kb_collectionArticles - Collection-article junction with ordering
 *   - kb_templates         - Reusable article templates
 *   - kb_articleFeedback   - Helpful/not-helpful + star ratings
 *   - kb_bookmarks         - User bookmark management
 *   - kb_userProgress      - Reading progress tracking
 *   - kb_pageViews         - Per-article page view analytics
 *   - kb_searchQueries     - Search query logging for analytics
 *   - kb_workflows         - Editorial workflow definitions
 *   - kb_articleWorkflows   - Workflow instances for articles
 *   - kb_comments          - Article comments with threading
 *   - kb_commentVotes      - Comment upvote/downvote tracking
 *   - kb_ragChunks         - RAG vector search chunks
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators ───────────────────────────────────────────────

export const kbArticleStatusValidator = v.union(
  v.literal("draft"),
  v.literal("review"),
  v.literal("published"),
  v.literal("archived"),
);

export const kbRelationTypeValidator = v.union(
  v.literal("related"),
  v.literal("prerequisite"),
  v.literal("followUp"),
  v.literal("alternative"),
);

export const kbCollectionTypeValidator = v.union(
  v.literal("manual"),
  v.literal("series"),
  v.literal("learningPath"),
);

export const kbTemplateCategoryValidator = v.union(
  v.literal("article"),
  v.literal("faq"),
  v.literal("tutorial"),
  v.literal("howTo"),
  v.literal("troubleshooting"),
  v.literal("changelog"),
);

export const kbWorkflowStepTypeValidator = v.union(
  v.literal("approval"),
  v.literal("review"),
  v.literal("auto"),
);

export const kbArticleWorkflowStatusValidator = v.union(
  v.literal("inProgress"),
  v.literal("pendingReview"),
  v.literal("approved"),
  v.literal("rejected"),
);

export const kbCommentVoteTypeValidator = v.union(
  v.literal("up"),
  v.literal("down"),
);

export const kbSearchSourceValidator = v.union(
  v.literal("convex"),
  v.literal("meilisearch"),
  v.literal("rag"),
);

// ─── Workflow Step Object Validator ─────────────────────────────────

export const kbWorkflowStepValidator = v.object({
  name: v.string(),
  type: kbWorkflowStepTypeValidator,
  assigneeRole: v.optional(v.string()),
  assigneeId: v.optional(v.id("users")),
  requiredApprovals: v.number(),
});

// ─── Tables ─────────────────────────────────────────────────────────

export const kbTables = {
  // ── Core Content ──────────────────────────────────────────────────

  kb_articles: defineTable({
    title: v.string(),
    slug: v.string(),
    excerpt: v.string(),
    content: v.string(),
    contentPlainText: v.string(),
    status: kbArticleStatusValidator,
    authorId: v.id("users"),
    contributors: v.array(v.id("users")),
    categoryId: v.optional(v.id("kb_categories")),
    parentArticleId: v.optional(v.id("kb_articles")),
    metaTitle: v.optional(v.string()),
    metaDescription: v.optional(v.string()),
    keywords: v.array(v.string()),
    featuredImageId: v.optional(v.id("media")),
    scheduledAt: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    viewCount: v.number(),
    uniqueViewCount: v.number(),
    helpfulVotes: v.number(),
    notHelpfulVotes: v.number(),
    readingTimeMinutes: v.number(),
    version: v.number(),
    lastMajorUpdate: v.optional(v.number()),
    isFeatured: v.boolean(),
    sortOrder: v.number(),
    meilisearchSynced: v.boolean(),
    meilisearchSyncedAt: v.optional(v.number()),
    ragSynced: v.boolean(),
    ragSyncedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_author", ["authorId"])
    .index("by_category", ["categoryId"])
    .index("by_parent", ["parentArticleId"])
    .index("by_published", ["publishedAt"])
    .index("by_scheduled", ["scheduledAt"])
    .index("by_featured", ["isFeatured"])
    .index("by_views", ["viewCount"])
    .index("by_status_updated", ["status", "updatedAt"])
    .index("by_meilisearch_sync", ["meilisearchSynced"])
    .index("by_rag_sync", ["ragSynced"])
    .searchIndex("search_articles", {
      searchField: "contentPlainText",
      filterFields: ["status", "categoryId"],
    }),

  kb_articleVersions: defineTable({
    articleId: v.id("kb_articles"),
    version: v.number(),
    title: v.string(),
    content: v.string(),
    changeSummary: v.string(),
    authorId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_article", ["articleId"])
    .index("by_article_version", ["articleId", "version"]),

  kb_categories: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    parentId: v.optional(v.id("kb_categories")),
    order: v.number(),
    isActive: v.boolean(),
    isPublished: v.boolean(),
    articleCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_parent", ["parentId"])
    .index("by_order", ["order"])
    .index("by_published", ["isPublished"])
    .index("by_published_order", ["isPublished", "order"]),

  kb_tags: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    articleCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_count", ["articleCount"]),

  // ── Relationships ─────────────────────────────────────────────────

  kb_articleTags: defineTable({
    articleId: v.id("kb_articles"),
    tagId: v.id("kb_tags"),
    createdAt: v.number(),
  })
    .index("by_article", ["articleId"])
    .index("by_tag", ["tagId"])
    .index("by_article_tag", ["articleId", "tagId"]),

  kb_relatedArticles: defineTable({
    sourceArticleId: v.id("kb_articles"),
    relatedArticleId: v.id("kb_articles"),
    relationType: kbRelationTypeValidator,
    createdAt: v.number(),
  })
    .index("by_source", ["sourceArticleId"])
    .index("by_related", ["relatedArticleId"])
    .index("by_source_related", ["sourceArticleId", "relatedArticleId"]),

  // ── Collections & Templates ───────────────────────────────────────

  kb_collections: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    coverImageId: v.optional(v.id("media")),
    type: kbCollectionTypeValidator,
    isPublic: v.boolean(),
    articleCount: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_type", ["type"])
    .index("by_public", ["isPublic"]),

  kb_collectionArticles: defineTable({
    collectionId: v.id("kb_collections"),
    articleId: v.id("kb_articles"),
    order: v.number(),
    addedBy: v.id("users"),
    addedAt: v.number(),
  })
    .index("by_collection", ["collectionId"])
    .index("by_article", ["articleId"])
    .index("by_collection_order", ["collectionId", "order"]),

  kb_templates: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    content: v.string(),
    category: kbTemplateCategoryValidator,
    isDefault: v.boolean(),
    isActive: v.boolean(),
    usageCount: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_category", ["category"])
    .index("by_active", ["isActive"]),

  // ── User Engagement ───────────────────────────────────────────────

  kb_articleFeedback: defineTable({
    articleId: v.id("kb_articles"),
    userId: v.optional(v.id("users")),
    sessionId: v.string(),
    isHelpful: v.boolean(),
    rating: v.optional(v.number()),
    comment: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_article", ["articleId"])
    .index("by_user", ["userId"])
    .index("by_session_article", ["sessionId", "articleId"]),

  kb_bookmarks: defineTable({
    userId: v.id("users"),
    articleId: v.id("kb_articles"),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_article", ["articleId"])
    .index("by_user_article", ["userId", "articleId"]),

  kb_userProgress: defineTable({
    userId: v.id("users"),
    articleId: v.id("kb_articles"),
    progressPercent: v.number(),
    scrollPosition: v.number(),
    lastReadAt: v.number(),
    readTime: v.number(),
    completedRead: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_article", ["articleId"])
    .index("by_user_article", ["userId", "articleId"])
    .index("by_user_recent", ["userId", "lastReadAt"]),

  // ── Analytics ─────────────────────────────────────────────────────

  kb_pageViews: defineTable({
    articleId: v.id("kb_articles"),
    userId: v.optional(v.id("users")),
    sessionId: v.string(),
    referrer: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    duration: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_article", ["articleId"])
    .index("by_user", ["userId"])
    .index("by_session", ["sessionId"])
    .index("by_session_article", ["sessionId", "articleId"])
    .index("by_date", ["createdAt"]),

  kb_searchQueries: defineTable({
    query: v.string(),
    resultCount: v.number(),
    userId: v.optional(v.id("users")),
    clickedArticleId: v.optional(v.id("kb_articles")),
    source: kbSearchSourceValidator,
    createdAt: v.number(),
  })
    .index("by_date", ["createdAt"])
    .index("by_user", ["userId"])
    .index("by_article", ["clickedArticleId"]),

  // ── Editorial Workflows ───────────────────────────────────────────

  kb_workflows: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    steps: v.array(kbWorkflowStepValidator),
    isDefault: v.boolean(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_default", ["isDefault"])
    .index("by_active", ["isActive"]),

  kb_articleWorkflows: defineTable({
    articleId: v.id("kb_articles"),
    workflowId: v.id("kb_workflows"),
    currentStep: v.number(),
    status: kbArticleWorkflowStatusValidator,
    assigneeId: v.optional(v.id("users")),
    dueDate: v.optional(v.number()),
    approvals: v.array(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_article", ["articleId"])
    .index("by_workflow", ["workflowId"])
    .index("by_assignee", ["assigneeId"])
    .index("by_status", ["status"])
    .index("by_due_date", ["dueDate"]),

  // ── Moderation ────────────────────────────────────────────────────

  kb_comments: defineTable({
    articleId: v.id("kb_articles"),
    userId: v.id("users"),
    parentId: v.optional(v.id("kb_comments")),
    content: v.string(),
    isApproved: v.boolean(),
    isEdited: v.boolean(),
    isDeleted: v.boolean(),
    upvotes: v.number(),
    downvotes: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_article", ["articleId"])
    .index("by_parent", ["parentId"])
    .index("by_user", ["userId"])
    .index("by_approved", ["isApproved"]),

  kb_commentVotes: defineTable({
    commentId: v.id("kb_comments"),
    userId: v.id("users"),
    voteType: kbCommentVoteTypeValidator,
    createdAt: v.number(),
  })
    .index("by_comment", ["commentId"])
    .index("by_user", ["userId"])
    .index("by_user_comment", ["userId", "commentId"]),

  // ── Search Infrastructure ─────────────────────────────────────────

  kb_ragChunks: defineTable({
    articleId: v.id("kb_articles"),
    articleSlug: v.string(),
    content: v.string(),
    chunkIndex: v.number(),
    embedding: v.array(v.number()),
    metadata: v.object({
      title: v.string(),
      categorySlug: v.optional(v.string()),
      excerpt: v.optional(v.string()),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_article", ["articleId"])
    .index("by_article_slug", ["articleSlug"]),
};
