/**
 * Search System - Internal Functions
 *
 * Non-client-callable functions used by:
 *   - Event handlers (incremental reindexing on content changes)
 *   - Scheduled functions (analytics purge, full reindex batches)
 *   - Cross-system internal calls (logSearchQuery)
 *
 * Functions:
 *   onContentChanged        - Handle content upsert/delete for incremental reindex
 *   logSearchQuery          - Log a search query to analytics (async, non-blocking)
 *   reindexAll              - Full reindex of all content (Administrator action)
 *   purgeOldAnalytics       - Clean up analytics data past retention period
 *   cleanupOrphanedIndex    - Remove search index entries for deleted content
 *   checkReindexPermission  - Auth check for reindex action (internalQuery)
 *
 * Note: Content stripping is imported from helpers.ts (stripContentForSearch).
 */

import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { getUserIdentifier, lookupUserByIdentifier } from "../helpers/permissions";
import {
  onContentChangedArgs,
  logSearchQueryArgs,
  searchableContentTypeValidator,
  MAX_INDEXED_CONTENT_LENGTH,
  MAX_INDEXED_TITLE_LENGTH,
} from "./validators";
import { stripContentForSearch } from "./helpers";

/**
 * Truncate a string to a maximum length, preserving word boundaries.
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  const truncated = str.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > maxLength * 0.8
    ? truncated.substring(0, lastSpace)
    : truncated;
}

/**
 * Generate an excerpt from content (first ~200 chars, word-boundary safe).
 */
function generateExcerpt(content: string, maxLength: number = 200): string {
  return truncate(content, maxLength);
}

// ─── onContentChanged ───────────────────────────────────────────────────────

/**
 * Handle content creation, update, or deletion for incremental search reindexing.
 *
 * Called internally by event handlers when content lifecycle events fire.
 * This is the core incremental reindex function.
 *
 * For "upsert": fetches the content, builds the search index entry, and
 * upserts into the searchIndex table.
 * For "delete": removes the corresponding searchIndex entry.
 */
export const onContentChanged = internalMutation({
  args: onContentChangedArgs,
  handler: async (ctx, args) => {
    const { contentType, contentId, action } = args;

    // ── Delete action ───────────────────────────────────────────────────
    if (action === "delete") {
      const existing = await ctx.db
        .query("searchIndex")
        .withIndex("by_content", (q) =>
          q.eq("contentType", contentType).eq("contentId", contentId),
        )
        .unique();

      if (existing) {
        await ctx.db.delete("searchIndex", existing._id);
      }
      return;
    }

    // ── Upsert action ───────────────────────────────────────────────────
    const now = Date.now();

    if (contentType === "post" || contentType === "page") {
      await upsertPostOrPage(ctx, contentType, contentId, now);
    } else if (contentType === "media") {
      await upsertMedia(ctx, contentId, now);
    } else if (contentType === "comment") {
      await upsertComment(ctx, contentId, now);
    } else if (contentType === "course") {
      await upsertCourse(ctx, contentId, now);
    }
  },
});

// ─── Content-Type Specific Upsert Functions ─────────────────────────────────

/**
 * Upsert a post or page into the search index.
 */
