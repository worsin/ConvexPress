import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import type { Id, Doc } from "../_generated/dataModel";
/**
 * Knowledge Base System - Category Functions
 *
 * CRUD and hierarchy operations for KB categories:
 *   list           - All categories for admin (auth required)
 *   listPublished  - Published categories with article counts (public)
 *   getBySlug      - Single category by slug (public)
 *   getHierarchy   - Full category tree structure (public)
 *   create         - Create a new category
 *   update         - Update an existing category
 *   reorder        - Change a category's sort order
 *   remove         - Delete a category (reassigns articles to uncategorized)
 */

import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { generateCategorySlug } from "./helpers/utils";
import { validateCategoryFields, validateCategoryParent, assertCategoryNotDeleting } from "./helpers/categoryHierarchy";
import {
  createCategoryArgs,
  updateCategoryArgs,
  reorderCategoryArgs,
  removeCategoryArgs,
  getCategoryBySlugArgs,
} from "./validators";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { createPublicKbAccess } from "./publicAccess";
import { beginCategoryDeletion } from "./categoryDeletion";
import { kbTables } from "../schema/kb";

// ─── List (Admin) ───────────────────────────────────────────────────────────

export const list: RegisteredQuery<"public", Record<string, never>, Doc<"kb_categories">[] | null> = query({
  args: {},
  returns: v.union(v.null(), v.array(v.object({
    ...kbTables.kb_categories.validator.fields,
    _id: v.id("kb_categories"), _creationTime: v.number(),
  }))),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    await requireCan(ctx, "kb.view");

    const categories = await ctx.db
      .query("kb_categories")
      .withIndex("by_order")
      .take(500);

    return categories;
  },
});

// ─── List Published (Public) ────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const listPublished = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const access = createPublicKbAccess(ctx);
    if (!await access.available()) return null;
    const categories = await ctx.db
      .query("kb_categories")
      .withIndex("by_published_order", (q: ConvexQueryBuilder) => q.eq("isPublished", true))
      .take(500);

    const visible = [];
    for (const category of categories) {
      if (await access.allowedRoute(`/help/${encodeURIComponent(category.slug)}`)) visible.push(category);
    }
    return visible;
  },
});

// ─── Get By Slug (Public) ───────────────────────────────────────────────────

export const getBySlug: RegisteredQuery<"public", { slug: string }, Doc<"kb_categories"> | null> = query({
  args: getCategoryBySlugArgs,
  handler: async (ctx, args) => {
    const access = createPublicKbAccess(ctx);
    if (!await access.available()) return null;
    const category = await ctx.db
      .query("kb_categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!category?.isPublished || !await access.allowedRoute(`/help/${encodeURIComponent(category.slug)}`)) return null;
    return category;
  },
});

// ─── Get Hierarchy (Public) ─────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getHierarchy = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const access = createPublicKbAccess(ctx);
    if (!await access.available()) return null;
    const categories = await ctx.db
      .query("kb_categories")
      .withIndex("by_published_order", (q: ConvexQueryBuilder) => q.eq("isPublished", true))
      .take(500);

    // Build tree structure
    type CategoryNode = (typeof categories)[0] & { children: CategoryNode[] };
    const map = new Map<string, CategoryNode>();
    const roots: CategoryNode[] = [];

    for (const cat of categories) {
      if (!await access.allowedRoute(`/help/${encodeURIComponent(cat.slug)}`)) continue;
      map.set(cat._id, { ...cat, children: [] });
    }

    for (const cat of categories) {
      const node = map.get(cat._id);
      if (!node) continue;
      if (cat.parentId) {
        const parent = map.get(cat.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  },
});

// ─── Create ─────────────────────────────────────────────────────────────────

export const create: RegisteredMutation<"public", { name: string; description?: string; icon?: string; parentId?: Id<"kb_categories"> }, Id<"kb_categories">> = mutation({
  args: createCategoryArgs,
  returns: v.id("kb_categories"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageCategories");

    validateCategoryFields(args);
    await validateCategoryParent(ctx, args.parentId);
    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Category name is required" });
    }

    const slug = await generateCategorySlug(ctx, name);

    // Get max order for positioning
    const allCategories = await ctx.db
      .query("kb_categories")
      .withIndex("by_order")
      .order("desc")
      .first();
    const maxOrder = allCategories ? allCategories.order : 0;

    const now = Date.now();
    const categoryId = await ctx.db.insert("kb_categories", {
      name,
      slug,
      description: args.description,
      icon: args.icon,
      parentId: args.parentId,
      order: maxOrder + 1,
      isActive: true,
      isPublished: true,
      articleCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return categoryId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

export const update: RegisteredMutation<"public", {
  categoryId: Id<"kb_categories">; name?: string; description?: string; icon?: string;
  parentId?: Id<"kb_categories"> | null; isPublished?: boolean;
}, Id<"kb_categories">> = mutation({
  args: updateCategoryArgs,
  returns: v.id("kb_categories"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageCategories");

    const category = await ctx.db.get("kb_categories", args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found" });
    }

    assertCategoryNotDeleting(category);
    validateCategoryFields(args);
    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Category name is required" });
      }
      updates.name = name;
      updates.slug = await generateCategorySlug(ctx, name, args.categoryId);
    }

    if (args.description !== undefined) updates.description = args.description;
    if (args.icon !== undefined) updates.icon = args.icon;
    if (args.parentId !== undefined) {
      await validateCategoryParent(ctx, args.parentId, args.categoryId);
      updates.parentId = args.parentId ?? undefined;
    }
    if (args.isPublished !== undefined) updates.isPublished = args.isPublished;

    await ctx.db.patch("kb_categories", args.categoryId, updates);
    return args.categoryId;
  },
});

// ─── Reorder ────────────────────────────────────────────────────────────────

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const reorder = mutation({
  args: reorderCategoryArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageCategories");

    const category = await ctx.db.get("kb_categories", args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found" });
    }

    assertCategoryNotDeleting(category);
    await ctx.db.patch("kb_categories", args.categoryId, {
      order: args.newOrder,
      updatedAt: Date.now(),
    });

    return args.categoryId;
  },
});

// ─── Remove ─────────────────────────────────────────────────────────────────

export const remove: RegisteredMutation<"public", { categoryId: Id<"kb_categories"> }, Id<"kb_categories">> = mutation({
  args: removeCategoryArgs,
  returns: v.id("kb_categories"),
  handler: async (ctx, args) => beginCategoryDeletion(ctx, args.categoryId),
});
