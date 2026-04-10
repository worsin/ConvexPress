/**
 * WordPress Sync - Taxonomies Import Phase
 *
 * Imports categories and tags from WordPress.
 * Must run before posts because posts reference terms.
 *
 * Categories are hierarchical (have parentId), tags are flat.
 */

import { internalAction, internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { fetchWPCategories, fetchWPTags, type WPCategory, type WPTag } from "../helpers/wpClient";
import type { PhaseResult } from "../internals";
import type { SyncError, PhaseProgress } from "../validators";
import { WP_BATCH_SIZE, createDefaultImportConfig, FINDING_CODES } from "../validators";
import { createFinding } from "../helpers/idMapping";
import { createHash } from "crypto";

// ─── Source Hash Helper ───────────────────────────────────────────────────

function computeSourceHash(fields: Record<string, unknown>): string {
  return createHash("md5").update(JSON.stringify(fields)).digest("hex");
}

// ─── Taxonomies Import Action ──────────────────────────────────────────────

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
        errors: [{ phase: "taxonomies", wpId: 0, message: "Job or site not found", timestamp: Date.now() }],
        hasMore: false,
      };
    }

    // Get import config
    const importConfig = job?.importConfig ?? createDefaultImportConfig();
    const isDryRun = importConfig.behavior.dryRun;

    const credentials = {
      siteUrl: site.siteUrl,
      username: site.username,
      applicationPassword: site.applicationPassword,
    };

    // We process categories first, then tags
    const categoriesProgress = { ...job.progress.categories };
    const tagsProgress = { ...job.progress.tags };

    // Process categories if not done
    if (categoriesProgress.imported + categoriesProgress.failed < categoriesProgress.total || categoriesProgress.total === 0) {
      const result = await importCategories(ctx, siteId, jobId, credentials, categoriesProgress, isDryRun, importConfig);
      errors.push(...result.errors);

      // Return categories progress if still more to do
      if (result.hasMore) {
        return {
          progress: result.progress,
          errors,
          hasMore: true,
        };
      }
    }

    // Process tags
    const tagsResult = await importTags(ctx, siteId, jobId, credentials, tagsProgress, isDryRun, importConfig);
    errors.push(...tagsResult.errors);

    // Combine progress for reporting
    // Use tags progress since that's what we're currently working on
    return {
      progress: tagsResult.progress,
      errors,
      hasMore: tagsResult.hasMore,
    };
  },
});

// ─── Category Import ───────────────────────────────────────────────────────

