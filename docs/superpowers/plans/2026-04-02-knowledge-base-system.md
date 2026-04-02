# Knowledge Base System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a full-featured enterprise Knowledge Base system for ConvexPress with 19 tables, editorial workflows, collections, templates, and full-stack search.

**Architecture:** Independent Convex module at `convex/schema/kb.ts` + `convex/kb/`. Uses shared helpers (permissions, events, slugs, sanitization). Admin UI via TanStack Router, website UI via TanStack Start SSR. Three-tier search: Convex-native (default), Meilisearch (opt-in), RAG (opt-in).

**Tech Stack:** Convex, TanStack Router, TanStack Start, TipTap, Meilisearch, OpenAI Embeddings, Base UI, Tailwind CSS v4

---

## Task 1: Schema + Hub Integration

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/schema/kb.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/schema.ts`

19 tables, all prefixed `kb_`. Exports `kbTables` object for spreading into `schema.ts`.

- [ ] **Step 1: Create the KB schema file**

Create `ConvexPress-Admin/packages/backend/convex/schema/kb.ts`:

```typescript
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
 *
 * Key design decisions:
 *   - All tables prefixed `kb_` for namespace isolation
 *   - authorId references Convex users table (Id<"users">)
 *   - Denormalized counts on articles (viewCount, helpfulVotes, etc.)
 *   - Session-based deduplication for anonymous feedback and page views
 *   - TipTap JSON content with extracted plaintext for search indexing
 *   - Meilisearch and RAG sync flags for opt-in external search
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators (used by schema and functions) ───────────────────────

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

// ─── Workflow Step Object Validator ─────────────────────────────────────────

export const kbWorkflowStepValidator = v.object({
  name: v.string(),
  type: kbWorkflowStepTypeValidator,
  assigneeRole: v.optional(v.string()),
  assigneeId: v.optional(v.id("users")),
  requiredApprovals: v.number(),
});

// ─── Tables ─────────────────────────────────────────────────────────────────

export const kbTables = {
  // ── Core Content ────────────────────────────────────────────────────────

  /**
   * kb_articles - Primary article storage
   *
   * The main content table for the Knowledge Base. Each article has a
   * lifecycle: draft -> review -> published -> archived.
   *
   * Indexes support:
   *   - Admin article list (by status, author, category, featured)
   *   - Website article display (by slug, category, published date)
   *   - Scheduled publishing cron
   *   - Meilisearch and RAG sync jobs
   *   - Full-text search on contentPlainText
   */
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

  /**
   * kb_articleVersions - Article version history
   *
   * Stores snapshots of article content at each published version.
   * Used for version comparison and rollback.
   */
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

  /**
   * kb_categories - Hierarchical category taxonomy
   *
   * Supports nested categories via parentId self-reference.
   * articleCount is denormalized for performance.
   */
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

  /**
   * kb_tags - Flat tag taxonomy
   *
   * Simple tags for cross-cutting article classification.
   * articleCount is denormalized for performance.
   */
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

  // ── Relationships ──────────────────────────────────────────────────────

  /**
   * kb_articleTags - Article-tag junction table
   *
   * Many-to-many relationship between articles and tags.
   * by_article_tag index enforces uniqueness.
   */
  kb_articleTags: defineTable({
    articleId: v.id("kb_articles"),
    tagId: v.id("kb_tags"),
    createdAt: v.number(),
  })
    .index("by_article", ["articleId"])
    .index("by_tag", ["tagId"])
    .index("by_article_tag", ["articleId", "tagId"]),

  /**
   * kb_relatedArticles - Article-to-article relationships
   *
   * Supports typed relationships: related, prerequisite, followUp, alternative.
   * by_source_related index enforces uniqueness per direction.
   */
  kb_relatedArticles: defineTable({
    sourceArticleId: v.id("kb_articles"),
    relatedArticleId: v.id("kb_articles"),
    relationType: kbRelationTypeValidator,
    createdAt: v.number(),
  })
    .index("by_source", ["sourceArticleId"])
    .index("by_related", ["relatedArticleId"])
    .index("by_source_related", ["sourceArticleId", "relatedArticleId"]),

  // ── Collections & Templates ────────────────────────────────────────────

  /**
   * kb_collections - Curated article collections / learning paths
   *
   * Three types: manual (curated list), series (ordered sequence),
   * learningPath (structured curriculum).
   */
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

  /**
   * kb_collectionArticles - Collection-article junction with ordering
   *
   * Maintains the order of articles within a collection.
   * by_collection_order index supports ordered retrieval.
   */
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

  /**
   * kb_templates - Reusable article templates
   *
   * Pre-built content structures for common article types.
   * usageCount is denormalized for analytics.
   */
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

  // ── User Engagement ────────────────────────────────────────────────────

  /**
   * kb_articleFeedback - Helpful/not-helpful + star ratings
   *
   * Session-based deduplication: by_session_article prevents duplicate
   * feedback from the same session on the same article.
   */
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

  /**
   * kb_bookmarks - User bookmark management
   *
   * by_user_article index enforces uniqueness: one bookmark per user per article.
   */
  kb_bookmarks: defineTable({
    userId: v.id("users"),
    articleId: v.id("kb_articles"),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_article", ["articleId"])
    .index("by_user_article", ["userId", "articleId"]),

  /**
   * kb_userProgress - Reading progress tracking
   *
   * Tracks how far a user has read in an article, including scroll
   * position, read time, and completion status.
   */
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

  // ── Analytics ──────────────────────────────────────────────────────────

  /**
   * kb_pageViews - Per-article page view analytics
   *
   * Stores individual page view events with session deduplication.
   * Duration is updated asynchronously after the initial view.
   */
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
    .index("by_date", ["createdAt"]),

  /**
   * kb_searchQueries - Search query logging for analytics
   *
   * Logs every search query with result count and clicked article
   * for search quality analysis and improvement.
   */
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

  // ── Editorial Workflows ────────────────────────────────────────────────

  /**
   * kb_workflows - Editorial workflow definitions
   *
   * Configurable multi-step review/approval workflows.
   * Each workflow has ordered steps with assignees and approval requirements.
   */
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

  /**
   * kb_articleWorkflows - Active workflow instances for articles
   *
   * Tracks the progress of an article through a workflow.
   * One active workflow per article at a time.
   */
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
    .index("by_assignee", ["assigneeId"])
    .index("by_status", ["status"])
    .index("by_due_date", ["dueDate"]),

  // ── Moderation ─────────────────────────────────────────────────────────

  /**
   * kb_comments - Article comments with threading
   *
   * Supports 2-level nesting via parentId. isDeleted provides soft delete.
   * Denormalized upvotes/downvotes for fast display.
   */
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

  /**
   * kb_commentVotes - Comment upvote/downvote tracking
   *
   * by_user_comment index enforces uniqueness: one vote per user per comment.
   */
  kb_commentVotes: defineTable({
    commentId: v.id("kb_comments"),
    userId: v.id("users"),
    voteType: kbCommentVoteTypeValidator,
    createdAt: v.number(),
  })
    .index("by_comment", ["commentId"])
    .index("by_user", ["userId"])
    .index("by_user_comment", ["userId", "commentId"]),

  // ── Search Infrastructure ──────────────────────────────────────────────

  /**
   * kb_ragChunks - RAG vector search chunks
   *
   * Stores chunked article content with embeddings for semantic search.
   * Only populated when RAG is enabled in KB settings.
   */
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
```

- [ ] **Step 2: Import and spread in schema.ts**

Modify `ConvexPress-Admin/packages/backend/convex/schema.ts`. Add the import alongside the other schema imports, and spread it into the `defineSchema` call.

Add this import after the existing imports (e.g., after `import { analyticsTables } from "./schema/analytics";`):

```typescript
import { kbTables } from "./schema/kb";
```

Add this spread inside the `defineSchema({})` call (e.g., after `...analyticsTables,`):

```typescript
  ...kbTables,
```

- [ ] **Step 3: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable` to confirm the schema deploys without errors.

**Commit:** `feat(kb): add 19-table Knowledge Base schema with all indexes`

---

## Task 2: Event Constants

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/events/constants.ts`

Add KB system slug and all KB event codes to the event constants file.

- [ ] **Step 1: Add KB system slug**

Modify `ConvexPress-Admin/packages/backend/convex/events/constants.ts`. Add `KB: "kb"` to the `SYSTEM` object, after the existing entries (e.g., after `SITEMAP: "sitemap",`):

```typescript
  KB: "kb",
```

- [ ] **Step 2: Add KB event codes**

Add the following block after the `DASHBOARD_EVENTS` definition (before the `ALL_EVENT_CODES` array):

```typescript
/** Knowledge Base System events (6) */
export const KB_EVENTS = {
  ARTICLE_CREATED: "kb.article_created",
  ARTICLE_PUBLISHED: "kb.article_published",
  ARTICLE_UPDATED: "kb.article_updated",
  ARTICLE_ARCHIVED: "kb.article_archived",
  COMMENT_CREATED: "kb.comment_created",
  FEEDBACK_SUBMITTED: "kb.feedback_submitted",
} as const;
```

- [ ] **Step 3: Add KB events to ALL_EVENT_CODES array**

Add `...Object.values(KB_EVENTS),` to the `ALL_EVENT_CODES` array, after `...Object.values(DASHBOARD_EVENTS),`:

```typescript
  ...Object.values(KB_EVENTS),
```

- [ ] **Step 4: Add KB to EVENT_CODES_BY_SYSTEM**

Add the KB entry to the `EVENT_CODES_BY_SYSTEM` object, after the `[SYSTEM.AUDIT]` entry:

```typescript
  [SYSTEM.KB]: Object.values(KB_EVENTS),
```

- [ ] **Step 5: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx tsc --noEmit --pretty` to check for type errors.

**Commit:** `feat(kb): add KB system slug and event codes to event constants`

---

## Task 3: Validators

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/validators.ts`

Shared argument validators for all KB Convex functions.

- [ ] **Step 1: Create the validators file**

Create `ConvexPress-Admin/packages/backend/convex/kb/validators.ts`:

```typescript
/**
 * Knowledge Base System - Shared Argument Validators
 *
 * Reusable Convex argument validators for KB mutations and queries.
 * Centralizes validation logic so mutations and queries stay clean.
 */

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
  status: v.optional(kbArticleStatusValidator),
  categoryId: v.optional(v.id("kb_categories")),
  authorId: v.optional(v.id("users")),
  search: v.optional(v.string()),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
};

export const getArticleByIdArgs = {
  articleId: v.id("kb_articles"),
};

export const getArticleBySlugArgs = {
  slug: v.string(),
};

export const listPublishedArticlesArgs = {
  categoryId: v.optional(v.id("kb_categories")),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
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
  templateId: v.id("kb_templates"),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  content: v.optional(v.string()),
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
  steps: v.array(kbWorkflowStepValidator),
  isDefault: v.optional(v.boolean()),
};

export const updateWorkflowArgs = {
  workflowId: v.id("kb_workflows"),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  steps: v.optional(v.array(kbWorkflowStepValidator)),
  isDefault: v.optional(v.boolean()),
  isActive: v.optional(v.boolean()),
};

export const removeWorkflowArgs = {
  workflowId: v.id("kb_workflows"),
};

export const startWorkflowArgs = {
  articleId: v.id("kb_articles"),
  workflowId: v.optional(v.id("kb_workflows")),
};

export const approveStepArgs = {
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
```

**Commit:** `feat(kb): add shared argument validators for all KB functions`

---

## Task 4: KB Helpers

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/helpers/auth.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/kb/helpers/utils.ts`

- [ ] **Step 1: Create KB auth helper**

Create `ConvexPress-Admin/packages/backend/convex/kb/helpers/auth.ts`:

```typescript
/**
 * Knowledge Base System - Auth Helpers
 *
 * Thin wrappers around the core permission helpers, specialized for KB.
 * These provide a consistent KB-specific API and make it easy to add
 * KB-specific authorization logic in the future.
 *
 * Usage:
 *   import { requireKbCan } from "./helpers/auth";
 *   const user = await requireKbCan(ctx, "kb.create");
 */

import { requireCan, getCurrentUser, requireAuth } from "../../helpers/permissions";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

/**
 * Require a KB-specific capability. Returns the user on success.
 *
 * @param ctx - Convex mutation or query context
 * @param capability - The capability to check (e.g., "kb.create", "kb.publish")
 * @returns The authenticated user document
 * @throws ConvexError with UNAUTHORIZED or FORBIDDEN code
 */
export async function requireKbCan(
  ctx: MutationCtx | QueryCtx,
  capability: string,
) {
  return requireCan(ctx, capability as any);
}

/**
 * Check if the current user is the author of an article.
 *
 * @param ctx - Convex query or mutation context
 * @param articleAuthorId - The article's authorId field
 * @returns true if the current user is the article's author
 */
export async function isArticleOwner(
  ctx: QueryCtx | MutationCtx,
  articleAuthorId: string,
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  if (!user) return false;
  return user._id === articleAuthorId;
}

export { getCurrentUser, requireAuth };
```

- [ ] **Step 2: Create KB utils helper**

Create `ConvexPress-Admin/packages/backend/convex/kb/helpers/utils.ts`:

```typescript
/**
 * Knowledge Base System - Utility Helpers
 *
 * Slug generation for KB tables (not using the posts table, so needs
 * its own uniqueness checks), plaintext extraction from TipTap JSON,
 * and reading time calculation.
 *
 * Usage:
 *   import { generateKbSlug, extractPlainText, calculateReadingTime } from "./helpers/utils";
 */

import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

/** Maximum slug length in characters. */
const MAX_SLUG_LENGTH = 200;

/** Average words per minute for reading time calculation. */
const WORDS_PER_MINUTE = 200;

// ─── Slug Generation ────────────────────────────────────────────────────────

/**
 * Slugify a title string into a URL-safe slug.
 *
 * Rules:
 *   - Lowercase
 *   - Replace spaces, underscores with hyphens
 *   - Remove non-alphanumeric except hyphens
 *   - Collapse consecutive hyphens
 *   - Trim leading/trailing hyphens
 *   - Truncate to MAX_SLUG_LENGTH
 *   - Fallback to "untitled" if empty result
 */
export function slugify(title: string): string {
  let slug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LENGTH);

  if (!slug) slug = "untitled";
  return slug;
}

/**
 * Generate a unique slug for a KB article.
 *
 * Checks the kb_articles table's by_slug index to ensure uniqueness.
 * If a conflict exists, appends -2, -3, etc. until unique.
 *
 * @param ctx - Convex MutationCtx
 * @param title - The title to derive the slug from
 * @param existingArticleId - If updating, exclude this article from uniqueness check
 * @returns A unique slug string
 */
export async function generateArticleSlug(
  ctx: MutationCtx,
  title: string,
  existingArticleId?: Id<"kb_articles">,
): Promise<string> {
  const base = slugify(title);
  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("kb_articles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (!existing || (existingArticleId && existing._id === existingArticleId)) {
      break;
    }

    slug = `${base}-${suffix}`;
    suffix++;

    if (suffix > 1000) {
      slug = `${base}-${Date.now()}`;
      break;
    }
  }

  return slug;
}

/**
 * Generate a unique slug for a KB category.
 *
 * @param ctx - Convex MutationCtx
 * @param name - The category name to derive the slug from
 * @param existingCategoryId - If updating, exclude this category from uniqueness check
 * @returns A unique slug string
 */
export async function generateCategorySlug(
  ctx: MutationCtx,
  name: string,
  existingCategoryId?: Id<"kb_categories">,
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("kb_categories")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (!existing || (existingCategoryId && existing._id === existingCategoryId)) {
      break;
    }

    slug = `${base}-${suffix}`;
    suffix++;

    if (suffix > 1000) {
      slug = `${base}-${Date.now()}`;
      break;
    }
  }

  return slug;
}

/**
 * Generate a unique slug for a KB tag.
 *
 * @param ctx - Convex MutationCtx
 * @param name - The tag name to derive the slug from
 * @param existingTagId - If updating, exclude this tag from uniqueness check
 * @returns A unique slug string
 */
export async function generateTagSlug(
  ctx: MutationCtx,
  name: string,
  existingTagId?: Id<"kb_tags">,
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("kb_tags")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (!existing || (existingTagId && existing._id === existingTagId)) {
      break;
    }

    slug = `${base}-${suffix}`;
    suffix++;

    if (suffix > 1000) {
      slug = `${base}-${Date.now()}`;
      break;
    }
  }

  return slug;
}

/**
 * Generate a unique slug for a KB collection.
 *
 * @param ctx - Convex MutationCtx
 * @param name - The collection name to derive the slug from
 * @param existingCollectionId - If updating, exclude from uniqueness check
 * @returns A unique slug string
 */
export async function generateCollectionSlug(
  ctx: MutationCtx,
  name: string,
  existingCollectionId?: Id<"kb_collections">,
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("kb_collections")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (!existing || (existingCollectionId && existing._id === existingCollectionId)) {
      break;
    }

    slug = `${base}-${suffix}`;
    suffix++;

    if (suffix > 1000) {
      slug = `${base}-${Date.now()}`;
      break;
    }
  }

  return slug;
}

/**
 * Generate a unique slug for a KB template.
 *
 * @param ctx - Convex MutationCtx
 * @param name - The template name to derive the slug from
 * @param existingTemplateId - If updating, exclude from uniqueness check
 * @returns A unique slug string
 */
export async function generateTemplateSlug(
  ctx: MutationCtx,
  name: string,
  existingTemplateId?: Id<"kb_templates">,
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("kb_templates")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (!existing || (existingTemplateId && existing._id === existingTemplateId)) {
      break;
    }

    slug = `${base}-${suffix}`;
    suffix++;

    if (suffix > 1000) {
      slug = `${base}-${Date.now()}`;
      break;
    }
  }

  return slug;
}

// ─── Content Processing ─────────────────────────────────────────────────────

/**
 * Extract plain text from TipTap JSON content.
 *
 * Recursively walks the TipTap JSON document tree and extracts all
 * text content, joining with spaces. Used for:
 *   - Convex searchIndex population (contentPlainText field)
 *   - Reading time calculation
 *   - Excerpt auto-generation
 *
 * @param jsonContent - Serialized TipTap JSON string
 * @returns Plain text string with no HTML/formatting
 */
export function extractPlainText(jsonContent: string): string {
  try {
    const doc = JSON.parse(jsonContent);
    return extractTextFromNode(doc).trim();
  } catch {
    // If JSON parsing fails, return the raw string (may already be plain text)
    return jsonContent;
  }
}

/**
 * Recursively extract text from a TipTap JSON node.
 */
function extractTextFromNode(node: any): string {
  if (!node) return "";

  // Text node -- return the text content
  if (node.type === "text" && typeof node.text === "string") {
    return node.text;
  }

  // Container node -- recurse into children
  if (Array.isArray(node.content)) {
    const childTexts = node.content.map((child: any) => extractTextFromNode(child));
    // Add newlines between block-level nodes
    const blockTypes = [
      "paragraph", "heading", "blockquote", "codeBlock",
      "bulletList", "orderedList", "listItem", "horizontalRule",
    ];
    if (blockTypes.includes(node.type)) {
      return childTexts.join(" ") + "\n";
    }
    return childTexts.join(" ");
  }

  return "";
}

/**
 * Calculate estimated reading time in minutes from plain text.
 *
 * Uses 200 words per minute as the average reading speed.
 * Returns a minimum of 1 minute.
 *
 * @param plainText - The plain text content
 * @returns Reading time in minutes (integer, minimum 1)
 */
export function calculateReadingTime(plainText: string): number {
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  const minutes = Math.ceil(wordCount / WORDS_PER_MINUTE);
  return Math.max(1, minutes);
}

/**
 * Auto-generate an excerpt from plain text content.
 *
 * Takes the first 300 characters and truncates at the last word boundary.
 *
 * @param plainText - The plain text content
 * @param maxLength - Maximum excerpt length (default 300)
 * @returns Truncated excerpt string
 */
export function generateExcerpt(plainText: string, maxLength = 300): string {
  if (plainText.length <= maxLength) return plainText;

  const truncated = plainText.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.5) {
    return truncated.slice(0, lastSpace) + "...";
  }
  return truncated + "...";
}
```

- [ ] **Step 3: Create the helpers directory** -- Run `mkdir -p /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/kb/helpers`

- [ ] **Step 4: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx tsc --noEmit --pretty` to check for type errors.

**Commit:** `feat(kb): add KB auth and utility helpers (slug, plaintext, reading time)`

---

## Task 5: Articles CRUD (mutations + queries)

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/mutations.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/kb/queries.ts`

- [ ] **Step 1: Create the articles mutations file**

Create `ConvexPress-Admin/packages/backend/convex/kb/mutations.ts`:

```typescript
/**
 * Knowledge Base System - Article Mutations
 *
 * All write operations for the KB article lifecycle:
 *   create           - Create a new article (draft)
 *   update           - Update an existing article
 *   publish          - Publish an article (immediate or scheduled)
 *   unpublish        - Revert a published article to draft
 *   archive          - Archive an article
 *   remove           - Permanently delete an article and related data
 *   toggleFeatured   - Toggle the featured flag
 *   createVersion    - Create a version snapshot
 *
 * Authorization:
 *   - create: kb.create
 *   - update: kb.edit (any) or kb.editOwn (own only)
 *   - publish/unpublish: kb.publish
 *   - archive/remove: kb.delete
 *   - toggleFeatured: kb.publish
 *   - createVersion: kb.edit or kb.editOwn
 */

import { ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { KB_EVENTS, SYSTEM } from "../events/constants";
import {
  generateArticleSlug,
  extractPlainText,
  calculateReadingTime,
  generateExcerpt,
} from "./helpers/utils";
import {
  createArticleArgs,
  updateArticleArgs,
  publishArticleArgs,
  unpublishArticleArgs,
  archiveArticleArgs,
  removeArticleArgs,
  toggleFeaturedArgs,
  createVersionArgs,
  MAX_KB_TITLE_LENGTH,
  MAX_KB_EXCERPT_LENGTH,
  MAX_KEYWORDS,
} from "./validators";

// ─── Create ─────────────────────────────────────────────────────────────────

export const create = mutation({
  args: createArticleArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.create");

    const title = (args.title ?? "").trim();
    if (title.length > MAX_KB_TITLE_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Title must be ${MAX_KB_TITLE_LENGTH} characters or fewer`,
      });
    }

    if (args.excerpt && args.excerpt.length > MAX_KB_EXCERPT_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Excerpt must be ${MAX_KB_EXCERPT_LENGTH} characters or fewer`,
      });
    }

    if (args.keywords && args.keywords.length > MAX_KEYWORDS) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Maximum ${MAX_KEYWORDS} keywords allowed`,
      });
    }

    const slug = await generateArticleSlug(ctx, title || "untitled");
    const content = args.content ?? "";
    const plainText = args.contentPlainText ?? extractPlainText(content);
    const excerpt = args.excerpt ?? generateExcerpt(plainText);
    const readingTime = calculateReadingTime(plainText);

    // If a template was specified, increment its usage count
    if (args.templateId) {
      const template = await ctx.db.get(args.templateId);
      if (template) {
        await ctx.db.patch(args.templateId, {
          usageCount: template.usageCount + 1,
          updatedAt: Date.now(),
        });
      }
    }

    const now = Date.now();
    const articleId = await ctx.db.insert("kb_articles", {
      title: title || "Untitled Article",
      slug,
      excerpt,
      content,
      contentPlainText: plainText,
      status: "draft",
      authorId: user._id,
      contributors: [],
      categoryId: args.categoryId,
      parentArticleId: args.parentArticleId,
      metaTitle: args.metaTitle,
      metaDescription: args.metaDescription,
      keywords: args.keywords ?? [],
      featuredImageId: args.featuredImageId,
      scheduledAt: undefined,
      publishedAt: undefined,
      viewCount: 0,
      uniqueViewCount: 0,
      helpfulVotes: 0,
      notHelpfulVotes: 0,
      readingTimeMinutes: readingTime,
      version: 1,
      lastMajorUpdate: undefined,
      isFeatured: false,
      sortOrder: 0,
      meilisearchSynced: false,
      meilisearchSyncedAt: undefined,
      ragSynced: false,
      ragSyncedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });

    await emitEvent(ctx, KB_EVENTS.ARTICLE_CREATED, SYSTEM.KB, {
      articleId,
      title: title || "Untitled Article",
      authorId: user._id,
    });

    return articleId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

