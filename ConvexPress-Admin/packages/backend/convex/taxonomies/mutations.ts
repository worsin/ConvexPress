/**
 * Taxonomy System - Public Mutations
 *
 * All write operations for managing categories, tags, and term-post relationships.
 *
 * Mutations:
 *   - createCategory - Create a new hierarchical category
 *   - updateCategory - Update an existing category's name, slug, parent, description
 *   - deleteCategory - Delete a category (re-parent children, reassign posts)
 *   - createTag - Create a new flat tag
 *   - updateTag - Update an existing tag's name, slug, description
 *   - deleteTag - Delete a tag (remove all relationships)
 *   - assign - Assign a term to a post (create termRelationship)
 *   - unassign - Remove a term from a post (delete termRelationship)
 *   - merge - Merge source term into target term
 *
 * All mutations require WorkOS authentication and appropriate capabilities.
 */

import { mutation } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { requireCan , getUserIdentifier } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { TAXONOMY_EVENTS, SYSTEM } from "../events/constants";
import {
  generateTermSlug,
  sanitizeSlug,
  updateTermCount,
  ensureDefaultCategory,
  validateCategoryHierarchy,
  getTermDepth,
} from "../helpers/taxonomy";
import {
  createCategoryArgs,
  updateCategoryArgs,
  deleteCategoryArgs,
  createTagArgs,
  updateTagArgs,
  deleteTagArgs,
  assignArgs,
  unassignArgs,
  mergeArgs,
  MAX_NAME_LENGTH,
  MAX_SLUG_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_CATEGORY_DEPTH,
} from "./validators";
import { checkPostCapability } from "../helpers/postAuth";

// ─── Validation Helpers (local) ─────────────────────────────────────────────

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Term name cannot be empty",
    });
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Term name cannot exceed ${MAX_NAME_LENGTH} characters`,
    });
  }
  return trimmed;
}

function validateDescription(description: string | undefined): string | undefined {
  if (description === undefined) return undefined;
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`,
    });
  }
  return description;
}

function validateSlugFormat(slug: string): string {
  const sanitized = sanitizeSlug(slug);
  if (!sanitized) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Slug must contain at least one alphanumeric character",
    });
  }
  if (sanitized.length > MAX_SLUG_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Slug cannot exceed ${MAX_SLUG_LENGTH} characters`,
    });
  }
  return sanitized;
}

// ─── Category Mutations ─────────────────────────────────────────────────────

/**
 * Create a new category.
 *
 * Requires `taxonomy.create_category` capability (Administrator, Editor).
 * Generates slug from name if not provided. Validates parent hierarchy.
 */
export const createCategory = mutation({
  args: createCategoryArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const user = await requireCan(ctx, "taxonomy.create_category");

    // 2. Validate name
    const name = validateName(args.name);

    // 3. Validate description
    const description = validateDescription(args.description);

    // 4. Generate or validate slug
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
        // Auto-deduplicate the slug
        slug = await generateTermSlug(ctx, slug, "category");
      }
    } else {
      slug = await generateTermSlug(ctx, name, "category");
    }

    // 5. Validate parent if provided
    if (args.parentId) {
      const parent = await ctx.db.get("terms", args.parentId);
      if (!parent) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Parent category does not exist",
        });
      }
      if (parent.taxonomy !== "category") {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Parent must be a category",
        });
      }

      // Check depth (for a new term, we just need parent depth + 1 <= maxDepth)
      const parentDepth = await getTermDepth(ctx, args.parentId);
      if (parentDepth + 1 >= MAX_CATEGORY_DEPTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Category hierarchy would exceed maximum depth of ${MAX_CATEGORY_DEPTH} levels`,
        });
      }
    }

    // 6. Check for duplicate name within same parent (sibling uniqueness)
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
        (args.parentId
          ? true // already filtered by parentId index
          : !s.parentId), // root-level only if no parent specified
    );
    if (siblingNameConflict) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `A category with the name "${name}" already exists at this level`,
      });
    }

    // 7. Insert term
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
      createdBy: getUserIdentifier(user),
    });

    // 8. Emit event
    await emitEvent(ctx, TAXONOMY_EVENTS.CATEGORY_CREATED, SYSTEM.TAXONOMY, {
      termId,
      name,
      parentId: args.parentId,
    });

    // 9. Return new term ID
    return termId;
  },
});

