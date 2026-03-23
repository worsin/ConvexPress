/**
 * WordPress Sync - Posts Import Phase
 *
 * Imports blog posts from WordPress including:
 *   - Post content (with Elementor data extraction)
 *   - Featured images
 *   - Author assignment
 *   - Category and tag relationships
 *   - ACF custom fields
 *   - Yoast SEO data
 */

import { internalAction, internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { fetchWPPosts, fetchWPPostMeta, type WPPost, type WPMeta } from "../helpers/wpClient";
import { parseElementorData, extractTextFromElementor, isElementorData } from "../helpers/elementor";
import { parseACFFields, hasACFFields, acfToPostMeta } from "../helpers/acfParser";
import { parseYoastMeta, hasYoastMeta, yoastToSEOMeta } from "../helpers/yoastParser";
import type { PhaseResult } from "../internals";
import type { SyncError, PhaseProgress } from "../validators";
import { WP_BATCH_SIZE } from "../validators";

// ─── Posts Import Action ───────────────────────────────────────────────────

export const importBatch = internalAction({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { jobId, siteId }): Promise<PhaseResult> => {
    const errors: SyncError[] = [];

    // Get job and site
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, { siteId });

    if (!job || !site) {
      return {
        progress: { total: 0, imported: 0, failed: 0 },
        errors: [{ phase: "posts", wpId: 0, message: "Job or site not found", timestamp: Date.now() }],
        hasMore: false,
      };
    }

    const credentials = {
      siteUrl: site.siteUrl,
      username: site.username,
      applicationPassword: site.applicationPassword,
    };

    const progress: PhaseProgress = { ...job.progress.posts };
    const cursor = progress.cursor || 0;
    const page = Math.floor(cursor / WP_BATCH_SIZE) + 1;

    // Fetch posts from WordPress
    const { data: posts, total } = await fetchWPPosts(credentials, page, WP_BATCH_SIZE);

    if (progress.total === 0 && total > 0) {
      progress.total = total;
    }

    // Process each post
    for (const wpPost of posts) {
      try {
        // Check if already imported
        const existingMapping = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getByWpId,
          { siteId, objectType: "post", wpId: wpPost.id }
        );

        if (existingMapping) {
          progress.imported++;
          continue;
        }

        // Fetch post meta (for Elementor, ACF, Yoast)
        let postMeta: WPMeta[] = [];
        try {
          postMeta = await fetchWPPostMeta(credentials, wpPost.id);
        } catch {
          // Continue without meta if fetch fails
        }

        // Process content and meta
        const processedContent = await processPostContent(wpPost, postMeta);

        // Resolve author
        const authorId = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getByWpId,
          { siteId, objectType: "user", wpId: wpPost.author }
        );

        // Resolve featured image
        let featuredImageId: string | undefined;
        if (wpPost.featured_media) {
          featuredImageId = await ctx.runQuery(
            internal.wordpressSync.helpers.idMapping.getByWpId,
            { siteId, objectType: "media", wpId: wpPost.featured_media }
          ) ?? undefined;
        }

        // Resolve categories and tags
        const categoryIds = await resolveTermIds(ctx, siteId, wpPost.categories || [], "category");
        const tagIds = await resolveTermIds(ctx, siteId, wpPost.tags || [], "tag");

        // Create the post
        const postId = await ctx.runMutation(internal.wordpressSync.phases.postsCreate, {
          wpPost: {
            id: wpPost.id,
            title: wpPost.title?.rendered || "",
            slug: wpPost.slug,
            content: processedContent.content,
            excerpt: wpPost.excerpt?.rendered || "",
            status: mapWPStatus(wpPost.status),
            commentStatus: wpPost.comment_status === "open" ? "open" : "closed",
            isSticky: wpPost.sticky || false,
            publishedAt: wpPost.date ? new Date(wpPost.date).getTime() : undefined,
            guid: wpPost.guid?.rendered,
          },
          authorId: authorId ?? undefined,
          featuredImageId,
          siteId,
        });

        // Store Elementor data if present
        if (processedContent.elementorData) {
          await ctx.runMutation(internal.wordpressSync.phases.postsCreateMeta, {
            postId,
            key: "_elementor_data",
            value: processedContent.elementorData,
          });

          // Also store original rendered HTML for reference
          if (wpPost.content?.rendered) {
            await ctx.runMutation(internal.wordpressSync.phases.postsCreateMeta, {
              postId,
              key: "_wp_content_rendered",
              value: wpPost.content.rendered,
            });
          }
        }

        // Store ACF data
        for (const acfMeta of processedContent.acfMeta) {
          await ctx.runMutation(internal.wordpressSync.phases.postsCreateMeta, {
            postId,
            key: acfMeta.key,
            value: acfMeta.value,
          });
        }

        // Store Yoast SEO data
        for (const seoMeta of processedContent.seoMeta) {
          await ctx.runMutation(internal.wordpressSync.phases.postsCreateMeta, {
            postId,
            key: seoMeta.key,
            value: seoMeta.value,
          });
        }

        // Create term relationships
        for (const termId of [...categoryIds, ...tagIds]) {
          await ctx.runMutation(internal.wordpressSync.phases.postsCreateTermRelationship, {
            postId,
            termId,
          });
        }

        // Create ID mapping
        await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
          siteId,
          objectType: "post",
          wpId: wpPost.id,
          convexId: postId,
        });

        progress.imported++;
      } catch (error) {
        errors.push({
          phase: "posts",
          wpId: wpPost.id,
          message: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        });
        progress.failed++;
      }
    }

    // Update cursor
    progress.cursor = cursor + posts.length;

    return {
      progress,
      errors,
      hasMore: progress.imported + progress.failed < progress.total,
    };
  },
});

