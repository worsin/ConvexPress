import { ConvexError } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";
import {
  createCommerceCategoryArgs,
  removeCommerceCategoryArgs,
  updateCommerceCategoryArgs,
} from "./validators";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function getUniqueCategorySlug(
  ctx: any,
  value: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(value) || `category-${Date.now()}`;
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("commerce_product_categories")
      .withIndex("by_slug", (q: any) => q.eq("slug", candidate))
      .unique();

    if (!existing || existing._id.toString() === excludeId) {
      return candidate;
    }

    candidate = `${base}-${suffix++}`;
  }
}

async function recomputeProductCategoryCount(ctx: any, categoryId: string) {
  const products = await ctx.db.query("commerce_products").take(5000);
  const count = products.filter(
    (product: any) =>
      product.status === "publish" &&
      product.categoryIds.some((id: any) => id.toString() === categoryId),
  ).length;

  await ctx.db.patch(categoryId as any, {
    productCount: count,
    updatedAt: Date.now(),
  });
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireCommerceEnabled(ctx);
    const categories = await ctx.db.query("commerce_product_categories").take(500);
    categories.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return categories;
  },
});

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    await requireCommerceEnabled(ctx);
    const categories = await ctx.db.query("commerce_product_categories").take(500);
    categories.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return categories.filter((category: any) => category.productCount > 0);
  },
});

export const create = mutation({
  args: createCommerceCategoryArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Category name is required.",
      });
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Parent category not found.",
        });
      }
    }

    const now = Date.now();
    return ctx.db.insert("commerce_product_categories", {
      name,
      slug: await getUniqueCategorySlug(ctx, name),
      description: args.description?.trim() || undefined,
      parentId: args.parentId,
      thumbnailMediaId: args.thumbnailMediaId,
      productCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: updateCommerceCategoryArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Category not found.",
      });
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Category name is required.",
        });
      }
      patch.name = name;
      patch.slug = await getUniqueCategorySlug(
        ctx,
        name,
        args.categoryId.toString(),
      );
    }

    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }

    if (args.parentId !== undefined) {
      patch.parentId = args.parentId;
    }

    if (args.thumbnailMediaId !== undefined) {
      patch.thumbnailMediaId = args.thumbnailMediaId ?? undefined;
    }

    await ctx.db.patch(args.categoryId, patch);
    await recomputeProductCategoryCount(ctx, args.categoryId.toString());
    return args.categoryId;
  },
});

export const remove = mutation({
  args: removeCommerceCategoryArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const category = await ctx.db.get(args.categoryId);
    if (!category) return null;

    const products = await ctx.db.query("commerce_products").take(5000);
    const inUse = products.some((product: any) =>
      product.categoryIds.some((id: any) => id.toString() === args.categoryId.toString()),
    );

    if (inUse) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Remove this category from products before deleting it.",
      });
    }

    await ctx.db.delete(args.categoryId);
    return args.categoryId;
  },
});