export const update = mutation({
  args: updateArticleArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    // Check edit permission: kb.edit for any article, kb.editOwn for own articles
    const isOwner = article.authorId === user._id;
    if (!isOwner) {
      await requireCan(ctx, "kb.edit");
    } else {
      await requireCan(ctx, "kb.editOwn");
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };

    if (args.title !== undefined) {
      const title = args.title.trim();
      if (title.length > MAX_KB_TITLE_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Title must be ${MAX_KB_TITLE_LENGTH} characters or fewer`,
        });
      }
      updates.title = title;
      updates.slug = await generateArticleSlug(ctx, title, args.articleId);
    }

    if (args.excerpt !== undefined) {
      if (args.excerpt.length > MAX_KB_EXCERPT_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Excerpt must be ${MAX_KB_EXCERPT_LENGTH} characters or fewer`,
        });
      }
      updates.excerpt = args.excerpt;
    }

    if (args.content !== undefined) {
      updates.content = args.content;
      const plainText = args.contentPlainText ?? extractPlainText(args.content);
      updates.contentPlainText = plainText;
      updates.readingTimeMinutes = calculateReadingTime(plainText);
      // Mark search sync as stale
      updates.meilisearchSynced = false;
      updates.ragSynced = false;
    }

    if (args.categoryId !== undefined) updates.categoryId = args.categoryId;
    if (args.parentArticleId !== undefined) updates.parentArticleId = args.parentArticleId;
    if (args.metaTitle !== undefined) updates.metaTitle = args.metaTitle;
    if (args.metaDescription !== undefined) updates.metaDescription = args.metaDescription;
    if (args.featuredImageId !== undefined) updates.featuredImageId = args.featuredImageId;
    if (args.sortOrder !== undefined) updates.sortOrder = args.sortOrder;

    if (args.keywords !== undefined) {
      if (args.keywords.length > MAX_KEYWORDS) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Maximum ${MAX_KEYWORDS} keywords allowed`,
        });
      }
      updates.keywords = args.keywords;
    }

    // Track contributors
    if (!article.contributors.includes(user._id) && user._id !== article.authorId) {
      updates.contributors = [...article.contributors, user._id];
    }

    await ctx.db.patch(args.articleId, updates);

    await emitEvent(ctx, KB_EVENTS.ARTICLE_UPDATED, SYSTEM.KB, {
      articleId: args.articleId,
      title: updates.title ?? article.title,
      authorId: user._id,
    });

    return args.articleId;
  },
});

// ─── Publish ────────────────────────────────────────────────────────────────

export const publish = mutation({
  args: publishArticleArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.publish");

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    if (article.status === "published") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Article is already published" });
    }

    const now = Date.now();
    const updates: Record<string, any> = {
      status: "published" as const,
      publishedAt: args.scheduledAt ?? now,
      scheduledAt: args.scheduledAt,
      updatedAt: now,
      meilisearchSynced: false,
      ragSynced: false,
    };

    // If scheduled for the future, don't set status to published yet
    if (args.scheduledAt && args.scheduledAt > now) {
      updates.status = "draft";
      updates.publishedAt = undefined;
      // Schedule the publish via internal function
      // (actual scheduling handled by the internals cron)
    }

    await ctx.db.patch(args.articleId, updates);

    // Update category article count
    if (article.categoryId) {
      const category = await ctx.db.get(article.categoryId);
      if (category) {
        await ctx.db.patch(article.categoryId, {
          articleCount: category.articleCount + 1,
          updatedAt: now,
        });
      }
    }

    await emitEvent(ctx, KB_EVENTS.ARTICLE_PUBLISHED, SYSTEM.KB, {
      articleId: args.articleId,
      title: article.title,
      authorId: user._id,
      publishedAt: updates.publishedAt ?? now,
    });

    return args.articleId;
  },
});

// ─── Unpublish ──────────────────────────────────────────────────────────────

export const unpublish = mutation({
  args: unpublishArticleArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.publish");

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    if (article.status !== "published") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Article is not published" });
    }

    const now = Date.now();
    await ctx.db.patch(args.articleId, {
      status: "draft",
      publishedAt: undefined,
      updatedAt: now,
      meilisearchSynced: false,
      ragSynced: false,
    });

    // Decrement category article count
    if (article.categoryId) {
      const category = await ctx.db.get(article.categoryId);
      if (category && category.articleCount > 0) {
        await ctx.db.patch(article.categoryId, {
          articleCount: category.articleCount - 1,
          updatedAt: now,
        });
      }
    }

    return args.articleId;
  },
});

// ─── Archive ────────────────────────────────────────────────────────────────

export const archive = mutation({
  args: archiveArticleArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.delete");

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    const wasPublished = article.status === "published";
    const now = Date.now();

    await ctx.db.patch(args.articleId, {
      status: "archived",
      updatedAt: now,
      meilisearchSynced: false,
      ragSynced: false,
    });

    // Decrement category count if was published
    if (wasPublished && article.categoryId) {
      const category = await ctx.db.get(article.categoryId);
      if (category && category.articleCount > 0) {
        await ctx.db.patch(article.categoryId, {
          articleCount: category.articleCount - 1,
          updatedAt: now,
        });
      }
    }

    await emitEvent(ctx, KB_EVENTS.ARTICLE_ARCHIVED, SYSTEM.KB, {
      articleId: args.articleId,
      title: article.title,
      authorId: user._id,
    });

    return args.articleId;
  },
});

// ─── Remove (Permanent Delete) ──────────────────────────────────────────────

export const remove = mutation({
  args: removeArticleArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.delete");

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    // Delete all related data
    const articleTags = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const at of articleTags) {
      // Decrement tag article count
      const tag = await ctx.db.get(at.tagId);
      if (tag && tag.articleCount > 0) {
        await ctx.db.patch(at.tagId, { articleCount: tag.articleCount - 1, updatedAt: Date.now() });
      }
      await ctx.db.delete(at._id);
    }

    const relatedFrom = await ctx.db
      .query("kb_relatedArticles")
      .withIndex("by_source", (q) => q.eq("sourceArticleId", args.articleId))
      .collect();
    for (const r of relatedFrom) await ctx.db.delete(r._id);

    const relatedTo = await ctx.db
      .query("kb_relatedArticles")
      .withIndex("by_related", (q) => q.eq("relatedArticleId", args.articleId))
      .collect();
    for (const r of relatedTo) await ctx.db.delete(r._id);

    const versions = await ctx.db
      .query("kb_articleVersions")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const v of versions) await ctx.db.delete(v._id);

    const collectionArticles = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const ca of collectionArticles) {
      const collection = await ctx.db.get(ca.collectionId);
      if (collection && collection.articleCount > 0) {
        await ctx.db.patch(ca.collectionId, {
          articleCount: collection.articleCount - 1,
          updatedAt: Date.now(),
        });
      }
      await ctx.db.delete(ca._id);
    }

    const feedback = await ctx.db
      .query("kb_articleFeedback")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const f of feedback) await ctx.db.delete(f._id);

    const bookmarks = await ctx.db
      .query("kb_bookmarks")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const b of bookmarks) await ctx.db.delete(b._id);

    const progress = await ctx.db
      .query("kb_userProgress")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const p of progress) await ctx.db.delete(p._id);

    const views = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const pv of views) await ctx.db.delete(pv._id);

    const comments = await ctx.db
      .query("kb_comments")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const c of comments) {
      const votes = await ctx.db
        .query("kb_commentVotes")
        .withIndex("by_comment", (q) => q.eq("commentId", c._id))
        .collect();
      for (const cv of votes) await ctx.db.delete(cv._id);
      await ctx.db.delete(c._id);
    }

    const ragChunks = await ctx.db
      .query("kb_ragChunks")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    for (const rc of ragChunks) await ctx.db.delete(rc._id);

    // Decrement category article count if was published
    if (article.status === "published" && article.categoryId) {
      const category = await ctx.db.get(article.categoryId);
      if (category && category.articleCount > 0) {
        await ctx.db.patch(article.categoryId, {
          articleCount: category.articleCount - 1,
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.delete(args.articleId);

    return args.articleId;
  },
});

// ─── Toggle Featured ────────────────────────────────────────────────────────

export const toggleFeatured = mutation({
  args: toggleFeaturedArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.publish");

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    await ctx.db.patch(args.articleId, {
      isFeatured: !article.isFeatured,
      updatedAt: Date.now(),
    });

    return !article.isFeatured;
  },
});

// ─── Create Version ─────────────────────────────────────────────────────────

export const createVersion = mutation({
  args: createVersionArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    const isOwner = article.authorId === user._id;
    if (!isOwner) {
      await requireCan(ctx, "kb.edit");
    } else {
      await requireCan(ctx, "kb.editOwn");
    }

    const now = Date.now();
    const versionId = await ctx.db.insert("kb_articleVersions", {
      articleId: args.articleId,
      version: article.version,
      title: article.title,
      content: article.content,
      changeSummary: args.changeSummary,
      authorId: user._id,
      createdAt: now,
    });

    await ctx.db.patch(args.articleId, {
      version: article.version + 1,
      lastMajorUpdate: now,
      updatedAt: now,
    });

    return versionId;
  },
});
```

- [ ] **Step 2: Create the articles queries file**

Create `ConvexPress-Admin/packages/backend/convex/kb/queries.ts`:

```typescript
/**
 * Knowledge Base System - Article Queries
 *
 * All read operations for articles:
 *   list              - Paginated article list with filters (admin, auth required)
 *   getById           - Single article by ID (admin, auth required)
 *   getBySlug         - Single published article by slug (public, no auth)
 *   listPublished     - Paginated published articles (public, no auth)
 *   getPopular        - Most viewed published articles (public)
 *   getRecent         - Recently published articles (public)
 *   getFeatured       - Featured published articles (public)
 *   getVersions       - Article version history (admin, auth required)
 */

import { ConvexError } from "convex/values";
import { query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import {
  listArticlesArgs,
  getArticleByIdArgs,
  getArticleBySlugArgs,
  listPublishedArticlesArgs,
  getPopularArticlesArgs,
  getRecentArticlesArgs,
  getFeaturedArticlesArgs,
  getVersionsArgs,
  DEFAULT_KB_PER_PAGE_ADMIN,
  DEFAULT_KB_PER_PAGE_WEBSITE,
  MAX_KB_PER_PAGE,
} from "./validators";

// ─── List (Admin) ───────────────────────────────────────────────────────────

export const list = query({
  args: listArticlesArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const page = args.page ?? 1;
    const perPage = Math.min(args.perPage ?? DEFAULT_KB_PER_PAGE_ADMIN, MAX_KB_PER_PAGE);

    let articlesQuery;

    if (args.search) {
      // Use search index
      articlesQuery = ctx.db
        .query("kb_articles")
        .withSearchIndex("search_articles", (q) => {
          let sq = q.search("contentPlainText", args.search!);
          if (args.status) sq = sq.eq("status", args.status);
          if (args.categoryId) sq = sq.eq("categoryId", args.categoryId);
          return sq;
        });
    } else if (args.status) {
      articlesQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_status_updated", (q) => q.eq("status", args.status!))
        .order("desc");
    } else if (args.categoryId) {
      articlesQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId!));
    } else if (args.authorId) {
      articlesQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_author", (q) => q.eq("authorId", args.authorId!));
    } else {
      articlesQuery = ctx.db.query("kb_articles").order("desc");
    }

    const allArticles = await articlesQuery.collect();

    // Apply remaining filters that couldn't be handled by the index
    let filtered = allArticles;
    if (args.authorId && !args.status && !args.search) {
      // Already filtered by index
    } else if (args.authorId) {
      filtered = filtered.filter((a) => a.authorId === args.authorId);
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / perPage);
    const start = (page - 1) * perPage;
    const items = filtered.slice(start, start + perPage);

    // Enrich with author info
    const enriched = await Promise.all(
      items.map(async (article) => {
        const author = await ctx.db.get(article.authorId);
        return {
          ...article,
          author: author
            ? {
                _id: author._id,
                displayName: (author as any).displayName ?? author.email,
                avatarUrl: (author as any).avatarUrl,
              }
            : null,
        };
      }),
    );

    return {
      items: enriched,
      total,
      page,
      perPage,
      totalPages,
    };
  },
});

// ─── Get By ID (Admin) ─────────────────────────────────────────────────────

export const getById = query({
  args: getArticleByIdArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const article = await ctx.db.get(args.articleId);
    if (!article) return null;

    const author = await ctx.db.get(article.authorId);
    const category = article.categoryId ? await ctx.db.get(article.categoryId) : null;

    // Get tags
    const articleTags = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    const tags = await Promise.all(
      articleTags.map(async (at) => ctx.db.get(at.tagId)),
    );

    return {
      ...article,
      author: author
        ? {
            _id: author._id,
            displayName: (author as any).displayName ?? author.email,
            avatarUrl: (author as any).avatarUrl,
          }
        : null,
      category,
      tags: tags.filter(Boolean),
    };
  },
});

// ─── Get By Slug (Public) ───────────────────────────────────────────────────

export const getBySlug = query({
  args: getArticleBySlugArgs,
  handler: async (ctx, args) => {
    const article = await ctx.db
      .query("kb_articles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!article || article.status !== "published") return null;

    const author = await ctx.db.get(article.authorId);
    const category = article.categoryId ? await ctx.db.get(article.categoryId) : null;

    const articleTags = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article", (q) => q.eq("articleId", article._id))
      .collect();
    const tags = await Promise.all(
      articleTags.map(async (at) => ctx.db.get(at.tagId)),
    );

    // Get related articles
    const relatedLinks = await ctx.db
      .query("kb_relatedArticles")
      .withIndex("by_source", (q) => q.eq("sourceArticleId", article._id))
      .collect();
    const relatedArticles = await Promise.all(
      relatedLinks.map(async (link) => {
        const related = await ctx.db.get(link.relatedArticleId);
        if (!related || related.status !== "published") return null;
        return {
          _id: related._id,
          title: related.title,
          slug: related.slug,
          excerpt: related.excerpt,
          relationType: link.relationType,
        };
      }),
    );

    return {
      ...article,
      author: author
        ? {
            _id: author._id,
            displayName: (author as any).displayName ?? author.email,
            avatarUrl: (author as any).avatarUrl,
          }
        : null,
      category,
      tags: tags.filter(Boolean),
      relatedArticles: relatedArticles.filter(Boolean),
    };
  },
});

// ─── List Published (Public) ────────────────────────────────────────────────

export const listPublished = query({
  args: listPublishedArticlesArgs,
  handler: async (ctx, args) => {
    const page = args.page ?? 1;
    const perPage = Math.min(args.perPage ?? DEFAULT_KB_PER_PAGE_WEBSITE, MAX_KB_PER_PAGE);

    let articlesQuery;
    if (args.categoryId) {
      articlesQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId!));
    } else {
      articlesQuery = ctx.db
        .query("kb_articles")
        .withIndex("by_published");
    }

    const allArticles = await articlesQuery.collect();
    const published = allArticles
      .filter((a) => a.status === "published")
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

    const total = published.length;
    const totalPages = Math.ceil(total / perPage);
    const start = (page - 1) * perPage;
    const items = published.slice(start, start + perPage);

    const enriched = await Promise.all(
      items.map(async (article) => {
        const author = await ctx.db.get(article.authorId);
        const category = article.categoryId ? await ctx.db.get(article.categoryId) : null;
        return {
          ...article,
          author: author
            ? {
                _id: author._id,
                displayName: (author as any).displayName ?? author.email,
                avatarUrl: (author as any).avatarUrl,
              }
            : null,
          category,
        };
      }),
    );

    return {
      items: enriched,
      total,
      page,
      perPage,
      totalPages,
    };
  },
});

// ─── Get Popular (Public) ───────────────────────────────────────────────────

export const getPopular = query({
  args: getPopularArticlesArgs,
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    const articles = await ctx.db
      .query("kb_articles")
      .withIndex("by_views")
      .order("desc")
      .collect();

    return articles
      .filter((a) => a.status === "published")
      .slice(0, limit)
      .map((a) => ({
        _id: a._id,
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        viewCount: a.viewCount,
        categoryId: a.categoryId,
      }));
  },
});

// ─── Get Recent (Public) ────────────────────────────────────────────────────

export const getRecent = query({
  args: getRecentArticlesArgs,
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    const articles = await ctx.db
      .query("kb_articles")
      .withIndex("by_published")
      .order("desc")
      .collect();

    return articles
      .filter((a) => a.status === "published")
      .slice(0, limit)
      .map((a) => ({
        _id: a._id,
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        publishedAt: a.publishedAt,
        categoryId: a.categoryId,
      }));
  },
});

// ─── Get Featured (Public) ──────────────────────────────────────────────────

export const getFeatured = query({
  args: getFeaturedArticlesArgs,
  handler: async (ctx, args) => {
    const limit = args.limit ?? 6;

    const articles = await ctx.db
      .query("kb_articles")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .collect();

    return articles
      .filter((a) => a.status === "published")
      .slice(0, limit)
      .map((a) => ({
        _id: a._id,
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        viewCount: a.viewCount,
        categoryId: a.categoryId,
        featuredImageId: a.featuredImageId,
      }));
  },
});

// ─── Get Versions (Admin) ───────────────────────────────────────────────────

export const getVersions = query({
  args: getVersionsArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const versions = await ctx.db
      .query("kb_articleVersions")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .order("desc")
      .collect();

    return Promise.all(
      versions.map(async (v) => {
        const author = await ctx.db.get(v.authorId);
        return {
          ...v,
          author: author
            ? {
                _id: author._id,
                displayName: (author as any).displayName ?? author.email,
              }
            : null,
        };
      }),
    );
  },
});
```

- [ ] **Step 3: Create the kb directory** -- Run `mkdir -p /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend/convex/kb`

- [ ] **Step 4: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable` to confirm deployment.

**Commit:** `feat(kb): add article CRUD mutations and queries`

---

## Task 6: Categories CRUD

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/categories.ts`

- [ ] **Step 1: Create the categories file**

Create `ConvexPress-Admin/packages/backend/convex/kb/categories.ts`:

```typescript
/**
 * Knowledge Base System - Category Functions
 *
 * CRUD and hierarchy operations for KB categories:
 *   list           - All categories for admin (auth required)
 *   listPublished  - Published categories with article counts (public)
 *   getBySlug      - Single category by slug (public)
 *   getHierarchy   - Full category tree structure (public)
 *   create         - Create a new category
 *   update         - Update an existing category
 *   reorder        - Change a category's sort order
 *   remove         - Delete a category (reassigns articles to uncategorized)
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { generateCategorySlug } from "./helpers/utils";
import {
  createCategoryArgs,
  updateCategoryArgs,
  reorderCategoryArgs,
  removeCategoryArgs,
  getCategoryBySlugArgs,
} from "./validators";

// ─── List (Admin) ───────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const categories = await ctx.db
      .query("kb_categories")
      .withIndex("by_order")
      .collect();

    return categories;
  },
});

// ─── List Published (Public) ────────────────────────────────────────────────

export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("kb_categories")
      .withIndex("by_published_order", (q) => q.eq("isPublished", true))
      .collect();

    return categories;
  },
});

// ─── Get By Slug (Public) ───────────────────────────────────────────────────

export const getBySlug = query({
  args: getCategoryBySlugArgs,
  handler: async (ctx, args) => {
    const category = await ctx.db
      .query("kb_categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!category || !category.isPublished) return null;
    return category;
  },
});

// ─── Get Hierarchy (Public) ─────────────────────────────────────────────────

export const getHierarchy = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("kb_categories")
      .withIndex("by_published_order", (q) => q.eq("isPublished", true))
      .collect();

    // Build tree structure
    type CategoryNode = (typeof categories)[0] & { children: CategoryNode[] };
    const map = new Map<string, CategoryNode>();
    const roots: CategoryNode[] = [];

    for (const cat of categories) {
      map.set(cat._id, { ...cat, children: [] });
    }

    for (const cat of categories) {
      const node = map.get(cat._id)!;
      if (cat.parentId) {
        const parent = map.get(cat.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  },
});

// ─── Create ─────────────────────────────────────────────────────────────────

export const create = mutation({
  args: createCategoryArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageCategories");

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Category name is required" });
    }

    const slug = await generateCategorySlug(ctx, name);

    // Get max order for positioning
    const allCategories = await ctx.db
      .query("kb_categories")
      .withIndex("by_order")
      .order("desc")
      .first();
    const maxOrder = allCategories ? allCategories.order : 0;

    const now = Date.now();
    const categoryId = await ctx.db.insert("kb_categories", {
      name,
      slug,
      description: args.description,
      icon: args.icon,
      parentId: args.parentId,
      order: maxOrder + 1,
      isActive: true,
      isPublished: true,
      articleCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return categoryId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

export const update = mutation({
  args: updateCategoryArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageCategories");

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found" });
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Category name is required" });
      }
      updates.name = name;
      updates.slug = await generateCategorySlug(ctx, name, args.categoryId);
    }

    if (args.description !== undefined) updates.description = args.description;
    if (args.icon !== undefined) updates.icon = args.icon;
    if (args.parentId !== undefined) {
      // Prevent self-parenting
      if (args.parentId === args.categoryId) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Category cannot be its own parent" });
      }
      updates.parentId = args.parentId;
    }
    if (args.isPublished !== undefined) updates.isPublished = args.isPublished;

    await ctx.db.patch(args.categoryId, updates);
    return args.categoryId;
  },
});

// ─── Reorder ────────────────────────────────────────────────────────────────

export const reorder = mutation({
  args: reorderCategoryArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageCategories");

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found" });
    }

    await ctx.db.patch(args.categoryId, {
      order: args.newOrder,
      updatedAt: Date.now(),
    });

    return args.categoryId;
  },
});

// ─── Remove ─────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: removeCategoryArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageCategories");

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found" });
    }

    // Move child categories to parent (or root)
    const children = await ctx.db
      .query("kb_categories")
      .withIndex("by_parent", (q) => q.eq("parentId", args.categoryId))
      .collect();
    for (const child of children) {
      await ctx.db.patch(child._id, {
        parentId: category.parentId,
        updatedAt: Date.now(),
      });
    }

    // Unassign articles from this category
    const articles = await ctx.db
      .query("kb_articles")
      .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
      .collect();
    for (const article of articles) {
      await ctx.db.patch(article._id, {
        categoryId: undefined,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.delete(args.categoryId);
    return args.categoryId;
  },
});
```

**Commit:** `feat(kb): add category CRUD with hierarchy support`

---

## Task 7: Tags CRUD

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/tags.ts`

- [ ] **Step 1: Create the tags file**

Create `ConvexPress-Admin/packages/backend/convex/kb/tags.ts`:

```typescript
/**
 * Knowledge Base System - Tag Functions
 *
 * CRUD and article tagging operations:
 *   list             - All tags (public)
 *   getBySlug        - Single tag by slug (public)
 *   create           - Create a new tag
 *   update           - Update an existing tag
 *   remove           - Delete a tag and all article associations
 *   addToArticle     - Tag an article
 *   removeFromArticle - Untag an article
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { generateTagSlug } from "./helpers/utils";
import {
  createTagArgs,
  updateTagArgs,
  removeTagArgs,
  addTagToArticleArgs,
  removeTagFromArticleArgs,
  getTagBySlugArgs,
} from "./validators";

// ─── List (Public) ──────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("kb_tags").collect();
  },
});

// ─── Get By Slug (Public) ───────────────────────────────────────────────────

export const getBySlug = query({
  args: getTagBySlugArgs,
  handler: async (ctx, args) => {
    return ctx.db
      .query("kb_tags")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

// ─── Create ─────────────────────────────────────────────────────────────────

export const create = mutation({
  args: createTagArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageTags");

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Tag name is required" });
    }

    const slug = await generateTagSlug(ctx, name);
    const now = Date.now();

    const tagId = await ctx.db.insert("kb_tags", {
      name,
      slug,
      description: args.description,
      color: args.color,
      articleCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return tagId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

export const update = mutation({
  args: updateTagArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageTags");

    const tag = await ctx.db.get(args.tagId);
    if (!tag) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Tag not found" });
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Tag name is required" });
      }
      updates.name = name;
      updates.slug = await generateTagSlug(ctx, name, args.tagId);
    }

    if (args.description !== undefined) updates.description = args.description;
    if (args.color !== undefined) updates.color = args.color;

    await ctx.db.patch(args.tagId, updates);
    return args.tagId;
  },
});

// ─── Remove ─────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: removeTagArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageTags");

    const tag = await ctx.db.get(args.tagId);
    if (!tag) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Tag not found" });
    }

    // Delete all article-tag associations
    const articleTags = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_tag", (q) => q.eq("tagId", args.tagId))
      .collect();
    for (const at of articleTags) {
      await ctx.db.delete(at._id);
    }

    await ctx.db.delete(args.tagId);
    return args.tagId;
  },
});

// ─── Add To Article ─────────────────────────────────────────────────────────

export const addToArticle = mutation({
  args: addTagToArticleArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    // Check for existing association
    const existing = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article_tag", (q) =>
        q.eq("articleId", args.articleId).eq("tagId", args.tagId),
      )
      .first();

    if (existing) return existing._id; // Already tagged

    const linkId = await ctx.db.insert("kb_articleTags", {
      articleId: args.articleId,
      tagId: args.tagId,
      createdAt: Date.now(),
    });

    // Increment tag article count
    const tag = await ctx.db.get(args.tagId);
    if (tag) {
      await ctx.db.patch(args.tagId, {
        articleCount: tag.articleCount + 1,
        updatedAt: Date.now(),
      });
    }

    return linkId;
  },
});

// ─── Remove From Article ────────────────────────────────────────────────────

export const removeFromArticle = mutation({
  args: removeTagFromArticleArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const existing = await ctx.db
      .query("kb_articleTags")
      .withIndex("by_article_tag", (q) =>
        q.eq("articleId", args.articleId).eq("tagId", args.tagId),
      )
      .first();

    if (!existing) return null; // Not tagged

    await ctx.db.delete(existing._id);

    // Decrement tag article count
    const tag = await ctx.db.get(args.tagId);
    if (tag && tag.articleCount > 0) {
      await ctx.db.patch(args.tagId, {
        articleCount: tag.articleCount - 1,
        updatedAt: Date.now(),
      });
    }

    return existing._id;
  },
});
```

**Commit:** `feat(kb): add tag CRUD with article tagging/untagging`

---

## Task 8: Collections CRUD

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/collections.ts`

- [ ] **Step 1: Create the collections file**

Create `ConvexPress-Admin/packages/backend/convex/kb/collections.ts`:

```typescript
/**
 * Knowledge Base System - Collection Functions
 *
 * CRUD and article ordering for collections / learning paths:
 *   list              - All collections for admin (auth required)
 *   listPublic        - Public collections (public)
 *   getById           - Single collection by ID (auth required)
 *   getBySlug         - Single public collection by slug (public)
 *   create            - Create a new collection
 *   update            - Update an existing collection
 *   remove            - Delete a collection and all article associations
 *   addArticle        - Add an article to a collection
 *   removeArticle     - Remove an article from a collection
 *   reorderArticles   - Change article order within a collection
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { generateCollectionSlug } from "./helpers/utils";
import {
  createCollectionArgs,
  updateCollectionArgs,
  removeCollectionArgs,
  addArticleToCollectionArgs,
  removeArticleFromCollectionArgs,
  reorderCollectionArticlesArgs,
  getCollectionByIdArgs,
  getCollectionBySlugArgs,
} from "./validators";

// ─── List (Admin) ───────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    return ctx.db.query("kb_collections").order("desc").collect();
  },
});

// ─── List Public ────────────────────────────────────────────────────────────

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("kb_collections")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .collect();
  },
});

// ─── Get By ID (Admin) ─────────────────────────────────────────────────────

export const getById = query({
  args: getCollectionByIdArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const collection = await ctx.db.get(args.collectionId);
    if (!collection) return null;

    // Get articles in order
    const collectionArticles = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_collection_order", (q) => q.eq("collectionId", args.collectionId))
      .collect();

    const articles = await Promise.all(
      collectionArticles.map(async (ca) => {
        const article = await ctx.db.get(ca.articleId);
        return article
          ? { ...ca, article: { _id: article._id, title: article.title, slug: article.slug, status: article.status } }
          : null;
      }),
    );

    return { ...collection, articles: articles.filter(Boolean) };
  },
});

// ─── Get By Slug (Public) ───────────────────────────────────────────────────

export const getBySlug = query({
  args: getCollectionBySlugArgs,
  handler: async (ctx, args) => {
    const collection = await ctx.db
      .query("kb_collections")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!collection || !collection.isPublic) return null;

    const collectionArticles = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_collection_order", (q) => q.eq("collectionId", collection._id))
      .collect();

    const articles = await Promise.all(
      collectionArticles.map(async (ca) => {
        const article = await ctx.db.get(ca.articleId);
        if (!article || article.status !== "published") return null;
        return {
          _id: article._id,
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          readingTimeMinutes: article.readingTimeMinutes,
          order: ca.order,
          categoryId: article.categoryId,
        };
      }),
    );

    return { ...collection, articles: articles.filter(Boolean) };
  },
});

// ─── Create ─────────────────────────────────────────────────────────────────

export const create = mutation({
  args: createCollectionArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageCollections");

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Collection name is required" });
    }

    const slug = await generateCollectionSlug(ctx, name);
    const now = Date.now();

    const collectionId = await ctx.db.insert("kb_collections", {
      name,
      slug,
      description: args.description,
      coverImageId: args.coverImageId,
      type: args.type,
      isPublic: args.isPublic ?? false,
      articleCount: 0,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return collectionId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

export const update = mutation({
  args: updateCollectionArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageCollections");

    const collection = await ctx.db.get(args.collectionId);
    if (!collection) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Collection not found" });
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Collection name is required" });
      }
      updates.name = name;
      updates.slug = await generateCollectionSlug(ctx, name, args.collectionId);
    }

    if (args.description !== undefined) updates.description = args.description;
    if (args.coverImageId !== undefined) updates.coverImageId = args.coverImageId;
    if (args.type !== undefined) updates.type = args.type;
    if (args.isPublic !== undefined) updates.isPublic = args.isPublic;

    await ctx.db.patch(args.collectionId, updates);
    return args.collectionId;
  },
});

// ─── Remove ─────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: removeCollectionArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageCollections");

    const collection = await ctx.db.get(args.collectionId);
    if (!collection) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Collection not found" });
    }

    // Delete all collection-article associations
    const collectionArticles = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_collection", (q) => q.eq("collectionId", args.collectionId))
      .collect();
    for (const ca of collectionArticles) {
      await ctx.db.delete(ca._id);
    }

    await ctx.db.delete(args.collectionId);
    return args.collectionId;
  },
});

// ─── Add Article ────────────────────────────────────────────────────────────

export const addArticle = mutation({
  args: addArticleToCollectionArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageCollections");

    // Check for existing association
    const existing = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_collection", (q) => q.eq("collectionId", args.collectionId))
      .collect();

    const alreadyAdded = existing.find((ca) => ca.articleId === args.articleId);
    if (alreadyAdded) return alreadyAdded._id;

    const maxOrder = existing.length > 0
      ? Math.max(...existing.map((ca) => ca.order))
      : 0;

    const linkId = await ctx.db.insert("kb_collectionArticles", {
      collectionId: args.collectionId,
      articleId: args.articleId,
      order: maxOrder + 1,
      addedBy: user._id,
      addedAt: Date.now(),
    });

    // Increment collection article count
    const collection = await ctx.db.get(args.collectionId);
    if (collection) {
      await ctx.db.patch(args.collectionId, {
        articleCount: collection.articleCount + 1,
        updatedAt: Date.now(),
      });
    }

    return linkId;
  },
});

// ─── Remove Article ─────────────────────────────────────────────────────────

export const removeArticle = mutation({
  args: removeArticleFromCollectionArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageCollections");

    const collectionArticles = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_collection", (q) => q.eq("collectionId", args.collectionId))
      .collect();

    const toRemove = collectionArticles.find((ca) => ca.articleId === args.articleId);
    if (!toRemove) return null;

    await ctx.db.delete(toRemove._id);

    // Decrement collection article count
    const collection = await ctx.db.get(args.collectionId);
    if (collection && collection.articleCount > 0) {
      await ctx.db.patch(args.collectionId, {
        articleCount: collection.articleCount - 1,
        updatedAt: Date.now(),
      });
    }

    return toRemove._id;
  },
});

// ─── Reorder Articles ───────────────────────────────────────────────────────

export const reorderArticles = mutation({
  args: reorderCollectionArticlesArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageCollections");

    const collectionArticles = await ctx.db
      .query("kb_collectionArticles")
      .withIndex("by_collection", (q) => q.eq("collectionId", args.collectionId))
      .collect();

    const toReorder = collectionArticles.find((ca) => ca.articleId === args.articleId);
    if (!toReorder) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found in collection" });
    }

    await ctx.db.patch(toReorder._id, { order: args.newOrder });
    return toReorder._id;
  },
});
```

**Commit:** `feat(kb): add collection CRUD with article ordering`

---

## Task 9: Templates CRUD

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/templates.ts`

- [ ] **Step 1: Create the templates file**

Create `ConvexPress-Admin/packages/backend/convex/kb/templates.ts`:

```typescript
/**
 * Knowledge Base System - Template Functions
 *
 * CRUD for reusable article templates:
 *   list    - All templates for admin (auth required)
 *   getById - Single template by ID (auth required)
 *   create  - Create a new template
 *   update  - Update an existing template
 *   remove  - Delete a template
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { generateTemplateSlug } from "./helpers/utils";
import {
  createTemplateArgs,
  updateTemplateArgs,
  removeTemplateArgs,
  getTemplateByIdArgs,
} from "./validators";

// ─── List (Admin) ───────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    return ctx.db
      .query("kb_templates")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

// ─── Get By ID (Admin) ─────────────────────────────────────────────────────

export const getById = query({
  args: getTemplateByIdArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    return ctx.db.get(args.templateId);
  },
});

// ─── Create ─────────────────────────────────────────────────────────────────

export const create = mutation({
  args: createTemplateArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageTemplates");

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Template name is required" });
    }

    const slug = await generateTemplateSlug(ctx, name);
    const now = Date.now();

    const templateId = await ctx.db.insert("kb_templates", {
      name,
      slug,
      description: args.description,
      content: args.content,
      category: args.category,
      isDefault: args.isDefault ?? false,
      isActive: true,
      usageCount: 0,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // If setting as default, unset other defaults in same category
    if (args.isDefault) {
      const others = await ctx.db
        .query("kb_templates")
        .withIndex("by_category", (q) => q.eq("category", args.category))
        .collect();
      for (const other of others) {
        if (other._id !== templateId && other.isDefault) {
          await ctx.db.patch(other._id, { isDefault: false, updatedAt: now });
        }
      }
    }

    return templateId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

export const update = mutation({
  args: updateTemplateArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageTemplates");

    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Template not found" });
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Template name is required" });
      }
      updates.name = name;
      updates.slug = await generateTemplateSlug(ctx, name, args.templateId);
    }

    if (args.description !== undefined) updates.description = args.description;
    if (args.content !== undefined) updates.content = args.content;
    if (args.category !== undefined) updates.category = args.category;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    if (args.isDefault !== undefined) {
      updates.isDefault = args.isDefault;
      if (args.isDefault) {
        const category = args.category ?? template.category;
        const others = await ctx.db
          .query("kb_templates")
          .withIndex("by_category", (q) => q.eq("category", category))
          .collect();
        for (const other of others) {
          if (other._id !== args.templateId && other.isDefault) {
            await ctx.db.patch(other._id, { isDefault: false, updatedAt: Date.now() });
          }
        }
      }
    }

    await ctx.db.patch(args.templateId, updates);
    return args.templateId;
  },
});

// ─── Remove ─────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: removeTemplateArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageTemplates");

    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Template not found" });
    }

    await ctx.db.delete(args.templateId);
    return args.templateId;
  },
});
```

**Commit:** `feat(kb): add template CRUD with default management`

---

## Task 10: Comments + Voting

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/comments.ts`

- [ ] **Step 1: Create the comments file**

Create `ConvexPress-Admin/packages/backend/convex/kb/comments.ts`:

```typescript
/**
 * Knowledge Base System - Comment Functions
 *
 * Threaded comments with voting for KB articles:
 *   listByArticle - Threaded comments for an article (public)
 *   create        - Create a comment (auth required)
 *   update        - Update own comment (auth required)
 *   deleteComment - Soft delete a comment (auth: owner or moderator)
 *   vote          - Upvote or downvote a comment (auth required)
 *   removeVote    - Remove a vote (auth required)
 *   getCount      - Comment count for an article (public)
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { KB_EVENTS, SYSTEM } from "../events/constants";
import {
  listCommentsByArticleArgs,
  createCommentArgs,
  updateCommentArgs,
  deleteCommentArgs,
  voteCommentArgs,
  removeVoteArgs,
  getCommentCountArgs,
} from "./validators";

// ─── List By Article (Public, threaded) ─────────────────────────────────────

export const listByArticle = query({
  args: listCommentsByArticleArgs,
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("kb_comments")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();

    // Only show approved, non-deleted comments
    const visible = comments.filter((c) => c.isApproved && !c.isDeleted);

    // Enrich with author info
    const enriched = await Promise.all(
      visible.map(async (comment) => {
        const author = await ctx.db.get(comment.userId);
        return {
          ...comment,
          author: author
            ? {
                _id: author._id,
                displayName: (author as any).displayName ?? author.email,
                avatarUrl: (author as any).avatarUrl,
              }
            : null,
        };
      }),
    );

    // Build threaded structure: top-level comments with nested replies
    const topLevel = enriched.filter((c) => !c.parentId);
    const replies = enriched.filter((c) => c.parentId);

    return topLevel.map((parent) => ({
      ...parent,
      replies: replies
        .filter((r) => r.parentId === parent._id)
        .sort((a, b) => a.createdAt - b.createdAt),
    }));
  },
});

// ─── Create ─────────────────────────────────────────────────────────────────

export const create = mutation({
  args: createCommentArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    const content = args.content.trim();
    if (!content) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Comment content is required" });
    }

    // Validate parent if replying (max 2-level nesting)
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.articleId !== args.articleId) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Invalid parent comment" });
      }
      if (parent.parentId) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Maximum nesting depth is 2 levels" });
      }
    }

    const now = Date.now();
    const commentId = await ctx.db.insert("kb_comments", {
      articleId: args.articleId,
      userId: user._id,
      parentId: args.parentId,
      content,
      isApproved: true, // Auto-approve by default; can be changed in settings
      isEdited: false,
      isDeleted: false,
      upvotes: 0,
      downvotes: 0,
      createdAt: now,
      updatedAt: now,
    });

    await emitEvent(ctx, KB_EVENTS.COMMENT_CREATED, SYSTEM.KB, {
      commentId,
      articleId: args.articleId,
      userId: user._id,
      parentId: args.parentId,
    });

    return commentId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

export const update = mutation({
  args: updateCommentArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Comment not found" });
    }

    // Only owner or moderator can edit
    if (comment.userId !== user._id) {
      await requireCan(ctx, "kb.moderateComments");
    }

    const content = args.content.trim();
    if (!content) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Comment content is required" });
    }

    await ctx.db.patch(args.commentId, {
      content,
      isEdited: true,
      updatedAt: Date.now(),
    });

    return args.commentId;
  },
});

// ─── Delete (Soft) ──────────────────────────────────────────────────────────

export const deleteComment = mutation({
  args: deleteCommentArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Comment not found" });
    }

    // Only owner or moderator can delete
    if (comment.userId !== user._id) {
      await requireCan(ctx, "kb.moderateComments");
    }

    await ctx.db.patch(args.commentId, {
      isDeleted: true,
      content: "[deleted]",
      updatedAt: Date.now(),
    });

    return args.commentId;
  },
});

// ─── Vote ───────────────────────────────────────────────────────────────────

export const vote = mutation({
  args: voteCommentArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Comment not found" });
    }

    // Check for existing vote
    const existingVote = await ctx.db
      .query("kb_commentVotes")
      .withIndex("by_user_comment", (q) =>
        q.eq("userId", user._id).eq("commentId", args.commentId),
      )
      .first();

    if (existingVote) {
      if (existingVote.voteType === args.voteType) {
        return existingVote._id; // Same vote already exists
      }

      // Change vote direction
      await ctx.db.patch(existingVote._id, {
        voteType: args.voteType,
        createdAt: Date.now(),
      });

      // Update denormalized counts
      if (args.voteType === "up") {
        await ctx.db.patch(args.commentId, {
          upvotes: comment.upvotes + 1,
          downvotes: Math.max(0, comment.downvotes - 1),
        });
      } else {
        await ctx.db.patch(args.commentId, {
          upvotes: Math.max(0, comment.upvotes - 1),
          downvotes: comment.downvotes + 1,
        });
      }

      return existingVote._id;
    }

    // New vote
    const voteId = await ctx.db.insert("kb_commentVotes", {
      commentId: args.commentId,
      userId: user._id,
      voteType: args.voteType,
      createdAt: Date.now(),
    });

    // Update denormalized counts
    if (args.voteType === "up") {
      await ctx.db.patch(args.commentId, { upvotes: comment.upvotes + 1 });
    } else {
      await ctx.db.patch(args.commentId, { downvotes: comment.downvotes + 1 });
    }

    return voteId;
  },
});

// ─── Remove Vote ────────────────────────────────────────────────────────────

export const removeVote = mutation({
  args: removeVoteArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const existingVote = await ctx.db
      .query("kb_commentVotes")
      .withIndex("by_user_comment", (q) =>
        q.eq("userId", user._id).eq("commentId", args.commentId),
      )
      .first();

    if (!existingVote) return null;

    const comment = await ctx.db.get(args.commentId);
    if (comment) {
      if (existingVote.voteType === "up") {
        await ctx.db.patch(args.commentId, {
          upvotes: Math.max(0, comment.upvotes - 1),
        });
      } else {
        await ctx.db.patch(args.commentId, {
          downvotes: Math.max(0, comment.downvotes - 1),
        });
      }
    }

    await ctx.db.delete(existingVote._id);
    return existingVote._id;
  },
});

// ─── Get Count (Public) ─────────────────────────────────────────────────────

export const getCount = query({
  args: getCommentCountArgs,
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("kb_comments")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();

    return comments.filter((c) => c.isApproved && !c.isDeleted).length;
  },
});
```

**Commit:** `feat(kb): add threaded comments with voting`

---

## Task 11: Feedback + Ratings

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/feedback.ts`

- [ ] **Step 1: Create the feedback file**

Create `ConvexPress-Admin/packages/backend/convex/kb/feedback.ts`:

```typescript
/**
 * Knowledge Base System - Feedback Functions
 *
 * Helpful/not-helpful feedback and star ratings for articles:
 *   submitHelpful     - Submit helpful/not-helpful feedback (session-deduplicated)
 *   submitRating      - Submit a star rating (session-deduplicated)
 *   getArticleStats   - Aggregate feedback stats for an article (public)
 *   getUserFeedback   - Check if session has already provided feedback (public)
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { KB_EVENTS, SYSTEM } from "../events/constants";
import {
  submitHelpfulArgs,
  submitRatingArgs,
  getArticleFeedbackStatsArgs,
  getUserFeedbackArgs,
} from "./validators";

// ─── Submit Helpful ─────────────────────────────────────────────────────────

export const submitHelpful = mutation({
  args: submitHelpfulArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    // Check for existing feedback from this session
    const existing = await ctx.db
      .query("kb_articleFeedback")
      .withIndex("by_session_article", (q) =>
        q.eq("sessionId", args.sessionId).eq("articleId", args.articleId),
      )
      .first();

    if (existing) {
      // Update existing feedback
      const oldIsHelpful = existing.isHelpful;
      await ctx.db.patch(existing._id, {
        isHelpful: args.isHelpful,
        comment: args.comment,
      });

      // Update denormalized counts on article
      const article = await ctx.db.get(args.articleId);
      if (article && oldIsHelpful !== args.isHelpful) {
        if (args.isHelpful) {
          await ctx.db.patch(args.articleId, {
            helpfulVotes: article.helpfulVotes + 1,
            notHelpfulVotes: Math.max(0, article.notHelpfulVotes - 1),
          });
        } else {
          await ctx.db.patch(args.articleId, {
            helpfulVotes: Math.max(0, article.helpfulVotes - 1),
            notHelpfulVotes: article.notHelpfulVotes + 1,
          });
        }
      }

      return existing._id;
    }

    // Create new feedback
    const feedbackId = await ctx.db.insert("kb_articleFeedback", {
      articleId: args.articleId,
      userId: user?._id,
      sessionId: args.sessionId,
      isHelpful: args.isHelpful,
      comment: args.comment,
      createdAt: Date.now(),
    });

    // Update denormalized counts
    const article = await ctx.db.get(args.articleId);
    if (article) {
      if (args.isHelpful) {
        await ctx.db.patch(args.articleId, {
          helpfulVotes: article.helpfulVotes + 1,
        });
      } else {
        await ctx.db.patch(args.articleId, {
          notHelpfulVotes: article.notHelpfulVotes + 1,
        });
      }
    }

    await emitEvent(ctx, KB_EVENTS.FEEDBACK_SUBMITTED, SYSTEM.KB, {
      feedbackId,
      articleId: args.articleId,
      isHelpful: args.isHelpful,
    });

    return feedbackId;
  },
});

// ─── Submit Rating ──────────────────────────────────────────────────────────

export const submitRating = mutation({
  args: submitRatingArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    if (args.rating < 1 || args.rating > 5) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Rating must be between 1 and 5" });
    }

    // Check for existing feedback from this session
    const existing = await ctx.db
      .query("kb_articleFeedback")
      .withIndex("by_session_article", (q) =>
        q.eq("sessionId", args.sessionId).eq("articleId", args.articleId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        rating: args.rating,
        comment: args.comment,
      });
      return existing._id;
    }

    const feedbackId = await ctx.db.insert("kb_articleFeedback", {
      articleId: args.articleId,
      userId: user?._id,
      sessionId: args.sessionId,
      isHelpful: args.rating >= 4,
      rating: args.rating,
      comment: args.comment,
      createdAt: Date.now(),
    });

    return feedbackId;
  },
});

// ─── Get Article Stats (Public) ─────────────────────────────────────────────

export const getArticleStats = query({
  args: getArticleFeedbackStatsArgs,
  handler: async (ctx, args) => {
    const feedback = await ctx.db
      .query("kb_articleFeedback")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();

    const helpful = feedback.filter((f) => f.isHelpful).length;
    const notHelpful = feedback.filter((f) => !f.isHelpful).length;
    const ratings = feedback.filter((f) => f.rating !== undefined);
    const avgRating = ratings.length > 0
      ? ratings.reduce((sum, f) => sum + (f.rating ?? 0), 0) / ratings.length
      : null;

    return {
      totalFeedback: feedback.length,
      helpful,
      notHelpful,
      helpfulPercent: feedback.length > 0 ? Math.round((helpful / feedback.length) * 100) : 0,
      avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      ratingCount: ratings.length,
    };
  },
});

// ─── Get User Feedback (Public) ─────────────────────────────────────────────

export const getUserFeedback = query({
  args: getUserFeedbackArgs,
  handler: async (ctx, args) => {
    return ctx.db
      .query("kb_articleFeedback")
      .withIndex("by_session_article", (q) =>
        q.eq("sessionId", args.sessionId).eq("articleId", args.articleId),
      )
      .first();
  },
});
```

**Commit:** `feat(kb): add article feedback and ratings`

---

## Task 12: Bookmarks

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/bookmarks.ts`

- [ ] **Step 1: Create the bookmarks file**

Create `ConvexPress-Admin/packages/backend/convex/kb/bookmarks.ts`:

```typescript
/**
 * Knowledge Base System - Bookmark Functions
 *
 * User bookmark management:
 *   list         - List all bookmarks for the current user (auth required)
 *   isBookmarked - Check if an article is bookmarked (auth required)
 *   toggle       - Toggle bookmark on/off (auth required)
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { toggleBookmarkArgs, isBookmarkedArgs } from "./validators";

// ─── List ───────────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const bookmarks = await ctx.db
      .query("kb_bookmarks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    // Enrich with article details
    return Promise.all(
      bookmarks.map(async (bookmark) => {
        const article = await ctx.db.get(bookmark.articleId);
        return {
          ...bookmark,
          article: article
            ? {
                _id: article._id,
                title: article.title,
                slug: article.slug,
                excerpt: article.excerpt,
                status: article.status,
                categoryId: article.categoryId,
              }
            : null,
        };
      }),
    );
  },
});

// ─── Is Bookmarked ──────────────────────────────────────────────────────────

export const isBookmarked = query({
  args: isBookmarkedArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return false;

    const bookmark = await ctx.db
      .query("kb_bookmarks")
      .withIndex("by_user_article", (q) =>
        q.eq("userId", user._id).eq("articleId", args.articleId),
      )
      .first();

    return !!bookmark;
  },
});

// ─── Toggle ─────────────────────────────────────────────────────────────────

export const toggle = mutation({
  args: toggleBookmarkArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const existing = await ctx.db
      .query("kb_bookmarks")
      .withIndex("by_user_article", (q) =>
        q.eq("userId", user._id).eq("articleId", args.articleId),
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { bookmarked: false };
    }

    await ctx.db.insert("kb_bookmarks", {
      userId: user._id,
      articleId: args.articleId,
      notes: args.notes,
      createdAt: Date.now(),
    });

    return { bookmarked: true };
  },
});
```

**Commit:** `feat(kb): add bookmark toggle and list`

---

## Task 13: User Progress

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/progress.ts`

- [ ] **Step 1: Create the progress file**

Create `ConvexPress-Admin/packages/backend/convex/kb/progress.ts`:

```typescript
/**
 * Knowledge Base System - User Progress Functions
 *
 * Reading progress tracking:
 *   getProgress    - Get reading progress for an article (auth required)
 *   trackProgress  - Update reading progress (auth required)
 *   getUserHistory - Get recent reading history (auth required)
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { getProgressArgs, trackProgressArgs } from "./validators";

// ─── Get Progress ───────────────────────────────────────────────────────────

export const getProgress = query({
  args: getProgressArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    return ctx.db
      .query("kb_userProgress")
      .withIndex("by_user_article", (q) =>
        q.eq("userId", user._id).eq("articleId", args.articleId),
      )
      .first();
  },
});

// ─── Track Progress ─────────────────────────────────────────────────────────

export const trackProgress = mutation({
  args: trackProgressArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const existing = await ctx.db
      .query("kb_userProgress")
      .withIndex("by_user_article", (q) =>
        q.eq("userId", user._id).eq("articleId", args.articleId),
      )
      .first();

    const now = Date.now();

    if (existing) {
      // Only update if progress increased
      const newPercent = Math.max(existing.progressPercent, args.progressPercent);
      const newReadTime = existing.readTime + args.readTime;
      const completed = args.completedRead ?? (newPercent >= 90);

      await ctx.db.patch(existing._id, {
        progressPercent: newPercent,
        scrollPosition: args.scrollPosition,
        lastReadAt: now,
        readTime: newReadTime,
        completedRead: completed || existing.completedRead,
      });

      return existing._id;
    }

    const progressId = await ctx.db.insert("kb_userProgress", {
      userId: user._id,
      articleId: args.articleId,
      progressPercent: args.progressPercent,
      scrollPosition: args.scrollPosition,
      lastReadAt: now,
      readTime: args.readTime,
      completedRead: args.completedRead ?? (args.progressPercent >= 90),
    });

    return progressId;
  },
});

// ─── Get User History ───────────────────────────────────────────────────────

export const getUserHistory = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const progress = await ctx.db
      .query("kb_userProgress")
      .withIndex("by_user_recent", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(20);

    return Promise.all(
      progress.map(async (p) => {
        const article = await ctx.db.get(p.articleId);
        return {
          ...p,
          article: article
            ? {
                _id: article._id,
                title: article.title,
                slug: article.slug,
                categoryId: article.categoryId,
              }
            : null,
        };
      }),
    );
  },
});
```

**Commit:** `feat(kb): add reading progress tracking`

---

## Task 14: Editorial Workflows

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/workflows.ts`

- [ ] **Step 1: Create the workflows file**

Create `ConvexPress-Admin/packages/backend/convex/kb/workflows.ts`:

```typescript
/**
 * Knowledge Base System - Workflow Functions
 *
 * Editorial workflow management:
 *   list          - All workflows (admin)
 *   get           - Single workflow by ID (admin)
 *   getDefault    - Get the default workflow (admin)
 *   create        - Create a workflow definition
 *   update        - Update a workflow definition
 *   remove        - Delete a workflow
 *   startWorkflow - Start a workflow for an article
 *   approveStep   - Approve the current workflow step
 *   rejectStep    - Reject the current workflow step
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import {
  createWorkflowArgs,
  updateWorkflowArgs,
  removeWorkflowArgs,
  startWorkflowArgs,
  approveStepArgs,
  rejectStepArgs,
} from "./validators";
import { v } from "convex/values";

// ─── List (Admin) ───────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    return ctx.db.query("kb_workflows").collect();
  },
});

// ─── Get (Admin) ────────────────────────────────────────────────────────────

export const get = query({
  args: { workflowId: v.id("kb_workflows") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    return ctx.db.get(args.workflowId);
  },
});

// ─── Get Default ────────────────────────────────────────────────────────────

export const getDefault = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    return ctx.db
      .query("kb_workflows")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .first();
  },
});

// ─── Create ─────────────────────────────────────────────────────────────────

export const create = mutation({
  args: createWorkflowArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageWorkflows");

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow name is required" });
    }

    if (args.steps.length === 0) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow must have at least one step" });
    }

    const now = Date.now();

    // If setting as default, unset other defaults
    if (args.isDefault) {
      const existingDefault = await ctx.db
        .query("kb_workflows")
        .withIndex("by_default", (q) => q.eq("isDefault", true))
        .first();
      if (existingDefault) {
        await ctx.db.patch(existingDefault._id, { isDefault: false, updatedAt: now });
      }
    }

    const workflowId = await ctx.db.insert("kb_workflows", {
      name,
      description: args.description,
      steps: args.steps,
      isDefault: args.isDefault ?? false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return workflowId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

export const update = mutation({
  args: updateWorkflowArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageWorkflows");

    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Workflow not found" });
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow name is required" });
      }
      updates.name = name;
    }

    if (args.description !== undefined) updates.description = args.description;
    if (args.steps !== undefined) {
      if (args.steps.length === 0) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow must have at least one step" });
      }
      updates.steps = args.steps;
    }
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    if (args.isDefault !== undefined) {
      updates.isDefault = args.isDefault;
      if (args.isDefault) {
        const existingDefault = await ctx.db
          .query("kb_workflows")
          .withIndex("by_default", (q) => q.eq("isDefault", true))
          .first();
        if (existingDefault && existingDefault._id !== args.workflowId) {
          await ctx.db.patch(existingDefault._id, { isDefault: false, updatedAt: Date.now() });
        }
      }
    }

    await ctx.db.patch(args.workflowId, updates);
    return args.workflowId;
  },
});

// ─── Remove ─────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: removeWorkflowArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageWorkflows");

    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Workflow not found" });
    }

    // Delete all article workflow instances using this workflow
    const instances = await ctx.db
      .query("kb_articleWorkflows")
      .withIndex("by_status")
      .collect();
    for (const instance of instances) {
      if (instance.workflowId === args.workflowId) {
        await ctx.db.delete(instance._id);
      }
    }

    await ctx.db.delete(args.workflowId);
    return args.workflowId;
  },
});

// ─── Start Workflow ─────────────────────────────────────────────────────────

export const startWorkflow = mutation({
  args: startWorkflowArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const article = await ctx.db.get(args.articleId);
    if (!article) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found" });
    }

    // Get the workflow (specified or default)
    let workflow;
    if (args.workflowId) {
      workflow = await ctx.db.get(args.workflowId);
    } else {
      workflow = await ctx.db
        .query("kb_workflows")
        .withIndex("by_default", (q) => q.eq("isDefault", true))
        .first();
    }

    if (!workflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "No workflow found" });
    }

    if (!workflow.isActive) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow is not active" });
    }

    // Check for existing active workflow on this article
    const existingWorkflow = await ctx.db
      .query("kb_articleWorkflows")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();
    const activeWorkflow = existingWorkflow.find(
      (w) => w.status === "inProgress" || w.status === "pendingReview",
    );
    if (activeWorkflow) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Article already has an active workflow" });
    }

    // Update article status to review
    await ctx.db.patch(args.articleId, {
      status: "review",
      updatedAt: Date.now(),
    });

    const now = Date.now();
    const firstStep = workflow.steps[0];
    const articleWorkflowId = await ctx.db.insert("kb_articleWorkflows", {
      articleId: args.articleId,
      workflowId: workflow._id,
      currentStep: 0,
      status: "pendingReview",
      assigneeId: firstStep?.assigneeId,
      dueDate: undefined,
      approvals: [],
      createdAt: now,
      updatedAt: now,
    });

    return articleWorkflowId;
  },
});

// ─── Approve Step ───────────────────────────────────────────────────────────

export const approveStep = mutation({
  args: approveStepArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.publish");

    const articleWorkflow = await ctx.db.get(args.articleWorkflowId);
    if (!articleWorkflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article workflow not found" });
    }

    if (articleWorkflow.status !== "pendingReview") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow is not pending review" });
    }

    const workflow = await ctx.db.get(articleWorkflow.workflowId);
    if (!workflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Workflow definition not found" });
    }

    const currentStep = workflow.steps[articleWorkflow.currentStep];
    if (!currentStep) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Invalid workflow step" });
    }

    const newApprovals = [...articleWorkflow.approvals, user._id];
    const now = Date.now();

    // Check if enough approvals for this step
    if (newApprovals.length >= currentStep.requiredApprovals) {
      const nextStepIndex = articleWorkflow.currentStep + 1;

      if (nextStepIndex >= workflow.steps.length) {
        // All steps completed -- workflow approved
        await ctx.db.patch(args.articleWorkflowId, {
          status: "approved",
          approvals: newApprovals,
          updatedAt: now,
        });

        // Publish the article
        const article = await ctx.db.get(articleWorkflow.articleId);
        if (article) {
          await ctx.db.patch(articleWorkflow.articleId, {
            status: "published",
            publishedAt: now,
            updatedAt: now,
            meilisearchSynced: false,
            ragSynced: false,
          });
        }
      } else {
        // Move to next step
        const nextStep = workflow.steps[nextStepIndex];
        await ctx.db.patch(args.articleWorkflowId, {
          currentStep: nextStepIndex,
          approvals: [],
          assigneeId: nextStep?.assigneeId,
          updatedAt: now,
        });
      }
    } else {
      // Record approval but wait for more
      await ctx.db.patch(args.articleWorkflowId, {
        approvals: newApprovals,
        updatedAt: now,
      });
    }

    return args.articleWorkflowId;
  },
});

// ─── Reject Step ────────────────────────────────────────────────────────────

export const rejectStep = mutation({
  args: rejectStepArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.publish");

    const articleWorkflow = await ctx.db.get(args.articleWorkflowId);
    if (!articleWorkflow) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article workflow not found" });
    }

    if (articleWorkflow.status !== "pendingReview") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Workflow is not pending review" });
    }

    const now = Date.now();
    await ctx.db.patch(args.articleWorkflowId, {
      status: "rejected",
      updatedAt: now,
    });

    // Revert article to draft
    await ctx.db.patch(articleWorkflow.articleId, {
      status: "draft",
      updatedAt: now,
    });

    return args.articleWorkflowId;
  },
});
```

**Commit:** `feat(kb): add editorial workflow management with approval/rejection`

---

## Task 15: Analytics

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/analytics.ts`

- [ ] **Step 1: Create the analytics file**

Create `ConvexPress-Admin/packages/backend/convex/kb/analytics.ts`:

```typescript
/**
 * Knowledge Base System - Analytics Functions
 *
 * Page view tracking and search analytics:
 *   trackPageView      - Record a page view (session-deduplicated, mutation)
 *   updateDuration     - Update view duration (mutation)
 *   trackSearch        - Log a search query (mutation)
 *   getDashboardStats  - KB-wide analytics stats (admin query)
 *   getArticleStats    - Single article analytics (admin query)
 *   getSearchAnalytics - Search query analytics (admin query)
 */

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import {
  trackPageViewArgs,
  updateDurationArgs,
  trackSearchArgs,
  getDashboardStatsArgs,
  getArticleAnalyticsArgs,
  getSearchAnalyticsArgs,
  PAGE_VIEW_DEDUP_WINDOW_MS,
} from "./validators";

// ─── Track Page View ────────────────────────────────────────────────────────

export const trackPageView = mutation({
  args: trackPageViewArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();

    // Session-based deduplication: skip if same session+article viewed within 30 min
    const recentViews = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(10);

    const recentForArticle = recentViews.find(
      (v) => v.articleId === args.articleId && now - v.createdAt < PAGE_VIEW_DEDUP_WINDOW_MS,
    );

    if (recentForArticle) {
      return recentForArticle._id; // Deduplicated
    }

    // Record the view
    const viewId = await ctx.db.insert("kb_pageViews", {
      articleId: args.articleId,
      userId: user?._id,
      sessionId: args.sessionId,
      referrer: args.referrer,
      userAgent: args.userAgent,
      duration: undefined,
      createdAt: now,
    });

    // Increment article view counts
    const article = await ctx.db.get(args.articleId);
    if (article) {
      const isNewUnique = !recentViews.some((v) => v.articleId === args.articleId);
      await ctx.db.patch(args.articleId, {
        viewCount: article.viewCount + 1,
        uniqueViewCount: isNewUnique ? article.uniqueViewCount + 1 : article.uniqueViewCount,
      });
    }

    return viewId;
  },
});

