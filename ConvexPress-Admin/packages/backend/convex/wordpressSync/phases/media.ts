/**
 * WordPress Sync - Media Import Phase
 *
 * Downloads media files from WordPress and uploads to Convex storage.
 * Must run before posts because posts reference featured images.
 *
 * Uses smaller batch sizes due to file download overhead.
 */

import { internalAction, internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { fetchWPMedia, type WPMedia } from "../helpers/wpClient";
import type { PhaseResult } from "../internals";
import type { SyncError, PhaseProgress } from "../validators";
import { MEDIA_BATCH_SIZE } from "../validators";

// ─── Media Import Action ───────────────────────────────────────────────────

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
        errors: [{ phase: "media", wpId: 0, message: "Job or site not found", timestamp: Date.now() }],
        hasMore: false,
      };
    }

    const credentials = {
      siteUrl: site.siteUrl,
      username: site.username,
      applicationPassword: site.applicationPassword,
    };

    const progress: PhaseProgress = { ...job.progress.media };
    const cursor = progress.cursor || 0;
    const page = Math.floor(cursor / MEDIA_BATCH_SIZE) + 1;

    // Fetch media from WordPress
    const { data: mediaItems, total } = await fetchWPMedia(credentials, page, MEDIA_BATCH_SIZE);

    if (progress.total === 0 && total > 0) {
      progress.total = total;
    }

    // Process each media item
    for (const wpMedia of mediaItems) {
      try {
        // Check if already imported
        const existingMapping = await ctx.runQuery(
          internal.wordpressSync.helpers.idMapping.getByWpId,
          { siteId, objectType: "media", wpId: wpMedia.id }
        );

        if (existingMapping) {
          progress.imported++;
          continue;
        }

        // Download and upload the media file
        const result = await downloadAndUpload(ctx, wpMedia, siteId);

        if (result.success && result.mediaId) {
          // Create ID mapping
          await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
            siteId,
            objectType: "media",
            wpId: wpMedia.id,
            convexId: result.mediaId,
          });

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
      progress,
      errors,
      hasMore: progress.imported + progress.failed < progress.total,
    };
  },
});

// ─── Download and Upload Helper ────────────────────────────────────────────

async function downloadAndUpload(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  wpMedia: WPMedia,
  siteId: Id<"wordpressSites">
): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  try {
    // Check if media with same source URL already exists
    const existingByUrl = await ctx.runQuery(
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
    }),
    storageId: v.id("_storage"),
    url: v.string(),
    siteId: v.id("wordpressSites"),
  },
  handler: async (ctx, { wpMedia, storageId, url, siteId }) => {
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

    // Create media record
    const mediaId = await ctx.db.insert("media", {
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
      status: "active",
      uploadedBy: uploaderId,
      wpAttachmentId: wpMedia.id,
      wpSourceUrl: wpMedia.sourceUrl,
      wpSourceSiteId: siteId,
      createdAt: now,
      updatedAt: now,
    });

    return mediaId;
  },
});

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
