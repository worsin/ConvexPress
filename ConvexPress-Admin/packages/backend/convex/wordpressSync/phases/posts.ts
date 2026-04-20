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

import { internalAction, internalMutation, type ActionCtx } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { fetchWPPosts, fetchWPPostMeta, type WPPost, type WPMeta } from "../helpers/wpClient";
import { parseElementorData, extractTextFromElementor, isElementorData } from "../helpers/elementor";
import { parseACFFields, hasACFFields, acfToPostMeta } from "../helpers/acfParser";
import { parseYoastMeta, hasYoastMeta, yoastToSEOMeta } from "../helpers/yoastParser";
import { selectWpPostMetaForPreservation } from "../fieldPolicy";
import type { PhaseResult } from "../internals";
import type { SyncError, PhaseProgress } from "../validators";
import { WP_BATCH_SIZE, normalizeImportConfig, FINDING_CODES, siteCredentialsValidator } from "../validators";
import { createFinding } from "../helpers/idMapping";


// ─── Source Hash Helper ───────────────────────────────────────────────────

function computeSourceHash(fields: Record<string, unknown>): string {
  const str = JSON.stringify(fields); let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; } return h.toString(36);
}

// ─── Posts Import Action ───────────────────────────────────────────────────

export const importBatch = internalAction({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
    credentials: siteCredentialsValidator,
  },
  handler: async (ctx, { jobId, siteId, credentials }): Promise<PhaseResult> => {
    const errors: SyncError[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Get job and site
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, { siteId });

    // Get import config
    const importConfig = normalizeImportConfig(job?.importConfig);
    const isDryRun = importConfig.behavior.dryRun;

    if (!job || !site) {
      return {
        progress: { total: 0, imported: 0, failed: 0 },
        errors: [{ phase: "posts", wpId: 0, message: "Job or site not found", timestamp: Date.now() }],
        hasMore: false,
      };
    }

    const progress: PhaseProgress = { ...job.progress.posts };
    const cursor = progress.cursor || 0;
    const entityLimit =
      typeof importConfig.filters.entityLimit === "number"
        ? importConfig.filters.entityLimit
        : undefined;
    if (entityLimit !== undefined && cursor >= entityLimit) {
      progress.total = Math.min(progress.total || entityLimit, entityLimit);
      progress.cursor = cursor;
      return {
        progress,
        errors,
        hasMore: false,
      };
    }

    const page = Math.floor(cursor / WP_BATCH_SIZE) + 1;

    // Fetch posts from WordPress
    const { data: fetchedPosts, total } = await fetchWPPosts(credentials, page, WP_BATCH_SIZE, {
      importDrafts: importConfig.behavior.importDrafts,
      dateRangeStart: importConfig.filters.dateRangeStart,
      dateRangeEnd: importConfig.filters.dateRangeEnd,
    });
    const posts =
      entityLimit !== undefined
        ? fetchedPosts.slice(0, Math.max(0, entityLimit - cursor))
        : fetchedPosts;

    const effectiveTotal = entityLimit !== undefined ? Math.min(total, entityLimit) : total;
    if (progress.total === 0 && effectiveTotal > 0) {
      progress.total = effectiveTotal;
    }

    // Process each post
    for (const wpPost of posts) {
      try {
        // Compute source hash for change detection
        const sourceHash = computeSourceHash({
          title: wpPost.title?.rendered,
          content: wpPost.content?.rendered,
          status: wpPost.status,
          slug: wpPost.slug,
        });

        // Check if already imported (get full mapping for sourceHash comparison)
        const existingMapping = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getFullMappingByWpId,
          { siteId, objectType: "post", wpId: wpPost.id }
        );
        const existingPostId = existingMapping?.convexId;

        if (existingMapping) {
          if (!isDryRun) {
            await ctx.runMutation(internal.wordpressSync.helpers.idMapping.touch, {
              siteId,
              objectType: "post",
              wpId: wpPost.id,
              jobId,
            });
          }

          // Source hash comparison - skip if unchanged
          if (existingMapping.sourceHash === sourceHash) {
            skipped++;
            progress.imported++;
            continue;
          }

          // Local edit detection
          if (importConfig.behavior.preserveLocalEdits) {
            const localPost = await ctx.runQuery(
              internal.wordpressSync.internals.getEntityById,
              { table: "posts", id: existingMapping.convexId }
            );
            if (localPost && localPost.updatedAt > existingMapping.createdAt) {
              await createFinding(ctx, {
                siteId, jobId, severity: "warning", phase: "posts",
                code: FINDING_CODES.LOCAL_EDIT_CONFLICT,
                message: `Post "${wpPost.title?.rendered}" was edited locally since import`,
                sourceType: "post", sourceId: String(wpPost.id),
                destinationTable: "posts", wpId: wpPost.id,
                convexId: existingMapping.convexId,
              });
              skipped++;
              progress.imported++;
              continue;
            }
          }

          // Update the sourceHash on the existing mapping
          if (!isDryRun) {
            await ctx.runMutation(
              internal.wordpressSync.helpers.idMapping.updateSourceHash,
              { siteId, objectType: "post", wpId: wpPost.id, sourceHash }
            );
          }

          // Existing mapping with changed hash - if updateExisting is false, skip
          if (!importConfig.behavior.updateExisting) {
            skipped++;
            progress.imported++;
            continue;
          }

          // Continue into the shared write path below to patch the mapped post.
        }

        // No existing mapping - check for slug collision
        const existingBySlug = existingMapping
          ? null
          : await ctx.runQuery(
              internal.wordpressSync.internals.findPostBySlug,
              { slug: wpPost.slug, type: "post" }
            );

        if (existingBySlug) {
          await createFinding(ctx, {
            siteId, jobId, severity: "warning", phase: "posts",
            code: FINDING_CODES.SLUG_COLLISION,
            message: `Post with slug "${wpPost.slug}" already exists locally (ID: ${existingBySlug._id})`,
            sourceType: "post", sourceId: String(wpPost.id),
            destinationTable: "posts", wpId: wpPost.id,
            convexId: existingBySlug._id,
          });
          if (!importConfig.behavior.updateExisting) {
            skipped++;
            progress.imported++;
            continue;
          }
        }

        if (!isDryRun) {
          // Fetch post meta (for Elementor, ACF, Yoast)
          let postMeta: WPMeta[] = [];
          if (importConfig.scope.elementor) {
            try {
              postMeta = await fetchWPPostMeta(credentials, wpPost.id);
            } catch {
              // Continue without meta if fetch fails
            }
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
            existingId: existingPostId,
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
          }

          // Store original rendered HTML for reference and future re-rendering.
          if (wpPost.content?.rendered) {
            await ctx.runMutation(internal.wordpressSync.phases.postsCreateMeta, {
              postId,
              key: "_wp_content_rendered",
              value: wpPost.content.rendered,
            });
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

          const storedMetaKeys = new Set([
            "_elementor_data",
            "_wp_content_rendered",
            ...processedContent.acfMeta.map((item) => item.key),
            ...processedContent.seoMeta.map((item) => item.key),
          ]);

          for (const sourceMeta of selectWpPostMetaForPreservation(postMeta, storedMetaKeys)) {
            await ctx.runMutation(internal.wordpressSync.phases.postsCreateMeta, {
              postId,
              key: sourceMeta.key,
              value: sourceMeta.value,
            });
          }

          // Create term relationships
          for (const termId of [...categoryIds, ...tagIds]) {
            await ctx.runMutation(internal.wordpressSync.phases.postsCreateTermRelationship, {
              postId,
              termId,
            });
          }

          if (!existingPostId) {
            // Create ID mapping with sourceHash
            await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
              siteId,
              objectType: "post",
              wpId: wpPost.id,
              convexId: postId,
              sourceHash,
              jobId,
            });
          }
        }

        if (existingPostId) {
          updated++;
        } else {
          created++;
        }
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
      // Prefer rendered HTML for display; Elementor JSON remains in postMeta.
      result.content = wpPost.content?.rendered
        ? createHtmlBlockDocument(wpPost.content.rendered)
        : createParagraphDocument(extractTextFromElementor(parsed));
    }
  }

  // If no Elementor content, preserve rendered WordPress HTML as an HTML block.
  if (!result.content && wpPost.content?.rendered) {
    result.content = createHtmlBlockDocument(wpPost.content.rendered);
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
  ctx: ActionCtx,
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

function createHtmlBlockDocument(html: string): string {
  return JSON.stringify({
    type: "doc",
    content: [
      {
        type: "html",
        attrs: { content: html },
      },
    ],
  });
}

function createParagraphDocument(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: text
      ? [
          {
            type: "paragraph",
            content: [{ type: "text", text }],
          },
        ]
      : [],
  });
}

