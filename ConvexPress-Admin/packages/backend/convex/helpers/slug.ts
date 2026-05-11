/**
 * Shared Slug Generation Helper
 *
 * Generates URL-safe slugs from titles with uniqueness guarantees.
 * Used by the Post System, Page System, and any other system that
 * needs unique slugs for the `posts` table.
 *
 * Slugs are unique per `type` (post vs page) among non-trashed content.
 *
 * Usage:
 *   import { generateUniqueSlug } from "../helpers/slug";
 *
 *   const slug = await generateUniqueSlug(ctx, "My Blog Post", "post");
 *   const slug = await generateUniqueSlug(ctx, "About Us", "page", existingPostId);
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Maximum slug length in characters. */
const MAX_SLUG_LENGTH = 200;

/**
 * Slugify a title string into a URL-safe slug.
 *
 * Rules:
 *   - Lowercase
 *   - Replace spaces, underscores with hyphens
 *   - Remove non-alphanumeric except hyphens
 *   - Collapse consecutive hyphens
 *   - Trim leading/trailing hyphens
 *   - Truncate to MAX_SLUG_LENGTH
 *   - Fallback to "untitled" if empty result
 */
export function slugify(title: string): string {
  let slug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars except spaces and hyphens
    .replace(/[\s_]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/-+/g, "-") // Collapse consecutive hyphens
    .replace(/^-|-$/g, "") // Trim leading/trailing hyphens
    .slice(0, MAX_SLUG_LENGTH);

  if (!slug) slug = "untitled";

  return slug;
}

/**
 * Generate a unique slug for a post/page within the `posts` table.
 *
 * Checks the `by_slug` index (which is scoped to [slug, type]) to ensure
 * uniqueness among all posts of the same type (regardless of status, since
 * WordPress allows trashed posts to reuse slugs but we keep it simple).
 *
 * If a conflict exists, appends -2, -3, etc. until unique.
 *
 * @param ctx - Convex MutationCtx
 * @param title - The title to derive the slug from
 * @param type - "post" or "page"
 * @param existingPostId - If updating, exclude this post from uniqueness check
 * @returns A unique slug string
 */
export async function generateUniqueSlug(
  ctx: MutationCtx,
  title: string,
  type: "post" | "page",
  existingPostId?: Id<"posts">,
): Promise<string> {
  const base = slugify(title);

  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("posts")
      .withIndex("by_slug", (q) => q.eq("slug", slug).eq("type", type))
      .first();

    // No conflict, or the conflict is the post being updated
    if (!existing || (existingPostId && existing._id === existingPostId)) {
      break;
    }

    slug = `${base}-${suffix}`;
    suffix++;

    // Safety: prevent runaway in case of corrupt data
    if (suffix > 1000) {
      slug = `${base}-${Date.now()}`;
      break;
    }
  }

  return slug;
}

/**
 * Validate and sanitize a user-provided slug.
 *
 * Applies the same rules as slugify but works on user input that is
 * intended to be used as-is (after sanitization).
 *
 * @param slug - The user-provided slug
 * @returns Sanitized slug, or null if the input is invalid/empty
 */
export function sanitizeSlug(slug: string): string | null {
  const sanitized = slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LENGTH);

  if (!sanitized) return null;
  return sanitized;
}