async function upsertPostOrPage(
  ctx: MutationCtx,
  contentType: "post" | "page",
  contentId: string,
  now: number,
): Promise<void> {
  // Fetch the post/page
  let post;
  try {
    // contentId is a string reference to a posts table ID
    post = await ctx.db.get("posts", contentId as Id<"posts">);
  } catch {
    // Invalid ID - skip
    return;
  }
  if (!post) return;

  // Only index the correct type (posts table has a "type" field: "post" | "page")
  if (post.type !== contentType) return;

  // Build searchable text
  const title = truncate(
    stripContentForSearch(post.title || ""),
    MAX_INDEXED_TITLE_LENGTH,
  );
  const rawContent = post.content || "";
  const strippedContent = truncate(
    stripContentForSearch(rawContent),
    MAX_INDEXED_CONTENT_LENGTH,
  );
  const excerpt = post.excerpt
    ? stripContentForSearch(post.excerpt)
    : generateExcerpt(strippedContent);

  // Resolve author name
  let authorName = "Unknown";
  let authorId = "";
  if (post.authorId) {
    const author = await ctx.db.get("users", post.authorId);
    if (author) {
      authorName =
        author.displayName || `${author.firstName ?? ""} ${author.lastName ?? ""}`.trim() || author.email;
      authorId = getUserIdentifier(author);
    }
  }

  // Fetch taxonomy terms (posts only)
  let categoryNames: string[] | undefined;
  let tagNames: string[] | undefined;

  if (contentType === "post") {
    try {
      // Look up taxonomy assignments for this post via termRelationships
      // Use the post's actual Convex _id for the index query
      const assignments = await ctx.db
        .query("termRelationships")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .take(500); // H-16 FIX: bounded query

      if (assignments.length > 0) {
        const cats: string[] = [];
        const tags: string[] = [];

        for (const assignment of assignments) {
          const term = await ctx.db.get("terms", assignment.termId);
          if (term) {
            // The `taxonomy` field on the term distinguishes category vs tag
            if (term.taxonomy === "category") {
              cats.push(term.name);
            } else if (term.taxonomy === "post_tag") {
              tags.push(term.name);
            }
          }
        }

        if (cats.length > 0) categoryNames = cats;
        if (tags.length > 0) tagNames = tags;
      }
    } catch {
      // Taxonomy tables may not exist yet - graceful degradation
    }
  }

  // Build URL
  const url =
    contentType === "page"
      ? post.path || `/${post.slug}`
      : `/blog/${post.slug}`;

  // Calculate boost score
  let boostScore = 0;
  if (contentType === "post" && post.isSticky) {
    boostScore += 10;
  }

  // Build the index entry
  const indexEntry = {
    contentType,
    contentId,
    title,
    content: strippedContent,
    excerpt,
    authorId,
    authorName,
    status: post.status,
    categoryNames,
    tagNames,
    url,
    boostScore: boostScore > 0 ? boostScore : undefined,
    publishedAt: post.publishedAt,
    indexedAt: now,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };

  // Upsert: check if entry already exists
  const existing = await ctx.db
    .query("searchIndex")
    .withIndex("by_content", (q) =>
      q.eq("contentType", contentType).eq("contentId", contentId),
    )
    .unique();

  if (existing) {
    await ctx.db.patch("searchIndex", existing._id, indexEntry);
  } else {
    await ctx.db.insert("searchIndex", indexEntry);
  }
}

/**
 * Upsert a media item into the search index.
 */
async function upsertMedia(
  ctx: MutationCtx,
  contentId: string,
  now: number,
): Promise<void> {
  let media;
  try {
    media = await ctx.db.get("media", contentId as Id<"media">);
  } catch {
    return;
  }
  if (!media) return;

  const title = truncate(
    stripContentForSearch(media.title || media.fileName || ""),
    MAX_INDEXED_TITLE_LENGTH,
  );
  const description = media.description
    ? stripContentForSearch(media.description)
    : "";
  const content = truncate(
    [title, media.altText || "", media.caption || "", description]
      .filter(Boolean)
      .join(" "),
    MAX_INDEXED_CONTENT_LENGTH,
  );
  const excerpt = generateExcerpt(content);

  // Resolve author
  let authorName = "Unknown";
  let authorId = "";
  if (media.uploadedBy) {
    const author = await ctx.db.get("users", media.uploadedBy);
    if (author) {
      authorName =
        author.displayName || `${author.firstName ?? ""} ${author.lastName ?? ""}`.trim() || author.email;
      authorId = getUserIdentifier(author);
    }
  }

  const url = `/media/${contentId}`;

  const indexEntry = {
    contentType: "media" as const,
    contentId,
    title,
    content,
    excerpt,
    authorId,
    authorName,
    status: "publish", // Media is always "published" once uploaded
    altText: media.altText,
    caption: media.caption,
    mimeType: media.mimeType,
    url,
    indexedAt: now,
    createdAt: media.createdAt ?? now,
    updatedAt: media.updatedAt ?? now,
  };

  const existing = await ctx.db
    .query("searchIndex")
    .withIndex("by_content", (q) =>
      q.eq("contentType", "media").eq("contentId", contentId),
    )
    .unique();

  if (existing) {
    await ctx.db.patch("searchIndex", existing._id, indexEntry);
  } else {
    await ctx.db.insert("searchIndex", indexEntry);
  }
}

