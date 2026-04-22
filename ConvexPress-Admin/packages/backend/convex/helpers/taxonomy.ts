/**
 * Taxonomy System - Shared Helper Functions
 *
 * Reusable logic used across taxonomy mutations, queries, and internals.
 * These helpers handle slug generation, term count maintenance,
 * default category enforcement, and hierarchy validation.
 *
 * Usage:
 *   import { generateTermSlug, updateTermCount, ensureDefaultCategory, validateCategoryHierarchy } from "../helpers/taxonomy";
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  MAX_CATEGORY_DEPTH,
} from "../taxonomies/validators";

type ReadCtx = Pick<QueryCtx, "db">;

// ─── Slug Generation ────────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from a term name, ensuring uniqueness within
 * the taxonomy type. If a conflict exists, appends -2, -3, etc.
 *
 * @param ctx - Convex mutation or query context
 * @param name - The term name to slugify
 * @param taxonomy - "category" or "post_tag"
 * @param existingTermId - If updating, exclude this term from uniqueness check
 * @returns A unique slug string
 */
export async function generateTermSlug(
  ctx: ReadCtx,
  name: string,
  taxonomy: "category" | "post_tag",
  existingTermId?: Id<"terms">,
): Promise<string> {
  // Generate base slug: lowercase, replace spaces/underscores with hyphens,
  // remove non-alphanumeric (except hyphens), collapse multiple hyphens,
  // trim leading/trailing hyphens
  let baseSlug = name
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-") // spaces and underscores to hyphens
    .replace(/[^a-z0-9-]/g, "") // remove non-alphanumeric except hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens

  // Fallback for names that produce an empty slug (e.g., all special characters)
  if (!baseSlug) {
    baseSlug = "term";
  }

  // Truncate to max slug length (leave room for suffix)
  if (baseSlug.length > 190) {
    baseSlug = baseSlug.substring(0, 190);
  }

  // Check uniqueness and append suffix if needed
  let candidateSlug = baseSlug;
  let suffix = 1;

  while (true) {
    const existing = await ctx.db
      .query("terms")
      .withIndex("by_slug_taxonomy", (q) =>
        q.eq("slug", candidateSlug).eq("taxonomy", taxonomy),
      )
      .unique();

    // No conflict, or the conflict is the term being updated
    if (!existing || (existingTermId && existing._id === existingTermId)) {
      return candidateSlug;
    }

    // Conflict found -- try next suffix
    suffix++;
    candidateSlug = `${baseSlug}-${suffix}`;
  }
}

/**
 * Validate a user-provided slug format.
 * Must be lowercase, alphanumeric + hyphens only.
 *
 * @returns The sanitized slug, or null if invalid.
 */
export function sanitizeSlug(slug: string): string | null {
  const sanitized = slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!sanitized) return null;
  return sanitized;
}

// ─── Term Count Maintenance ─────────────────────────────────────────────────

/**
 * Recalculate the published post count for a term.
 *
 * Counts all termRelationships where the linked post has status = "publish".
 * Since the posts table may not exist yet during incremental development,
 * this gracefully handles missing posts.
 *
 * @param ctx - Convex mutation context
 * @param termId - The term to update the count for
 */
export async function updateTermCount(
  ctx: MutationCtx,
  termId: Id<"terms">,
): Promise<void> {
  const term = await ctx.db.get("terms", termId);
  if (!term) return;

  // Get all relationships for this term
  const relationships = await ctx.db
    .query("termRelationships")
    .withIndex("by_term", (q) => q.eq("termId", termId))
    .collect();

  // Count only relationships where the linked post is published
  let publishedCount = 0;
  for (const rel of relationships) {
    const post = await ctx.db.get("posts", rel.postId);
    if (post) {
      const postDoc = post as Doc<"posts">;
      if (postDoc.status === "publish") {
        publishedCount++;
      }
    }
  }

  // Update the denormalized count
  await ctx.db.patch("terms", termId, { count: publishedCount });
}

// ─── Default Category ───────────────────────────────────────────────────────

/**
 * Find or create the default "Uncategorized" category.
 * This is idempotent -- calling it multiple times is safe.
 *
 * @param ctx - Convex mutation context
 * @returns The ID of the default category
 */
