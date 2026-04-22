/**
 * Page System - Internal Functions
 *
 * Internal helpers for page hierarchy management. These functions are NOT
 * client-callable -- they are used by page mutations for:
 *
 *   - Slug generation (unique within type "page")
 *   - Path computation (joining parent slugs with "/")
 *   - Recursive path/depth recomputation after hierarchy changes
 *   - Circular reference detection
 *
 * Architecture notes:
 *   - Pages live in the shared `posts` table with `type: "page"`
 *   - Hierarchy is stored via `parentId`, `path`, and `depth` fields
 *   - `path` is pre-computed (e.g., "/services/web-design") for O(1) lookups
 *   - `depth` tracks nesting level (0 = top-level, max 5)
 *   - Slug uniqueness is scoped to `type: "page"` (pages and posts can share slugs)
 */

import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { v } from "convex/values";

// ─── Constants ───────────────────────────────────────────────────────────────

type ReadCtx = Pick<QueryCtx, "db">;

/** Maximum allowed page nesting depth (0-indexed: 0, 1, 2, 3, 4 = 5 levels). */
export const MAX_PAGE_DEPTH = 4;

// ─── Slug Generation ─────────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from a string.
 * Lowercase, alphanumeric + hyphens, no consecutive hyphens,
 * no leading/trailing hyphens, max 200 characters.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);
}

/**
 * Generate a unique slug for a page within the `posts` table (type = "page").
 *
 * If the base slug already exists, appends a numeric suffix (-2, -3, etc.)
 * until a unique slug is found.
 *
 * @param ctx - Query or mutation context
 * @param baseSlug - The desired slug (already slugified)
 * @param excludeId - Optional page ID to exclude from uniqueness check (for updates)
 * @returns A unique slug string
 */
export async function generateUniqueSlug(
  ctx: ReadCtx,
  baseSlug: string,
  excludeId?: Id<"posts">,
): Promise<string> {
  let slug = baseSlug || "page";
  let suffix = 0;

  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
    const existing = await ctx.db
      .query("posts")
      .withIndex("by_type_slug", (q) =>
        q.eq("type", "page").eq("slug", candidate),
      )
      .unique();

    if (!existing || (excludeId && existing._id === excludeId)) {
      return candidate;
    }
    suffix++;

    // Safety valve to prevent infinite loops
    if (suffix > 100) {
      return `${slug}-${Date.now()}`;
    }
  }
}

// ─── Path Computation ────────────────────────────────────────────────────────

/**
 * Compute the full URL path for a page based on its parent chain.
 *
 * Walks up the parent chain from the given parent, collecting slugs,
 * then joins them with "/" to form the full path.
 *
 * Examples:
 *   - Top-level page with slug "about" -> "/about"
 *   - Child of "services" with slug "web-design" -> "/services/web-design"
 *   - Grandchild: "/services/web-design/pricing"
 *
 * @param ctx - Query or mutation context
 * @param slug - The page's own slug
 * @param parentId - The page's parent ID (undefined for top-level)
 * @returns The computed path string
 */
export async function computePagePath(
  ctx: ReadCtx,
  slug: string,
  parentId?: Id<"posts">,
): Promise<string> {
  const segments: string[] = [slug];

  let currentParentId = parentId;
  let safetyCounter = 0;

  while (currentParentId) {
    // Safety valve to prevent infinite loops from corrupt data
    if (safetyCounter++ > 10) {
      break;
    }

    const parent = await ctx.db.get("posts", currentParentId);
    if (!parent || parent.type !== "page") break;

    segments.unshift(parent.slug);
    currentParentId = parent.parentId as Id<"posts"> | undefined;
  }

  return "/" + segments.join("/");
}

/**
 * Compute the depth of a page based on its parent chain.
 *
 * @param ctx - Query or mutation context
 * @param parentId - The page's parent ID (undefined for top-level)
 * @returns The depth number (0 = top-level)
 */
export async function computePageDepth(
  ctx: ReadCtx,
  parentId?: Id<"posts">,
): Promise<number> {
  if (!parentId) return 0;

  let depth = 0;
  let currentParentId: Id<"posts"> | undefined = parentId;
  let safetyCounter = 0;

  while (currentParentId) {
    if (safetyCounter++ > 10) break;
    depth++;
    const parent = await ctx.db.get("posts", currentParentId);
    if (!parent || parent.type !== "page") break;
    currentParentId = parent.parentId as Id<"posts"> | undefined;
  }

  return depth;
}

// ─── Hierarchy Validation ────────────────────────────────────────────────────

/**
 * Detect circular references in the page hierarchy.
 *
 * Walks the ancestor chain from the proposed new parent to the root.
 * If the current page appears anywhere in that chain, a circular
 * reference would be created.
 *
 * @param ctx - Query or mutation context
 * @param pageId - The page being reparented
 * @param newParentId - The proposed new parent
 * @returns true if a circular reference would be created
 */
export async function wouldCreateCircle(
  ctx: ReadCtx,
  pageId: Id<"posts">,
  newParentId: Id<"posts">,
): Promise<boolean> {
  let currentId: Id<"posts"> | undefined = newParentId;
  let safetyCounter = 0;

  while (currentId) {
    if (safetyCounter++ > 10) return true; // Assume circular if too deep
    if (currentId === pageId) return true;

    const current = await ctx.db.get("posts", currentId);
    if (!current || current.type !== "page") break;
    currentId = current.parentId as Id<"posts"> | undefined;
  }

  return false;
}

/**
 * Validate a parent page for assignment.
 *
 * Checks:
 *   1. Parent exists
 *   2. Parent is a page (not a post)
 *   3. Parent is not in trash
 *
 * @param ctx - Query or mutation context
 * @param parentId - The parent ID to validate
 * @returns The parent page document
 * @throws ConvexError if parent is invalid
 */
