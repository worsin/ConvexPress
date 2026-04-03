/**
 * Knowledge Base System - Auth Helpers
 *
 * Thin wrappers around the core permission helpers, specialized for KB.
 * These provide a consistent KB-specific API and make it easy to add
 * KB-specific authorization logic in the future.
 *
 * Usage:
 *   import { requireKbCan } from "./helpers/auth";
 *   const user = await requireKbCan(ctx, "kb.create");
 */

import { requireCan, getCurrentUser, requireAuth } from "../../helpers/permissions";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

/**
 * Require a KB-specific capability. Returns the user on success.
 *
 * @param ctx - Convex mutation or query context
 * @param capability - The capability to check (e.g., "kb.create", "kb.publish")
 * @returns The authenticated user document
 * @throws ConvexError with UNAUTHORIZED or FORBIDDEN code
 */
export async function requireKbCan(
  ctx: MutationCtx | QueryCtx,
  capability: string,
) {
  return requireCan(ctx, capability as any);
}

/**
 * Check if the current user is the author of an article.
 *
 * @param ctx - Convex query or mutation context
 * @param articleAuthorId - The article's authorId field
 * @returns true if the current user is the article's author
 */
export async function isArticleOwner(
  ctx: QueryCtx | MutationCtx,
  articleAuthorId: string,
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  if (!user) return false;
  return user._id === articleAuthorId;
}

export { getCurrentUser, requireAuth };
