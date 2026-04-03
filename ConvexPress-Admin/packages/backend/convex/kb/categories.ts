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

import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { generateCategorySlug } from "./helpers/utils";
import {
  createCategoryArgs,
  updateCategoryArgs,
  reorderCategoryArgs,
  removeCategoryArgs,
  getCategoryBySlugArgs,
} from "./validators";

// ─── List (Admin) ───────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const categories = await ctx.db
      .query("kb_categories")
      .withIndex("by_order")
      .collect();

    return categories;
  },
});

// ─── List Published (Public) ────────────────────────────────────────────────

export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("kb_categories")
      .withIndex("by_published_order", (q) => q.eq("isPublished", true))
      .collect();

    return categories;
  },
});

// ─── Get By Slug (Public) ───────────────────────────────────────────────────

export const getBySlug = query({
  args: getCategoryBySlugArgs,
  handler: async (ctx, args) => {
    const category = await ctx.db
      .query("kb_categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!category || !category.isPublished) return null;
    return category;
  },
});

// ─── Get Hierarchy (Public) ─────────────────────────────────────────────────

export const getHierarchy = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("kb_categories")
      .withIndex("by_published_order", (q) => q.eq("isPublished", true))
      .collect();

    // Build tree structure
    type CategoryNode = (typeof categories)[0] & { children: CategoryNode[] };
    const map = new Map<string, CategoryNode>();
    const roots: CategoryNode[] = [];

    for (const cat of categories) {
      map.set(cat._id, { ...cat, children: [] });
    }

    for (const cat of categories) {
      const node = map.get(cat._id)!;
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

export const create = mutation({
  args: createCategoryArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageCategories");

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

export const update = mutation({
  args: updateCategoryArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageCategories");

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found" });
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };

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
      // Prevent self-parenting
      if (args.parentId === args.categoryId) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Category cannot be its own parent" });
      }
      updates.parentId = args.parentId;
    }
    if (args.isPublished !== undefined) updates.isPublished = args.isPublished;

    await ctx.db.patch(args.categoryId, updates);
    return args.categoryId;
  },
});

// ─── Reorder ────────────────────────────────────────────────────────────────

export const reorder = mutation({
  args: reorderCategoryArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageCategories");

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found" });
    }

    await ctx.db.patch(args.categoryId, {
      order: args.newOrder,
      updatedAt: Date.now(),
    });

    return args.categoryId;
  },
});

// ─── Remove ─────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: removeCategoryArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "kb.manageCategories");

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found" });
    }

    // Move child categories to parent (or root)
    const children = await ctx.db
      .query("kb_categories")
      .withIndex("by_parent", (q) => q.eq("parentId", args.categoryId))
      .collect();
    for (const child of children) {
      await ctx.db.patch(child._id, {
        parentId: category.parentId,
        updatedAt: Date.now(),
      });
    }

    // Unassign articles from this category
    const articles = await ctx.db
      .query("kb_articles")
      .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
      .collect();
    for (const article of articles) {
      await ctx.db.patch(article._id, {
        categoryId: undefined,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.delete(args.categoryId);
    return args.categoryId;
  },
});