// ─── Content Processing ────────────────────────────────────────────────────

interface ProcessedContent {
  content: string;
  elementorData?: string;
  acfMeta: Array<{ key: string; value: string }>;
  seoMeta: Array<{ key: string; value: string }>;
}

async function processPostContent(
  wpPost: WPPost,
  postMeta: WPMeta[]
): Promise<ProcessedContent> {
  const result: ProcessedContent = {
    content: "",
    acfMeta: [],
    seoMeta: [],
  };

  // Check for Elementor data in meta
  const elementorMeta = postMeta.find((m) => m.key === "_elementor_data");
  const elementorValue = elementorMeta?.value;

  if (elementorValue && typeof elementorValue === "string" && isElementorData(elementorValue)) {
    const parsed = parseElementorData(elementorValue);
    if (parsed) {
      // Store the raw Elementor JSON
      result.elementorData = elementorValue;
      // Extract plain text for searchability
      result.content = extractTextFromElementor(parsed);
    }
  }

  // If no Elementor content, use rendered HTML stripped of tags
  if (!result.content && wpPost.content?.rendered) {
    result.content = stripHtml(wpPost.content.rendered);
  }

  // Process ACF fields
  const metaItems = postMeta.map((m) => ({
    key: m.key,
    value: m.value as string | number | boolean | Record<string, unknown>,
  }));

  if (hasACFFields(metaItems)) {
    const acfData = parseACFFields(metaItems);
    result.acfMeta = acfToPostMeta(acfData);
  }

  // Process Yoast SEO
  if (hasYoastMeta(metaItems)) {
    const yoastData = parseYoastMeta(metaItems);
    result.seoMeta = yoastToSEOMeta(yoastData);
  }

  return result;
}

// ─── Helper Functions ──────────────────────────────────────────────────────

async function resolveTermIds(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  siteId: Id<"wordpressSites">,
  wpIds: number[],
  objectType: "category" | "tag"
): Promise<string[]> {
  const ids: string[] = [];

  for (const wpId of wpIds) {
    const mapping = await ctx.runQuery(
      internal.wordpressSync.helpers.idMapping.getByWpId,
      { siteId, objectType, wpId }
    );
    if (mapping) {
      ids.push(mapping);
    }
  }

  return ids;
}

