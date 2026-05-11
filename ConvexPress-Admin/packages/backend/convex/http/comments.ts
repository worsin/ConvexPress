/**
 * Comments API Endpoints
 *
 * GET    /api/v1/comments      - List comments (read:comments)
 * GET    /api/v1/comments/:id  - Get single comment (read:comments)
 * POST   /api/v1/comments      - Create comment (write:comments)
 * PUT    /api/v1/comments/:id  - Update comment (write:comments)
 * DELETE /api/v1/comments/:id  - Delete comment (write:comments)
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
  parseJsonBody,
  toISOString,
  getHttpErrorCode,
  getHttpErrorMessage,
} from "./helpers";
import { asId, asOptionalId } from "../helpers/types";

/**
 * Format a comment record for API response.
 */
type ApiCommentRecord = {
  _id: string;
  content?: string;
  status?: string;
  postId?: string;
  authorId?: string;
  authorName?: string;
  authorAvatarUrl?: string;
  parentId?: string;
  depth?: number;
  likeCount?: number;
  flagCount?: number;
  isEdited?: boolean;
  editedAt?: number;
  postTitle?: string;
  postSlug?: string;
  createdAt?: number;
  updatedAt?: number;
};

type CommentListResult = {
  comments: ApiCommentRecord[];
  total: number;
  page: number;
  perPage: number;
};

type CommentCreateResult = {
  commentId: string;
  status: string;
};

function formatComment(comment: ApiCommentRecord) {
  return {
    id: comment._id,
    post_id: comment.postId,
    content: comment.content,
    status: comment.status,
    author_id: comment.authorId,
    author_name: comment.authorName,
    author_avatar_url: comment.authorAvatarUrl ?? null,
    parent_id: comment.parentId ?? null,
    depth: comment.depth,
    like_count: comment.likeCount,
    flag_count: comment.flagCount,
    is_edited: comment.isEdited,
    edited_at: comment.editedAt ? toISOString(comment.editedAt) : null,
    post_title: comment.postTitle ?? null,
    post_slug: comment.postSlug ?? null,
    created_at: comment.createdAt ? toISOString(comment.createdAt) : null,
    updated_at: comment.updatedAt ? toISOString(comment.updatedAt) : null,
  };
}

export const commentsListHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:comments");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const { page, perPage } = parsePagination(url);
  const status = url.searchParams.get("status") as
    | "approved"
    | "pending"
    | "spam"
    | "trash"
    | undefined;
  const postId = url.searchParams.get("post_id") || undefined;
  const search = url.searchParams.get("search") || undefined;

  try {
    const result = (await ctx.runQuery(internal.comments.httpInternals.listInternal, {
      page,
      perPage,
      status: status || undefined,
      postId: asOptionalId<"posts">(postId),
      search,
      orderBy: "createdAt",
      orderDir: "desc",
    })) as CommentListResult;

    const formatted = result.comments.map(formatComment);
    return paginatedResponse(formatted, result.total, result.page, result.perPage);
  } catch (error: unknown) {
    return errorResponse(
      getHttpErrorMessage(error, "Failed to list comments"),
      getHttpErrorCode(error, "INTERNAL_ERROR"),
      500,
    );
  }
});

export const commentsGetHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:comments");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const id = extractIdFromPath(url, "/api/v1/comments");
  if (!id) {
    return errorResponse("Comment ID is required", "VALIDATION_ERROR", 400);
  }

  try {
    const comment = (await ctx.runQuery(internal.comments.httpInternals.getInternal, {
      commentId: asId<"comments">(id),
    })) as ApiCommentRecord | null;

    if (!comment) {
      return errorResponse("Comment not found", "NOT_FOUND", 404);
    }

    return jsonResponse(formatComment(comment));
  } catch {
    return errorResponse("Comment not found", "NOT_FOUND", 404);
  }
});

