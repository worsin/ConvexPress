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
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";

// ─── List (Admin) ───────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
    }

    const categories = await ctx.db
      .query("kb_categories")
      .withIndex("by_order")
      .take(500);

    return categories;
  },
});

// ─── List Published (Public) ────────────────────────────────────────────────

export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const categories = await ctx.db
      .query("kb_categories")
      .withIndex("by_published_order", (q) => q.eq("isPublished", true))
      .take(500);

    return categories;
  },
});

// ─── Get By Slug (Public) ───────────────────────────────────────────────────

export const getBySlug = query({
  args: getCategoryBySlugArgs,
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
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
    if (!(await isPluginEnabled(ctx, "knowledgeBase"))) return null;
    const categories = await ctx.db
      .query("kb_categories")
      .withIndex("by_published_order", (q) => q.eq("isPublished", true))
      .take(500);

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
    await requirePluginEnabled(ctx, "knowledgeBase");
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
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageCategories");

    const category = await ctx.db.get("kb_categories", args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found" });
    }

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
      // Prevent self-parenting
      if (args.parentId === args.categoryId) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Category cannot be its own parent" });
      }
      // Prevent circular parenting (A -> B -> A)
      if (args.parentId) {
        let current = await ctx.db.get("kb_categories", args.parentId);
        while (current) {
          if (current._id === args.categoryId) {
            throw new ConvexError({
              code: "VALIDATION_ERROR",
              message: "Circular parent reference detected: this would create a cycle",
            });
          }
          current = current.parentId ? await ctx.db.get("kb_categories", current.parentId) : null;
        }
      }
      updates.parentId = args.parentId;
    }
    if (args.isPublished !== undefined) updates.isPublished = args.isPublished;

    await ctx.db.patch("kb_categories", args.categoryId, updates);
    return args.categoryId;
  },
});

// ─── Reorder ────────────────────────────────────────────────────────────────

export const reorder = mutation({
  args: reorderCategoryArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageCategories");

    const category = await ctx.db.get("kb_categories", args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found" });
    }

    await ctx.db.patch("kb_categories", args.categoryId, {
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
    await requirePluginEnabled(ctx, "knowledgeBase");
    const user = await requireCan(ctx, "kb.manageCategories");

    const category = await ctx.db.get("kb_categories", args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found" });
    }

    // Move child categories to parent (or root)
    const children = await ctx.db
      .query("kb_categories")
      .withIndex("by_parent", (q) => q.eq("parentId", args.categoryId))
      .take(200);
    for (const child of children) {
      await ctx.db.patch("kb_categories", child._id, {
        parentId: category.parentId,
        updatedAt: Date.now(),
      });
    }

    // Unassign articles from this category
    const articles = await ctx.db
      .query("kb_articles")
      .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
      .take(1000);
    for (const article of articles) {
      await ctx.db.patch("kb_articles", article._id, {
        categoryId: undefined,
        meilisearchSynced: false,
        ragSynced: false,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.delete("kb_categories", args.categoryId);
    return args.categoryId;
  },
});