/**
 * Update an existing category.
 *
 * Requires `taxonomy.update_category` capability (Administrator, Editor).
 * Validates hierarchy changes and slug uniqueness.
 */
export const updateCategory = mutation({
  args: updateCategoryArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    await requireCan(ctx, "taxonomy.update_category");

    // 2. Fetch existing term
    const term = await ctx.db.get("terms", args.termId);
    if (!term) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Category not found",
      });
    }
    if (term.taxonomy !== "category") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Term is not a category",
      });
    }

    // 3. Build patch object and track changes
    const patch: Record<string, any> = {};
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];

    // 4. Validate and apply name change
    if (args.name !== undefined) {
      const newName = validateName(args.name);
      if (newName !== term.name) {
        // Check sibling name uniqueness
        const parentId = args.parentId !== undefined
          ? (args.parentId === null ? undefined : args.parentId)
          : term.parentId;

        const siblings = parentId
          ? await ctx.db
              .query("terms")
              .withIndex("by_parent", (q) => q.eq("parentId", parentId))
              .collect()
          : (
              await ctx.db
                .query("terms")
                .withIndex("by_taxonomy", (q) => q.eq("taxonomy", "category"))
                .collect()
            ).filter((s) => !s.parentId);

        const conflict = siblings.find(
          (s) =>
            s._id !== args.termId &&
            s.taxonomy === "category" &&
            s.name.toLowerCase() === newName.toLowerCase(),
        );
        if (conflict) {
          throw new ConvexError({
            code: "CONFLICT",
            message: `A category with the name "${newName}" already exists at this level`,
          });
        }

        changes.push({ field: "name", oldValue: term.name, newValue: newName });
        patch.name = newName;
      }
    }

    // 5. Validate and apply slug change
    if (args.slug !== undefined) {
      const newSlug = validateSlugFormat(args.slug);
      if (newSlug !== term.slug) {
        // Check uniqueness
        const existing = await ctx.db
          .query("terms")
          .withIndex("by_slug_taxonomy", (q) =>
            q.eq("slug", newSlug).eq("taxonomy", "category"),
          )
          .unique();
        if (existing && existing._id !== args.termId) {
          throw new ConvexError({
            code: "CONFLICT",
            message: `A category with the slug "${newSlug}" already exists`,
          });
        }
        changes.push({ field: "slug", oldValue: term.slug, newValue: newSlug });
        patch.slug = newSlug;
      }
    }

    // 6. Validate and apply parent change
    if (args.parentId !== undefined) {
      const newParentId = args.parentId === null ? undefined : args.parentId;
      const oldParentId = term.parentId;

      if (newParentId !== oldParentId) {
        if (newParentId) {
          // Validate the new parent
          const result = await validateCategoryHierarchy(
            ctx,
            args.termId,
            newParentId,
          );
          if (!result.valid) {
            throw new ConvexError({
              code: "VALIDATION_ERROR",
              message: result.error!,
            });
          }
        }
        changes.push({
          field: "parentId",
          oldValue: oldParentId,
          newValue: newParentId,
        });
        patch.parentId = newParentId;
      }
    }

    // 7. Validate and apply description change
    if (args.description !== undefined) {
      const newDesc = validateDescription(args.description);
      if (newDesc !== term.description) {
        changes.push({
          field: "description",
          oldValue: term.description,
          newValue: newDesc,
        });
        patch.description = newDesc;
      }
    }

    // 8. If no changes, return term as-is
    if (changes.length === 0) {
      return term;
    }

    // 9. Update
    patch.updatedAt = Date.now();
    await ctx.db.patch("terms", args.termId, patch);

    // 10. Emit event (using registered constant)
    await emitEvent(ctx, TAXONOMY_EVENTS.CATEGORY_UPDATED, SYSTEM.TAXONOMY, {
      termId: args.termId,
      name: patch.name ?? term.name,
      changes,
    });

    // 11. Return updated term
    const updated = await ctx.db.get("terms", args.termId);
    return updated;
  },
});

