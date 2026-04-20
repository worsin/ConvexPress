/**
 * WordPress Sync - Media Import Phase
 *
 * Downloads media files from WordPress and uploads to Convex storage.
 * Must run before posts because posts reference featured images.
 *
 * Uses smaller batch sizes due to file download overhead.
 */

import { internalAction, internalMutation, type ActionCtx, type MutationCtx } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { fetchWPMedia, type WPMedia } from "../helpers/wpClient";
import type { PhaseResult } from "../internals";
import type { SyncError, PhaseProgress } from "../validators";
import { MEDIA_BATCH_SIZE, normalizeImportConfig, FINDING_CODES, siteCredentialsValidator } from "../validators";
import { createFinding } from "../helpers/idMapping";


// ─── Source Hash Helper ───────────────────────────────────────────────────

function computeSourceHash(fields: Record<string, unknown>): string {
  const str = JSON.stringify(fields); let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; } return h.toString(36);
}

// ─── Media Import Action ───────────────────────────────────────────────────

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
        errors: [{ phase: "media", wpId: 0, message: "Job or site not found", timestamp: Date.now() }],
        hasMore: false,
      };
    }

    const progress: PhaseProgress = { ...job.progress.media };
    const cursor = progress.cursor || 0;
    const entityLimit =
      typeof importConfig.filters.entityLimit === "number"
        ? importConfig.filters.entityLimit
        : undefined;
    if (entityLimit !== undefined && cursor >= entityLimit) {
      progress.total = Math.min(progress.total || entityLimit, entityLimit);
      return { progress, errors, hasMore: false };
    }
    const page = Math.floor(cursor / MEDIA_BATCH_SIZE) + 1;

    // Fetch media from WordPress
    const { data: fetchedMediaItems, total } = await fetchWPMedia(credentials, page, MEDIA_BATCH_SIZE, {
      dateRangeStart: importConfig.filters.dateRangeStart,
      dateRangeEnd: importConfig.filters.dateRangeEnd,
    });
    const mediaItems =
      entityLimit !== undefined
        ? fetchedMediaItems.slice(0, Math.max(0, entityLimit - cursor))
        : fetchedMediaItems;
    const effectiveTotal = entityLimit !== undefined ? Math.min(total, entityLimit) : total;

    if (progress.total === 0 && effectiveTotal > 0) {
      progress.total = effectiveTotal;
    }

    // Process each media item
    for (const wpMedia of mediaItems) {
      try {
        // Compute source hash for change detection
        const sourceHash = computeSourceHash({
          title: wpMedia.title?.rendered,
          source_url: wpMedia.source_url,
          mime_type: wpMedia.mime_type,
          slug: wpMedia.slug,
          alt_text: wpMedia.alt_text,
          caption: wpMedia.caption?.rendered,
          description: wpMedia.description?.rendered,
          file: wpMedia.media_details?.file,
          width: wpMedia.media_details?.width,
          height: wpMedia.media_details?.height,
          filesize: wpMedia.media_details?.filesize,
          sizes: wpMedia.media_details?.sizes,
        });
        const sourceUrls = extractMediaSourceUrls(wpMedia);

        // Check if already imported (full mapping for sourceHash)
        const existingMapping = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getFullMappingByWpId,
          { siteId, objectType: "media", wpId: wpMedia.id }
        );
        const existingMediaId = existingMapping?.convexId;

        if (existingMapping) {
          if (!isDryRun) {
            await ctx.runMutation(internal.wordpressSync.helpers.idMapping.touch, {
              siteId,
              objectType: "media",
              wpId: wpMedia.id,
              jobId,
            });
          }

          // Source hash comparison - skip if unchanged
          if (existingMapping.sourceHash === sourceHash) {
            skipped++;
            progress.imported++;
            continue;
          }

          if (!isDryRun) {
            await ctx.runMutation(
              internal.wordpressSync.helpers.idMapping.updateSourceHash,
              { siteId, objectType: "media", wpId: wpMedia.id, sourceHash }
            );
          }

          if (!importConfig.behavior.updateExisting) {
            skipped++;
            progress.imported++;
            continue;
          }

          if (!isDryRun) {
            const sourceChanged = existingMapping.sourceUrl !== wpMedia.source_url;
            const result = sourceChanged
              ? await downloadAndUpload(ctx, wpMedia, siteId, existingMediaId)
              : await updateExistingMedia(ctx, wpMedia, siteId, existingMediaId);

            if (!result.success || !result.mediaId) {
              errors.push({
                phase: "media",
                wpId: wpMedia.id,
                message: result.error || "Failed to update media",
                timestamp: Date.now(),
              });
              progress.failed++;
              continue;
            }

            await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
              siteId,
              objectType: "media",
              wpId: wpMedia.id,
              convexId: result.mediaId,
              sourceUrl: wpMedia.source_url,
              sourceUrls,
              sourceHash,
              jobId,
            });
          }

          updated++;
          progress.imported++;
          continue;
        }

        // No existing mapping - sourceUrl collision is already handled
        // inside downloadAndUpload via mediaFindBySourceUrl

        if (!isDryRun) {
          // Download and upload the media file
          const result = await downloadAndUpload(ctx, wpMedia, siteId);

          if (result.success && result.mediaId) {
            // Create ID mapping with sourceUrl and sourceHash
            await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
              siteId,
              objectType: "media",
              wpId: wpMedia.id,
              convexId: result.mediaId,
              sourceUrl: wpMedia.source_url,
              sourceUrls,
              sourceHash,
              jobId,
            });

            created++;
            progress.imported++;
          } else {
            errors.push({
              phase: "media",
              wpId: wpMedia.id,
              message: result.error || "Failed to upload media",
              timestamp: Date.now(),
            });
            progress.failed++;
          }
        } else {
          // Dry run - count as created without actually creating
          created++;
          progress.imported++;
        }
      } catch (error) {
        errors.push({
          phase: "media",
          wpId: wpMedia.id,
          message: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        });
        progress.failed++;
      }
    }

    // Update cursor
    progress.cursor = cursor + mediaItems.length;

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