// ─── Post Creation Mutations ───────────────────────────────────────────────

export const postsCreate = internalMutation({
  args: {
    existingId: v.optional(v.string()),
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
  handler: async (ctx, { existingId, wpPost, authorId, featuredImageId, siteId }) => {
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

    const fields = {
      type: "post" as const,
      title: stripHtml(wpPost.title),
      slug: wpPost.slug,
      content: wpPost.content,
      excerpt: stripHtml(wpPost.excerpt) || undefined,
      status: wpPost.status,
      visibility: (wpPost.status === "private" ? "private" : "public") as "private" | "public",
      authorId: finalAuthorId,
      featuredImageId: featuredImageId ? (featuredImageId as Id<"media">) : undefined,
      commentStatus: wpPost.commentStatus,
      isSticky: wpPost.isSticky,
      publishedAt: wpPost.publishedAt,
      wpPostId: wpPost.id,
      wpGuid: wpPost.guid,
      wpSourceSiteId: siteId,
      updatedAt: now,
    };

    if (existingId) {
      await ctx.db.patch(existingId as Id<"posts">, fields);
      return existingId;
    }

    // Create post
    const postId = await ctx.db.insert("posts", {
      ...fields,
      createdAt: now,
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
    const existing = await ctx.db
      .query("postMeta")
      .withIndex("by_post_key", (q) =>
        q.eq("postId", postId as Id<"posts">).eq("key", key)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { value });
      return;
    }

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