async function upsertCourse(
  ctx: MutationCtx,
  contentId: string,
  now: number,
): Promise<void> {
  let course;
  try {
    course = await ctx.db.get("lms_courses", contentId as Id<"lms_courses">);
  } catch {
    return;
  }
  if (!course) return;

  const title = truncate(stripContentForSearch(course.title || ""), MAX_INDEXED_TITLE_LENGTH);
  const description = stripContentForSearch(docToText(course.descriptionDoc));
  const excerpt = stripContentForSearch(course.excerpt || "") || generateExcerpt(description);
  const content = truncate(
    [
      title,
      excerpt,
      description,
      ...(course.categoryIds ?? []),
      ...(course.tagIds ?? []),
    ].join("\n"),
    MAX_INDEXED_CONTENT_LENGTH,
  );

  let authorName = "Unknown";
  let authorId = "";
  if (course.authorId) {
    const author = await ctx.db.get("users", course.authorId);
    if (author) {
      authorName =
        author.displayName ||
        `${author.firstName ?? ""} ${author.lastName ?? ""}`.trim() ||
        author.email;
      authorId = getUserIdentifier(author);
    }
  }

  const indexEntry = {
    contentType: "course" as const,
    contentId,
    title,
    content,
    excerpt,
    authorId,
    authorName,
    status: course.status === "published" ? "publish" : course.status,
    categoryNames: course.categoryIds,
    tagNames: course.tagIds,
    url: `/courses/${course.slug}`,
    boostScore: course.status === "published" ? 2 : undefined,
    publishedAt: course.publishedAt,
    indexedAt: now,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };

  const existing = await ctx.db
    .query("searchIndex")
    .withIndex("by_content", (q) =>
      q.eq("contentType", "course").eq("contentId", contentId),
    )
    .unique();

  if (existing) {
    await ctx.db.patch("searchIndex", existing._id, indexEntry);
  } else {
    await ctx.db.insert("searchIndex", indexEntry);
  }
}

function docToText(doc: unknown): string {
  const tree = doc as { content?: Array<{ content?: Array<{ text?: string }> }> };
  if (!tree || !Array.isArray(tree.content)) return "";
  return tree.content
    .map((node) => (node.content ?? []).map((child) => child.text ?? "").join(""))
    .join("\n\n");
}

/**
 * Upsert a comment into the search index.
 * Only indexes approved comments.
 */
async function upsertComment(
  ctx: MutationCtx,
  contentId: string,
  now: number,
): Promise<void> {
  let comment;
  try {
    comment = await ctx.db.get("comments", contentId as Id<"comments">);
  } catch {
    return;
  }
  if (!comment) return;

  // Only index approved comments
  if (comment.status !== "approved") {
    // If not approved, remove from index if exists
    const existing = await ctx.db
      .query("searchIndex")
      .withIndex("by_content", (q) =>
        q.eq("contentType", "comment").eq("contentId", contentId),
      )
      .unique();

    if (existing) {
      await ctx.db.delete("searchIndex", existing._id);
    }
    return;
  }

  // Get the parent post for URL and context
  const post = await ctx.db.get("posts", comment.postId);
  const postTitle = post?.title ?? "[Deleted Post]";
  const postSlug = post?.slug ?? "";

  const content = truncate(
    stripContentForSearch(comment.content || ""),
    MAX_INDEXED_CONTENT_LENGTH,
  );
  const excerpt = generateExcerpt(content);

  const url = `/blog/${postSlug}#comment-${contentId}`;

  const indexEntry = {
    contentType: "comment" as const,
    contentId,
    title: `Comment on "${postTitle}"`,
    content,
    excerpt,
    authorId: comment.authorId || "",
    authorName: comment.authorName || "Anonymous",
    status: comment.status,
    url,
    indexedAt: now,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };

  const existing = await ctx.db
    .query("searchIndex")
    .withIndex("by_content", (q) =>
      q.eq("contentType", "comment").eq("contentId", contentId),
    )
    .unique();

  if (existing) {
    await ctx.db.patch("searchIndex", existing._id, indexEntry);
  } else {
    await ctx.db.insert("searchIndex", indexEntry);
  }
}

// ─── logSearchQuery ─────────────────────────────────────────────────────────

/**
 * Log a search query to the analytics table.
 *
 * Called asynchronously (non-blocking) after search results are returned.
 * Silently no-ops if logging fails.
 */
export const logSearchQuery = internalMutation({
  args: logSearchQueryArgs,
  handler: async (ctx, args) => {
    await ctx.db.insert("searchQueries", {
      query: args.query,
      normalizedQuery: args.normalizedQuery,
      resultCount: args.resultCount,
      userId: args.userId,
      source: args.source,
      contentTypeFilter: args.contentTypeFilter,
      categoryFilter: args.categoryFilter,
      tagFilter: args.tagFilter,
      createdAt: Date.now(),
    });
  },
});