// ─── Download and Upload Helper ────────────────────────────────────────────

async function downloadAndUpload(
  ctx: ActionCtx,
  wpMedia: WPMedia,
  siteId: Id<"wordpressSites">,
  existingId?: string,
): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  try {
    // Check if media with same source URL already exists
    const existingByUrl = existingId
      ? null
      : await ctx.runQuery(
          internal.wordpressSync.phases.mediaFindBySourceUrl,
          { sourceUrl: wpMedia.source_url }
        );

    if (existingByUrl) {
      // Media already exists, just return the ID
      return { success: true, mediaId: existingByUrl };
    }

    // Download the file
    const response = await fetch(wpMedia.source_url, {
      headers: {
        "User-Agent": "ConvexPress-CMS/1.0",
      },
    });

    if (!response.ok) {
      return { success: false, error: `Download failed: ${response.status}` };
    }

    const blob = await response.blob();

    // Generate upload URL and upload to Convex storage
    const uploadUrl = await ctx.storage.generateUploadUrl();

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": wpMedia.mime_type,
      },
      body: blob,
    });

    if (!uploadResponse.ok) {
      return { success: false, error: "Storage upload failed" };
    }

    const { storageId } = (await uploadResponse.json()) as { storageId: Id<"_storage"> };

    // Get the URL for the uploaded file
    const url = await ctx.storage.getUrl(storageId);

    if (!url) {
      return { success: false, error: "Failed to get storage URL" };
    }

    // Create media record
    const mediaId = await ctx.runMutation(internal.wordpressSync.phases.mediaCreate, {
      existingId,
      wpMedia: {
        id: wpMedia.id,
        title: wpMedia.title?.rendered || wpMedia.slug,
        slug: wpMedia.slug,
        fileName: wpMedia.media_details?.file || wpMedia.slug,
        description: wpMedia.description?.rendered,
        caption: wpMedia.caption?.rendered,
        altText: wpMedia.alt_text,
        mimeType: wpMedia.mime_type,
        mediaType: determineMediaType(wpMedia.mime_type),
        fileSize: wpMedia.media_details?.filesize || blob.size,
        width: wpMedia.media_details?.width,
        height: wpMedia.media_details?.height,
        sourceUrl: wpMedia.source_url,
        authorWpId: wpMedia.author,
        sizes: extractWpMediaSizes(wpMedia),
      },
      storageId,
      url,
      siteId,
    });

    return { success: true, mediaId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function updateExistingMedia(
  ctx: ActionCtx,
  wpMedia: WPMedia,
  siteId: Id<"wordpressSites">,
  existingId: string | undefined,
): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  if (!existingId) {
    return { success: false, error: "Existing media mapping is missing a destination ID" };
  }

  try {
    const mediaId = await ctx.runMutation(internal.wordpressSync.phases.mediaUpdateMetadata, {
      mediaId: existingId,
      wpMedia: {
        id: wpMedia.id,
        title: wpMedia.title?.rendered || wpMedia.slug,
        slug: wpMedia.slug,
        fileName: wpMedia.media_details?.file || wpMedia.slug,
        description: wpMedia.description?.rendered,
        caption: wpMedia.caption?.rendered,
        altText: wpMedia.alt_text,
        mimeType: wpMedia.mime_type,
        mediaType: determineMediaType(wpMedia.mime_type),
        fileSize: wpMedia.media_details?.filesize || 0,
        width: wpMedia.media_details?.width,
        height: wpMedia.media_details?.height,
        sourceUrl: wpMedia.source_url,
        authorWpId: wpMedia.author,
        sizes: extractWpMediaSizes(wpMedia),
      },
      siteId,
    });
    return { success: true, mediaId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function extractMediaSourceUrls(wpMedia: WPMedia): string[] {
  const urls = new Set<string>();
  if (wpMedia.source_url) urls.add(wpMedia.source_url);

  for (const size of Object.values(wpMedia.media_details?.sizes ?? {})) {
    if (size.source_url) urls.add(size.source_url);
  }

  return Array.from(urls);
}

function extractWpMediaSizes(wpMedia: WPMedia) {
  return Object.entries(wpMedia.media_details?.sizes ?? {}).map(([name, size]) => ({
    name,
    width: size.width,
    height: size.height,
    fileSize: wpMedia.media_details?.filesize || 0,
    mimeType: size.mime_type || wpMedia.mime_type,
  }));
}

// ─── Media Type Detection ──────────────────────────────────────────────────

function determineMediaType(
  mimeType: string
): "image" | "video" | "audio" | "document" | "archive" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";

  if (
    mimeType === "application/pdf" ||
    mimeType.includes("document") ||
    mimeType.includes("text/")
  ) {
    return "document";
  }

  if (
    mimeType.includes("zip") ||
    mimeType.includes("tar") ||
    mimeType.includes("rar") ||
    mimeType.includes("7z")
  ) {
    return "archive";
  }

  return "other";
}

// ─── Internal Queries ──────────────────────────────────────────────────────

export const mediaFindBySourceUrl = internalMutation({
  args: {
    sourceUrl: v.string(),
  },
  handler: async (ctx, { sourceUrl }) => {
    // Note: This is a mutation so we can use it in actions
    // We're just reading though - uses index for performance
    const existing = await ctx.db
      .query("media")
      .withIndex("by_wpSourceUrl", (q) => q.eq("wpSourceUrl", sourceUrl))
      .first();

    return existing?._id ?? null;
  },
});

// ─── Media Creation Mutation ───────────────────────────────────────────────

export const mediaCreate = internalMutation({
  args: {
    existingId: v.optional(v.string()),
    wpMedia: v.object({
      id: v.number(),
      title: v.string(),
      slug: v.string(),
      fileName: v.string(),
      description: v.optional(v.string()),
      caption: v.optional(v.string()),
      altText: v.optional(v.string()),
      mimeType: v.string(),
      mediaType: v.union(
        v.literal("image"),
        v.literal("video"),
        v.literal("audio"),
        v.literal("document"),
        v.literal("archive"),
        v.literal("other")
      ),
      fileSize: v.number(),
      width: v.optional(v.number()),
      height: v.optional(v.number()),
      sourceUrl: v.string(),
      authorWpId: v.number(),
      sizes: v.optional(v.array(v.object({
        name: v.string(),
        width: v.number(),
        height: v.number(),
        fileSize: v.number(),
        mimeType: v.string(),
      }))),
    }),
    storageId: v.id("_storage"),
    url: v.string(),
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { existingId, wpMedia, storageId, url, siteId }) => {
    const now = Date.now();

    // Try to find the author (imported earlier)
    const authorMapping = await ctx.db
      .query("wpIdMappings")
      .withIndex("by_wp_id", (q) =>
        q.eq("siteId", siteId).eq("objectType", "user").eq("wpId", wpMedia.authorWpId)
      )
      .first();

    // Get first admin user as fallback uploader
    let uploaderId: Id<"users">;
    if (authorMapping) {
      uploaderId = authorMapping.convexId as Id<"users">;
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
          uploaderId = admin._id;
        }
      }

      // If still no user, get first user
      if (!uploaderId!) {
        const firstUser = await ctx.db.query("users").first();
        if (firstUser) {
          uploaderId = firstUser._id;
        } else {
          throw new Error("No users exist to assign as uploader");
        }
      }
    }

    // Strip HTML from text fields
    const description = wpMedia.description ? stripHtml(wpMedia.description) : undefined;
    const caption = wpMedia.caption ? stripHtml(wpMedia.caption) : undefined;

    const fields = {
      title: stripHtml(wpMedia.title),
      fileName: wpMedia.fileName,
      slug: wpMedia.slug,
      description,
      caption,
      altText: wpMedia.altText || undefined,
      storageId,
      url,
      mimeType: wpMedia.mimeType,
      fileSize: wpMedia.fileSize,
      mediaType: wpMedia.mediaType,
      width: wpMedia.width,
      height: wpMedia.height,
      status: "active" as const,
      uploadedBy: uploaderId,
      uploadPath: wpMedia.fileName,
      wpAttachmentId: wpMedia.id,
      wpSourceUrl: wpMedia.sourceUrl,
      wpSourceSiteId: siteId,
      updatedAt: now,
    };

    if (existingId) {
      await ctx.db.patch(existingId as Id<"media">, fields);
      await replaceImportedMediaSizes(ctx, existingId as Id<"media">, storageId, url, wpMedia);
      return existingId;
    }

    // Create media record
    const mediaId = await ctx.db.insert("media", {
      ...fields,
      createdAt: now,
    });

    await replaceImportedMediaSizes(ctx, mediaId, storageId, url, wpMedia);

    return mediaId;
  },
});