function mapWPStatus(
  wpStatus: string
): "auto-draft" | "draft" | "pending" | "publish" | "future" | "private" | "trash" {
  switch (wpStatus) {
    case "publish":
      return "publish";
    case "draft":
      return "draft";
    case "pending":
      return "pending";
    case "private":
      return "private";
    case "future":
      return "future";
    case "trash":
      return "trash";
    case "auto-draft":
      return "auto-draft";
    default:
      return "draft";
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

// ─── Post Creation Mutations ───────────────────────────────────────────────

export const postsCreate = internalMutation({
  args: {
    wpPost: v.object({
      id: v.number(),
      title: v.string(),
      slug: v.string(),
      content: v.string(),
      excerpt: v.string(),
      status: v.union(
        v.literal("auto-draft"),
        v.literal("draft"),
        v.literal("pending"),
        v.literal("publish"),
        v.literal("future"),
        v.literal("private"),
        v.literal("trash")
      ),
      commentStatus: v.union(v.literal("open"), v.literal("closed")),
      isSticky: v.boolean(),
      publishedAt: v.optional(v.number()),
      guid: v.optional(v.string()),
    }),
    authorId: v.optional(v.string()),
    featuredImageId: v.optional(v.string()),
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { wpPost, authorId, featuredImageId, siteId }) => {
    const now = Date.now();

    // Get a fallback author if needed
    let finalAuthorId: Id<"users">;
    if (authorId) {
      finalAuthorId = authorId as Id<"users">;
    } else {
      // Use first admin as fallback
      const adminRole = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
        .first();

      if (adminRole) {
        const admin = await ctx.db
          .query("users")
          .withIndex("by_roleId", (q) => q.eq("roleId", adminRole._id))
          .first();

        if (admin) {
          finalAuthorId = admin._id;
        }
      }

      if (!finalAuthorId!) {
        const firstUser = await ctx.db.query("users").first();
        if (firstUser) {
          finalAuthorId = firstUser._id;
        } else {
          throw new Error("No users exist to assign as author");
        }
      }
    }

    // Create post
    const postId = await ctx.db.insert("posts", {
      type: "post",
      title: stripHtml(wpPost.title),
      slug: wpPost.slug,
      content: wpPost.content,
      excerpt: stripHtml(wpPost.excerpt) || undefined,
      status: wpPost.status,
      visibility: wpPost.status === "private" ? "private" : "public",
      authorId: finalAuthorId,
      featuredImageId: featuredImageId ? (featuredImageId as Id<"media">) : undefined,
      commentStatus: wpPost.commentStatus,
      isSticky: wpPost.isSticky,
      publishedAt: wpPost.publishedAt,
      wpPostId: wpPost.id,
      wpGuid: wpPost.guid,
      wpSourceSiteId: siteId,
      createdAt: now,
      updatedAt: now,
    });

    return postId;
  },
});

export const postsCreateMeta = internalMutation({
  args: {
    postId: v.string(),
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, { postId, key, value }) => {
    await ctx.db.insert("postMeta", {
      postId: postId as Id<"posts">,
      key,
      value,
    });
  },
});

export const postsCreateTermRelationship = internalMutation({
  args: {
    postId: v.string(),
    termId: v.string(),
  },
  handler: async (ctx, { postId, termId }) => {
    // Check if relationship already exists
    const existing = await ctx.db
      .query("termRelationships")
      .withIndex("by_post_term", (q) =>
        q.eq("postId", postId as Id<"posts">).eq("termId", termId as Id<"terms">)
      )
      .first();

    if (existing) return;

    await ctx.db.insert("termRelationships", {
      postId: postId as Id<"posts">,
      termId: termId as Id<"terms">,
    });
  },
});
