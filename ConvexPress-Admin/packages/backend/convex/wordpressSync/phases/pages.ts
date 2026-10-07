import { canonicalJson, sha256Hex } from "../../canonicalDocuments/foundation/shared/fingerprints";
import { canonicalBoundary, importWordPressDocument } from "../../canonicalDocuments/service";
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

import { insertWithMediaReferences, patchWithMediaReferences } from "../../media/attachmentGuard";
import { internalAction, internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { fetchWPPages, fetchWPPostMeta, type WPPage, type WPMeta } from "../helpers/wpClient";
import { parseElementorData, isElementorData } from "../helpers/elementor";
import { parseACFFields, hasACFFields, acfToPostMeta } from "../helpers/acfParser";
import { parseYoastMeta, hasYoastMeta, yoastToSEOMeta } from "../helpers/yoastParser";
import { selectWpPostMetaForPreservation } from "../fieldPolicy";
import type { PhaseResult } from "../internals";
import type { SyncError, PhaseProgress } from "../validators";
import { WP_BATCH_SIZE, normalizeImportConfig, FINDING_CODES, siteCredentialsValidator } from "../validators";
import { createFinding } from "../helpers/idMapping";


// ─── Source Hash Helper ───────────────────────────────────────────────────



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
        const pageMeta: WPMeta[] = importConfig.scope.elementor
          ? await fetchWPPostMeta(credentials, wpPage.id, "pages") : [];
        const sourceHash = sha256Hex(canonicalJson({record:wpPage,meta:pageMeta}));

        // Check if already imported (full mapping for sourceHash)
        const existingMapping = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getFullMappingByWpId,
          { siteId, objectType: "page", wpId: wpPage.id }
        );
        const existingPageId = existingMapping?.convexId;
        const localDocument = existingMapping ? await ctx.runQuery(
          internal.wordpressSync.internals.getEntityById, {table:"posts",id:existingMapping.convexId}
        ) : null;

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
            if (localDocument && (existingMapping.acceptedRevision !== undefined
              ? localDocument.blocksRevision !== existingMapping.acceptedRevision || localDocument.updatedAt !== existingMapping.acceptedUpdatedAt
              : localDocument.updatedAt > existingMapping.createdAt)) {
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
            if (!parentId) throw new Error("Import the WordPress parent page before this child.");
          }

          const meta = [
            {key:"_wp_source_record",value:JSON.stringify(wpPage)},
            {key:"_wp_source_meta",value:JSON.stringify(pageMeta)},
            {key:"_wp_content_rendered",value:wpPage.content?.rendered ?? ""},
            ...processedContent.acfMeta, ...processedContent.seoMeta,
            ...(processedContent.elementorData ? [{key:"_elementor_data",value:processedContent.elementorData},{key:"_elementor_edit_mode",value:"builder"}] : []),
          ];
          meta.push(...selectWpPostMetaForPreservation(pageMeta,new Set(meta.map(item=>item.key))));
          // Create the page
          await ctx.runMutation(internal.wordpressSync.phases.pages.pagesCreate, {
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
            siteId, jobId, sourceHash,
            expectedRevision: localDocument?.blocksRevision,
            expectedUpdatedAt: localDocument?.updatedAt,
            meta,
          });
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
      if (!wpPage.content?.rendered) throw new Error("Elementor content requires rendered HTML for a reviewed canonical import.");
      result.content = wpPage.content.rendered;
    }
  }

  // If no Elementor content, pass rendered WordPress HTML to the reviewed canonical converter.
  if (!result.content && wpPage.content?.rendered) {
    result.content = wpPage.content.rendered;
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

// ─── Page Creation Mutation ────────────────────────────────────────────────

export const pagesCreate = internalMutation({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    sourceHash: v.string(),
    expectedRevision: v.optional(v.number()),
    expectedUpdatedAt: v.optional(v.number()),
    meta: v.array(v.object({key:v.string(),value:v.string()})),

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
  returns: v.id("posts"),
  handler: async (ctx, { wpPage, ...args }) => canonicalBoundary(() => importWordPressDocument(ctx, "page", {...args,document:{...wpPage,title:stripHtml(wpPage.title),excerpt:stripHtml(wpPage.excerpt)}})),
});