export const commentsCreateHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "write:comments");
  if (auth instanceof Response) return auth;

  const body = await parseJsonBody(request);
  if (!body) {
    return errorResponse("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  if (!body.content || typeof body.content !== "string") {
    return errorResponse("content is required", "VALIDATION_ERROR", 400);
  }
  if (!body.post_id || typeof body.post_id !== "string") {
    return errorResponse("post_id is required", "VALIDATION_ERROR", 400);
  }

  try {
    const userAgent = request.headers.get("User-Agent") || undefined;
    const ipAddress =
      request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
      request.headers.get("X-Real-IP") ||
      undefined;

    const result = (await ctx.runMutation(internal.comments.httpInternals.createInternal, {
      postId: asId<"posts">(body.post_id as string),
      content: body.content as string,
      parentId: asOptionalId<"comments">(body.parent_id as string | undefined),
      authorId: auth.userId, // H-17: Pass authenticated user ID
      authorName: (body.author_name as string) || "API User",
      authorEmail: (body.author_email as string) || "api@example.com",
      authorAvatarUrl: body.author_avatar_url as string | undefined,
      userAgent,
      ipAddress,
    })) as CommentCreateResult;

    return jsonResponse(
      {
        id: result.commentId,
        status: result.status,
      },
      201,
    );
  } catch (error: unknown) {
    const code = getHttpErrorCode(error, "INTERNAL_ERROR");
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      FORBIDDEN: 403,
      VALIDATION_ERROR: 400,
      RATE_LIMITED: 429,
      INVALID_STATE: 409,
      UNAUTHORIZED: 401,
    };
    return errorResponse(
      getHttpErrorMessage(error, "Failed to create comment"),
      code,
      statusMap[code] ?? 500,
    );
  }
});

export const commentsUpdateHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "write:comments");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const id = extractIdFromPath(url, "/api/v1/comments");
  if (!id) {
    return errorResponse("Comment ID is required", "VALIDATION_ERROR", 400);
  }

  const body = await parseJsonBody(request);
  if (!body) {
    return errorResponse("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  if (!body.content || typeof body.content !== "string") {
    return errorResponse("content is required", "VALIDATION_ERROR", 400);
  }

  try {
    const commentId = await ctx.runMutation(internal.comments.httpInternals.updateInternal, {
      commentId: asId<"comments">(id),
      content: body.content as string,
    });

    return jsonResponse({
      id: commentId,
      updated: true,
    });
  } catch (error: unknown) {
    const code = getHttpErrorCode(error, "INTERNAL_ERROR");
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      FORBIDDEN: 403,
      VALIDATION_ERROR: 400,
      INVALID_STATE: 409,
      UNAUTHORIZED: 401,
    };
    return errorResponse(
      getHttpErrorMessage(error, "Failed to update comment"),
      code,
      statusMap[code] ?? 500,
    );
  }
});

export const commentsDeleteHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "write:comments");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const id = extractIdFromPath(url, "/api/v1/comments");
  if (!id) {
    return errorResponse("Comment ID is required", "VALIDATION_ERROR", 400);
  }

  // Check if permanent delete is requested via query param
  const permanent = url.searchParams.get("permanent") === "true";

  try {
    if (permanent) {
      await ctx.runMutation(internal.comments.httpInternals.permanentDeleteInternal, {
        commentId: asId<"comments">(id),
      });
    } else {
      await ctx.runMutation(internal.comments.httpInternals.trashInternal, {
        commentId: asId<"comments">(id),
      });
    }

    return jsonResponse({
      id,
      deleted: true,
      permanent,
    });
  } catch (error: unknown) {
    const code = getHttpErrorCode(error, "INTERNAL_ERROR");
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      FORBIDDEN: 403,
      INVALID_STATE: 409,
      UNAUTHORIZED: 401,
    };
    return errorResponse(
      getHttpErrorMessage(error, "Failed to delete comment"),
      code,
      statusMap[code] ?? 500,
    );
  }
});