/**
 * Delete a category.
 *
 * Requires `taxonomy.delete_category` capability (Administrator, Editor).
 * Cannot delete the default "Uncategorized" category.
 * Re-parents children and reassigns orphaned posts to the default category.
 */
export const deleteCategory = mutation({
  args: deleteCategoryArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    await requireCan(ctx, "taxonomy.delete_category");

    // 2. Fetch term
    const term = await ctx.db.get("terms", args.termId);
    if (!term) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Category not found",
      });
    }
    if (term.taxonomy !== "category") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Term is not a category",
      });
    }

    // 3. Cannot delete default category
    if (term.isDefault) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot delete the default category",
      });
    }

    // 4. Re-parent child categories to this category's parent (or root)
    const children = await ctx.db
      .query("terms")
      .withIndex("by_parent", (q) => q.eq("parentId", args.termId))
      .collect();

    let reparentedChildren = 0;
    for (const child of children) {
      await ctx.db.patch("terms", child._id, {
        parentId: term.parentId, // undefined if this was root = children become root
        updatedAt: Date.now(),
      });
      reparentedChildren++;
    }

    // 5. Handle post relationships
    const relationships = await ctx.db
      .query("termRelationships")
      .withIndex("by_term", (q) => q.eq("termId", args.termId))
      .collect();

    // Ensure default category exists for post reassignment
    const defaultCategoryId = await ensureDefaultCategory(ctx);
    let reassignedPosts = 0;

    for (const rel of relationships) {
      // Delete this relationship
      await ctx.db.delete("termRelationships", rel._id);

      // Check if post has any remaining categories (the deleted record
      // is already removed from the DB, so the query returns only live records)
      const remainingRelationships = await ctx.db
        .query("termRelationships")
        .withIndex("by_post", (q) => q.eq("postId", rel.postId))
        .collect();

      // Filter to only category relationships
      let hasCategoryLeft = false;
      for (const remaining of remainingRelationships) {
        const remainingTerm = await ctx.db.get("terms", remaining.termId);
        if (remainingTerm && remainingTerm.taxonomy === "category") {
          hasCategoryLeft = true;
          break;
        }
      }

      // If no categories left, assign default category
      if (!hasCategoryLeft) {
        // Check if default category relationship already exists
        const existingDefault = await ctx.db
          .query("termRelationships")
          .withIndex("by_post_term", (q) =>
            q.eq("postId", rel.postId).eq("termId", defaultCategoryId),
          )
          .unique();

        if (!existingDefault) {
          await ctx.db.insert("termRelationships", {
            postId: rel.postId,
            termId: defaultCategoryId,
          });
        }
        reassignedPosts++;
      }
    }

    // 6. Update default category count if posts were reassigned
    if (reassignedPosts > 0) {
      await updateTermCount(ctx, defaultCategoryId);
    }

    // 7. Delete the term
    const termName = term.name;
    await ctx.db.delete("terms", args.termId);

    // 8. Emit event
    await emitEvent(ctx, TAXONOMY_EVENTS.CATEGORY_DELETED, SYSTEM.TAXONOMY, {
      termId: args.termId,
      name: termName,
    });

    // 9. Return results
    return { reassignedPosts, reparentedChildren };
  },
});

// ─── Tag Mutations ──────────────────────────────────────────────────────────

/**
 * Create a new tag.
 *
 * Requires `taxonomy.create_tag` capability (Administrator, Editor, Author).
 * Tags are flat (no hierarchy).
 */
export const createTag = mutation({
  args: createTagArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const user = await requireCan(ctx, "taxonomy.create_tag");

    // 2. Validate name
    const name = validateName(args.name);

    // 3. Validate description
    const description = validateDescription(args.description);

    // 4. Check for duplicate name within tags (case-insensitive).
    // NOTE: Known Convex limitation -- Convex does not support case-insensitive
    // index queries. This collects all tags into memory for JS comparison.
    // Future optimization: add a `nameLowercase` indexed field on `terms` to
    // enable O(1) case-insensitive lookups via index.
    const nameLower = name.toLowerCase();
    const tagsForCaseCheck = await ctx.db
      .query("terms")
      .withIndex("by_taxonomy_name", (q) => q.eq("taxonomy", "post_tag"))
      .collect();
    const caseConflict = tagsForCaseCheck.find(
      (t) => t.name.toLowerCase() === nameLower,
    );
    if (caseConflict) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `A tag with the name "${name}" already exists`,
      });
    }

    // 5. Generate or validate slug
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

    // 6. Insert term
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
      createdBy: getUserIdentifier(user),
    });

    // 7. Emit event
    await emitEvent(ctx, TAXONOMY_EVENTS.TAG_CREATED, SYSTEM.TAXONOMY, {
      termId,
      name,
    });

    // 8. Return new term ID
    return termId;
  },
});

