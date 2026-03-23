/**
 * Media API Endpoints
 *
 * GET    /api/v1/media      - List media items (read:media)
 * GET    /api/v1/media/:id  - Get single media item (read:media)
 * POST   /api/v1/media      - Upload media (write:media)
 * DELETE /api/v1/media/:id  - Delete media item (write:media)
 *
 * H1 fix: All endpoints are now wired to actual Convex query/mutation functions
 * instead of returning placeholder stubs.
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  authenticateApiRequest,
  errorResponse,
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

export const mediaUploadHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "write:media");
  if (auth instanceof Response) return auth;

  // For media uploads via API, the body should contain the file metadata.
  // Actual file upload is a two-step process:
  //   1. POST /api/v1/media with metadata -> returns upload URL
  //   2. Client uploads file to the storage URL
  //   3. Client sends a follow-up with storageId to finalize
  // For now, this endpoint generates an upload URL for the API consumer.

  try {
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return jsonResponse({ uploadUrl }, 201);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Failed to generate upload URL",
      "INTERNAL_ERROR",
      500,
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
