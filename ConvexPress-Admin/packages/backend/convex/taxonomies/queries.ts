import { v } from "convex/values";
import { evaluateMembershipAccess } from "../membership/access";
import { RequestReadLedger, CANONICAL_READ_LIMITS } from "../helpers/requestReadLedger";
import { canEditContent, canDiscoverContent } from "../helpers/publicContent";
/** Editor taxonomy collections require editorial taxonomy capability.
 * Public post labels use getByPost; Website archives use categoryArchives and
 * taxonomyArchives. Raw record lookups and the materializing archive are retired.
 */

import { query, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getCurrentUser, currentUserCan } from "../helpers/permissions";
import {
  listArgs,
  getByPostArgs,
  DEFAULT_PER_PAGE,
} from "./validators";

async function canReadTaxonomyAdmin(ctx: QueryCtx): Promise<boolean> {
  const user=await getCurrentUser(ctx);
  if(!user || user.status!=="active")return false;
  for(const capability of ["taxonomy.assign","taxonomy.create_category","taxonomy.update_category","taxonomy.delete_category","taxonomy.create_tag","taxonomy.update_tag","taxonomy.delete_tag","taxonomy.merge"] as const)
    if(await currentUserCan(ctx,capability))return true;
  return false;
}

// ─── Types ──────────────────────────────────────────────────────────────────

type CategoryTreeNode = {
  _id: Id<"terms">;
  name: string;
  slug: string;
  count: number;
  countReady: boolean;
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
    if (!(await canReadTaxonomyAdmin(ctx))) {
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
      allTerms = allTerms.filter((t) => t.countReady !== true || t.count > 0);
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

        const { countState: _countState, ...metadata } = term;
        return {
          ...metadata,
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
 * Get all terms assigned to a post.
 *
 * Auth: Public (used by website post detail pages).
 *
 * Returns closed { _id, name, slug } labels, never raw term records.
 * Editors can read their authorized drafts; public callers need current post
 * and destination route access. Returns a filtered subset
 * if taxonomy is specified.
 */
const postTermLabel = v.object({ _id:v.id("terms"),name:v.string(),slug:v.string() });
export const getByPost = query({
  args: getByPostArgs,
  returns: v.object({ categories:v.array(postTermLabel),tags:v.array(postTermLabel) }),
  handler: async (ctx, args) => {
    // A post identifier is not authority to inspect its editorial taxonomy.
    const budget=new RequestReadLedger({...CANONICAL_READ_LIMITS,queries:1024});
    const empty={categories:[],tags:[]};
    budget.beforeRead();const post=budget.record(await ctx.db.get("posts",args.postId));
    if(!post)return empty;
    const editor=await canEditContent(ctx,post,budget);
    if(!editor && (!(await canDiscoverContent(ctx,post,budget)) ||
      typeof post.publishedAt!=="number" || post.publishedAt>Date.now()))return empty;
    budget.beforeRead();
    const relationships=await ctx.db.query("termRelationships").withIndex("by_post",q=>q.eq("postId",args.postId)).take(100);
    for(const relationship of relationships)budget.record(relationship);
    const categories:Array<{_id:Id<"terms">;name:string;slug:string}>=[],tags:typeof categories=[];
    const seen=new Set<string>();
    for(const rel of relationships){
      if(seen.has(rel.termId))continue;
      seen.add(rel.termId);
      budget.beforeRead();const term=budget.record(await ctx.db.get("terms",rel.termId));
      if(!term || args.taxonomy && term.taxonomy!==args.taxonomy)continue;
      if(!editor){
        const path=`/${term.taxonomy==="category"?"category":"tag"}/${encodeURIComponent(term.slug)}`;
        if(!(await evaluateMembershipAccess(ctx,{resourceType:"route",resourceIdOrKey:path},budget)).allowed)continue;
      }
      // Counts, imports, descriptions and ownership remain editorial metadata.
      const label={_id:term._id,name:term.name,slug:term.slug};
      (term.taxonomy==="category"?categories:tags).push(label);
    }
    categories.sort((a,b)=>a.name.localeCompare(b.name));
    tags.sort((a,b)=>a.name.localeCompare(b.name));
    return {categories,tags};
  },
});

/**
 * Get the full hierarchical category tree.
 *
 * Auth: Editorial taxonomy capability (admin metaboxes).
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
    if(!(await canReadTaxonomyAdmin(ctx)))return [];
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
        countReady: cat.countReady === true,
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
    if (!(await canReadTaxonomyAdmin(ctx))) {
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
