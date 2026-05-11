/**
 * Taxonomy System - Public Queries
 *
 * All read operations for taxonomy terms and term-post relationships.
 *
 * Queries:
 *   - list - List terms by taxonomy type with search, pagination, sorting
 *   - get - Get a single term by ID, or by slug + taxonomy
 *   - getByPost - Get all terms (categories + tags) assigned to a post
 *   - getBySlug - Get a term by taxonomy + slug (convenience shorthand)
 *   - getCategoryTree - Get full hierarchical category tree
 *   - getPostsByTerm - Get paginated posts for a term (archive pages)
 *   - counts - Get category and tag totals
 *
 * Authentication:
 *   - Admin queries (list, getCategoryTree, counts) require auth
 *   - Public queries (get, getBySlug, getByPost, getPostsByTerm) are open
 *     for website SSR archive pages
 */

import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentUser } from "../helpers/permissions";
import {
  listArgs,
  getArgs,
  getByPostArgs,
  getBySlugArgs,
  getPostsByTermArgs,
  DEFAULT_PER_PAGE,
} from "./validators";
import { getTermDepth } from "../helpers/taxonomy";

// ─── Types ──────────────────────────────────────────────────────────────────

type CategoryTreeNode = {
  _id: Id<"terms">;
  name: string;
  slug: string;
  count: number;
  isDefault: boolean;
  depth: number;
  children: CategoryTreeNode[];
};

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * List terms with filtering, sorting, and pagination.
 *
 * Supports filtering by taxonomy type, parent, search (case-insensitive
 * substring on name), and hiding empty terms. Sorts by name, count, slug,
 * or createdAt. Paginates with offset-based page + perPage.
 *
 * Auth: Required (admin usage).
 */
export const list = query({
  args: listArgs,
  handler: async (ctx, args) => {
    // Auth check
    const user = await getCurrentUser(ctx);
    if (!user) {
      return {
        terms: [],
        total: 0,
        page: 1,
        perPage: DEFAULT_PER_PAGE,
        totalPages: 0,
      };
    }

    const page = args.page ?? 1;
    const perPage = args.perPage ?? DEFAULT_PER_PAGE;
    const orderBy = args.orderBy ?? "name";
    const orderDir = args.orderDir ?? "asc";

    // Fetch all terms matching the taxonomy filter.
    // Bounded to 5000 terms - sufficient for most taxonomies.
    let allTerms;
    if (args.taxonomy) {
      allTerms = await ctx.db
        .query("terms")
        .withIndex("by_taxonomy", (q) => q.eq("taxonomy", args.taxonomy!))
        .take(5000);
    } else {
      allTerms = await ctx.db.query("terms").take(5000);
    }

    // Filter by parentId if specified
    if (args.parentId !== undefined) {
      allTerms = allTerms.filter((t) => t.parentId === args.parentId);
    }

    // Filter by search (case-insensitive substring on name)
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      allTerms = allTerms.filter(
        (t) =>
          t.name.toLowerCase().includes(searchLower) ||
          t.slug.toLowerCase().includes(searchLower),
      );
    }

    // Filter out empty terms if requested
    if (args.hideEmpty) {
      allTerms = allTerms.filter((t) => t.count > 0);
    }

    // Sort
    allTerms.sort((a, b) => {
      let cmp = 0;
      switch (orderBy) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "count":
          cmp = a.count - b.count;
          break;
        case "slug":
          cmp = a.slug.localeCompare(b.slug);
          break;
        case "createdAt":
          cmp = a.createdAt - b.createdAt;
          break;
      }
      return orderDir === "desc" ? -cmp : cmp;
    });

    const total = allTerms.length;
    const totalPages = Math.ceil(total / perPage);

    // Paginate
    const start = (page - 1) * perPage;
    const paginatedTerms = allTerms.slice(start, start + perPage);

    // Batch-compute depth using the already-fetched allTerms array.
    // Build a map of termId -> term for O(1) parent lookups in memory,
    // avoiding recursive DB reads per term (O(N*D) -> O(N) reads).
    const termMap = new Map<string, (typeof allTerms)[number]>();
    for (const t of allTerms) {
      termMap.set(t._id as string, t);
    }

    function computeDepthInMemory(termId: string): number {
      let depth = 0;
      let currentId = termId;
      const visited = new Set<string>();
      while (true) {
        const current = termMap.get(currentId);
        if (!current || !current.parentId) break;
        if (visited.has(currentId)) break; // Safety: prevent infinite loops
        visited.add(currentId);
        currentId = current.parentId as string;
        depth++;
        if (depth > 20) break; // Safety limit
      }
      return depth;
    }

    // Compute depth and children for each paginated term
    const termsWithMeta = await Promise.all(
      paginatedTerms.map(async (term) => {
        const depth = term.parentId
          ? computeDepthInMemory(term._id as string)
          : 0;

        // Get direct child IDs (for categories)
        // Bounded to 200 children per category - sufficient for hierarchies
        let children: Id<"terms">[] | undefined;
        if (term.taxonomy === "category") {
          const childTerms = await ctx.db
            .query("terms")
            .withIndex("by_parent", (q) => q.eq("parentId", term._id))
            .take(200);
          children = childTerms.map((c) => c._id);
        }

        return {
          ...term,
          depth,
          children,
        };
      }),
    );

    return {
      terms: termsWithMeta,
      total,
      page,
      perPage,
      totalPages,
    };
  },
});

