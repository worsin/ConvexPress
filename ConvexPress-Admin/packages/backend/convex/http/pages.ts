/**
 * Pages API Endpoints
 *
 * GET    /api/v1/pages      - List published pages (read:posts)
 * GET    /api/v1/pages/:id  - Get single page (read:posts)
 * POST   /api/v1/pages      - Create new page (write:posts)
 * PUT    /api/v1/pages/:id  - Update page (write:posts)
 * DELETE /api/v1/pages/:id  - Trash/delete page (write:posts)
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
  getHttpErrorMessage,
} from "./helpers";
import { asId, asOptionalId } from "../helpers/types";

type ApiPageRecord = {
  _id: string;
  title?: string;
  slug?: string;
  status?: string;
  path?: string;
  content?: string;
  excerpt?: string;
  depth?: number;
  menuOrder?: number;
  parentId?: string;
  parent?: unknown;
  children?: unknown[];
  pageTemplate?: string;
  isPasswordProtected?: boolean;
  createdAt?: number;
  updatedAt?: number;
  publishedAt?: number;
};

type PageListResult = {
  pages: ApiPageRecord[];
  total: number;
  page: number;
  perPage: number;
};

export const pagesListHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:posts");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const { page, perPage } = parsePagination(url);

  try {
    const result = (await ctx.runQuery(internal.pages.httpInternals.listPublishedInternal, {
      page,
      perPage,
    })) as PageListResult;

    const formatted = result.pages.map((p) => ({
      id: p._id,
      title: p.title ?? "",
      slug: p.slug ?? "",
      path: p.path ?? null,
      depth: p.depth ?? 0,
      menu_order: p.menuOrder ?? 0,
      parent_id: p.parentId ?? null,
      page_template: p.pageTemplate ?? "default",
      excerpt: p.excerpt ?? "",
      published_at: p.publishedAt ? toISOString(p.publishedAt) : null,
      created_at: p.createdAt ? toISOString(p.createdAt) : null,
    }));

    return paginatedResponse(formatted, result.total, result.page, result.perPage);
  } catch {
    return paginatedResponse([], 0, page, perPage);
  }
});

export const pagesGetHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:posts");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const id = extractIdFromPath(url, "/api/v1/pages");
  if (!id) {
    return errorResponse("Page ID is required", "VALIDATION_ERROR", 400);
  }

  try {
    const page = (await ctx.runQuery(internal.pages.httpInternals.getInternal, {
      pageId: asId<"posts">(id),
    })) as ApiPageRecord | null;

    if (!page) {
      return errorResponse("Page not found", "NOT_FOUND", 404);
    }

    return jsonResponse({
      id: page._id,
      title: page.title ?? "",
      slug: page.slug ?? "",
      status: page.status ?? "draft",
      path: page.path ?? null,
      content: page.content ?? "",
      excerpt: page.excerpt ?? "",
      depth: page.depth ?? 0,
      menu_order: page.menuOrder ?? 0,
      parent: page.parent ?? null,
      children: page.children ?? [],
      page_template: page.pageTemplate ?? "default",
      is_password_protected: page.isPasswordProtected ?? false,
      created_at: page.createdAt ? toISOString(page.createdAt) : null,
      updated_at: page.updatedAt ? toISOString(page.updatedAt) : null,
      published_at: page.publishedAt ? toISOString(page.publishedAt) : null,
    });
  } catch {
    return errorResponse("Page not found", "NOT_FOUND", 404);
  }
});

export const pagesCreateHandler = httpAction(async (ctx, request) => {
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
    const pageId = await ctx.runMutation(internal.pages.httpInternals.createInternal, {
      title: body.title,
      content: body.content,
      excerpt: body.excerpt,
      status: body.status ?? "draft",
      parentId: body.parent_id,
      menuOrder: body.menu_order,
      pageTemplate: body.page_template,
      slug: body.slug,
      authorId: asId<"users">(auth.userId), // H-17: Pass authenticated user ID
    });

    return jsonResponse({ id: pageId }, 201);
  } catch (error: unknown) {
    const message = getHttpErrorMessage(error, "Failed to create page");
    return errorResponse(message, "SERVER_ERROR", 500);
  }
});

export const pagesUpdateHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "write:posts");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const id = extractIdFromPath(url, "/api/v1/pages");
  if (!id) {
    return errorResponse("Page ID is required", "VALIDATION_ERROR", 400);
  }

  const body = await parseJsonBody(request);
  if (!body) {
    return errorResponse("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  try {
    // Build args, only including fields that were provided
    const args: {
      pageId: Id<"posts">;
      title?: string;
      content?: string;
      excerpt?: string;
      status?: string;
      slug?: string;
      parentId?: Id<"posts">;
      menuOrder?: number;
      pageTemplate?: string;
      visibility?: string;
      password?: string;
      commentStatus?: string;
    } = { pageId: asId<"posts">(id) };
    if (body.title !== undefined) args.title = body.title as string;
    if (body.content !== undefined) args.content = body.content as string;
    if (body.excerpt !== undefined) args.excerpt = body.excerpt as string;
    if (body.status !== undefined) args.status = body.status as string;
    if (body.slug !== undefined) args.slug = body.slug as string;
    if (body.parent_id !== undefined) args.parentId = asId<"posts">(body.parent_id as string);
    if (body.menu_order !== undefined) args.menuOrder = body.menu_order as number;
    if (body.page_template !== undefined) args.pageTemplate = body.page_template as string;
    if (body.visibility !== undefined) args.visibility = body.visibility as string;
    if (body.password !== undefined) args.password = body.password as string;
    if (body.comment_status !== undefined) args.commentStatus = body.comment_status as string;

    await ctx.runMutation(internal.pages.httpInternals.updateInternal, args);

    return jsonResponse({ id, updated: true });
  } catch (error: unknown) {
    const message = getHttpErrorMessage(error, "Failed to update page");
    return errorResponse(message, "SERVER_ERROR", 500);
  }
});

export const pagesDeleteHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "write:posts");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const id = extractIdFromPath(url, "/api/v1/pages");
  if (!id) {
    return errorResponse("Page ID is required", "VALIDATION_ERROR", 400);
  }

  try {
    await ctx.runMutation(internal.pages.httpInternals.trashInternal, {
      pageId: asId<"posts">(id),
    });

    return jsonResponse({ id, deleted: true });
  } catch (error: unknown) {
    const message = getHttpErrorMessage(error, "Failed to delete page");
    return errorResponse(message, "SERVER_ERROR", 500);
  }
});