export async function validateParent(
  ctx: ReadCtx,
  parentId: Id<"posts">,
): Promise<{
  _id: Id<"posts">;
  type: string;
  status: string;
  slug: string;
  parentId?: Id<"posts">;
  depth?: number;
}> {
  const parent = await ctx.db.get("posts", parentId);

  if (!parent) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Invalid parent page",
    });
  }

  if (parent.type !== "page") {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Invalid parent page: the specified record is not a page",
    });
  }

  if (parent.status === "trash") {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Cannot set trashed page as parent",
    });
  }

  return parent as {
    _id: Id<"posts">;
    type: string;
    status: string;
    slug: string;
    parentId?: Id<"posts">;
    depth?: number;
  };
}

/**
 * Get the maximum depth of descendants of a page.
 *
 * Used when reparenting to check if the entire subtree would exceed
 * the max depth limit at its new position.
 *
 * @param ctx - Query or mutation context
 * @param pageId - The page whose subtree to measure
 * @returns Maximum depth relative to this page (0 if no children)
 */
export async function getMaxSubtreeDepth(
  ctx: ReadCtx,
  pageId: Id<"posts">,
): Promise<number> {
  const children = await ctx.db
    .query("posts")
    .withIndex("by_type_parent", (q) =>
      q.eq("type", "page").eq("parentId", pageId),
    )
    .collect();

  if (children.length === 0) return 0;

  let maxChildDepth = 0;
  for (const child of children) {
    const childSubDepth = await getMaxSubtreeDepth(ctx, child._id);
    maxChildDepth = Math.max(maxChildDepth, 1 + childSubDepth);
  }

  return maxChildDepth;
}

// ─── Descendant Path Updates ─────────────────────────────────────────────────

/**
 * Recursively recompute path and depth for a page and all its descendants.
 *
 * Called when:
 *   - A page's slug changes (its own path changes, cascading to all descendants)
 *   - A page is reparented (its path and depth change, cascading to descendants)
 *
 * This is a potentially expensive operation for deep hierarchies, but
 * Convex mutations have execution time limits that naturally bound it.
 *
 * @param ctx - Mutation context (needs write access)
 * @param pageId - The page to start recomputing from
 * @param newParentPath - The parent's full path (or "" for top-level)
 * @param newDepth - The new depth for this page
 */
export async function recomputeDescendantPaths(
  ctx: MutationCtx,
  pageId: Id<"posts">,
  newParentPath: string,
  newDepth: number,
): Promise<void> {
  // Get all direct children of this page
  const children = await ctx.db
    .query("posts")
    .withIndex("by_type_parent", (q) =>
      q.eq("type", "page").eq("parentId", pageId),
    )
    .collect();

  // Get the current page to use its slug for children's paths
  const page = await ctx.db.get("posts", pageId);
  if (!page) return;

  const currentPath = newParentPath === ""
    ? `/${page.slug}`
    : `${newParentPath}/${page.slug}`;

  for (const child of children) {
    const childPath = `${currentPath}/${child.slug}`;
    const childDepth = newDepth + 1;

    await ctx.db.patch("posts", child._id, {
      path: childPath,
      depth: childDepth,
      updatedAt: Date.now(),
    });

    // Recurse into grandchildren
    await recomputeDescendantPaths(ctx, child._id, currentPath, childDepth);
  }
}

// ─── Internal Convex Functions ───────────────────────────────────────────────

/**
 * Internal mutation to recompute paths for a page and all descendants.
 * Callable from scheduled jobs or other internal functions.
 */
export const recomputePaths = internalMutation({
  args: {
    pageId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.get("posts", args.pageId);
    if (!page || page.type !== "page") return;

    // Compute this page's own path from its parent chain
    const path = await computePagePath(
      ctx,
      page.slug,
      page.parentId as Id<"posts"> | undefined,
    );
    const depth = await computePageDepth(
      ctx,
      page.parentId as Id<"posts"> | undefined,
    );

    // Update this page
    await ctx.db.patch("posts", args.pageId, { path, depth, updatedAt: Date.now() });

    // Determine the parent's portion of the path for children
    const parentPath = path.substring(0, path.lastIndexOf("/")) || "";

    // Recompute all descendants
    await recomputeDescendantPaths(ctx, args.pageId, parentPath, depth);
  },
});

/**
 * Internal query to get a page's full ancestor chain (for breadcrumbs).
 * Returns array from root to the page itself.
 */
export const getAncestorChain = internalQuery({
  args: {
    pageId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const ancestors: Array<{
      _id: Id<"posts">;
      title: string;
      slug: string;
      path?: string;
    }> = [];

    const page = await ctx.db.get("posts", args.pageId);
    if (!page || page.type !== "page") return ancestors;

    // Walk up the parent chain
    let currentId: Id<"posts"> | undefined = page.parentId as Id<"posts"> | undefined;
    let safetyCounter = 0;

    while (currentId) {
      if (safetyCounter++ > 10) break;

      const ancestor = await ctx.db.get("posts", currentId);
      if (!ancestor || ancestor.type !== "page") break;

      ancestors.unshift({
        _id: ancestor._id,
        title: ancestor.title,
        slug: ancestor.slug,
        path: ancestor.path as string | undefined,
      });

      currentId = ancestor.parentId as Id<"posts"> | undefined;
    }

    // Add the page itself at the end
    ancestors.push({
      _id: page._id,
      title: page.title,
      slug: page.slug,
      path: page.path as string | undefined,
    });

    return ancestors;
  },
});