// ─── reindexAll ─────────────────────────────────────────────────────────────

/**
 * Full reindex of all content.
 *
 * This is an internalMutation called by the admin reindex action.
 * Processes all content types in sequence, batch by batch.
 *
 * Args:
 *   - contentType: optional filter for specific content type
 */
export const reindexAll = internalMutation({
  args: {
    contentType: v.optional(searchableContentTypeValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const stats = { post: 0, page: 0, media: 0, comment: 0, course: 0, removed: 0, errors: 0 };
    const contentTypes: Array<"post" | "page" | "media" | "comment" | "course"> = args.contentType
      ? [args.contentType]
      : ["post", "page", "media", "comment", "course"];

    for (const ct of contentTypes) {
      try {
        if (ct === "post" || ct === "page") {
          // Fetch all posts/pages of this type
          const items = await ctx.db
            .query("posts")
            .withIndex("by_type_status", (q) => q.eq("type", ct))
            .take(500); // H-16 FIX: bounded query

          for (const item of items) {
            try {
              await upsertPostOrPage(ctx, ct, item._id.toString(), now);
              stats[ct]++;
            } catch {
              stats.errors++;
            }
          }
        } else if (ct === "media") {
          // Fetch all media items
          const items = await ctx.db.query("media").take(500); // H-16 FIX: bounded query

          for (const item of items) {
            try {
              await upsertMedia(ctx, item._id.toString(), now);
              stats.media++;
            } catch {
              stats.errors++;
            }
          }
        } else if (ct === "comment") {
          // Fetch all approved comments
          const items = await ctx.db
            .query("comments")
            .withIndex("by_status", (q) => q.eq("status", "approved"))
            .take(500); // H-16 FIX: bounded query

          for (const item of items) {
            try {
              await upsertComment(ctx, item._id.toString(), now);
              stats.comment++;
            } catch {
              stats.errors++;
            }
          }
        } else if (ct === "course") {
          const items = await ctx.db
            .query("lms_courses")
            .withIndex("by_status", (q) => q.eq("status", "published"))
            .take(500);

          for (const item of items) {
            try {
              await upsertCourse(ctx, item._id.toString(), now);
              stats.course++;
            } catch {
              stats.errors++;
            }
          }
        }
      } catch {
        stats.errors++;
      }
    }

    // ── Cleanup orphaned entries (#53 FIX: handle all content types) ────
    // Find entries in searchIndex that reference content which no longer exists.
    // Each content type must be looked up in its own table.
    const allIndexEntries = await ctx.db.query("searchIndex").take(500); // H-16 FIX: bounded query

    for (const entry of allIndexEntries) {
      try {
        let source: unknown = null;
        if (entry.contentType === "post" || entry.contentType === "page") {
          source = await ctx.db.get("posts", entry.contentId as Id<"posts">);
        } else if (entry.contentType === "media") {
          source = await ctx.db.get("media", entry.contentId as Id<"media">);
        } else if (entry.contentType === "comment") {
          source = await ctx.db.get("comments", entry.contentId as Id<"comments">);
        } else if (entry.contentType === "course") {
          source = await ctx.db.get("lms_courses", entry.contentId as Id<"lms_courses">);
        }
        if (!source) {
          await ctx.db.delete("searchIndex", entry._id);
          stats.removed++;
        }
      } catch {
        // Invalid ID format - remove orphan
        await ctx.db.delete("searchIndex", entry._id);
        stats.removed++;
      }
    }

    return stats;
  },
});

// ─── purgeOldAnalytics ──────────────────────────────────────────────────────

/**
 * Purge search analytics data older than the retention period.
 *
 * Called by scheduled cron job. Default retention: 90 days.
 * Processes up to 500 records per invocation to stay within
 * Convex mutation time limits.
 */
export const purgeOldAnalytics = internalMutation({
  args: {
    retentionDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const retentionMs =
      (args.retentionDays ?? 90) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - retentionMs;
    let purged = 0;

    // Fetch old queries (oldest first)
    const oldQueries = await ctx.db
      .query("searchQueries")
      .withIndex("by_date")
      .order("asc")
      .take(500);

    for (const query of oldQueries) {
      if (query.createdAt < cutoff) {
        await ctx.db.delete("searchQueries", query._id);
        purged++;
      } else {
        // Since sorted by date asc, no more old records
        break;
      }
    }

    return { purged };
  },
});

// ─── cleanupOrphanedIndex ───────────────────────────────────────────────────

/**
 * Remove search index entries whose source content no longer exists.
 *
 * Called internally after a full reindex or as a maintenance task.
 * Processes up to 200 entries per invocation.
 */
export const cleanupOrphanedIndex = internalMutation({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db
      .query("searchIndex")
      .take(200);

    let removed = 0;

    for (const entry of entries) {
      try {
        // #53 FIX: Look up content in the correct table based on contentType
        let source: unknown = null;
        if (entry.contentType === "post" || entry.contentType === "page") {
          source = await ctx.db.get("posts", entry.contentId as Id<"posts">);
        } else if (entry.contentType === "media") {
          source = await ctx.db.get("media", entry.contentId as Id<"media">);
        } else if (entry.contentType === "comment") {
          source = await ctx.db.get("comments", entry.contentId as Id<"comments">);
        } else if (entry.contentType === "course") {
          source = await ctx.db.get("lms_courses", entry.contentId as Id<"lms_courses">);
        }
        if (!source) {
          await ctx.db.delete("searchIndex", entry._id);
          removed++;
        }
      } catch {
        // Invalid ID - orphaned entry
        await ctx.db.delete("searchIndex", entry._id);
        removed++;
      }
    }

    return { removed };
  },
});

