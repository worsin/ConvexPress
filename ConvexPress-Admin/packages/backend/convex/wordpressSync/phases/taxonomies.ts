/**
 * WordPress Sync - Taxonomies Import Phase
 *
 * Imports categories and tags from WordPress.
 * Must run before posts because posts reference terms.
 *
 * Categories are hierarchical (have parentId), tags are flat.
 */

import { internalAction, internalMutation, type ActionCtx } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { fetchWPCategories, fetchWPTags, type WPCategory, type WPTag } from "../helpers/wpClient";
import type { PhaseResult } from "../internals";
import type { SyncError, PhaseProgress, SiteCredentials } from "../validators";
import { WP_BATCH_SIZE, normalizeImportConfig, FINDING_CODES, siteCredentialsValidator } from "../validators";
import { createFinding } from "../helpers/idMapping";


// ─── Source Hash Helper ───────────────────────────────────────────────────

function computeSourceHash(fields: Record<string, unknown>): string {
  const str = JSON.stringify(fields); let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; } return h.toString(36);
}

// ─── Taxonomies Import Action ──────────────────────────────────────────────

export const importBatch = internalAction({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
    credentials: siteCredentialsValidator,
  },
  handler: async (ctx, { jobId, siteId, credentials }): Promise<PhaseResult> => {
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
    const importConfig = normalizeImportConfig(job?.importConfig);
    const isDryRun = importConfig.behavior.dryRun;

    // We process categories first, then tags.
    //
    // Architecture note: this phase tracks two sub-buckets (categories + tags)
    // but the orchestrator's `updatePhaseProgress` only writes one slot per
    // run. To avoid the orchestrator's write clobbering our state and to
    // keep the next batch reading current data, we persist sub-bucket
    // progress directly to `.categories` and `.tags` slots BEFORE returning
    // to the orchestrator. The orchestrator will still write the returned
    // PhaseProgress to `.taxonomies` (per `getProgressKey`); that becomes a
    // combined-summary slot we don't read from here.
    const categoriesProgress = { ...(job.progress.categories ?? { total: 0, imported: 0, failed: 0 }) };
    const tagsProgress = { ...(job.progress.tags ?? { total: 0, imported: 0, failed: 0 }) };

    // Process categories if not done
    if (categoriesProgress.imported + categoriesProgress.failed < categoriesProgress.total || categoriesProgress.total === 0) {
      const result = await importCategories(ctx, siteId, jobId, credentials, categoriesProgress, isDryRun, importConfig);
      errors.push(...result.errors);

      // Persist categories progress so the next batch reads up-to-date state.
      await ctx.runMutation(internal.wordpressSync.internals.updatePhaseProgress, {
        jobId,
        phase: "categories",
        progress: result.progress,
      });

      // Return categories progress if still more to do
      if (result.hasMore) {
        return {
          progress: result.progress,
          errors,
          hasMore: true,
        };
      }
    }

    if (
      !isDryRun &&
      categoriesProgress.total > 0 &&
      categoriesProgress.imported + categoriesProgress.failed >= categoriesProgress.total &&
      tagsProgress.imported === 0 &&
      tagsProgress.failed === 0
    ) {
      await repairCategoryHierarchy(ctx, siteId, credentials);
    }

    // Process tags
    const tagsResult = await importTags(ctx, siteId, jobId, credentials, tagsProgress, isDryRun, importConfig);
    errors.push(...tagsResult.errors);

    // Persist tags progress so the next batch reads up-to-date state.
    await ctx.runMutation(internal.wordpressSync.internals.updatePhaseProgress, {
      jobId,
      phase: "tags",
      progress: tagsResult.progress,
    });

    // Return combined progress to the orchestrator. The orchestrator will
    // write this to `.taxonomies` for display; the per-sub-bucket truth is
    // already stored in `.categories` and `.tags`.
    const combinedTotal =
      (categoriesProgress.total || 0) + (tagsResult.progress.total || 0);
    const combinedImported =
      (categoriesProgress.imported || 0) + (tagsResult.progress.imported || 0);
    const combinedFailed =
      (categoriesProgress.failed || 0) + (tagsResult.progress.failed || 0);
    return {
      progress: {
        total: combinedTotal,
        imported: combinedImported,
        failed: combinedFailed,
        cursor:
          (categoriesProgress.cursor || 0) + (tagsResult.progress.cursor || 0),
      },
      errors,
      hasMore: tagsResult.hasMore,
    };
  },
});

// ─── Category Import ───────────────────────────────────────────────────────

