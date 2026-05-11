/**
 * Taxonomy System - HTTP API Internal Functions
 *
 * These internal functions are used exclusively by HTTP actions (httpAction).
 * They are NOT client-callable, providing a security layer between the public
 * HTTP API and the database operations.
 *
 * This addresses security issue H-17: HTTP actions should use internal functions
 * instead of public API functions.
 *
 * Functions:
 *   listInternal           - List terms for HTTP API
 *   createCategoryInternal - Create category via HTTP API
 *   createTagInternal      - Create tag via HTTP API
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { emitEvent } from "../helpers/events";
import { TAXONOMY_EVENTS, SYSTEM } from "../events/constants";
import {
  generateTermSlug,
  sanitizeSlug,
  getTermDepth,
} from "../helpers/taxonomy";

const MAX_NAME_LENGTH = 200;
const MAX_SLUG_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_CATEGORY_DEPTH = 5;

/**
 * Internal version of list for HTTP API.
 * No client-side auth - caller (HTTP handler) handles API key auth.
 */
export const listInternal = internalQuery({
  args: {
    taxonomy: v.union(v.literal("category"), v.literal("post_tag")),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
    search: v.optional(v.string()),
    hideEmpty: v.optional(v.boolean()),
    orderBy: v.optional(v.string()),
    orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    const page = args.page ?? 1;
    const perPage = args.perPage ?? 20;
    const orderBy = args.orderBy ?? "name";
    const orderDir = args.orderDir ?? "asc";

    // Fetch all terms matching the taxonomy filter
    let allTerms = await ctx.db
      .query("terms")
      .withIndex("by_taxonomy", (q) => q.eq("taxonomy", args.taxonomy))
      .collect();

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

    return {
      terms: paginatedTerms,
      total,
      page,
      perPage,
      totalPages,
    };
  },
});

/**
 * Validate term name.
 */
function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Term name cannot be empty");
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`Term name cannot exceed ${MAX_NAME_LENGTH} characters`);
  }
  return trimmed;
}

/**
 * Validate slug format.
 */
function validateSlugFormat(slug: string): string {
  const sanitized = sanitizeSlug(slug);
  if (!sanitized) {
    throw new Error("Slug must contain at least one alphanumeric character");
  }
  if (sanitized.length > MAX_SLUG_LENGTH) {
    throw new Error(`Slug cannot exceed ${MAX_SLUG_LENGTH} characters`);
  }
  return sanitized;
}

/**
 * Internal version of createCategory for HTTP API.
 */
export const createCategoryInternal = internalMutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    parentId: v.optional(v.id("terms")),
    createdByUserId: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate name
    const name = validateName(args.name);

    // Validate description
    let description = args.description;
    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      throw new Error(`Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`);
    }

    // Generate or validate slug
    let slug: string;
    if (args.slug) {
      slug = validateSlugFormat(args.slug);
      // Check uniqueness within categories
      const existing = await ctx.db
        .query("terms")
        .withIndex("by_slug_taxonomy", (q) =>
          q.eq("slug", slug).eq("taxonomy", "category"),
        )
        .unique();
      if (existing) {
        slug = await generateTermSlug(ctx, slug, "category");
      }
    } else {
      slug = await generateTermSlug(ctx, name, "category");
    }

    // Validate parent if provided
    if (args.parentId) {
      const parent = await ctx.db.get("terms", args.parentId);
      if (!parent) {
        throw new Error("Parent category does not exist");
      }
      if (parent.taxonomy !== "category") {
        throw new Error("Parent must be a category");
      }

      // Check depth
      const parentDepth = await getTermDepth(ctx, args.parentId);
      if (parentDepth + 1 >= MAX_CATEGORY_DEPTH) {
        throw new Error(`Category hierarchy would exceed maximum depth of ${MAX_CATEGORY_DEPTH} levels`);
      }
    }

    // Check for duplicate name within same parent
    const siblingQuery = args.parentId
      ? ctx.db
          .query("terms")
          .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
      : ctx.db
          .query("terms")
          .withIndex("by_taxonomy", (q) => q.eq("taxonomy", "category"));

    const siblings = await siblingQuery.collect();
    const siblingNameConflict = siblings.find(
      (s) =>
        s.taxonomy === "category" &&
        s.name.toLowerCase() === name.toLowerCase() &&
        (args.parentId ? true : !s.parentId),
    );
    if (siblingNameConflict) {
      throw new Error(`A category with the name "${name}" already exists at this level`);
    }

    // Insert term
    const now = Date.now();
    const termId = await ctx.db.insert("terms", {
      name,
      slug,
      taxonomy: "category",
      parentId: args.parentId,
      description,
      count: 0,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
      createdBy: args.createdByUserId,
    });

    // Emit event
    await emitEvent(ctx, TAXONOMY_EVENTS.CATEGORY_CREATED, SYSTEM.TAXONOMY, {
      termId,
      name,
      parentId: args.parentId,
    });

    return termId;
  },
});

/**
 * Internal version of createTag for HTTP API.
 */
export const createTagInternal = internalMutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    createdByUserId: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate name
    const name = validateName(args.name);

    // Validate description
    let description = args.description;
    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      throw new Error(`Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`);
    }

    // Check for duplicate name within tags (case-insensitive)
    const nameLower = name.toLowerCase();
    const tagsForCaseCheck = await ctx.db
      .query("terms")
      .withIndex("by_taxonomy_name", (q) => q.eq("taxonomy", "post_tag"))
      .collect();
    const caseConflict = tagsForCaseCheck.find(
      (t) => t.name.toLowerCase() === nameLower,
    );
    if (caseConflict) {
      throw new Error(`A tag with the name "${name}" already exists`);
    }

    // Generate or validate slug
    let slug: string;
    if (args.slug) {
      slug = validateSlugFormat(args.slug);
      const existing = await ctx.db
        .query("terms")
        .withIndex("by_slug_taxonomy", (q) =>
          q.eq("slug", slug).eq("taxonomy", "post_tag"),
        )
        .unique();
      if (existing) {
        slug = await generateTermSlug(ctx, slug, "post_tag");
      }
    } else {
      slug = await generateTermSlug(ctx, name, "post_tag");
    }

    // Insert term
    const now = Date.now();
    const termId = await ctx.db.insert("terms", {
      name,
      slug,
      taxonomy: "post_tag",
      description,
      count: 0,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
      createdBy: args.createdByUserId,
    });

    // Emit event
    await emitEvent(ctx, TAXONOMY_EVENTS.TAG_CREATED, SYSTEM.TAXONOMY, {
      termId,
      name,
    });

    return termId;
  },
});
