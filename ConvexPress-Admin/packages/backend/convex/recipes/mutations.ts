import { ConvexError } from "convex/values";

import { mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import {
  createCategoryArgs,
  createRecipeArgs,
  deleteCategoryArgs,
  trashRecipeArgs,
  updateCategoryArgs,
  updateRecipeArgs,
} from "./validators";
import { requirePluginEnabled } from "../helpers/plugins";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function getUniqueRecipeSlug(ctx: any, seed: string, excludeId?: string) {
  const base = slugify(seed) || "recipe";
  let slug = base;
  let counter = 2;

  while (true) {
    const existing = await ctx.db
      .query("recipes")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .unique();
    if (!existing || existing._id.toString() === excludeId) {
      return slug;
    }
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

async function getUniqueCategorySlug(
  ctx: any,
  seed: string,
  excludeId?: string,
) {
  const base = slugify(seed) || "category";
  let slug = base;
  let counter = 2;

  while (true) {
    const existing = await ctx.db
      .query("recipe_categories")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .unique();
    if (!existing || existing._id.toString() === excludeId) {
      return slug;
    }
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

async function getRoleLevel(ctx: any, roleId: string | undefined) {
  if (!roleId) return 0;
  const role = await ctx.db.get("roles", roleId as any);
  return role?.level ?? 0;
}

function sanitizeTextList(items: readonly string[] | undefined) {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  return (items ?? []).map((item) => item.trim()).filter(Boolean);
}

async function recomputeCategoryCounts(ctx: any, categoryIds: readonly string[]) {
  if (categoryIds.length === 0) return;
  const recipes = await ctx.db.query("recipes").take(5000);
  for (const categoryId of categoryIds) {
    const count = recipes.filter(
      (recipe: { status: string; categoryIds: Array<{ toString(): string }> }) =>
        recipe.status === "publish" &&
        recipe.categoryIds.some(
          (entry: { toString(): string }) => entry.toString() === categoryId,
        ),
    ).length;
    await ctx.db.patch("recipe_categories", categoryId as any, {
      recipeCount: count,
      updatedAt: Date.now(),
    });
  }
}

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createCategory = mutation({
  args: createCategoryArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "recipes");
    await requireCan(ctx, "manage_options");

    const trimmedName = args.name.trim();
    if (!trimmedName) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Category name is required",
      });
    }

    const slug = await getUniqueCategorySlug(ctx, trimmedName);
    const now = Date.now();

    return ctx.db.insert("recipe_categories", {
      name: trimmedName,
      slug,
      description: args.description?.trim(),
      color: args.color?.trim(),
      recipeCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateCategory = mutation({
  args: updateCategoryArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "recipes");
    await requireCan(ctx, "manage_options");

    const category = await ctx.db.get("recipe_categories", args.categoryId);
    if (!category) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Recipe category not found",
      });
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      const trimmedName = args.name.trim();
      if (!trimmedName) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Category name is required",
        });
      }
      patch.name = trimmedName;
      patch.slug = await getUniqueCategorySlug(
        ctx,
        trimmedName,
        args.categoryId.toString(),
      );
    }

    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }
    if (args.color !== undefined) {
      patch.color = args.color.trim() || undefined;
    }

    await ctx.db.patch("recipe_categories", args.categoryId, patch);
    return args.categoryId;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deleteCategory = mutation({
  args: deleteCategoryArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "recipes");
    await requireCan(ctx, "manage_options");

    const category = await ctx.db.get("recipe_categories", args.categoryId);
    if (!category) return null;

    const recipes = await ctx.db.query("recipes").take(5000);
    for (const recipe of recipes) {
      if (
        recipe.categoryIds.some(
          (categoryId: any) => categoryId.toString() === args.categoryId.toString(),
        )
      ) {
        await ctx.db.patch("recipes", recipe._id, {
          categoryIds: recipe.categoryIds.filter(
            (categoryId: any) =>
              categoryId.toString() !== args.categoryId.toString(),
          ),
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.delete("recipe_categories", args.categoryId);
    return args.categoryId;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createRecipe = mutation({
  args: createRecipeArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "recipes");
    const user = await requireCan(ctx, "post.create");
    const now = Date.now();
    const status = args.status ?? "draft";
    const title = args.title.trim();
    if (!title) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Recipe title is required",
      });
    }

    const slug = await getUniqueRecipeSlug(ctx, args.slug ?? title);
    const recipeId = await ctx.db.insert("recipes", {
      title,
      slug,
      excerpt: args.excerpt?.trim(),
      description: args.description?.trim(),
      status,
      authorId: user._id,
      featuredImageId: args.featuredImageId,
      scanMediaId: args.scanMediaId,
      categoryIds: args.categoryIds ?? [],
      prepMinutes: args.prepMinutes,
      cookMinutes: args.cookMinutes,
      totalMinutes:
        args.totalMinutes ??
        ((args.prepMinutes ?? 0) + (args.cookMinutes ?? 0) || undefined),
      servings: args.servings?.trim(),
      yieldText: args.yieldText?.trim(),
      difficulty: args.difficulty,
      ingredients: sanitizeTextList(args.ingredients),
      instructions: sanitizeTextList(args.instructions),
      notes: args.notes?.trim(),
      nutrition: args.nutrition,
      scannedText: args.scannedText?.trim(),
      aiExtractedFromScan: args.aiExtractedFromScan ?? false,
      isFeatured: args.isFeatured ?? false,
      publishedAt: status === "publish" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    await recomputeCategoryCounts(
      ctx,
      (args.categoryIds ?? []).map((id: any) => id.toString()),
    );

    return recipeId;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateRecipe = mutation({
  args: updateRecipeArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "recipes");
    const user = await requireCan(ctx, "post.update");
    const recipe = await ctx.db.get("recipes", args.recipeId);
    if (!recipe) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Recipe not found",
      });
    }

    const roleLevel = await getRoleLevel(ctx, user.roleId?.toString());
    if (roleLevel < 80 && recipe.authorId.toString() !== user._id.toString()) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only edit your own recipes",
      });
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Recipe title is required",
        });
      }
      patch.title = title;
    }

    if (args.slug !== undefined || args.title !== undefined) {
      patch.slug = await getUniqueRecipeSlug(
        ctx,
        args.slug ?? args.title ?? recipe.slug,
        args.recipeId.toString(),
      );
    }

    if (args.excerpt !== undefined) patch.excerpt = args.excerpt.trim() || undefined;
    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }
    if (args.status !== undefined) {
      patch.status = args.status;
      if (args.status === "publish" && !recipe.publishedAt) {
        patch.publishedAt = Date.now();
      }
    }
    if (args.featuredImageId !== undefined) {
      patch.featuredImageId = args.featuredImageId;
    }
    if (args.scanMediaId !== undefined) patch.scanMediaId = args.scanMediaId;
    if (args.categoryIds !== undefined) patch.categoryIds = args.categoryIds;
    if (args.prepMinutes !== undefined) patch.prepMinutes = args.prepMinutes;
    if (args.cookMinutes !== undefined) patch.cookMinutes = args.cookMinutes;
    if (args.totalMinutes !== undefined) patch.totalMinutes = args.totalMinutes;
    if (args.servings !== undefined) patch.servings = args.servings.trim() || undefined;
    if (args.yieldText !== undefined) patch.yieldText = args.yieldText.trim() || undefined;
    if (args.difficulty !== undefined) patch.difficulty = args.difficulty;
    if (args.ingredients !== undefined) {
      patch.ingredients = sanitizeTextList(args.ingredients);
    }
    if (args.instructions !== undefined) {
      patch.instructions = sanitizeTextList(args.instructions);
    }
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    if (args.nutrition !== undefined) patch.nutrition = args.nutrition;
    if (args.scannedText !== undefined) {
      patch.scannedText = args.scannedText.trim() || undefined;
    }
    if (args.aiExtractedFromScan !== undefined) {
      patch.aiExtractedFromScan = args.aiExtractedFromScan;
    }
    if (args.isFeatured !== undefined) patch.isFeatured = args.isFeatured;
    if (args.publishedAt !== undefined) patch.publishedAt = args.publishedAt;

    if (
      patch.totalMinutes === undefined &&
      (args.prepMinutes !== undefined || args.cookMinutes !== undefined)
    ) {
      patch.totalMinutes =
        (args.prepMinutes ?? recipe.prepMinutes ?? 0) +
          (args.cookMinutes ?? recipe.cookMinutes ?? 0) || undefined;
    }

    await ctx.db.patch("recipes", args.recipeId, patch);

    const categoryIds = new Set<string>([
      ...recipe.categoryIds.map((id: any) => id.toString()),
      ...(args.categoryIds ?? []).map((id: any) => id.toString()),
    ]);
    await recomputeCategoryCounts(ctx, [...categoryIds]);

    return args.recipeId;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const trashRecipe = mutation({
  args: trashRecipeArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "recipes");
    const user = await requireCan(ctx, "post.trash");
    const recipe = await ctx.db.get("recipes", args.recipeId);
    if (!recipe) return null;

    const roleLevel = await getRoleLevel(ctx, user.roleId?.toString());
    if (roleLevel < 80 && recipe.authorId.toString() !== user._id.toString()) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only trash your own recipes",
      });
    }

    await ctx.db.patch("recipes", args.recipeId, {
      status: "trash",
      updatedAt: Date.now(),
    });
    await recomputeCategoryCounts(
      ctx,
      recipe.categoryIds.map((id: any) => id.toString()),
    );
    return args.recipeId;
  },
});
