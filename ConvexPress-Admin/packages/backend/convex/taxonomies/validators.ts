/**
 * Taxonomy System - Shared Argument Validators
 *
 * Reusable validator objects for taxonomy mutations and queries.
 * Centralizes validation logic so mutations.ts and queries.ts stay DRY.
 */

import { v } from "convex/values";

// ─── Shared Value Validators ────────────────────────────────────────────────

/** The two supported taxonomy types. */
export const taxonomyTypeValidator = v.union(
  v.literal("category"),
  v.literal("post_tag"),
);

/** Sort field options for term listing. */
export const orderByValidator = v.union(
  v.literal("name"),
  v.literal("count"),
  v.literal("slug"),
  v.literal("createdAt"),
);

/** Sort direction. */
export const orderDirValidator = v.union(
  v.literal("asc"),
  v.literal("desc"),
);

// ─── Mutation Arg Validators ────────────────────────────────────────────────

/** Args for creating a category. */
export const createCategoryArgs = {
  name: v.string(),
  slug: v.optional(v.string()),
  parentId: v.optional(v.id("terms")),
  description: v.optional(v.string()),
};

/** Args for updating a category. */
export const updateCategoryArgs = {
  termId: v.id("terms"),
  name: v.optional(v.string()),
  slug: v.optional(v.string()),
  parentId: v.optional(v.union(v.id("terms"), v.null())), // null = make root-level
  description: v.optional(v.string()),
};

/** Args for deleting a category. */
export const deleteCategoryArgs = {
  termId: v.id("terms"),
};

/** Args for creating a tag. */
export const createTagArgs = {
  name: v.string(),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
};

/** Args for updating a tag. */
export const updateTagArgs = {
  termId: v.id("terms"),
  name: v.optional(v.string()),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
};

/** Args for deleting a tag. */
export const deleteTagArgs = {
  termId: v.id("terms"),
};

/** Args for assigning a term to a post. */
export const assignArgs = {
  postId: v.id("posts"),
  termId: v.id("terms"),
};

/** Args for unassigning a term from a post. */
export const unassignArgs = {
  postId: v.id("posts"),
  termId: v.id("terms"),
};

/** Args for merging terms. */
export const mergeArgs = {
  sourceTermId: v.id("terms"),
  targetTermId: v.id("terms"),
};

// ─── Query Arg Validators ───────────────────────────────────────────────────

/** Args for the list query. */
export const listArgs = {
  taxonomy: v.optional(taxonomyTypeValidator),
  parentId: v.optional(v.id("terms")),
  search: v.optional(v.string()),
  orderBy: v.optional(orderByValidator),
  orderDir: v.optional(orderDirValidator),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
  hideEmpty: v.optional(v.boolean()),
};

/** Args for getting a single term. */
export const getArgs = {
  termId: v.optional(v.id("terms")),
  slug: v.optional(v.string()),
  taxonomy: v.optional(taxonomyTypeValidator),
};

/** Args for getting terms by post. */
export const getByPostArgs = {
  postId: v.id("posts"),
  taxonomy: v.optional(taxonomyTypeValidator),
};

/** Args for getting a term by slug. */
export const getBySlugArgs = {
  slug: v.string(),
  taxonomy: taxonomyTypeValidator,
};

/** Args for getting posts by term (archive). */
export const getPostsByTermArgs = {
  termId: v.id("terms"),
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
};

// ─── Validation Constants ───────────────────────────────────────────────────

/** Maximum length for term names. */
export const MAX_NAME_LENGTH = 200;

/** Maximum length for term slugs. */
export const MAX_SLUG_LENGTH = 200;

/** Maximum length for term descriptions. */
export const MAX_DESCRIPTION_LENGTH = 5000;

/** Maximum category hierarchy depth (root = 0, max child depth = 4). */
export const MAX_CATEGORY_DEPTH = 5;

/** Default number of terms per page. */
export const DEFAULT_PER_PAGE = 20;
