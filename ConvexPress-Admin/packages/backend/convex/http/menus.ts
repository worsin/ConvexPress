/**
 * Menus API Endpoints
 *
 * GET /api/v1/menus - List menus (read:menus)
 *
 * Returns menus with assigned location names, sorted alphabetically by name.
 * Uses an internal query to bypass Convex auth (HTTP uses API key auth).
 */

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  authenticateApiRequest,
  paginatedResponse,
  parsePagination,
  toISOString,
} from "./helpers";

export const menusListHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:menus");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const { page, perPage } = parsePagination(url);

  // Fetch all menus via internal query (bypasses Convex auth)
  const menus = await ctx.runQuery(
    internal.menus.internals.listMenusInternal,
    {},
  );

  // Format response
  // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
  const formatted = menus.map((m) => ({
    id: m._id,
    name: m.name,
    slug: m.slug,
    description: m.description ?? null,
    auto_add_pages: m.autoAddPages ?? false,
    item_count: m.itemCount ?? 0,
    assigned_locations: m.assignedLocations ?? [],
    created_by: m.createdBy,
    created_at: m.createdAt ? toISOString(m.createdAt) : null,
    updated_at: m.updatedAt ? toISOString(m.updatedAt) : null,
  }));

  // Apply pagination
  const total = formatted.length;
  const startIndex = (page - 1) * perPage;
  const paginated = formatted.slice(startIndex, startIndex + perPage);

  return paginatedResponse(paginated, total, page, perPage);
});