// ─── Update Duration ────────────────────────────────────────────────────────

export const updateDuration = mutation({
  args: updateDurationArgs,
  handler: async (ctx, args) => {
    const view = await ctx.db.get(args.pageViewId);
    if (!view) return;

    await ctx.db.patch(args.pageViewId, { duration: args.duration });
  },
});

// ─── Track Search ───────────────────────────────────────────────────────────

export const trackSearch = mutation({
  args: trackSearchArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const searchId = await ctx.db.insert("kb_searchQueries", {
      query: args.query,
      resultCount: args.resultCount,
      userId: user?._id,
      clickedArticleId: args.clickedArticleId,
      source: args.source,
      createdAt: Date.now(),
    });

    return searchId;
  },
});

// ─── Get Dashboard Stats (Admin) ────────────────────────────────────────────

export const getDashboardStats = query({
  args: getDashboardStatsArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.viewAnalytics");

    const now = Date.now();
    const startDate = args.startDate ?? now - 30 * 24 * 60 * 60 * 1000; // Default 30 days
    const endDate = args.endDate ?? now;

    // Article counts by status
    const allArticles = await ctx.db.query("kb_articles").collect();
    const statusCounts = {
      draft: 0,
      review: 0,
      published: 0,
      archived: 0,
    };
    for (const article of allArticles) {
      statusCounts[article.status]++;
    }

    // Page views in range
    const views = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_date")
      .collect();
    const viewsInRange = views.filter((v) => v.createdAt >= startDate && v.createdAt <= endDate);
    const totalViews = viewsInRange.length;
    const uniqueSessions = new Set(viewsInRange.map((v) => v.sessionId)).size;

    // Search queries in range
    const searches = await ctx.db
      .query("kb_searchQueries")
      .withIndex("by_date")
      .collect();
    const searchesInRange = searches.filter((s) => s.createdAt >= startDate && s.createdAt <= endDate);

    // Feedback stats
    const feedback = await ctx.db.query("kb_articleFeedback").collect();
    const helpful = feedback.filter((f) => f.isHelpful).length;
    const total = feedback.length;

    return {
      articles: statusCounts,
      totalArticles: allArticles.length,
      views: {
        total: totalViews,
        uniqueSessions,
      },
      searches: {
        total: searchesInRange.length,
        avgResultCount: searchesInRange.length > 0
          ? Math.round(searchesInRange.reduce((s, q) => s + q.resultCount, 0) / searchesInRange.length)
          : 0,
      },
      feedback: {
        total,
        helpfulPercent: total > 0 ? Math.round((helpful / total) * 100) : 0,
      },
    };
  },
});