async function importCategories(
  ctx: ActionCtx,
  siteId: Id<"wordpressSites">,
  jobId: Id<"wordpressSyncJobs">,
  credentials: SiteCredentials,
  progress: PhaseProgress,
  isDryRun: boolean,
  importConfig: any
): Promise<PhaseResult> {
  const errors: SyncError[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = progress.cursor || 0;
  const entityLimit =
    typeof importConfig.filters.entityLimit === "number"
      ? importConfig.filters.entityLimit
      : undefined;
  if (entityLimit !== undefined && cursor >= entityLimit) {
    progress.total = Math.min(progress.total || entityLimit, entityLimit);
    return { progress, errors, hasMore: false };
  }
  const page = Math.floor(cursor / WP_BATCH_SIZE) + 1;

  // Fetch categories
  const { data: fetchedCategories, total } = await fetchWPCategories(credentials, page, WP_BATCH_SIZE);
  const categories =
    entityLimit !== undefined
      ? fetchedCategories.slice(0, Math.max(0, entityLimit - cursor))
      : fetchedCategories;
  const effectiveTotal = entityLimit !== undefined ? Math.min(total, entityLimit) : total;

  if (progress.total === 0 && effectiveTotal > 0) {
    progress.total = effectiveTotal;
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
      const existingTermId = existingMapping?.convexId;

      if (existingMapping) {
        if (!isDryRun) {
          await ctx.runMutation(internal.wordpressSync.helpers.idMapping.touch, {
            siteId,
            objectType: "category",
            wpId: wpCategory.id,
            jobId,
          });
        }

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
      }

      // No existing mapping - check for slug collision
      const existingBySlug = existingMapping
        ? null
        : await ctx.runQuery(
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
        const termId = await ctx.runMutation(internal.wordpressSync.phases.taxonomies.taxonomiesCreateTerm, {
          existingId: existingTermId,
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

        if (!existingTermId) {
          // Create ID mapping with sourceHash
          await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
            siteId,
            objectType: "category",
            wpId: wpCategory.id,
            convexId: termId,
            sourceHash,
            jobId,
          });
        }
      }

      if (existingTermId) {
        updated++;
      } else {
        created++;
      }
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
  ctx: ActionCtx,
  siteId: Id<"wordpressSites">,
  jobId: Id<"wordpressSyncJobs">,
  credentials: SiteCredentials,
  progress: PhaseProgress,
  isDryRun: boolean,
  importConfig: any
): Promise<PhaseResult> {
  const errors: SyncError[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = progress.cursor || 0;
  const entityLimit =
    typeof importConfig.filters.entityLimit === "number"
      ? importConfig.filters.entityLimit
      : undefined;
  if (entityLimit !== undefined && cursor >= entityLimit) {
    progress.total = Math.min(progress.total || entityLimit, entityLimit);
    return { progress, errors, hasMore: false };
  }
  const page = Math.floor(cursor / WP_BATCH_SIZE) + 1;

  // Fetch tags
  const { data: fetchedTags, total } = await fetchWPTags(credentials, page, WP_BATCH_SIZE);
  const tags =
    entityLimit !== undefined
      ? fetchedTags.slice(0, Math.max(0, entityLimit - cursor))
      : fetchedTags;
  const effectiveTotal = entityLimit !== undefined ? Math.min(total, entityLimit) : total;

  if (progress.total === 0 && effectiveTotal > 0) {
    progress.total = effectiveTotal;
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
      const existingTermId = existingMapping?.convexId;

      if (existingMapping) {
        if (!isDryRun) {
          await ctx.runMutation(internal.wordpressSync.helpers.idMapping.touch, {
            siteId,
            objectType: "tag",
            wpId: wpTag.id,
            jobId,
          });
        }

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
      }

      // No existing mapping - check for slug collision
      const existingBySlug = existingMapping
        ? null
        : await ctx.runQuery(
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
        const termId = await ctx.runMutation(internal.wordpressSync.phases.taxonomies.taxonomiesCreateTerm, {
          existingId: existingTermId,
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

        if (!existingTermId) {
          // Create ID mapping with sourceHash
          await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
            siteId,
            objectType: "tag",
            wpId: wpTag.id,
            convexId: termId,
            sourceHash,
            jobId,
          });
        }
      }

      if (existingTermId) {
        updated++;
      } else {
        created++;
      }
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

async function repairCategoryHierarchy(
  ctx: ActionCtx,
  siteId: Id<"wordpressSites">,
  credentials: SiteCredentials
) {
  let page = 1;

  while (true) {
    const { data: categories, total } = await fetchWPCategories(credentials, page, WP_BATCH_SIZE);

    for (const wpCategory of categories) {
      const termId = await ctx.runQuery(
        internal.wordpressSync.helpers.idMapping.getByWpId,
        { siteId, objectType: "category", wpId: wpCategory.id }
      );

      if (!termId) continue;

      let parentId: string | undefined;
      if (wpCategory.parent > 0) {
        parentId = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getByWpId,
          { siteId, objectType: "category", wpId: wpCategory.parent }
        ) ?? undefined;
      }

      await ctx.runMutation(internal.wordpressSync.phases.taxonomies.taxonomiesSetParent, {
        termId,
        parentId,
      });
    }

    if (page * WP_BATCH_SIZE >= total || categories.length === 0) break;
    page++;
  }
}

// ─── Term Creation Mutation ────────────────────────────────────────────────

export const taxonomiesCreateTerm = internalMutation({
  args: {
    existingId: v.optional(v.string()),
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
  handler: async (ctx, { existingId, wpTerm, taxonomy, parentId, siteId }) => {
    const now = Date.now();

    const fields = {
      name: wpTerm.name,
      slug: wpTerm.slug,
      taxonomy,
      parentId: parentId ? (parentId as Id<"terms">) : undefined,
      description: wpTerm.description || undefined,
      count: wpTerm.count,
      wpTermId: wpTerm.id,
      wpSourceSiteId: siteId,
      updatedAt: now,
    };

    if (existingId) {
      await ctx.db.patch(existingId as Id<"terms">, fields);
      return existingId;
    }

    // Check if term with same slug exists in this taxonomy
    const existing = await ctx.db
      .query("terms")
      .withIndex("by_slug_taxonomy", (q) => q.eq("slug", wpTerm.slug).eq("taxonomy", taxonomy))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    // Create term
    const termId = await ctx.db.insert("terms", {
      ...fields,
      isDefault: false,
      createdAt: now,
    });

    return termId;
  },
});

export const taxonomiesSetParent = internalMutation({
  args: {
    termId: v.string(),
    parentId: v.optional(v.string()),
  },
  handler: async (ctx, { termId, parentId }) => {
    await ctx.db.patch(termId as Id<"terms">, {
      parentId: parentId ? (parentId as Id<"terms">) : undefined,
      updatedAt: Date.now(),
    });
  },
});
