/**
 * WordPress Sync - Comments Import Phase
 *
 * Imports comments from WordPress including:
 *   - Comment content
 *   - Author info (name, email, URL)
 *   - Parent/child threading
 *   - Moderation status
 */

import { internalAction, internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { fetchWPComments, type WPComment } from "../helpers/wpClient";
import type { PhaseResult } from "../internals";
import type { SyncError, PhaseProgress } from "../validators";
import { WP_BATCH_SIZE, createDefaultImportConfig } from "../validators";

// ─── Comments Import Action ────────────────────────────────────────────────

export const importBatch = internalAction({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { jobId, siteId }): Promise<PhaseResult> => {
    const errors: SyncError[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Get job and site
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, { siteId });

    // Get import config
    const importConfig = job?.importConfig ?? createDefaultImportConfig();
    const isDryRun = importConfig.behavior.dryRun;

    if (!job || !site) {
      return {
        progress: { total: 0, imported: 0, failed: 0 },
        errors: [{ phase: "comments", wpId: 0, message: "Job or site not found", timestamp: Date.now() }],
        hasMore: false,
      };
    }

    const credentials = {
      siteUrl: site.siteUrl,
      username: site.username,
      applicationPassword: site.applicationPassword,
    };

    const progress: PhaseProgress = { ...job.progress.comments };
    const cursor = progress.cursor || 0;
    const page = Math.floor(cursor / WP_BATCH_SIZE) + 1;

    // Fetch comments from WordPress
    const { data: comments, total } = await fetchWPComments(credentials, page, WP_BATCH_SIZE);

    if (progress.total === 0 && total > 0) {
      progress.total = total;
    }

    // Sort by parent to ensure parents are created first
    const sorted = [...comments].sort((a, b) => {
      if (a.parent === 0 && b.parent !== 0) return -1;
      if (a.parent !== 0 && b.parent === 0) return 1;
      return a.id - b.id;
    });

    // Process each comment
    for (const wpComment of sorted) {
      try {
        // Check if already imported
        const existingMapping = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getByWpId,
          { siteId, objectType: "comment", wpId: wpComment.id }
        );

        if (existingMapping) {
          skipped++;
          progress.imported++;
          continue;
        }

        // Resolve post ID
        const postId = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getByWpId,
          { siteId, objectType: "post", wpId: wpComment.post }
        );

        // Try page if not a post
        const pageId = postId ? null : await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getByWpId,
          { siteId, objectType: "page", wpId: wpComment.post }
        );

        const resolvedPostId = postId || pageId;

        if (!resolvedPostId) {
          // Skip comments on posts/pages that weren't imported
          progress.failed++;
          errors.push({
            phase: "comments",
            wpId: wpComment.id,
            message: `Post/page ${wpComment.post} not found`,
            timestamp: Date.now(),
          });
          continue;
        }

        if (!isDryRun) {
          // Resolve parent comment if this is a reply
          let parentCommentId: string | undefined;
          if (wpComment.parent > 0) {
            parentCommentId = await ctx.runQuery(
              internal.wordpressSync.helpers.idMapping.getByWpId,
              { siteId, objectType: "comment", wpId: wpComment.parent }
            ) ?? undefined;
          }

          // Try to find the author user
          let authorId: string | undefined;
          if (wpComment.author > 0) {
            authorId = await ctx.runQuery(
              internal.wordpressSync.helpers.idMapping.getByWpId,
              { siteId, objectType: "user", wpId: wpComment.author }
            ) ?? undefined;
          }

          // Create comment
          const commentId = await ctx.runMutation(internal.wordpressSync.phases.commentsCreate, {
            wpComment: {
              id: wpComment.id,
              postId: resolvedPostId,
              parentId: parentCommentId,
              authorId,
              authorName: wpComment.author_name,
              authorEmail: wpComment.author_email,
              authorUrl: wpComment.author_url,
              content: wpComment.content?.rendered || "",
              status: mapCommentStatus(wpComment.status),
              createdAt: wpComment.date ? new Date(wpComment.date).getTime() : Date.now(),
            },
            siteId,
          });

          // Create ID mapping
          await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
            siteId,
            objectType: "comment",
            wpId: wpComment.id,
            convexId: commentId,
          });
        }

        created++;
        progress.imported++;
      } catch (error) {
        errors.push({
          phase: "comments",
          wpId: wpComment.id,
          message: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        });
        progress.failed++;
      }
    }

    // Update cursor
    progress.cursor = cursor + comments.length;

    return {
      progress: {
        ...progress,
        created,
        updated,
        skipped,
        conflicted: 0,
      },
      errors,
      hasMore: progress.imported + progress.failed < progress.total,
    };
  },
});

// ─── Helper Functions ──────────────────────────────────────────────────────

function mapCommentStatus(wpStatus: string): "approved" | "pending" | "spam" | "trash" {
  switch (wpStatus) {
    case "approved":
    case "1":
      return "approved";
    case "hold":
    case "0":
      return "pending";
    case "spam":
      return "spam";
    case "trash":
      return "trash";
    default:
      return "pending";
  }
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Comment Creation Mutation ─────────────────────────────────────────────

export const commentsCreate = internalMutation({
  args: {
    wpComment: v.object({
      id: v.number(),
      postId: v.string(),
      parentId: v.optional(v.string()),
      authorId: v.optional(v.string()),
      authorName: v.string(),
      authorEmail: v.optional(v.string()),
      authorUrl: v.optional(v.string()),
      content: v.string(),
      status: v.union(
        v.literal("approved"),
        v.literal("pending"),
        v.literal("spam"),
        v.literal("trash")
      ),
      createdAt: v.number(),
    }),
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { wpComment, siteId }) => {
    const now = Date.now();

    // Calculate depth
    let depth = 0;
    if (wpComment.parentId) {
      const parent = await ctx.db.get(wpComment.parentId as Id<"comments">);
      if (parent) {
        depth = (parent.depth || 0) + 1;
      }
    }

    // Use author ID if we have a linked user, otherwise use placeholder
    const authorId = wpComment.authorId || `wp-guest-${wpComment.id}`;

    // Get avatar URL from imported user if available
    let authorAvatarUrl: string | undefined;
    if (wpComment.authorId) {
      const user = await ctx.db.get(wpComment.authorId as Id<"users">);
      if (user) {
        authorAvatarUrl = user.avatarUrl || user.profilePictureUrl;
      }
    }

    // Create comment
    const commentId = await ctx.db.insert("comments", {
      postId: wpComment.postId as Id<"posts">,
      content: stripHtml(wpComment.content),
      status: wpComment.status,
      authorId,
      authorName: wpComment.authorName,
      authorAvatarUrl,
      parentId: wpComment.parentId ? (wpComment.parentId as Id<"comments">) : undefined,
      depth,
      likeCount: 0,
      flagCount: 0,
      isEdited: false,
      wpCommentId: wpComment.id,
      wpSourceSiteId: siteId,
      createdAt: wpComment.createdAt,
      updatedAt: now,
    });

    // Update post comment count
    const post = await ctx.db.get(wpComment.postId as Id<"posts">);
    if (post) {
      await ctx.db.patch(post._id, {
        commentCount: (post.commentCount || 0) + 1,
      });
    }

    return commentId;
  },
});