// ─── Get Article Stats (Admin) ──────────────────────────────────────────────

export const getArticleStats = query({
  args: getArticleAnalyticsArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.viewAnalytics");

    const views = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_article", (q) => q.eq("articleId", args.articleId))
      .collect();

    const durations = views.filter((v) => v.duration).map((v) => v.duration!);
    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : 0;

    const uniqueSessions = new Set(views.map((v) => v.sessionId)).size;

    // Views over time (last 30 days, grouped by day)
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recentViews = views.filter((v) => v.createdAt >= thirtyDaysAgo);

    const viewsByDay: Record<string, number> = {};
    for (const view of recentViews) {
      const day = new Date(view.createdAt).toISOString().slice(0, 10);
      viewsByDay[day] = (viewsByDay[day] ?? 0) + 1;
    }

    return {
      totalViews: views.length,
      uniqueSessions,
      avgDuration,
      viewsByDay,
    };
  },
});

// ─── Get Search Analytics (Admin) ───────────────────────────────────────────

export const getSearchAnalytics = query({
  args: getSearchAnalyticsArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.viewAnalytics");

    const now = Date.now();
    const startDate = args.startDate ?? now - 30 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate ?? now;
    const limit = args.limit ?? 20;

    const searches = await ctx.db
      .query("kb_searchQueries")
      .withIndex("by_date")
      .collect();

    const inRange = searches.filter((s) => s.createdAt >= startDate && s.createdAt <= endDate);

    // Group by query
    const queryCounts: Record<string, { count: number; avgResults: number; clicked: number }> = {};
    for (const search of inRange) {
      const key = search.query.toLowerCase().trim();
      if (!queryCounts[key]) {
        queryCounts[key] = { count: 0, avgResults: 0, clicked: 0 };
      }
      queryCounts[key].count++;
      queryCounts[key].avgResults += search.resultCount;
      if (search.clickedArticleId) queryCounts[key].clicked++;
    }

    // Calculate averages and sort
    const topQueries = Object.entries(queryCounts)
      .map(([query, stats]) => ({
        query,
        count: stats.count,
        avgResults: Math.round(stats.avgResults / stats.count),
        clickRate: stats.count > 0 ? Math.round((stats.clicked / stats.count) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    // Zero-result queries
    const zeroResults = inRange
      .filter((s) => s.resultCount === 0)
      .map((s) => s.query);
    const uniqueZeroResults = [...new Set(zeroResults.map((q) => q.toLowerCase().trim()))];

    return {
      totalSearches: inRange.length,
      topQueries,
      zeroResultQueries: uniqueZeroResults.slice(0, limit),
      bySource: {
        convex: inRange.filter((s) => s.source === "convex").length,
        meilisearch: inRange.filter((s) => s.source === "meilisearch").length,
        rag: inRange.filter((s) => s.source === "rag").length,
      },
    };
  },
});
```

**Commit:** `feat(kb): add page view tracking and analytics queries`

---

## Task 16: Search (Convex-native)

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/search.ts`

- [ ] **Step 1: Create the search file**

Create `ConvexPress-Admin/packages/backend/convex/kb/search.ts`:

```typescript
/**
 * Knowledge Base System - Search Functions
 *
 * Convex-native full-text search:
 *   search    - Search published articles via Convex searchIndex
 *   logSearch - Log a search query for analytics (called after search)
 */

import { query, mutation } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { searchArticlesArgs, trackSearchArgs } from "./validators";

// ─── Search ─────────────────────────────────────────────────────────────────

export const search = query({
  args: searchArticlesArgs,
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    if (!args.query.trim()) return { results: [], total: 0 };

    const results = await ctx.db
      .query("kb_articles")
      .withSearchIndex("search_articles", (q) => {
        let sq = q.search("contentPlainText", args.query);
        sq = sq.eq("status", "published");
        if (args.categoryId) {
          sq = sq.eq("categoryId", args.categoryId);
        }
        return sq;
      })
      .take(limit);

    const enriched = await Promise.all(
      results.map(async (article) => {
        const category = article.categoryId ? await ctx.db.get(article.categoryId) : null;
        return {
          _id: article._id,
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          categoryId: article.categoryId,
          categoryName: category?.name ?? null,
          categorySlug: category?.slug ?? null,
          viewCount: article.viewCount,
          readingTimeMinutes: article.readingTimeMinutes,
          publishedAt: article.publishedAt,
        };
      }),
    );

    return { results: enriched, total: enriched.length };
  },
});

// ─── Log Search ─────────────────────────────────────────────────────────────

export const logSearch = mutation({
  args: trackSearchArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    return ctx.db.insert("kb_searchQueries", {
      query: args.query,
      resultCount: args.resultCount,
      userId: user?._id,
      clickedArticleId: args.clickedArticleId,
      source: args.source,
      createdAt: Date.now(),
    });
  },
});
```

**Commit:** `feat(kb): add Convex-native full-text search`

---

## Task 17: Internals

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/internals.ts`

- [ ] **Step 1: Create the internals file**

Create `ConvexPress-Admin/packages/backend/convex/kb/internals.ts`:

```typescript
/**
 * Knowledge Base System - Internal Functions
 *
 * Non-client-callable functions for scheduled operations:
 *   publishScheduled   - Auto-publish a scheduled article
 *   syncToMeilisearch  - Sync article to Meilisearch (placeholder)
 *   syncToRag          - Sync article to RAG (placeholder)
 *   cleanupPageViews   - Purge old page views (90-day retention)
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { emitEvent } from "../helpers/events";
import { KB_EVENTS, SYSTEM } from "../events/constants";

// ─── Publish Scheduled ──────────────────────────────────────────────────────

export const publishScheduled = internalMutation({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, { articleId }) => {
    const article = await ctx.db.get(articleId);
    if (!article || article.status !== "draft" || !article.scheduledAt) return;

    const now = Date.now();
    if (article.scheduledAt > now) return; // Not yet time

    await ctx.db.patch(articleId, {
      status: "published",
      publishedAt: now,
      scheduledAt: undefined,
      updatedAt: now,
      meilisearchSynced: false,
      ragSynced: false,
    });

    // Update category article count
    if (article.categoryId) {
      const category = await ctx.db.get(article.categoryId);
      if (category) {
        await ctx.db.patch(article.categoryId, {
          articleCount: category.articleCount + 1,
          updatedAt: now,
        });
      }
    }

    await emitEvent(ctx, KB_EVENTS.ARTICLE_PUBLISHED, SYSTEM.KB, {
      articleId,
      title: article.title,
      authorId: article.authorId,
      publishedAt: now,
      scheduledPublish: true,
    });
  },
});

// ─── Sync to Meilisearch (placeholder) ──────────────────────────────────────

export const syncToMeilisearch = internalMutation({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, { articleId }) => {
    const article = await ctx.db.get(articleId);
    if (!article) return;

    // Placeholder: actual Meilisearch sync will be implemented in Task 34
    // For now, just mark as synced
    await ctx.db.patch(articleId, {
      meilisearchSynced: true,
      meilisearchSyncedAt: Date.now(),
    });
  },
});

// ─── Sync to RAG (placeholder) ──────────────────────────────────────────────

export const syncToRag = internalMutation({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, { articleId }) => {
    const article = await ctx.db.get(articleId);
    if (!article) return;

    // Placeholder: actual RAG sync will be implemented in Task 35
    // For now, just mark as synced
    await ctx.db.patch(articleId, {
      ragSynced: true,
      ragSyncedAt: Date.now(),
    });
  },
});

// ─── Cleanup Page Views ─────────────────────────────────────────────────────

export const cleanupPageViews = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

    const oldViews = await ctx.db
      .query("kb_pageViews")
      .withIndex("by_date")
      .collect();

    let deleted = 0;
    for (const view of oldViews) {
      if (view.createdAt < ninetyDaysAgo) {
        await ctx.db.delete(view._id);
        deleted++;
      }
      // Safety limit to avoid timeout
      if (deleted >= 500) break;
    }

    return { deleted };
  },
});

// ─── Get Unsynced Articles ──────────────────────────────────────────────────

export const getUnsyncedForMeilisearch = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("kb_articles")
      .withIndex("by_meilisearch_sync", (q) => q.eq("meilisearchSynced", false))
      .take(50);
  },
});

export const getUnsyncedForRag = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("kb_articles")
      .withIndex("by_rag_sync", (q) => q.eq("ragSynced", false))
      .take(50);
  },
});
```

**Commit:** `feat(kb): add internal functions for scheduled publish and cleanup`

---

## Task 18: Settings Registration

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts`

Add KB-specific settings sections with defaults.

- [ ] **Step 1: Add KB settings type and defaults**

Modify `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts`. Add `"kb.general"`, `"kb.features"`, and `"kb.search"` to the `SettingsSection` type union, the `SECTION_NAMES` array, and the `DEFAULTS_MAP`. Add interfaces and default objects.

Add after the `EmailSettings` interface:

```typescript
export interface KbGeneralSettings {
  siteName: string;
  siteDescription: string;
  homepageLayout: "categories" | "search" | "featured";
  articlesPerPage: number;
}

export interface KbFeaturesSettings {
  commentsEnabled: boolean;
  bookmarksEnabled: boolean;
  progressTrackingEnabled: boolean;
  ratingsEnabled: boolean;
  relatedArticlesEnabled: boolean;
}

export interface KbSearchSettings {
  meilisearchEnabled: boolean;
  meilisearchUrl: string;
  meilisearchApiKey: string;
  ragEnabled: boolean;
  ragProvider: "openai" | "anthropic";
  ragApiKey: string;
  ragModel: string;
}
```

Add after `EMAIL_DEFAULTS`:

```typescript
export const KB_GENERAL_DEFAULTS: KbGeneralSettings = {
  siteName: "Help Center",
  siteDescription: "Find answers to your questions",
  homepageLayout: "categories",
  articlesPerPage: 20,
};

export const KB_FEATURES_DEFAULTS: KbFeaturesSettings = {
  commentsEnabled: true,
  bookmarksEnabled: true,
  progressTrackingEnabled: true,
  ratingsEnabled: true,
  relatedArticlesEnabled: true,
};

export const KB_SEARCH_DEFAULTS: KbSearchSettings = {
  meilisearchEnabled: false,
  meilisearchUrl: "",
  meilisearchApiKey: "",
  ragEnabled: false,
  ragProvider: "openai",
  ragApiKey: "",
  ragModel: "text-embedding-3-small",
};
```

Update the `SettingsSection` type to include:

```typescript
export type SettingsSection =
  | "general"
  | "reading"
  | "writing"
  | "discussion"
  | "permalinks"
  | "privacy"
  | "email"
  | "kb.general"
  | "kb.features"
  | "kb.search";
```

Update `SECTION_NAMES` to include:

```typescript
export const SECTION_NAMES: SettingsSection[] = [
  "general",
  "reading",
  "writing",
  "discussion",
  "permalinks",
  "privacy",
  "email",
  "kb.general",
  "kb.features",
  "kb.search",
];
```

Update `DEFAULTS_MAP` to include:

```typescript
const DEFAULTS_MAP: Record<SettingsSection, object> = {
  general: GENERAL_DEFAULTS,
  reading: READING_DEFAULTS,
  writing: WRITING_DEFAULTS,
  discussion: DISCUSSION_DEFAULTS,
  permalinks: PERMALINK_DEFAULTS,
  privacy: PRIVACY_DEFAULTS,
  email: EMAIL_DEFAULTS,
  "kb.general": KB_GENERAL_DEFAULTS,
  "kb.features": KB_FEATURES_DEFAULTS,
  "kb.search": KB_SEARCH_DEFAULTS,
};
```

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx tsc --noEmit --pretty` to check for type errors.

**Commit:** `feat(kb): register KB settings sections with defaults`

---

## Task 19: Admin UI -- Article List Table

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/index.tsx`
- Create: `ConvexPress-Admin/apps/web/src/components/kb/KBArticleListTable.tsx`

- [ ] **Step 1: Create the KB article list route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/index.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { KBArticleListTable } from "@/components/kb/KBArticleListTable";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

const kbSearchSchema = z.object({
  status: z
    .enum(["draft", "review", "published", "archived"])
    .optional(),
  search: z.string().optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
  categoryId: z.string().optional(),
  authorId: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/kb/")({
  validateSearch: kbSearchSchema,
  component: KBPage,
});

function KBPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <KBArticleListTable />
    </RoutePermissionGuard>
  );
}
```

- [ ] **Step 2: Create the KB article list component**

Create `ConvexPress-Admin/apps/web/src/components/kb/KBArticleListTable.tsx`:

```typescript
/**
 * KB Article List Table
 *
 * WordPress-style list table for KB articles with:
 *   - Status tabs (All, Draft, Review, Published, Archived)
 *   - Search bar
 *   - Sortable columns
 *   - Bulk actions
 *   - Row actions (Edit, View, Delete)
 *
 * This is a placeholder component. The Admin List Table UI Expert
 * will implement the full component using the shared list table patterns.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress/backend";
import { useNavigate } from "@tanstack/react-router";
import { Route } from "@/routes/_authenticated/_admin/kb/index";

export function KBArticleListTable() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const articles = useQuery(api.kb.queries.list, {
    status: search.status as any,
    search: search.search,
    page: search.page ?? 1,
    perPage: search.perPage ?? 20,
    categoryId: search.categoryId as any,
    authorId: search.authorId as any,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Knowledge Base Articles</h1>
        <button
          onClick={() => navigate({ to: "/kb/new" })}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          Add New Article
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 border-b border-[var(--color-border)]">
        {(["all", "draft", "review", "published", "archived"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() =>
              navigate({
                search: { ...search, status: tab === "all" ? undefined : tab, page: 1 },
              })
            }
            className={`px-3 py-2 text-sm font-medium ${
              (search.status ?? "all") === (tab === "all" ? undefined : tab)
                ? "border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]"
                : "text-[var(--color-muted-foreground)]"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Article list -- placeholder for full list table implementation */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]">
        {!articles ? (
          <div className="p-8 text-center text-[var(--color-muted-foreground)]">Loading...</div>
        ) : articles.items.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-muted-foreground)]">
            No articles found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-4 py-3 text-left font-medium">Title</th>
                <th className="px-4 py-3 text-left font-medium">Author</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Views</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {articles.items.map((article: any) => (
                <tr
                  key={article._id}
                  className="border-b border-[var(--color-border)] hover:bg-[var(--color-muted)]/50 cursor-pointer"
                  onClick={() => navigate({ to: "/kb/$articleId/edit", params: { articleId: article._id } })}
                >
                  <td className="px-4 py-3 font-medium">{article.title}</td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                    {article.author?.displayName ?? "Unknown"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      article.status === "published"
                        ? "bg-green-500/10 text-green-600"
                        : article.status === "draft"
                          ? "bg-yellow-500/10 text-yellow-600"
                          : article.status === "review"
                            ? "bg-blue-500/10 text-blue-600"
                            : "bg-black/5 text-[var(--color-muted-foreground)]"
                    }`}>
                      {article.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{article.viewCount}</td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                    {new Date(article.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the kb route directory** -- Run `mkdir -p /Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb` and `mkdir -p /Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/components/kb`

**Commit:** `feat(kb): add admin article list table route and component`

---

## Task 20: Admin UI -- Article Editor

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/new.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/$articleId.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/$articleId/edit.tsx`

- [ ] **Step 1: Create the new article route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/new.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/new")({
  component: NewKBArticlePage,
});

function NewKBArticlePage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Add New Article</h1>
        <p className="text-[var(--color-muted-foreground)]">
          KB article editor will be implemented by the Content Editor System Expert
          using the shared TipTap editor component.
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
```

- [ ] **Step 2: Create the article detail layout route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/$articleId.tsx`:

```typescript
import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_admin/kb/$articleId")({
  component: KBArticleDetailLayout,
  beforeLoad: ({ location, params }) => {
    const path = location.pathname;
    const base = `/kb/${params.articleId}`;
    if (path === base || path === `${base}/`) {
      throw redirect({ to: "/kb/$articleId/edit", params: { articleId: params.articleId } });
    }
  },
});

function KBArticleDetailLayout() {
  return <Outlet />;
}
```

- [ ] **Step 3: Create the article edit route**

Create directory first, then create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/$articleId/edit.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/$articleId/edit")({
  component: EditKBArticlePage,
});

