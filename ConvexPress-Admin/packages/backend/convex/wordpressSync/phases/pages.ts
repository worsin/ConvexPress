/**
 * WordPress Sync - Pages Import Phase
 *
 * Imports pages from WordPress including:
 *   - Page content (with Elementor data - critical for most pages!)
 *   - Page hierarchy (parent/child)
 *   - Page templates
 *   - Menu order
 *   - ACF custom fields
 *   - Yoast SEO data
 */

import { internalAction, internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { fetchWPPages, fetchWPPostMeta, type WPPage, type WPMeta } from "../helpers/wpClient";
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

// ─── Pages Import Action ───────────────────────────────────────────────────

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
        errors: [{ phase: "pages", wpId: 0, message: "Job or site not found", timestamp: Date.now() }],
        hasMore: false,
      };
    }

    const progress: PhaseProgress = { ...job.progress.pages };
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

    // Fetch pages from WordPress
    const { data: fetchedPages, total } = await fetchWPPages(credentials, page, WP_BATCH_SIZE, {
      importDrafts: importConfig.behavior.importDrafts,
      dateRangeStart: importConfig.filters.dateRangeStart,
      dateRangeEnd: importConfig.filters.dateRangeEnd,
    });
    const pages =
      entityLimit !== undefined
        ? fetchedPages.slice(0, Math.max(0, entityLimit - cursor))
        : fetchedPages;

    const effectiveTotal = entityLimit !== undefined ? Math.min(total, entityLimit) : total;
    if (progress.total === 0 && effectiveTotal > 0) {
      progress.total = effectiveTotal;
    }

    // Sort by parent to ensure parents are created first
    const sorted = [...pages].sort((a, b) => {
      if (a.parent === 0 && b.parent !== 0) return -1;
      if (a.parent !== 0 && b.parent === 0) return 1;
      return a.id - b.id;
    });

    // Process each page
    for (const wpPage of sorted) {
      try {
        // Compute source hash for change detection
        const sourceHash = computeSourceHash({
          title: wpPage.title?.rendered,
          content: wpPage.content?.rendered,
          status: wpPage.status,
          slug: wpPage.slug,
        });

        // Check if already imported (full mapping for sourceHash)
        const existingMapping = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getFullMappingByWpId,
          { siteId, objectType: "page", wpId: wpPage.id }
        );
        const existingPageId = existingMapping?.convexId;

        if (existingMapping) {
          if (!isDryRun) {
            await ctx.runMutation(internal.wordpressSync.helpers.idMapping.touch, {
              siteId,
              objectType: "page",
              wpId: wpPage.id,
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
            const localPage = await ctx.runQuery(
              internal.wordpressSync.internals.getEntityById,
              { table: "posts", id: existingMapping.convexId }
            );
            if (localPage && localPage.updatedAt > existingMapping.createdAt) {
              await createFinding(ctx, {
                siteId, jobId, severity: "warning", phase: "pages",
                code: FINDING_CODES.LOCAL_EDIT_CONFLICT,
                message: `Page "${wpPage.title?.rendered}" was edited locally since import`,
                sourceType: "page", sourceId: String(wpPage.id),
                destinationTable: "posts", wpId: wpPage.id,
                convexId: existingMapping.convexId,
              });
              skipped++;
              progress.imported++;
              continue;
            }
          }

          // Update sourceHash on existing mapping
          if (!isDryRun) {
            await ctx.runMutation(
              internal.wordpressSync.helpers.idMapping.updateSourceHash,
              { siteId, objectType: "page", wpId: wpPage.id, sourceHash }
            );
          }

          if (!importConfig.behavior.updateExisting) {
            skipped++;
            progress.imported++;
            continue;
          }

          // Continue into the shared write path below to patch the mapped page.
        }

        // No existing mapping - check for slug collision
        const existingBySlug = existingMapping
          ? null
          : await ctx.runQuery(
              internal.wordpressSync.internals.findPostBySlug,
              { slug: wpPage.slug, type: "page" }
            );

        if (existingBySlug) {
          await createFinding(ctx, {
            siteId, jobId, severity: "warning", phase: "pages",
            code: FINDING_CODES.SLUG_COLLISION,
            message: `Page with slug "${wpPage.slug}" already exists locally (ID: ${existingBySlug._id})`,
            sourceType: "page", sourceId: String(wpPage.id),
            destinationTable: "posts", wpId: wpPage.id,
            convexId: existingBySlug._id,
          });
          if (!importConfig.behavior.updateExisting) {
            skipped++;
            progress.imported++;
            continue;
          }
        }

        if (!isDryRun) {
          // Fetch post meta (for Elementor - very important for pages!)
          let pageMeta: WPMeta[] = [];
          if (importConfig.scope.elementor) {
            try {
              pageMeta = await fetchWPPostMeta(credentials, wpPage.id);
            } catch {
              // Continue without meta if fetch fails
            }
          }

          // Process content and meta
          const processedContent = await processPageContent(wpPage, pageMeta);

          // Resolve author
          const authorId = await ctx.runQuery(
            internal.wordpressSync.helpers.idMapping.getByWpId,
            { siteId, objectType: "user", wpId: wpPage.author }
          );

          // Resolve featured image
          let featuredImageId: string | undefined;
          if (wpPage.featured_media) {
            featuredImageId = await ctx.runQuery(
              internal.wordpressSync.helpers.idMapping.getByWpId,
              { siteId, objectType: "media", wpId: wpPage.featured_media }
            ) ?? undefined;
          }

          // Resolve parent page
          let parentId: string | undefined;
          if (wpPage.parent > 0) {
            parentId = await ctx.runQuery(
              internal.wordpressSync.helpers.idMapping.getByWpId,
              { siteId, objectType: "page", wpId: wpPage.parent }
            ) ?? undefined;
          }

          // Create the page
          const pageId = await ctx.runMutation(internal.wordpressSync.phases.pagesCreate, {
            existingId: existingPageId,
            wpPage: {
              id: wpPage.id,
              title: wpPage.title?.rendered || "",
              slug: wpPage.slug,
              content: processedContent.content,
              excerpt: wpPage.excerpt?.rendered || "",
              status: mapWPStatus(wpPage.status),
              commentStatus: wpPage.comment_status === "open" ? "open" : "closed",
              menuOrder: wpPage.menu_order || 0,
              template: wpPage.template || "default",
              publishedAt: wpPage.date ? new Date(wpPage.date).getTime() : undefined,
              guid: wpPage.guid?.rendered,
            },
            authorId: authorId ?? undefined,
            featuredImageId,
            parentId,
            siteId,
          });

          // Store Elementor data if present (this is critical for pages!)
          if (processedContent.elementorData) {
            await ctx.runMutation(internal.wordpressSync.phases.postsCreateMeta, {
              postId: pageId,
              key: "_elementor_data",
              value: processedContent.elementorData,
            });

            // Mark this page as using Elementor
            await ctx.runMutation(internal.wordpressSync.phases.postsCreateMeta, {
              postId: pageId,
              key: "_elementor_edit_mode",
              value: "builder",
            });
          }

          // Store original rendered HTML for reference and future re-rendering.
          if (wpPage.content?.rendered) {
            await ctx.runMutation(internal.wordpressSync.phases.postsCreateMeta, {
              postId: pageId,
              key: "_wp_content_rendered",
              value: wpPage.content.rendered,
            });
          }

          // Store ACF data
          for (const acfMeta of processedContent.acfMeta) {
            await ctx.runMutation(internal.wordpressSync.phases.postsCreateMeta, {
              postId: pageId,
              key: acfMeta.key,
              value: acfMeta.value,
            });
          }

          // Store Yoast SEO data
          for (const seoMeta of processedContent.seoMeta) {
            await ctx.runMutation(internal.wordpressSync.phases.postsCreateMeta, {
              postId: pageId,
              key: seoMeta.key,
              value: seoMeta.value,
            });
          }

          const storedMetaKeys = new Set([
            "_elementor_data",
            "_elementor_edit_mode",
            "_wp_content_rendered",
            ...processedContent.acfMeta.map((item) => item.key),
            ...processedContent.seoMeta.map((item) => item.key),
          ]);

          for (const sourceMeta of selectWpPostMetaForPreservation(pageMeta, storedMetaKeys)) {
            await ctx.runMutation(internal.wordpressSync.phases.postsCreateMeta, {
              postId: pageId,
              key: sourceMeta.key,
              value: sourceMeta.value,
            });
          }

          if (!existingPageId) {
            // Create ID mapping with sourceHash
            await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
              siteId,
              objectType: "page",
              wpId: wpPage.id,
              convexId: pageId,
              sourceHash,
              jobId,
            });
          }
        }

        if (existingPageId) {
          updated++;
        } else {
          created++;
        }
        progress.imported++;
      } catch (error) {
        errors.push({
          phase: "pages",
          wpId: wpPage.id,
          message: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        });
        progress.failed++;
      }
    }

    // Update cursor
    progress.cursor = cursor + pages.length;

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