async function importCategories(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  siteId: Id<"wordpressSites">,
  jobId: Id<"wordpressSyncJobs">,
  credentials: { siteUrl: string; username: string; applicationPassword: string },
  progress: PhaseProgress,
  isDryRun: boolean,
  importConfig: any
): Promise<PhaseResult> {
  const errors: SyncError[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = progress.cursor || 0;
  const page = Math.floor(cursor / WP_BATCH_SIZE) + 1;

  // Fetch categories
  const { data: categories, total } = await fetchWPCategories(credentials, page, WP_BATCH_SIZE);

  if (progress.total === 0 && total > 0) {
    progress.total = total;
  }

  // Sort by parent to ensure parents are created first
  const sorted = [...categories].sort((a, b) => {
    if (a.parent === 0 && b.parent !== 0) return -1;
    if (a.parent !== 0 && b.parent === 0) return 1;
    return a.id - b.id;
  });

  for (const wpCategory of sorted) {
    try {
      // Compute source hash for change detection
      const sourceHash = computeSourceHash({
        name: wpCategory.name,
        slug: wpCategory.slug,
        description: wpCategory.description,
        parent: wpCategory.parent,
      });

      // Check if already imported (full mapping for sourceHash)
      const existingMapping = await ctx.runQuery(
        internal.wordpressSync.helpers.idMapping.getFullMappingByWpId,
        { siteId, objectType: "category", wpId: wpCategory.id }
      );

      if (existingMapping) {
        if (existingMapping.sourceHash === sourceHash) {
          skipped++;
          progress.imported++;
          continue;
        }

        if (!isDryRun) {
          await ctx.runMutation(
            internal.wordpressSync.helpers.idMapping.updateSourceHash,
            { siteId, objectType: "category", wpId: wpCategory.id, sourceHash }
          );
        }

        if (!importConfig.behavior.updateExisting) {
          skipped++;
          progress.imported++;
          continue;
        }

        updated++;
        progress.imported++;
        continue;
      }

      // No existing mapping - check for slug collision
      const existingBySlug = await ctx.runQuery(
        internal.wordpressSync.internals.findTermBySlug,
        { slug: wpCategory.slug, taxonomy: "category" }
      );

      if (existingBySlug) {
        await createFinding(ctx, {
          siteId, jobId, severity: "warning", phase: "taxonomies",
          code: FINDING_CODES.TAXONOMY_PATH_COLLISION,
          message: `Category with slug "${wpCategory.slug}" already exists locally (ID: ${existingBySlug._id})`,
          sourceType: "category", sourceId: String(wpCategory.id),
          destinationTable: "terms", wpId: wpCategory.id,
          convexId: existingBySlug._id,
        });
        // The taxonomiesCreateTerm mutation already handles merging
        // (finding by slug and linking), so we don't skip here
      }

      if (!isDryRun) {
        // Resolve parent ID if this category has a parent
        let parentId: string | undefined;
        if (wpCategory.parent > 0) {
          parentId = await ctx.runQuery(
            internal.wordpressSync.helpers.idMapping.getByWpId,
            { siteId, objectType: "category", wpId: wpCategory.parent }
          ) ?? undefined;
        }

        // Create term
        const termId = await ctx.runMutation(internal.wordpressSync.phases.taxonomiesCreateTerm, {
          wpTerm: {
            id: wpCategory.id,
            name: wpCategory.name,
            slug: wpCategory.slug,
            description: wpCategory.description,
            count: wpCategory.count,
            parent: wpCategory.parent,
          },
          taxonomy: "category",
          parentId,
          siteId,
        });

        // Create ID mapping with sourceHash
        await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
          siteId,
          objectType: "category",
          wpId: wpCategory.id,
          convexId: termId,
          sourceHash,
        });
      }

      created++;
      progress.imported++;
    } catch (error) {
      errors.push({
        phase: "taxonomies",
        wpId: wpCategory.id,
        message: `Category: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
      });
      progress.failed++;
    }
  }

  progress.cursor = cursor + categories.length;

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
}

// ─── Tag Import ────────────────────────────────────────────────────────────

async function importTags(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  siteId: Id<"wordpressSites">,
  jobId: Id<"wordpressSyncJobs">,
  credentials: { siteUrl: string; username: string; applicationPassword: string },
  progress: PhaseProgress,
  isDryRun: boolean,
  importConfig: any
): Promise<PhaseResult> {
  const errors: SyncError[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = progress.cursor || 0;
  const page = Math.floor(cursor / WP_BATCH_SIZE) + 1;

  // Fetch tags
  const { data: tags, total } = await fetchWPTags(credentials, page, WP_BATCH_SIZE);

  if (progress.total === 0 && total > 0) {
    progress.total = total;
  }

  for (const wpTag of tags) {
    try {
      // Compute source hash for change detection
      const sourceHash = computeSourceHash({
        name: wpTag.name,
        slug: wpTag.slug,
        description: wpTag.description,
      });

      // Check if already imported (full mapping for sourceHash)
      const existingMapping = await ctx.runQuery(
        internal.wordpressSync.helpers.idMapping.getFullMappingByWpId,
        { siteId, objectType: "tag", wpId: wpTag.id }
      );

      if (existingMapping) {
        if (existingMapping.sourceHash === sourceHash) {
          skipped++;
          progress.imported++;
          continue;
        }

        if (!isDryRun) {
          await ctx.runMutation(
            internal.wordpressSync.helpers.idMapping.updateSourceHash,
            { siteId, objectType: "tag", wpId: wpTag.id, sourceHash }
          );
        }

        if (!importConfig.behavior.updateExisting) {
          skipped++;
          progress.imported++;
          continue;
        }

        updated++;
        progress.imported++;
        continue;
      }

      // No existing mapping - check for slug collision
      const existingBySlug = await ctx.runQuery(
        internal.wordpressSync.internals.findTermBySlug,
        { slug: wpTag.slug, taxonomy: "post_tag" }
      );

      if (existingBySlug) {
        await createFinding(ctx, {
          siteId, jobId, severity: "warning", phase: "taxonomies",
          code: FINDING_CODES.TAXONOMY_PATH_COLLISION,
          message: `Tag with slug "${wpTag.slug}" already exists locally (ID: ${existingBySlug._id})`,
          sourceType: "tag", sourceId: String(wpTag.id),
          destinationTable: "terms", wpId: wpTag.id,
          convexId: existingBySlug._id,
        });
        // The taxonomiesCreateTerm mutation already handles merging
      }

      if (!isDryRun) {
        // Create term
        const termId = await ctx.runMutation(internal.wordpressSync.phases.taxonomiesCreateTerm, {
          wpTerm: {
            id: wpTag.id,
            name: wpTag.name,
            slug: wpTag.slug,
            description: wpTag.description,
            count: wpTag.count,
            parent: 0,
          },
          taxonomy: "post_tag",
          parentId: undefined,
          siteId,
        });

        // Create ID mapping with sourceHash
        await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
          siteId,
          objectType: "tag",
          wpId: wpTag.id,
          convexId: termId,
          sourceHash,
        });
      }

      created++;
      progress.imported++;
    } catch (error) {
      errors.push({
        phase: "taxonomies",
        wpId: wpTag.id,
        message: `Tag: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
      });
      progress.failed++;
    }
  }

  progress.cursor = cursor + tags.length;

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
}

// ─── Term Creation Mutation ────────────────────────────────────────────────

export const taxonomiesCreateTerm = internalMutation({
  args: {
    wpTerm: v.object({
      id: v.number(),
      name: v.string(),
      slug: v.string(),
      description: v.optional(v.string()),
      count: v.number(),
      parent: v.number(),
    }),
    taxonomy: v.union(v.literal("category"), v.literal("post_tag")),
    parentId: v.optional(v.string()),
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { wpTerm, taxonomy, parentId, siteId }) => {
    const now = Date.now();

    // Check if term with same slug exists in this taxonomy
    const existing = await ctx.db
      .query("terms")
      .withIndex("by_slug_taxonomy", (q) => q.eq("slug", wpTerm.slug).eq("taxonomy", taxonomy))
      .first();

    if (existing) {
      // Update with WP reference if not set
      if (!existing.wpTermId) {
        await ctx.db.patch(existing._id, {
          wpTermId: wpTerm.id,
          wpSourceSiteId: siteId,
          updatedAt: now,
        });
      }
      return existing._id;
    }

    // Create term
    const termId = await ctx.db.insert("terms", {
      name: wpTerm.name,
      slug: wpTerm.slug,
      taxonomy,
      parentId: parentId ? (parentId as Id<"terms">) : undefined,
      description: wpTerm.description || undefined,
      count: wpTerm.count,
      isDefault: false,
      wpTermId: wpTerm.id,
      wpSourceSiteId: siteId,
      createdAt: now,
      updatedAt: now,
    });

    return termId;
  },
});