/**
 * Update an existing tag.
 *
 * Requires `taxonomy.update_tag` capability (Administrator, Editor).
 */
export const updateTag = mutation({
  args: updateTagArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    await requireCan(ctx, "taxonomy.update_tag");

    // 2. Fetch existing term
    const term = await ctx.db.get("terms", args.termId);
    if (!term) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Tag not found",
      });
    }
    if (term.taxonomy !== "post_tag") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Term is not a tag",
      });
    }

    // 3. Build patch object and track changes
    const patch: Record<string, any> = {};
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];

    // 4. Validate name
    if (args.name !== undefined) {
      const newName = validateName(args.name);
      if (newName !== term.name) {
        // Check uniqueness (case-insensitive).
        // NOTE: Known Convex limitation -- Convex does not support case-insensitive
        // index queries. This collects all tags into memory for JS comparison.
        // Future optimization: add a `nameLowercase` indexed field on `terms`.
        const allTags = await ctx.db
          .query("terms")
          .withIndex("by_taxonomy", (q) => q.eq("taxonomy", "post_tag"))
          .collect();
        const conflict = allTags.find(
          (t) =>
            t._id !== args.termId &&
            t.name.toLowerCase() === newName.toLowerCase(),
        );
        if (conflict) {
          throw new ConvexError({
            code: "CONFLICT",
            message: `A tag with the name "${newName}" already exists`,
          });
        }
        changes.push({ field: "name", oldValue: term.name, newValue: newName });
        patch.name = newName;
      }
    }

    // 5. Validate slug
    if (args.slug !== undefined) {
      const newSlug = validateSlugFormat(args.slug);
      if (newSlug !== term.slug) {
        const existing = await ctx.db
          .query("terms")
          .withIndex("by_slug_taxonomy", (q) =>
            q.eq("slug", newSlug).eq("taxonomy", "post_tag"),
          )
          .unique();
        if (existing && existing._id !== args.termId) {
          throw new ConvexError({
            code: "CONFLICT",
            message: `A tag with the slug "${newSlug}" already exists`,
          });
        }
        changes.push({ field: "slug", oldValue: term.slug, newValue: newSlug });
        patch.slug = newSlug;
      }
    }

    // 6. Validate description
    if (args.description !== undefined) {
      const newDesc = validateDescription(args.description);
      if (newDesc !== term.description) {
        changes.push({
          field: "description",
          oldValue: term.description,
          newValue: newDesc,
        });
        patch.description = newDesc;
      }
    }

    // 7. If no changes, return term as-is
    if (changes.length === 0) {
      return term;
    }

    // 8. Update
    patch.updatedAt = Date.now();
    await ctx.db.patch("terms", args.termId, patch);

    // 9. Emit event (using registered constant)
    await emitEvent(ctx, TAXONOMY_EVENTS.TAG_UPDATED, SYSTEM.TAXONOMY, {
      termId: args.termId,
      name: patch.name ?? term.name,
      changes,
    });

    // 10. Return updated term
    const updated = await ctx.db.get("terms", args.termId);
    return updated;
  },
});

/**
 * Delete a tag.
 *
 * Requires `taxonomy.delete_tag` capability (Administrator, Editor).
 * Removes all term relationships (no reassignment needed for tags).
 */