function EditKBArticlePage() {
  const { articleId } = Route.useParams();

  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Edit Article</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Article ID: {articleId}. Full editor will be implemented by the Content Editor
          System Expert using the shared TipTap editor component.
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
```

- [ ] **Step 4: Create route directories** -- Run `mkdir -p /Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/\$articleId`

**Commit:** `feat(kb): add admin article editor route placeholders`

---

## Task 21: Admin UI -- Categories Management

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/categories.tsx`

- [ ] **Step 1: Create the categories route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/categories.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/categories")({
  component: KBCategoriesPage,
});

function KBCategoriesPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">KB Categories</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Category tree management will be implemented by the Admin Settings UI Expert.
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
```

**Commit:** `feat(kb): add admin categories management route`

---

## Task 22: Admin UI -- Tags Management

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/tags.tsx`

- [ ] **Step 1: Create the tags route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/tags.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/tags")({
  component: KBTagsPage,
});

function KBTagsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">KB Tags</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Tag management will be implemented by the Admin Settings UI Expert.
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
```

**Commit:** `feat(kb): add admin tags management route`

---

## Task 23: Admin UI -- Collections Management

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/collections.tsx`

- [ ] **Step 1: Create the collections route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/collections.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/collections")({
  component: KBCollectionsPage,
});

function KBCollectionsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">KB Collections</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Collection management with drag-and-drop article ordering will be
          implemented by the Admin List Table UI Expert.
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
```

**Commit:** `feat(kb): add admin collections management route`

---

## Task 24: Admin UI -- Templates Management

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/templates.tsx`