async function processPageContent(
  wpPage: WPPage,
  pageMeta: WPMeta[]
): Promise<ProcessedContent> {
  const result: ProcessedContent = {
    content: "",
    acfMeta: [],
    seoMeta: [],
  };

  // Check for Elementor data in meta - this is CRITICAL for pages
  const elementorMeta = pageMeta.find((m) => m.key === "_elementor_data");
  const elementorValue = elementorMeta?.value;

  if (elementorValue && typeof elementorValue === "string" && isElementorData(elementorValue)) {
    const parsed = parseElementorData(elementorValue);
    if (parsed) {
      // Store the raw Elementor JSON (preserves all layout/design)
      result.elementorData = elementorValue;
      // Prefer rendered HTML for display; Elementor JSON remains in postMeta.
      result.content = wpPage.content?.rendered
        ? createHtmlBlockDocument(wpPage.content.rendered)
        : createParagraphDocument(extractTextFromElementor(parsed));
    }
  }

  // If no Elementor content, preserve rendered WordPress HTML as an HTML block.
  if (!result.content && wpPage.content?.rendered) {
    result.content = createHtmlBlockDocument(wpPage.content.rendered);
  }

  // Process ACF fields
  const metaItems = pageMeta.map((m) => ({
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

function calculatePagePath(slug: string, parentPath?: string): string {
  if (!parentPath) {
    return `/${slug}`;
  }
  return `${parentPath}/${slug}`;
}

function calculateDepth(parentId?: string): number {
  // In a real implementation, we'd look up the parent's depth
  // For now, assume 0 for top-level pages
  return parentId ? 1 : 0;
}

// ─── Page Creation Mutation ────────────────────────────────────────────────

export const pagesCreate = internalMutation({
  args: {
    existingId: v.optional(v.string()),
    wpPage: v.object({
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
      menuOrder: v.number(),
      template: v.string(),
      publishedAt: v.optional(v.number()),
      guid: v.optional(v.string()),
    }),
    authorId: v.optional(v.string()),
    featuredImageId: v.optional(v.string()),
    parentId: v.optional(v.string()),
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { existingId, wpPage, authorId, featuredImageId, parentId, siteId }) => {
    const now = Date.now();

    // Get a fallback author if needed
    let finalAuthorId: Id<"users">;
    if (authorId) {
      finalAuthorId = authorId as Id<"users">;
    } else {
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

    // Calculate path and depth
    let path = `/${wpPage.slug}`;
    let depth = 0;

    if (parentId) {
      const parent = await ctx.db.get(parentId as Id<"posts">);
      if (parent && parent.path) {
        path = `${parent.path}/${wpPage.slug}`;
        depth = (parent.depth || 0) + 1;
      }
    }

    const fields = {
      type: "page" as const,
      title: stripHtml(wpPage.title),
      slug: wpPage.slug,
      content: wpPage.content,
      excerpt: stripHtml(wpPage.excerpt) || undefined,
      status: wpPage.status,
      visibility: (wpPage.status === "private" ? "private" : "public") as "private" | "public",
      authorId: finalAuthorId,
      featuredImageId: featuredImageId ? (featuredImageId as Id<"media">) : undefined,
      commentStatus: wpPage.commentStatus,
      parentId: parentId ? (parentId as Id<"posts">) : undefined,
      menuOrder: wpPage.menuOrder,
      pageTemplate: wpPage.template !== "default" ? wpPage.template : undefined,
      path,
      depth,
      publishedAt: wpPage.publishedAt,
      wpPostId: wpPage.id,
      wpGuid: wpPage.guid,
      wpSourceSiteId: siteId,
      updatedAt: now,
    };

    if (existingId) {
      await ctx.db.patch(existingId as Id<"posts">, fields);
      return existingId;
    }

    // Create page
    const pageId = await ctx.db.insert("posts", {
      ...fields,
      createdAt: now,
    });

    return pageId;
  },
});