// ─── checkReindexPermission ──────────────────────────────────────────────────

/**
 * Internal query to check if a user has the search.reindex capability.
 * Called from the reindex action since actions cannot use requireCan() directly.
 */
export const checkReindexPermission = internalQuery({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    // Look up user by identifier (clerkUserId or Convex _id)
    const user = await lookupUserByIdentifier(ctx, args.userId);

    if (!user) return false;

    // Resolve role and check for capability
    if (user.roleId) {
      const role = await ctx.db.get("roles", user.roleId);
      if (!role) return false;
      return (
        Array.isArray(role.capabilities) &&
        (role.capabilities.includes("search.reindex") ||
          role.capabilities.includes("manage_options"))
      );
    }

    // Legacy role fallback: administrators always have all capabilities
    if (user.internalRole === "administrator") return true;

    return false;
  },
});

// ─── Reindex Lock (#57) ──────────────────────────────────────────────────────

/**
 * REINDEX_LOCK_KEY is stored in the settings table under a special section.
 * We use a simple flag approach: a searchIndex entry with a sentinel key.
 * To avoid schema changes, we store lock state in a well-known searchIndex
 * entry with contentType "post" and a sentinel contentId.
 *
 * Alternative: use a dedicated field. For now we use the settings system.
 */
const REINDEX_LOCK_SENTINEL = "__reindex_lock__";
const REINDEX_LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes auto-expire

/**
 * Atomically acquire a reindex lock. Returns true if acquired, false if
 * already held (and not expired).
 */
export const acquireReindexLock = internalMutation({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    // Check if a lock entry exists
    const existing = await ctx.db
      .query("searchIndex")
      .withIndex("by_content", (q) =>
        q.eq("contentType", "post").eq("contentId", REINDEX_LOCK_SENTINEL),
      )
      .unique();

    const now = Date.now();

    if (existing) {
      // Lock exists -- check if it's expired (safety valve)
      if (now - existing.indexedAt < REINDEX_LOCK_TIMEOUT_MS) {
        return false; // Still locked, not expired
      }
      // Expired -- update the lock entry to re-acquire
      await ctx.db.patch("searchIndex", existing._id, {
        indexedAt: now,
        updatedAt: now,
      });
      return true;
    }

    // No lock exists -- create one
    await ctx.db.insert("searchIndex", {
      contentType: "post",
      contentId: REINDEX_LOCK_SENTINEL,
      title: "",
      content: "",
      excerpt: "",
      authorId: "",
      authorName: "",
      status: "__lock__",
      url: "",
      indexedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  },
});

/**
 * Release the reindex lock.
 */
export const releaseReindexLock = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const existing = await ctx.db
      .query("searchIndex")
      .withIndex("by_content", (q) =>
        q.eq("contentType", "post").eq("contentId", REINDEX_LOCK_SENTINEL),
      )
      .unique();

    if (existing) {
      await ctx.db.delete("searchIndex", existing._id);
    }
  },
});