/**
 * Get a single term by ID, or by slug + taxonomy type.
 *
 * Auth: Public (used by website archive pages).
 *
 * Look up by termId OR by slug + taxonomy (using by_slug_taxonomy index).
 * If a category, computes depth and fetches direct children.
 */
export const get = query({
  args: getArgs,
  handler: async (ctx, args) => {
    let term;

    if (args.termId) {
      term = await ctx.db.get("terms", args.termId);
    } else if (args.slug && args.taxonomy) {
      term = await ctx.db
        .query("terms")
        .withIndex("by_slug_taxonomy", (q) =>
          q.eq("slug", args.slug!).eq("taxonomy", args.taxonomy!),
        )
        .unique();
    } else {
      return null;
    }

    if (!term) return null;

    // Compute depth
    const depth = term.parentId
      ? await getTermDepth(ctx, term._id)
      : 0;

    // Get direct children if category
    // Bounded to 200 children per category
    let children: Id<"terms">[] | undefined;
    if (term.taxonomy === "category") {
      const childTerms = await ctx.db
        .query("terms")
        .withIndex("by_parent", (q) => q.eq("parentId", term._id))
        .take(200);
      children = childTerms.map((c) => c._id);
    }

    return {
      ...term,
      depth,
      children,
    };
  },
});

/**
 * Get a term by slug + taxonomy type.
 *
 * Auth: Public (convenience shorthand for `get` with slug + taxonomy).
 */
export const getBySlug = query({
  args: getBySlugArgs,
  handler: async (ctx, args) => {
    const term = await ctx.db
      .query("terms")
      .withIndex("by_slug_taxonomy", (q) =>
        q.eq("slug", args.slug).eq("taxonomy", args.taxonomy),
      )
      .unique();

    if (!term) return null;

    // Compute depth
    const depth = term.parentId
      ? await getTermDepth(ctx, term._id)
      : 0;

    // Get direct children if category
    // Bounded to 200 children per category
    let children: Id<"terms">[] | undefined;
    if (term.taxonomy === "category") {
      const childTerms = await ctx.db
        .query("terms")
        .withIndex("by_parent", (q) => q.eq("parentId", term._id))
        .take(200);
      children = childTerms.map((c) => c._id);
    }

    return {
      ...term,
      depth,
      children,
    };
  },
});

/**
 * Get all terms assigned to a post.
 *
 * Auth: Public (used by website post detail pages).
 *
 * Returns { categories: Term[], tags: Term[] } or filtered subset
 * if taxonomy is specified.
 */
export const getByPost = query({
  args: getByPostArgs,
  handler: async (ctx, args) => {
    // Get all relationships for this post
    // Bounded to 100 terms per post - posts rarely have more than 20
    const relationships = await ctx.db
      .query("termRelationships")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(100);

    const categories: Doc<"terms">[] = [];
    const tags: Doc<"terms">[] = [];

    for (const rel of relationships) {
      const term = await ctx.db.get("terms", rel.termId);
      if (!term) continue;

      // Filter by taxonomy if specified
      if (args.taxonomy && term.taxonomy !== args.taxonomy) continue;

      if (term.taxonomy === "category") {
        categories.push(term);
      } else if (term.taxonomy === "post_tag") {
        tags.push(term);
      }
    }

    // Sort categories and tags alphabetically
    categories.sort((a, b) => a.name.localeCompare(b.name));
    tags.sort((a, b) => a.name.localeCompare(b.name));

    return { categories, tags };
  },
});

