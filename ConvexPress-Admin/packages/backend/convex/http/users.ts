/**
 * Users API Endpoints
 *
 * GET /api/v1/users      - List users (read:users)
 * GET /api/v1/users/:id  - Get single user (read:users)
 *
 * Users are read-only via API (no POST/PUT/DELETE for security).
 *
 * Uses internal queries (not public) because HTTP actions don't carry
 * a Convex auth session. API key authentication has already verified the
 * caller's read:users scope via authenticateApiRequest(), so the internal
 * queries safely bypass the session-based admin check.
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
  toISOString,
} from "./helpers";
import { asId } from "../helpers/types";

/** Shape returned by getUserInternal (enriched user profile) */
interface EnrichedUserProfile {
  _id: string;
  email?: string;
  displayName?: string;
  username?: string;
  slug?: string;
  status?: string;
  bio?: string;
  avatarUrl?: string;
  profilePictureUrl?: string;
  resolvedAvatarUrl?: string;
  postCount?: number;
  createdAt?: number;
}

export const usersListHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:users");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const { page, perPage } = parsePagination(url);
  const search = url.searchParams.get("search") ?? undefined;
  const status = url.searchParams.get("status") as "active" | "inactive" | "banned" | undefined;
  const orderBy = url.searchParams.get("orderBy") as "displayName" | "email" | "createdAt" | "postCount" | undefined;
  const orderDir = url.searchParams.get("orderDir") as "asc" | "desc" | undefined;

  try {
    const result = await ctx.runQuery(internal.profiles.internals.listUsersInternal, {
      page,
      perPage,
      search,
      status,
      orderBy,
      orderDir,
    });

    const formatted = result.users.map((u) => ({
      id: u._id,
      email: u.email,
      display_name: u.displayName ?? "",
      username: u.username ?? "",
      slug: u.slug ?? "",
      status: u.status,
      role_name: u.roleName ?? "",
      role_level: u.roleLevel ?? 0,
      avatar_url: u.resolvedAvatarUrl ?? u.avatarUrl ?? u.profilePictureUrl ?? null,
      post_count: u.postCount ?? 0,
      created_at: u.createdAt ? toISOString(u.createdAt) : null,
    }));

    return paginatedResponse(formatted, result.total, result.page, result.perPage);
  } catch (error: unknown) {
    return errorResponse(
      error?.data?.message ?? "Failed to list users",
      error?.data?.code ?? "INTERNAL_ERROR",
      500,
    );
  }
});

export const usersGetHandler = httpAction(async (ctx, request) => {
  const auth = await authenticateApiRequest(ctx, request, "read:users");
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const id = extractIdFromPath(url, "/api/v1/users");
  if (!id) {
    return errorResponse("User ID is required", "VALIDATION_ERROR", 400);
  }

  try {
    const user = await ctx.runQuery(internal.profiles.internals.getUserInternal, {
      userId: asId<"users">(id),
    }) as EnrichedUserProfile | null;

    if (!user) {
      return errorResponse("User not found", "NOT_FOUND", 404);
    }

    return jsonResponse({
      id: user._id,
      email: user.email ?? "",
      display_name: user.displayName ?? "",
      username: user.username ?? "",
      slug: user.slug ?? "",
      status: user.status ?? "active",
      bio: user.bio ?? "",
      avatar_url: user.resolvedAvatarUrl ?? user.avatarUrl ?? user.profilePictureUrl ?? null,
      post_count: user.postCount ?? 0,
      created_at: user.createdAt ? toISOString(user.createdAt) : null,
    });
  } catch {
    return errorResponse("User not found", "NOT_FOUND", 404);
  }
});