export const mediaUpdateMetadata = internalMutation({
  args: {
    mediaId: v.string(),
    wpMedia: v.object({
      id: v.number(),
      title: v.string(),
      slug: v.string(),
      fileName: v.string(),
      description: v.optional(v.string()),
      caption: v.optional(v.string()),
      altText: v.optional(v.string()),
      mimeType: v.string(),
      mediaType: v.union(
        v.literal("image"),
        v.literal("video"),
        v.literal("audio"),
        v.literal("document"),
        v.literal("archive"),
        v.literal("other")
      ),
      fileSize: v.number(),
      width: v.optional(v.number()),
      height: v.optional(v.number()),
      sourceUrl: v.string(),
      authorWpId: v.number(),
      sizes: v.optional(v.array(v.object({
        name: v.string(),
        width: v.number(),
        height: v.number(),
        fileSize: v.number(),
        mimeType: v.string(),
      }))),
    }),
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { mediaId, wpMedia, siteId }) => {
    const existing = await ctx.db.get(mediaId as Id<"media">);
    if (!existing) {
      throw new Error("Existing media not found");
    }

    const description = wpMedia.description ? stripHtml(wpMedia.description) : undefined;
    const caption = wpMedia.caption ? stripHtml(wpMedia.caption) : undefined;

    await ctx.db.patch(existing._id, {
      title: stripHtml(wpMedia.title),
      fileName: wpMedia.fileName,
      slug: wpMedia.slug,
      description,
      caption,
      altText: wpMedia.altText || undefined,
      mimeType: wpMedia.mimeType,
      fileSize: wpMedia.fileSize || existing.fileSize,
      mediaType: wpMedia.mediaType,
      width: wpMedia.width,
      height: wpMedia.height,
      uploadPath: wpMedia.fileName,
      wpAttachmentId: wpMedia.id,
      wpSourceUrl: wpMedia.sourceUrl,
      wpSourceSiteId: siteId,
      updatedAt: Date.now(),
    });

    await replaceImportedMediaSizes(ctx, existing._id, existing.storageId, existing.url, {
      ...wpMedia,
      fileSize: wpMedia.fileSize || existing.fileSize,
    });

    return mediaId;
  },
});

async function replaceImportedMediaSizes(
  ctx: MutationCtx,
  mediaId: Id<"media">,
  storageId: Id<"_storage">,
  url: string,
  wpMedia: {
    mimeType: string;
    fileSize: number;
    sizes?: Array<{ name: string; width: number; height: number; fileSize: number; mimeType: string }>;
  },
) {
  const existingSizes = await ctx.db
    .query("mediaSizes")
    .withIndex("by_media", (q: any) => q.eq("mediaId", mediaId))
    .collect();

  for (const size of existingSizes) {
    await ctx.db.delete(size._id);
  }

  for (const size of wpMedia.sizes ?? []) {
    await ctx.db.insert("mediaSizes", {
      mediaId,
      sizeName: size.name,
      storageId,
      url,
      width: size.width,
      height: size.height,
      fileSize: size.fileSize || wpMedia.fileSize,
      mimeType: size.mimeType || wpMedia.mimeType,
      crop: size.name === "thumbnail",
    });
  }
}

// ─── Utility Functions ─────────────────────────────────────────────────────

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