- [ ] **Step 1: Create the templates route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/templates.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/templates")({
  component: KBTemplatesPage,
});

function KBTemplatesPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">KB Templates</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Template CRUD with content preview will be implemented by the
          Admin Settings UI Expert.
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
```

**Commit:** `feat(kb): add admin templates management route`

---

## Task 25: Admin UI -- Workflows Management

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/workflows.tsx`

- [ ] **Step 1: Create the workflows route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/workflows.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/workflows")({
  component: KBWorkflowsPage,
});

function KBWorkflowsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">KB Workflows</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Workflow builder with step configuration will be implemented by the
          Admin Settings UI Expert.
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
```

**Commit:** `feat(kb): add admin workflows management route`

---

## Task 26: Admin UI -- Analytics Dashboard

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/analytics.tsx`

- [ ] **Step 1: Create the analytics route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/analytics.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/analytics")({
  component: KBAnalyticsPage,
});

function KBAnalyticsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">KB Analytics</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Analytics dashboard with charts for views, search queries,
          and feedback will be implemented by the Dashboard System Expert.
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
```

**Commit:** `feat(kb): add admin analytics dashboard route`

---

## Task 27: Admin UI -- Settings Page

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/settings.tsx`

- [ ] **Step 1: Create the settings route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/settings.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";

