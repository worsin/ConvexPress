/**
 * Taxonomies API Endpoints
 *
 * GET  /api/v1/categories  - List categories (read:taxonomies)
 * POST /api/v1/categories  - Create category (write:taxonomies)
 * GET  /api/v1/tags        - List tags (read:taxonomies)
 * POST /api/v1/tags        - Create tag (write:taxonomies)
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  authenticateApiRequest,
  errorResponse,
  jsonResponse,
  paginatedResponse,
  parsePagination,
  parseJsonBody,
  toISOString,
} from "./helpers";
import { asOptionalId } from "../helpers/types";

/**
 * Format a term record for API response.
 */
function formatTerm(term: { _id: string; name?: string; slug?: string; description?: string; count?: number; taxonomy?: string }) {
  return {
    id: term._id,
    name: term.name,
    slug: term.slug,
    description: term.description ?? "",
    taxonomy: term.taxonomy,
    parent_id: term.parentId ?? null,
    count: term.count ?? 0,
    created_at: term.createdAt ? toISOString(term.createdAt) : null,
    updated_at: term.updatedAt ? toISOString(term.updatedAt) : null,
  };
}

export const categoriesListHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:taxonomies");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const { page, perPage } = parsePagination(url);
  const search = url.searchParams.get("search") || undefined;
  const hideEmpty = url.searchParams.get("hide_empty") === "true";

  try {
    const result = await ctx.runQuery(internal.taxonomies.httpInternals.listInternal, {
      taxonomy: "category",
      page,
      perPage,
      search,
      hideEmpty,
      orderBy: "name",
      orderDir: "asc",
    });

    const formatted = result.terms.map(formatTerm);
    return paginatedResponse(formatted, result.total, result.page, result.perPage);
  } catch {
    return paginatedResponse([], 0, page, perPage);
  }
});

export const categoriesCreateHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "write:taxonomies");
  if (auth instanceof Response) return auth;

  const body = await parseJsonBody(request);
  if (!body) {
    return errorResponse("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  if (!body.name || typeof body.name !== "string") {
    return errorResponse("name is required", "VALIDATION_ERROR", 400);
  }

  try {
    const result = await ctx.runMutation(internal.taxonomies.httpInternals.createCategoryInternal, {
      name: body.name,
      description: (body.description as string) ?? undefined,
      slug: (body.slug as string) ?? undefined,
      parentId: asOptionalId<"terms">(body.parent_id as string | undefined),
      createdByUserId: auth.userId, // H-17: Pass authenticated user ID
    });

    return jsonResponse({ id: result, name: body.name }, 201);
  } catch (error: unknown) {
    const message = error?.data?.message ?? error?.message ?? "Failed to create category";
    return errorResponse(message, error?.data?.code ?? "SERVER_ERROR", 500);
  }
});

export const tagsListHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:taxonomies");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const { page, perPage } = parsePagination(url);
  const search = url.searchParams.get("search") || undefined;
  const hideEmpty = url.searchParams.get("hide_empty") === "true";

  try {
    const result = await ctx.runQuery(internal.taxonomies.httpInternals.listInternal, {
      taxonomy: "post_tag",
      page,
      perPage,
      search,
      hideEmpty,
      orderBy: "name",
      orderDir: "asc",
    });

    const formatted = result.terms.map(formatTerm);
    return paginatedResponse(formatted, result.total, result.page, result.perPage);
  } catch {
    return paginatedResponse([], 0, page, perPage);
  }
});

export const tagsCreateHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "write:taxonomies");
  if (auth instanceof Response) return auth;

  const body = await parseJsonBody(request);
  if (!body) {
    return errorResponse("Invalid JSON body", "VALIDATION_ERROR", 400);
  }

  if (!body.name || typeof body.name !== "string") {
    return errorResponse("name is required", "VALIDATION_ERROR", 400);
  }

  try {
    const result = await ctx.runMutation(internal.taxonomies.httpInternals.createTagInternal, {
      name: body.name,
      description: (body.description as string) ?? undefined,
      slug: (body.slug as string) ?? undefined,
      createdByUserId: auth.userId, // H-17: Pass authenticated user ID
    });

    return jsonResponse({ id: result, name: body.name }, 201);
  } catch (error: unknown) {
    const message = error?.data?.message ?? error?.message ?? "Failed to create tag";
    return errorResponse(message, error?.data?.code ?? "SERVER_ERROR", 500);
  }
});