/**
 * Get the full hierarchical category tree.
 *
 * Auth: Public (used by both admin metaboxes and website navigation).
 *
 * Fetches all categories in one query and builds a nested tree in memory.
 * Siblings are sorted alphabetically. Default category is always first
 * at root level.
 *
 * Performance: Bounded to 1000 categories (single query + in-memory build).
 * Sites rarely exceed 200 categories. If they do, consider pagination.
 */
export const getCategoryTree = query({
  args: {},
  handler: async (ctx) => {
    // Fetch all categories in one query, bounded to 1000 max
    const allCategories = await ctx.db
      .query("terms")
      .withIndex("by_taxonomy", (q) => q.eq("taxonomy", "category"))
      .take(1000);

    // Build a map for O(1) lookups
    const categoryMap = new Map<string, typeof allCategories[number]>();
    for (const cat of allCategories) {
      categoryMap.set(cat._id, cat);
    }

    // Build tree recursively
    function buildTree(
      parentId: Id<"terms"> | undefined,
      depth: number,
    ): CategoryTreeNode[] {
      const children = allCategories
        .filter((cat) => cat.parentId === parentId)
        .sort((a, b) => {
          // Default category always first at root level
          if (depth === 0) {
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
          }
          return a.name.localeCompare(b.name);
        });

      return children.map((cat) => ({
        _id: cat._id,
        name: cat.name,
        slug: cat.slug,
        count: cat.count,
        isDefault: cat.isDefault,
        depth,
        children: buildTree(cat._id, depth + 1),
      }));
    }

    // Build from root (parentId = undefined)
    return buildTree(undefined, 0);
  },
});

/**
 * Get paginated posts for a specific term (archive page).
 *
 * Auth: Public (used by website archive pages via SSR).
 *
 * Returns the term info along with paginated published posts sorted by
 * publishedAt descending.
 */
export const getPostsByTerm = query({
  args: getPostsByTermArgs,
  handler: async (ctx, args) => {
    const page = args.page ?? 1;
    const perPage = args.perPage ?? 10;

    // Fetch the term
    const term = await ctx.db.get("terms", args.termId);
    if (!term) {
      return {
        term: null,
        posts: [],
        total: 0,
        page,
        perPage,
        totalPages: 0,
      };
    }

    // Get all relationships for this term
    // Bounded to 10,000 posts per term - sufficient for archive pages
    const relationships = await ctx.db
      .query("termRelationships")
      .withIndex("by_term", (q) => q.eq("termId", args.termId))
      .take(10000);

    // Fetch linked posts and filter to published only
    const publishedPosts: Doc<"posts">[] = [];
    for (const rel of relationships) {
      const post = await ctx.db.get("posts", rel.postId);
      if (post) {
        const postDoc = post as Doc<"posts">;
        if (postDoc.status === "publish") {
          publishedPosts.push(postDoc);
        }
      }
    }

    // Sort by publishedAt descending (if available), else by _creationTime
    publishedPosts.sort((a, b) => {
      const aTime = a.publishedAt ?? a._creationTime;
      const bTime = b.publishedAt ?? b._creationTime;
      return bTime - aTime;
    });

    const total = publishedPosts.length;
    const totalPages = Math.ceil(total / perPage);

    // Paginate
    const start = (page - 1) * perPage;
    const paginatedPosts = publishedPosts.slice(start, start + perPage);

    return {
      term,
      posts: paginatedPosts,
      total,
      page,
      perPage,
      totalPages,
    };
  },
});

/**
 * Get category and tag totals.
 *
 * Auth: Required (admin dashboard usage).
 *
 * Returns { categories: number, tags: number } for the Dashboard
 * "At a Glance" widget.
 */
export const counts = query({
  args: {},
  handler: async (ctx) => {
    // Auth check
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { categories: 0, tags: 0 };
    }

    // Use targeted index queries per taxonomy type instead of fetching ALL terms
    // Bounded to 10,000 per taxonomy type - sufficient for admin dashboard counts
    const categoryTerms = await ctx.db
      .query("terms")
      .withIndex("by_taxonomy", (q) => q.eq("taxonomy", "category"))
      .take(10000);

    const tagTerms = await ctx.db
      .query("terms")
      .withIndex("by_taxonomy", (q) => q.eq("taxonomy", "post_tag"))
      .take(10000);

    return { categories: categoryTerms.length, tags: tagTerms.length };
  },
});