import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/settings")({
  component: KBSettingsPage,
});

function KBSettingsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">KB Settings</h1>
        <p className="text-[var(--color-muted-foreground)]">
          KB settings forms (general, features, search) will be implemented
          by the Admin Settings UI Expert using the shared settings form patterns.
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
```

**Commit:** `feat(kb): add admin settings page route`

---

## Task 28: Admin Sidebar Navigation

**Files:**
- Modify: Admin sidebar navigation component (the component that renders the admin sidebar)

This task adds the "Knowledge Base" top-level section to the admin sidebar with its sub-items: All Articles, Add New, Categories, Tags, Collections, Templates, Workflows, Analytics, Settings.

- [ ] **Step 1: Locate and update the sidebar navigation**

Find the admin sidebar component (likely in `ConvexPress-Admin/apps/web/src/components/admin/` or `ConvexPress-Admin/apps/web/src/components/layout/`) and add the Knowledge Base navigation section. Add it after the "Pages" section and before "Media" (or after "Media" per the design spec).

Add menu items:

```typescript
{
  label: "Knowledge Base",
  icon: BookOpen, // from lucide-react
  path: "/kb",
  children: [
    { label: "All Articles", path: "/kb" },
    { label: "Add New", path: "/kb/new" },
    { label: "Categories", path: "/kb/categories" },
    { label: "Tags", path: "/kb/tags" },
    { label: "Collections", path: "/kb/collections" },
    { label: "Templates", path: "/kb/templates" },
    { label: "Workflows", path: "/kb/workflows" },
    { label: "Analytics", path: "/kb/analytics" },
    { label: "Settings", path: "/kb/settings" },
  ],
}
```

- [ ] **Step 2: Verify** -- Navigate to the admin panel and confirm the Knowledge Base section appears in the sidebar.

**Commit:** `feat(kb): add Knowledge Base section to admin sidebar navigation`

---

## Task 29: Website UI -- KB Homepage (/help)

**Files:**
- Create: `ConvexPress-Website/apps/web/src/routes/_marketing/help/index.tsx`

- [ ] **Step 1: Create the help directory and route**

Run `mkdir -p /Users/worsin/Development/ConvexPress/ConvexPress-Website/apps/web/src/routes/_marketing/help`

Create `ConvexPress-Website/apps/web/src/routes/_marketing/help/index.tsx`:

```typescript
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

export const Route = createFileRoute("/_marketing/help/")({
  component: HelpCenter,
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(
        convexQuery(api.kb.categories.listPublished, {}),
      ),
      queryClient.ensureQueryData(
        convexQuery(api.kb.queries.getFeatured, { limit: 6 }),
      ),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Help Center" },
      { name: "description", content: "Find answers to your questions in our help center." },
    ],
  }),
});

function HelpCenter() {
  const { data: categories } = useSuspenseQuery(
    convexQuery(api.kb.categories.listPublished, {}),
  );
  const { data: featured } = useSuspenseQuery(
    convexQuery(api.kb.queries.getFeatured, { limit: 6 }),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Search hero */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight">How can we help?</h1>
        <p className="mt-3 text-lg text-[var(--color-muted-foreground)]">
          Search our knowledge base or browse by category
        </p>
        <form
          className="mx-auto mt-6 flex max-w-lg gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const query = new FormData(form).get("q") as string;
            if (query.trim()) {
              window.location.href = `/help/search?q=${encodeURIComponent(query)}`;
            }
          }}
        >
          <input
            name="q"
            type="text"
            placeholder="Search articles..."
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-[var(--color-primary)] px-6 py-3 text-sm font-medium text-white"
          >
            Search
          </button>
        </form>
      </div>

      {/* Categories grid */}
      <section className="mb-12">
        <h2 className="mb-6 text-2xl font-semibold">Browse by Category</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories?.map((cat: any) => (
            <Link
              key={cat._id}
              to="/help/$categorySlug"
              params={{ categorySlug: cat.slug }}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-6 transition hover:border-[var(--color-primary)]/50 hover:shadow-sm"
            >
              {cat.icon && <span className="mb-2 block text-2xl">{cat.icon}</span>}
              <h3 className="text-lg font-medium">{cat.name}</h3>
              {cat.description && (
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{cat.description}</p>
              )}
              <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                {cat.articleCount} {cat.articleCount === 1 ? "article" : "articles"}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured articles */}
      {featured && featured.length > 0 && (
        <section>
          <h2 className="mb-6 text-2xl font-semibold">Featured Articles</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((article: any) => (
              <div
                key={article._id}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5"
              >
                <h3 className="font-medium">{article.title}</h3>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)] line-clamp-2">
                  {article.excerpt}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

**Commit:** `feat(kb): add website help center homepage`

---

## Task 30: Website UI -- Category Page

**Files:**
- Create: `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug.tsx`

- [ ] **Step 1: Create the category page route**

Create `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug.tsx`:

```typescript
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

export const Route = createFileRoute("/_marketing/help/$categorySlug")({
  component: CategoryPage,
  loader: async ({ context: { queryClient }, params }) => {
    await queryClient.ensureQueryData(
      convexQuery(api.kb.categories.getBySlug, { slug: params.categorySlug }),
    );
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${(loaderData as any)?.name ?? "Category"} - Help Center` },
    ],
  }),
});

function CategoryPage() {
  const { categorySlug } = Route.useParams();

  const { data: category } = useSuspenseQuery(
    convexQuery(api.kb.categories.getBySlug, { slug: categorySlug }),
  );

  const { data: articles } = useSuspenseQuery(
    convexQuery(api.kb.queries.listPublished, {
      categoryId: category?._id,
      page: 1,
      perPage: 50,
    }),
  );

  if (!category) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Category not found</h1>
        <Link to="/help" className="mt-4 text-[var(--color-primary)] hover:underline">
          Back to Help Center
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <nav className="mb-6 text-sm text-[var(--color-muted-foreground)]">
        <Link to="/help" className="hover:text-[var(--color-foreground)]">Help Center</Link>
        <span className="mx-2">/</span>
        <span>{category.name}</span>
      </nav>

      <h1 className="text-3xl font-bold">{category.name}</h1>
      {category.description && (
        <p className="mt-2 text-[var(--color-muted-foreground)]">{category.description}</p>
      )}

      <div className="mt-8 space-y-3">
        {articles?.items?.map((article: any) => (
          <Link
            key={article._id}
            to="/help/$categorySlug/$articleSlug"
            params={{ categorySlug, articleSlug: article.slug }}
            className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition hover:border-[var(--color-primary)]/50"
          >
            <h3 className="font-medium">{article.title}</h3>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)] line-clamp-2">
              {article.excerpt}
            </p>
            <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
              {article.readingTimeMinutes} min read
            </p>
          </Link>
        ))}
        {(!articles?.items || articles.items.length === 0) && (
          <p className="text-[var(--color-muted-foreground)]">No articles in this category yet.</p>
        )}
      </div>
    </div>
  );
}
```

**Commit:** `feat(kb): add website category page`

---

## Task 31: Website UI -- Article Reader

**Files:**
- Create: `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx`

- [ ] **Step 1: Create the article slug directory and route**

Run `mkdir -p /Users/worsin/Development/ConvexPress/ConvexPress-Website/apps/web/src/routes/_marketing/help/\$categorySlug`

Create `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx`:

```typescript
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