export const deleteTag = mutation({
  args: deleteTagArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    await requireCan(ctx, "taxonomy.delete_tag");

    // 2. Fetch term
    const term = await ctx.db.get("terms", args.termId);
    if (!term) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Tag not found",
      });
    }
    if (term.taxonomy !== "post_tag") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Term is not a tag",
      });
    }

    // 3. Delete all relationships
    const relationships = await ctx.db
      .query("termRelationships")
      .withIndex("by_term", (q) => q.eq("termId", args.termId))
      .collect();

    for (const rel of relationships) {
      await ctx.db.delete("termRelationships", rel._id);
    }

    // 4. Delete the term
    const termName = term.name;
    await ctx.db.delete("terms", args.termId);

    // 5. Emit event
    await emitEvent(ctx, TAXONOMY_EVENTS.TAG_DELETED, SYSTEM.TAXONOMY, {
      termId: args.termId,
      name: termName,
    });

    // 6. Return result
    return { removedFromPosts: relationships.length };
  },
});

// ─── Term Assignment Mutations ──────────────────────────────────────────────

/**
 * Assign a term to a post (create a termRelationship).
 *
 * Requires `taxonomy.assign` capability (Administrator, Editor, Author, Contributor).
 * Idempotent: if already assigned, returns success without creating a duplicate.
 */
export const assign = mutation({
  args: assignArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const user = await requireCan(ctx, "taxonomy.assign");

    // 2. Verify post exists (C-1 fix: validate post before creating relationship)
    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    // 3. Post ownership check (C-2 fix: verify user can edit this post)
    // The user must own the post OR have Editor-level (80+) to modify others' posts
    const postDoc = post as Doc<"posts">;
    await checkPostCapability(ctx, user, postDoc, "edit");

    // 4. Verify term exists
    const term = await ctx.db.get("terms", args.termId);
    if (!term) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Term not found",
      });
    }

    // 5. Check for existing relationship (idempotent)
    const existing = await ctx.db
      .query("termRelationships")
      .withIndex("by_post_term", (q) =>
        q.eq("postId", args.postId).eq("termId", args.termId),
      )
      .unique();

    if (existing) {
      // Already assigned -- return success silently
      return { success: true, alreadyAssigned: true };
    }

    // 6. Create relationship
    await ctx.db.insert("termRelationships", {
      postId: args.postId,
      termId: args.termId,
    });

    // 7. Update term count (only if post is published)
    if (postDoc.status === "publish") {
      await updateTermCount(ctx, args.termId);
    }

    // 8. Emit event
    await emitEvent(ctx, TAXONOMY_EVENTS.TERM_ASSIGNED, SYSTEM.TAXONOMY, {
      postId: args.postId,
      termId: args.termId,
      taxonomyType: term.taxonomy,
    });

    // 9. Return success
    return { success: true, alreadyAssigned: false };
  },
});

/**
 * Remove a term from a post (delete a termRelationship).
 *
 * Requires `taxonomy.unassign` capability (Administrator, Editor, Author).
 * Idempotent: if not assigned, returns success without error.
 * Enforces default category: if removing the last category from a post,
 * the default "Uncategorized" category is assigned before removal.
 */
export const unassign = mutation({
  args: unassignArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const user = await requireCan(ctx, "taxonomy.unassign");

    // 2. Verify post exists (consistent with assign mutation)
    const post = await ctx.db.get("posts", args.postId);
    if (!post) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Post not found",
      });
    }

    // 3. Post ownership check (C-2 fix: verify user can edit this post)
    const postDoc = post as Doc<"posts">;
    await checkPostCapability(ctx, user, postDoc, "edit");

    // 4. Find relationship
    const relationship = await ctx.db
      .query("termRelationships")
      .withIndex("by_post_term", (q) =>
        q.eq("postId", args.postId).eq("termId", args.termId),
      )
      .unique();

    if (!relationship) {
      // Not assigned -- return success silently (idempotent)
      return { success: true, wasAssigned: false };
    }

    // 5. Check if this is a category and if it's the last one
    const term = await ctx.db.get("terms", args.termId);
    if (term && term.taxonomy === "category") {
      // Get all category relationships for this post
      const allPostRels = await ctx.db
        .query("termRelationships")
        .withIndex("by_post", (q) => q.eq("postId", args.postId))
        .collect();

      let categoryCount = 0;
      for (const rel of allPostRels) {
        if (rel._id === relationship._id) continue; // Skip the one being removed
        const relTerm = await ctx.db.get("terms", rel.termId);
        if (relTerm && relTerm.taxonomy === "category") {
          categoryCount++;
        }
      }

      // If removing the last category, assign default category first
      if (categoryCount === 0) {
        const defaultCategoryId = await ensureDefaultCategory(ctx);

        // Only add if not already the default category being removed
        if (args.termId !== defaultCategoryId) {
          // Check if default is already assigned
          const defaultRel = await ctx.db
            .query("termRelationships")
            .withIndex("by_post_term", (q) =>
              q.eq("postId", args.postId).eq("termId", defaultCategoryId),
            )
            .unique();

          if (!defaultRel) {
            await ctx.db.insert("termRelationships", {
              postId: args.postId,
              termId: defaultCategoryId,
            });
            // Update default category count
            await updateTermCount(ctx, defaultCategoryId);
          }
        }
      }
    }

    // 6. Delete the relationship
    await ctx.db.delete("termRelationships", relationship._id);

    // 7. Update term count
    if (postDoc.status === "publish") {
      await updateTermCount(ctx, args.termId);
    }

    // 8. Return success
    return { success: true, wasAssigned: true };
  },
});

