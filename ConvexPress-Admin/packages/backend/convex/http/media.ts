/**
 * Media API Endpoints
 *
 * GET    /api/v1/media      - List media items (read:media)
 * GET    /api/v1/media/:id  - Get single media item (read:media)
 * POST   /api/v1/media      - Upload media (write:media)
 * DELETE /api/v1/media/:id  - Delete media item (write:media)
 *
 * Upload flow:
 *   1. POST with no body -> returns a Convex storage upload URL
 *   2. Upload the file to that URL -> receive storageId from Convex
 *   3. POST metadata + storageId -> creates the media record
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  authenticateApiRequest,
  errorResponse,
  getHttpErrorCode,
  getHttpErrorMessage,
  jsonResponse,
  paginatedResponse,
  parsePagination,
  extractIdFromPath,
} from "./helpers";
import { asId } from "../helpers/types";

// ─── List Media ───────────────────────────────────────────────────────────────

export const mediaListHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:media");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const { page, perPage } = parsePagination(url);

  // Extract optional filters from query params
  const mediaType = url.searchParams.get("type") || undefined;
  const search = url.searchParams.get("search") || undefined;

  try {
    // Use an internal query to bypass client auth (API key already authenticated)
    const result = await ctx.runQuery(internal.media.internals.getMediaInternal_list, {
      mediaType: mediaType as "image" | "video" | "audio" | "document" | "archive" | "other" | undefined,
      search,
      numItems: perPage,
      cursor: page > 1 ? String((page - 1) * perPage) : null,
    });

    return paginatedResponse(
      result.items,
      result.total,
      page,
      perPage,
    );
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to list media",
      "INTERNAL_ERROR",
      500,
    );
  }
});

// ─── Get Single Media ─────────────────────────────────────────────────────────

export const mediaGetHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:media");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const id = extractIdFromPath(url, "/api/v1/media");
  if (!id) {
    return errorResponse("Media ID is required", "VALIDATION_ERROR", 400);
  }

  try {
    const media = await ctx.runQuery(internal.media.internals.getMediaInternal, {
      mediaId: asId<"media">(id),
    });

    if (!media) {
      return errorResponse("Media not found", "NOT_FOUND", 404);
    }

    return jsonResponse(media);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to get media",
      "INTERNAL_ERROR",
      500,
    );
  }
});

// ─── Upload Media ─────────────────────────────────────────────────────────────

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function statusForErrorCode(code: string): number {
  if (code === "VALIDATION_ERROR") return 400;
  if (code === "NOT_FOUND") return 404;
  if (code === "FORBIDDEN") return 403;
  return 500;
}

async function readOptionalJsonBody(
  request: Request,
): Promise<{ body: Record<string, unknown> | null } | { error: Response }> {
  const text = await request.text();
  if (!text.trim()) return { body: null };

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { body: parsed as Record<string, unknown> };
    }
    return {
      error: errorResponse("Request body must be a JSON object", "VALIDATION_ERROR", 400),
    };
  } catch {
    return {
      error: errorResponse("Request body must be valid JSON", "VALIDATION_ERROR", 400),
    };
  }
}

export const mediaUploadHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "write:media");
  if (auth instanceof Response) return auth;

  try {
    const parsed = await readOptionalJsonBody(request);
    if ("error" in parsed) return parsed.error;

    const body = parsed.body;
    const storageId = optionalString(body?.storageId) ?? optionalString(body?.storage_id);

    if (!storageId) {
      // Explicit upload-only response. No media database row exists until the
      // caller posts storageId and metadata back to this endpoint.
      const uploadUrl = await ctx.storage.generateUploadUrl();
      return jsonResponse({
        mode: "upload_url",
        uploadUrl,
        finalizeRequired: true,
        finalize: {
          method: "POST",
          path: "/api/v1/media",
          requiredFields: ["storageId", "fileName", "mimeType", "fileSize"],
          optionalFields: ["title", "altText", "caption", "description", "width", "height"],
        },
      }, 201);
    }

    const fileName = optionalString(body?.fileName) ?? optionalString(body?.file_name);
    const mimeType = optionalString(body?.mimeType) ?? optionalString(body?.mime_type);
    const fileSize = optionalNumber(body?.fileSize) ?? optionalNumber(body?.file_size);

    const missingFields = [
      !fileName ? "fileName" : null,
      !mimeType ? "mimeType" : null,
      fileSize === undefined ? "fileSize" : null,
    ].filter((field): field is string => Boolean(field));

    if (missingFields.length > 0) {
      return errorResponse(
        `Missing required media finalization fields: ${missingFields.join(", ")}`,
        "VALIDATION_ERROR",
        400,
        {
          required_fields: ["storageId", "fileName", "mimeType", "fileSize"],
        },
      );
    }

    const mediaId = await ctx.runMutation(internal.media.internals.createMediaInternal, {
      storageId: storageId as Id<"_storage">,
      fileName,
      mimeType,
      fileSize,
      uploadedBy: asId<"users">(auth.userId),
      title: optionalString(body?.title),
      altText: optionalString(body?.altText) ?? optionalString(body?.alt_text),
      caption: optionalString(body?.caption),
      description: optionalString(body?.description),
      width: optionalNumber(body?.width),
      height: optionalNumber(body?.height),
    });

    const media = await ctx.runQuery(internal.media.internals.getMediaInternal, {
      mediaId,
    });

    return jsonResponse(media ?? { id: mediaId }, 201);
  } catch (err) {
    const code = getHttpErrorCode(err, "INTERNAL_ERROR");
    return errorResponse(
      getHttpErrorMessage(err, "Failed to upload media"),
      code,
      statusForErrorCode(code),
    );
  }
});

// ─── Delete Media ─────────────────────────────────────────────────────────────

export const mediaDeleteHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "write:media");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const id = extractIdFromPath(url, "/api/v1/media");
  if (!id) {
    return errorResponse("Media ID is required", "VALIDATION_ERROR", 400);
  }

  try {
    // First verify the media exists
    const media = await ctx.runQuery(internal.media.internals.getMediaInternal, {
      mediaId: asId<"media">(id),
    });

    if (!media) {
      return errorResponse("Media not found", "NOT_FOUND", 404);
    }

    // Delete via internal mutation to bypass client auth
    await ctx.runMutation(internal.media.internals.deleteMediaInternal, {
      mediaId: asId<"media">(id),
    });

    return jsonResponse({ id, deleted: true });
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to delete media",
      "INTERNAL_ERROR",
      500,
    );
  }
});