export async function ensureDefaultCategory(
  ctx: MutationCtx,
): Promise<Id<"terms">> {
  // Check if default category already exists
  const existing = await ctx.db
    .query("terms")
    .withIndex("by_isDefault", (q) => q.eq("isDefault", true))
    .first();

  if (existing && existing.taxonomy === "category") {
    return existing._id;
  }

  // Also check by slug as a fallback
  const bySlug = await ctx.db
    .query("terms")
    .withIndex("by_slug_taxonomy", (q) =>
      q.eq("slug", "uncategorized").eq("taxonomy", "category"),
    )
    .unique();

  if (bySlug) {
    // Mark it as default if it wasn't already
    if (!bySlug.isDefault) {
      await ctx.db.patch("terms", bySlug._id, { isDefault: true });
    }
    return bySlug._id;
  }

  // Create the default category
  const now = Date.now();
  const id = await ctx.db.insert("terms", {
    name: "Uncategorized",
    slug: "uncategorized",
    taxonomy: "category",
    description: "Default category",
    count: 0,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

// ─── Hierarchy Validation ───────────────────────────────────────────────────

/**
 * Validate that setting a parent for a category does not:
 *   1. Create a circular reference (proposed parent is a descendant of the term)
 *   2. Exceed the maximum hierarchy depth
 *
 * @param ctx - Convex query or mutation context
 * @param termId - The category being moved/created
 * @param proposedParentId - The proposed parent category
 * @param maxDepth - Maximum allowed depth (default: MAX_CATEGORY_DEPTH = 5)
 * @returns { valid: true } or { valid: false, error: string }
 */
export async function validateCategoryHierarchy(
  ctx: ReadCtx,
  termId: Id<"terms">,
  proposedParentId: Id<"terms">,
  maxDepth: number = MAX_CATEGORY_DEPTH,
): Promise<{ valid: boolean; error?: string }> {
  // Cannot be its own parent
  if (termId === proposedParentId) {
    return { valid: false, error: "A category cannot be its own parent" };
  }

  // Verify proposed parent exists and is a category
  const parent = await ctx.db.get("terms", proposedParentId);
  if (!parent) {
    return { valid: false, error: "Parent category does not exist" };
  }
  if (parent.taxonomy !== "category") {
    return { valid: false, error: "Parent must be a category" };
  }

  // Check for circular reference: walk UP from proposed parent,
  // ensure we don't encounter termId
  let current: Id<"terms"> | undefined = proposedParentId;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current)) {
      return { valid: false, error: "Circular reference detected in category hierarchy" };
    }
    visited.add(current);

    if (current === termId) {
      return {
        valid: false,
        error: "Cannot set parent: would create a circular reference",
      };
    }

    const node: Doc<"terms"> | null = await ctx.db.get("terms", current);
    if (!node) break;
    current = node.parentId;
  }

  // Check depth: calculate proposed parent's depth, then ensure
  // the term's subtree depth + parent depth + 1 <= maxDepth
  const parentDepth = await getTermDepth(ctx, proposedParentId);
  const subtreeDepth = await getSubtreeMaxDepth(ctx, termId);

  // New depth of this term = parentDepth + 1
  // Deepest descendant will be at parentDepth + 1 + subtreeDepth
  if (parentDepth + 1 + subtreeDepth > maxDepth) {
    return {
      valid: false,
      error: `Category hierarchy would exceed maximum depth of ${maxDepth} levels`,
    };
  }

  return { valid: true };
}

/**
 * Calculate the depth of a term by walking up its parent chain.
 * Root-level terms have depth 0.
 */
export async function getTermDepth(
  ctx: ReadCtx,
  termId: Id<"terms">,
): Promise<number> {
  let depth = 0;
  let current: Id<"terms"> | undefined = termId;

  while (current) {
    const term: Doc<"terms"> | null = await ctx.db.get("terms", current);
    if (!term || !term.parentId) break;
    current = term.parentId;
    depth++;

    // Safety: prevent infinite loops from corrupt data
    if (depth > 20) break;
  }

  return depth;
}

/**
 * Calculate the maximum depth of a term's subtree.
 * A term with no children returns 0. A term with children returns
 * 1 + max(children subtree depths).
 */
async function getSubtreeMaxDepth(
  ctx: ReadCtx,
  termId: Id<"terms">,
): Promise<number> {
  const children = await ctx.db
    .query("terms")
    .withIndex("by_parent", (q) => q.eq("parentId", termId))
    .collect();

  if (children.length === 0) return 0;

  let maxChildDepth = 0;
  for (const child of children) {
    const childDepth = await getSubtreeMaxDepth(ctx, child._id);
    if (childDepth > maxChildDepth) {
      maxChildDepth = childDepth;
    }
  }

  return 1 + maxChildDepth;
}

/**
 * Get all descendant IDs of a category (for circular reference checks).
 * Returns a Set of term IDs including all children, grandchildren, etc.
 */
export async function getDescendantIds(
  ctx: ReadCtx,
  termId: Id<"terms">,
): Promise<Set<string>> {
  const descendants = new Set<string>();

  const children = await ctx.db
    .query("terms")
    .withIndex("by_parent", (q) => q.eq("parentId", termId))
    .collect();

  for (const child of children) {
    descendants.add(child._id);
    const childDescendants = await getDescendantIds(ctx, child._id);
    for (const id of childDescendants) {
      descendants.add(id);
    }
  }

  return descendants;
}