/**
 * Merge one term into another of the same taxonomy type.
 *
 * Requires `taxonomy.merge` capability (Administrator, Editor).
 * All posts from source are reassigned to target (avoiding duplicates).
 * Child categories of source are re-parented to target.
 * Source term is deleted.
 */
export const merge = mutation({
  args: mergeArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    await requireCan(ctx, "taxonomy.merge");

    // 2. Fetch both terms
    const source = await ctx.db.get("terms", args.sourceTermId);
    if (!source) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Source term not found",
      });
    }

    const target = await ctx.db.get("terms", args.targetTermId);
    if (!target) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Target term not found",
      });
    }

    // 3. Verify same taxonomy type
    if (source.taxonomy !== target.taxonomy) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cannot merge terms of different taxonomy types",
      });
    }

    // 4. Cannot merge same term
    if (args.sourceTermId === args.targetTermId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cannot merge a term into itself",
      });
    }

    // 5. Cannot merge default category as source
    if (source.isDefault) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot merge the default category",
      });
    }

    // 6. Reassign posts from source to target
    const sourceRels = await ctx.db
      .query("termRelationships")
      .withIndex("by_term", (q) => q.eq("termId", args.sourceTermId))
      .collect();

    let mergedPosts = 0;
    for (const rel of sourceRels) {
      // Check if target already has this post
      const existingTarget = await ctx.db
        .query("termRelationships")
        .withIndex("by_post_term", (q) =>
          q.eq("postId", rel.postId).eq("termId", args.targetTermId),
        )
        .unique();

      if (!existingTarget) {
        // Create new relationship with target
        await ctx.db.insert("termRelationships", {
          postId: rel.postId,
          termId: args.targetTermId,
          order: rel.order,
        });
        mergedPosts++;
      }

      // Delete old relationship with source
      await ctx.db.delete("termRelationships", rel._id);
    }

    // 7. Re-parent child categories (if applicable)
    let reparentedChildren = 0;
    if (source.taxonomy === "category") {
      const children = await ctx.db
        .query("terms")
        .withIndex("by_parent", (q) => q.eq("parentId", args.sourceTermId))
        .collect();

      for (const child of children) {
        await ctx.db.patch("terms", child._id, {
          parentId: args.targetTermId,
          updatedAt: Date.now(),
        });
        reparentedChildren++;
      }
    }

    // 8. Recalculate target count
    await updateTermCount(ctx, args.targetTermId);

    // 9. Delete source term
    const sourceName = source.name;
    const targetName = target.name;
    await ctx.db.delete("terms", args.sourceTermId);

    // 10. Emit event
    await emitEvent(ctx, TAXONOMY_EVENTS.MERGED, SYSTEM.TAXONOMY, {
      sourceTermId: args.sourceTermId,
      sourceName,
      targetTermId: args.targetTermId,
      targetName,
      taxonomyType: source.taxonomy,
      mergedPosts,
      reparentedChildren,
    });

    // 11. Return results
    return { mergedPosts, reparentedChildren };
  },
});
