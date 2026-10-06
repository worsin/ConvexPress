import { canonicalHttpInput, canonicalHttpRevision, canonicalHttpError } from "./canonicalInput";
/**
 * Posts API Endpoints
 *
 * GET    /api/v1/posts      - List published posts (read:posts)
 * GET    /api/v1/posts/:id  - Get single post (read:posts)
 * POST   /api/v1/posts      - Create new post (write:posts)
 * PUT    /api/v1/posts/:id  - Update post (write:posts)
 * DELETE /api/v1/posts/:id  - Trash/delete post (write:posts)
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
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
import { asId } from "../helpers/types";

type ApiAuthorRecord = {
  _id: string;
  displayName?: string;
};

type ApiPostRecord = {
  _id: string;
  title?: string;
  slug?: string;
  status?: string;
  content?: string;
  blocks?: unknown;
  blocksVersion?: number;
  blocksRevision?: number;
  excerpt?: string;
  author?: ApiAuthorRecord | null;
  featuredImageUrl?: string;
  isPasswordProtected?: boolean;
  createdAt?: number;
  updatedAt?: number;
  publishedAt?: number;
};

type PostListResult = {
  posts: ApiPostRecord[];
  total: number;
  page: number;
  perPage: number;
};

export const postsListHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:posts");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const { page, perPage } = parsePagination(url);

  // Query published posts from the database via the public listPublished query
  const result = (await ctx.runQuery(internal.posts.httpInternals.listPublishedInternal, {
    page,
    perPage,
  })) as PostListResult;

  const formatted = result.posts.map((p) => ({
    id: p._id,
    title: p.title ?? "",
    slug: p.slug ?? "",
    status: p.status ?? "draft",
    content: p.content ?? "",
    excerpt: p.excerpt ?? "",
    author: p.author
      ? { id: p.author._id, display_name: p.author.displayName ?? "" }
      : { id: "" },
    featured_image_url: p.featuredImageUrl ?? null,
    created_at: p.createdAt ? toISOString(p.createdAt) : null,
    updated_at: p.updatedAt ? toISOString(p.updatedAt) : null,
    published_at: p.publishedAt ? toISOString(p.publishedAt) : null,
  }));

  return paginatedResponse(formatted, result.total, result.page, result.perPage);
});

export const postsGetHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:posts");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const id = extractIdFromPath(url, "/api/v1/posts");
  if (!id) {
    return errorResponse("Post ID is required", "VALIDATION_ERROR", 400);
  }

  try {
    const post = (await ctx.runQuery(internal.posts.httpInternals.getInternal, {
      postId: asId<"posts">(id),
      keyId: asId<"apiKeys">(auth.keyId),
    })) as ApiPostRecord | null;

    if (!post) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }

    return jsonResponse({
      id: post._id,
      title: post.title ?? "",
      slug: post.slug ?? "",
      status: post.status ?? "draft",
      ...(post.blocksVersion===2 ? {blocks:post.blocks,blocks_version:2,blocks_revision:post.blocksRevision} : {content:post.content??""}),
      excerpt: post.excerpt ?? "",
      author: post.author
        ? { id: post.author._id, display_name: post.author.displayName ?? "" }
        : { id: "" },
      is_password_protected: post.isPasswordProtected ?? false,
      created_at: post.createdAt ? toISOString(post.createdAt) : null,
      updated_at: post.updatedAt ? toISOString(post.updatedAt) : null,
      published_at: post.publishedAt ? toISOString(post.publishedAt) : null,
    });
  } catch (error) {
    return canonicalHttpError(error,"Failed to read post");
  }
});

export const postsCreateHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "write:posts");
  if (auth instanceof Response) return auth;

  const body = await parseJsonBody(request);
  if (!body) {
    return errorResponse("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  if (!body.title || typeof body.title !== "string") {
    return errorResponse("title is required", "VALIDATION_ERROR", 400);
  }

  try {
    const input=canonicalHttpInput(body,auth.keyId,false);
    const result = await ctx.runMutation(internal.posts.httpInternals.createInternal, {...input,title:body.title});

    return jsonResponse({ id: result, title: body.title, blocks_version:2, blocks_revision:1 }, 201);
  } catch (error: unknown) {
    return canonicalHttpError(error,"Failed to create post");
  }
});

export const postsUpdateHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "write:posts");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const id = extractIdFromPath(url, "/api/v1/posts");
  if (!id) {
    return errorResponse("Post ID is required", "VALIDATION_ERROR", 400);
  }

  const body = await parseJsonBody(request);
  if (!body) {
    return errorResponse("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  try {
    const args = {...canonicalHttpInput(body,auth.keyId,false),postId:asId<"posts">(id),expectedRevision:canonicalHttpRevision(body)};
    const receipt=await ctx.runMutation(internal.posts.httpInternals.updateInternal, args);
    return jsonResponse({ id, updated: receipt.changed, blocks_version:2, blocks_revision:receipt.revision, digest:receipt.digest });
  } catch (error: unknown) {
    return canonicalHttpError(error,"Failed to update post");
  }
});

export const postsDeleteHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "write:posts");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const id = extractIdFromPath(url, "/api/v1/posts");
  if (!id) {
    return errorResponse("Post ID is required", "VALIDATION_ERROR", 400);
  }

  try {
    await ctx.runMutation(internal.posts.httpInternals.trashInternal, {
      postId: asId<"posts">(id),
    });
    return jsonResponse({ id, deleted: true });
  } catch (error: unknown) {
    const message = getHttpErrorMessage(error, "Failed to delete post");
    return errorResponse(message, getHttpErrorCode(error, "SERVER_ERROR"), 500);
  }
});