export const Route = createFileRoute("/_marketing/help/$categorySlug/$articleSlug")({
  component: ArticleReader,
  loader: async ({ context: { queryClient }, params }) => {
    await queryClient.ensureQueryData(
      convexQuery(api.kb.queries.getBySlug, { slug: params.articleSlug }),
    );
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${(loaderData as any)?.title ?? "Article"} - Help Center` },
      { name: "description", content: (loaderData as any)?.excerpt },
    ],
  }),
});

function ArticleReader() {
  const { categorySlug, articleSlug } = Route.useParams();

  const { data: article } = useSuspenseQuery(
    convexQuery(api.kb.queries.getBySlug, { slug: articleSlug }),
  );

  if (!article) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Article not found</h1>
        <Link to="/help" className="mt-4 text-[var(--color-primary)] hover:underline">
          Back to Help Center
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-[var(--color-muted-foreground)]">
        <Link to="/help" className="hover:text-[var(--color-foreground)]">Help Center</Link>
        <span className="mx-2">/</span>
        {article.category && (
          <>
            <Link
              to="/help/$categorySlug"
              params={{ categorySlug }}
              className="hover:text-[var(--color-foreground)]"
            >
              {article.category.name}
            </Link>
            <span className="mx-2">/</span>
          </>
        )}
        <span>{article.title}</span>
      </nav>

      {/* Article header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold leading-tight">{article.title}</h1>
        <div className="mt-3 flex items-center gap-4 text-sm text-[var(--color-muted-foreground)]">
          {article.author && <span>By {article.author.displayName}</span>}
          {article.publishedAt && (
            <span>Updated {new Date(article.publishedAt).toLocaleDateString()}</span>
          )}
          <span>{article.readingTimeMinutes} min read</span>
        </div>
      </header>

      {/* Article content -- placeholder for TipTap renderer */}
      <article className="prose prose-lg max-w-none">
        <p className="text-[var(--color-muted-foreground)]">
          Article content will be rendered here using the TipTap content renderer.
          The full reader experience (with feedback widget, comments, progress tracking,
          and bookmarks) will be implemented by the Website Blog UI Expert.
        </p>
      </article>

      {/* Related articles */}
      {article.relatedArticles && article.relatedArticles.length > 0 && (
        <section className="mt-12 border-t border-[var(--color-border)] pt-8">
          <h2 className="mb-4 text-xl font-semibold">Related Articles</h2>
          <div className="space-y-3">
            {article.relatedArticles.map((related: any) => (
              <Link
                key={related._id}
                to="/help/$categorySlug/$articleSlug"
                params={{ categorySlug, articleSlug: related.slug }}
                className="block text-[var(--color-primary)] hover:underline"
              >
                {related.title}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

**Commit:** `feat(kb): add website article reader page`

---

## Task 32: Website UI -- Search Results

**Files:**
- Create: `ConvexPress-Website/apps/web/src/routes/_marketing/help/search.tsx`

- [ ] **Step 1: Create the search results route**

Create `ConvexPress-Website/apps/web/src/routes/_marketing/help/search.tsx`:

```typescript
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { api } from "@convexpress-website/backend/generated/api";

const searchSchema = z.object({
  q: z.string().optional(),
});

export const Route = createFileRoute("/_marketing/help/search")({
  validateSearch: searchSchema,
  component: SearchResults,
  loader: async ({ context: { queryClient }, search }) => {
    if (search.q) {
      await queryClient.ensureQueryData(
        convexQuery(api.kb.search.search, { query: search.q, limit: 20 }),
      );
    }
  },
  head: ({ search }) => ({
    meta: [
      { title: `Search: ${search.q ?? ""} - Help Center` },
    ],
  }),
});

function SearchResults() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();

  const { data } = useSuspenseQuery(
    convexQuery(api.kb.search.search, { query: q ?? "", limit: 20 }),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <nav className="mb-6 text-sm text-[var(--color-muted-foreground)]">
        <Link to="/help" className="hover:text-[var(--color-foreground)]">Help Center</Link>
        <span className="mx-2">/</span>
        <span>Search</span>
      </nav>

      <form
        className="mb-8 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const query = new FormData(form).get("q") as string;
          navigate({ search: { q: query } });
        }}
      >
        <input
          name="q"
          type="text"
          defaultValue={q ?? ""}
          placeholder="Search articles..."
          className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-[var(--color-primary)] px-6 py-3 text-sm font-medium text-white"
        >
          Search
        </button>
      </form>

      {q && (
        <p className="mb-6 text-sm text-[var(--color-muted-foreground)]">
          {data?.total ?? 0} results for "{q}"
        </p>
      )}

      <div className="space-y-4">
        {data?.results?.map((article: any) => (
          <Link
            key={article._id}
            to="/help/$categorySlug/$articleSlug"
            params={{
              categorySlug: article.categorySlug ?? "uncategorized",
              articleSlug: article.slug,
            }}
            className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5 transition hover:border-[var(--color-primary)]/50"
          >
            <h3 className="font-medium">{article.title}</h3>
            {article.categoryName && (
              <p className="mt-1 text-xs text-[var(--color-primary)]">{article.categoryName}</p>
            )}
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)] line-clamp-2">
              {article.excerpt}
            </p>
            <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
              {article.readingTimeMinutes} min read
            </p>
          </Link>
        ))}
        {q && data?.results?.length === 0 && (
          <div className="py-8 text-center text-[var(--color-muted-foreground)]">
            No articles found. Try different keywords.
          </div>
        )}
      </div>
    </div>
  );
}
```

**Commit:** `feat(kb): add website search results page`

---

## Task 33: Website UI -- Collection View

**Files:**
- Create: `ConvexPress-Website/apps/web/src/routes/_marketing/help/collections/$slug.tsx`

- [ ] **Step 1: Create the collection route directory and file**

Run `mkdir -p /Users/worsin/Development/ConvexPress/ConvexPress-Website/apps/web/src/routes/_marketing/help/collections`

Create `ConvexPress-Website/apps/web/src/routes/_marketing/help/collections/$slug.tsx`:

```typescript
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

export const Route = createFileRoute("/_marketing/help/collections/$slug")({
  component: CollectionView,
  loader: async ({ context: { queryClient }, params }) => {
    await queryClient.ensureQueryData(
      convexQuery(api.kb.collections.getBySlug, { slug: params.slug }),
    );
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${(loaderData as any)?.name ?? "Collection"} - Help Center` },
    ],
  }),
});

function CollectionView() {
  const { slug } = Route.useParams();

  const { data: collection } = useSuspenseQuery(
    convexQuery(api.kb.collections.getBySlug, { slug }),
  );

  if (!collection) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">Collection not found</h1>
        <Link to="/help" className="mt-4 text-[var(--color-primary)] hover:underline">
          Back to Help Center
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <nav className="mb-6 text-sm text-[var(--color-muted-foreground)]">
        <Link to="/help" className="hover:text-[var(--color-foreground)]">Help Center</Link>
        <span className="mx-2">/</span>
        <span>Collections</span>
        <span className="mx-2">/</span>
        <span>{collection.name}</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-bold">{collection.name}</h1>
        {collection.description && (
          <p className="mt-2 text-[var(--color-muted-foreground)]">{collection.description}</p>
        )}
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          {collection.articleCount} {collection.articleCount === 1 ? "article" : "articles"}
          {collection.type === "learningPath" && " in this learning path"}
          {collection.type === "series" && " in this series"}
        </p>
      </header>

      <div className="space-y-3">
        {collection.articles?.map((article: any, index: number) => (
          <div
            key={article._id}
            className="flex items-start gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-sm font-medium text-[var(--color-primary)]">
              {index + 1}
            </span>
            <div>
              <h3 className="font-medium">{article.title}</h3>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)] line-clamp-2">
                {article.excerpt}
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                {article.readingTimeMinutes} min read
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Commit:** `feat(kb): add website collection view page`

---

## Task 34: Meilisearch Integration (opt-in)

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/meilisearch.ts`

- [ ] **Step 1: Create the Meilisearch integration file**

Create `ConvexPress-Admin/packages/backend/convex/kb/meilisearch.ts`:

```typescript
/**
 * Knowledge Base System - Meilisearch Integration
 *
 * Opt-in typo-tolerant search via Meilisearch. Only active when
 * meilisearchEnabled is true in kb.search settings.
 *
 * Functions:
 *   syncArticle        - Sync a single article to Meilisearch (action)
 *   deleteFromIndex    - Remove an article from the Meilisearch index (action)
 *   searchMeilisearch  - Search via Meilisearch proxy (action)
 *   syncAllUnsynced    - Batch sync all unsynced articles (action)
 */

import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

// ─── Sync Article ───────────────────────────────────────────────────────────

export const syncArticle = internalAction({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, { articleId }) => {
    // 1. Fetch KB search settings to get Meilisearch URL and API key
    // 2. Fetch article data via internal query
    // 3. Upsert document into Meilisearch index "kb_articles"
    // 4. Mark article as synced via internal mutation

    // Placeholder implementation -- actual HTTP calls to Meilisearch will be added
    // when the integration is configured. The structure is:
    //
    // const settings = await ctx.runQuery(internal.settings.queries.getSection, {
    //   section: "kb.search",
    // });
    // if (!settings?.meilisearchEnabled) return;
    //
    // const article = await ctx.runQuery(internal.kb.internals.getArticleForSync, {
    //   articleId,
    // });
    // if (!article || article.status !== "published") return;
    //
    // await fetch(`${settings.meilisearchUrl}/indexes/kb_articles/documents`, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     Authorization: `Bearer ${settings.meilisearchApiKey}`,
    //   },
    //   body: JSON.stringify([{
    //     id: article._id,
    //     title: article.title,
    //     content: article.contentPlainText,
    //     excerpt: article.excerpt,
    //     categoryId: article.categoryId,
    //     slug: article.slug,
    //     publishedAt: article.publishedAt,
    //   }]),
    // });
    //
    // await ctx.runMutation(internal.kb.internals.syncToMeilisearch, { articleId });

    console.log(`[KB Meilisearch] Sync placeholder for article ${articleId}`);
  },
});

// ─── Delete From Index ──────────────────────────────────────────────────────

export const deleteFromIndex = internalAction({
  args: { articleId: v.string() },
  handler: async (ctx, { articleId }) => {
    // Placeholder: DELETE /indexes/kb_articles/documents/{articleId}
    console.log(`[KB Meilisearch] Delete placeholder for article ${articleId}`);
  },
});

// ─── Search Meilisearch ─────────────────────────────────────────────────────

export const searchMeilisearch = action({
  args: {
    query: v.string(),
    categoryId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Placeholder: POST /indexes/kb_articles/search
    // Returns results in the same shape as Convex-native search
    console.log(`[KB Meilisearch] Search placeholder for "${args.query}"`);
    return { results: [], total: 0 };
  },
});

// ─── Sync All Unsynced ──────────────────────────────────────────────────────

export const syncAllUnsynced = internalAction({
  args: {},
  handler: async (ctx) => {
    const unsynced = await ctx.runQuery(
      internal.kb.internals.getUnsyncedForMeilisearch,
      {},
    );

    for (const article of unsynced) {
      await ctx.runAction(internal.kb.meilisearch.syncArticle, {
        articleId: article._id,
      });
    }

    return { synced: unsynced.length };
  },
});
```

**Commit:** `feat(kb): add Meilisearch integration placeholder (opt-in)`

---

## Task 35: RAG Integration (opt-in)

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/kb/rag.ts`

- [ ] **Step 1: Create the RAG integration file**

Create `ConvexPress-Admin/packages/backend/convex/kb/rag.ts`:

```typescript
/**
 * Knowledge Base System - RAG Integration
 *
 * Opt-in semantic search via vector embeddings. Only active when
 * ragEnabled is true in kb.search settings.
 *
 * Functions:
 *   chunkAndEmbed    - Chunk article content and generate embeddings (action)
 *   searchRag        - Vector similarity search (action)
 *   deleteChunks     - Remove all chunks for an article (internal mutation)
 *   syncAllUnsynced  - Batch process all unsynced articles (action)
 */

import { action, internalAction } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum chunk size in characters. */
const CHUNK_SIZE = 1000;

/** Overlap between chunks in characters. */
const CHUNK_OVERLAP = 200;

// ─── Chunk and Embed ────────────────────────────────────────────────────────

export const chunkAndEmbed = internalAction({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, { articleId }) => {
    // 1. Fetch RAG settings
    // 2. Fetch article data
    // 3. Split contentPlainText into overlapping chunks
    // 4. Generate embeddings via OpenAI API
    // 5. Delete old chunks for this article
    // 6. Insert new chunks with embeddings
    // 7. Mark article as RAG synced

    // Placeholder implementation:
    //
    // const settings = await ctx.runQuery(...);
    // if (!settings?.ragEnabled) return;
    //
    // const article = await ctx.runQuery(...);
    // if (!article || article.status !== "published") return;
    //
    // const chunks = splitIntoChunks(article.contentPlainText, CHUNK_SIZE, CHUNK_OVERLAP);
    //
    // const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     Authorization: `Bearer ${settings.ragApiKey}`,
    //   },
    //   body: JSON.stringify({
    //     model: settings.ragModel,
    //     input: chunks,
    //   }),
    // });
    //
    // const embeddings = await embeddingResponse.json();
    //
    // await ctx.runMutation(internal.kb.rag.deleteChunks, { articleId });
    //
    // for (let i = 0; i < chunks.length; i++) {
    //   await ctx.runMutation(internal.kb.rag.insertChunk, {
    //     articleId,
    //     articleSlug: article.slug,
    //     content: chunks[i],
    //     chunkIndex: i,
    //     embedding: embeddings.data[i].embedding,
    //     metadata: {
    //       title: article.title,
    //       categorySlug: category?.slug,
    //       excerpt: article.excerpt,
    //     },
    //   });
    // }
    //
    // await ctx.runMutation(internal.kb.internals.syncToRag, { articleId });

    console.log(`[KB RAG] Chunk and embed placeholder for article ${articleId}`);
  },
});

// ─── Search RAG ─────────────────────────────────────────────────────────────

export const searchRag = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // 1. Generate embedding for the query
    // 2. Query kb_ragChunks for nearest neighbors (cosine similarity)
    // 3. Deduplicate by articleId, return top results
    //
    // Placeholder:
    console.log(`[KB RAG] Search placeholder for "${args.query}"`);
    return { results: [], total: 0 };
  },
});

// ─── Delete Chunks (Internal) ───────────────────────────────────────────────

export const deleteChunks = internalMutation({
  args: { articleId: v.id("kb_articles") },
  handler: async (ctx, { articleId }) => {
    const chunks = await ctx.db
      .query("kb_ragChunks")
      .withIndex("by_article", (q) => q.eq("articleId", articleId))
      .collect();

    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    return { deleted: chunks.length };
  },
});

// ─── Insert Chunk (Internal) ────────────────────────────────────────────────

export const insertChunk = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("kb_ragChunks", {
      articleId: args.articleId,
      articleSlug: args.articleSlug,
      content: args.content,
      chunkIndex: args.chunkIndex,
      embedding: args.embedding,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ─── Sync All Unsynced ──────────────────────────────────────────────────────

export const syncAllUnsynced = internalAction({
  args: {},
  handler: async (ctx) => {
    const unsynced = await ctx.runQuery(
      internal.kb.internals.getUnsyncedForRag,
      {},
    );

    for (const article of unsynced) {
      await ctx.runAction(internal.kb.rag.chunkAndEmbed, {
        articleId: article._id,
      });
    }

    return { synced: unsynced.length };
  },
});
```

**Commit:** `feat(kb): add RAG integration placeholder (opt-in)`

---

## Task 36: Event + Email + Audit Integration

**Files:**
- Modify: Capability seed data (to add KB capabilities to roles)
- Modify: Route definitions (to register KB admin routes)

This task registers all KB events, email templates, and audit actions with the existing systems. It also seeds the KB capabilities into the default roles.

- [ ] **Step 1: Register KB capabilities in the role seed data**

Find the capabilities seed file (likely `ConvexPress-Admin/packages/backend/convex/seed/roles.ts` or similar) and add KB capabilities to the appropriate roles:

Administrator (all):
```
kb.view, kb.create, kb.edit, kb.editOwn, kb.delete, kb.publish,
kb.manageCategories, kb.manageTags, kb.manageCollections,
kb.manageWorkflows, kb.manageTemplates, kb.moderateComments, kb.viewAnalytics
```

Editor:
```
kb.view, kb.create, kb.edit, kb.editOwn, kb.delete, kb.publish,
kb.manageCategories, kb.manageTags, kb.moderateComments, kb.viewAnalytics
```

Author:
```
kb.view, kb.create, kb.editOwn
```

Contributor:
```
kb.view, kb.create
```

Subscriber:
```
kb.view
```

- [ ] **Step 2: Register KB admin routes in route definitions**

Find the route definitions file and add KB routes:

```
/admin/kb, /admin/kb/new, /admin/kb/categories, /admin/kb/tags,
/admin/kb/collections, /admin/kb/templates, /admin/kb/workflows,
/admin/kb/analytics, /admin/kb/settings
```

- [ ] **Step 3: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable` to confirm everything deploys.

**Commit:** `feat(kb): register capabilities, routes, and event integration`

---

## Summary

This plan implements the full Knowledge Base system across 36 tasks:

| Task Range | Scope | Files |
|-----------|-------|-------|
| 1 | Schema (19 tables) | `convex/schema/kb.ts`, `convex/schema.ts` |
| 2 | Event constants | `convex/events/constants.ts` |
| 3 | Validators | `convex/kb/validators.ts` |
| 4 | Helpers | `convex/kb/helpers/auth.ts`, `convex/kb/helpers/utils.ts` |
| 5-17 | Backend functions | `convex/kb/*.ts` (13 files) |
| 18 | Settings | `convex/settings/defaults.ts` |
| 19-28 | Admin UI | `routes/_admin/kb/*.tsx` (10 routes) |
| 29-33 | Website UI | `routes/_marketing/help/*.tsx` (5 routes) |
| 34 | Meilisearch | `convex/kb/meilisearch.ts` |
| 35 | RAG | `convex/kb/rag.ts` |
| 36 | Integration | Seed data + route definitions |

All backend code lives in `ConvexPress-Admin/packages/backend/convex/`. The Website app is a consumer only. Each task produces a commit. The plan can be executed linearly or with Tasks 5-17 parallelized (they are independent backend function files).
