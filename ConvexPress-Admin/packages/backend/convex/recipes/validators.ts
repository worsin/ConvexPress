import { v } from "convex/values";

import {
  recipeDifficultyValidator,
  recipeNutritionValidator,
  recipeStatusValidator,
} from "../schema/recipes";

export const createCategoryArgs = {
  name: v.string(),
  description: v.optional(v.string()),
  color: v.optional(v.string()),
};

export const updateCategoryArgs = {
  categoryId: v.id("recipe_categories"),
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  color: v.optional(v.string()),
};

export const deleteCategoryArgs = {
  categoryId: v.id("recipe_categories"),
};

export const listRecipesArgs = {
  search: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  status: v.optional(recipeStatusValidator),
};

export const getRecipeArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  recipeId: v.id("recipes"),
};

export const getRecipeBySlugArgs = {
  slug: v.string(),
};

export const listPublicRecipesArgs = {
  page: v.optional(v.number()),
  perPage: v.optional(v.number()),
  categorySlug: v.optional(v.string()),
};

export const createRecipeArgs = {
  title: v.string(),
  slug: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  description: v.optional(v.string()),
  status: v.optional(recipeStatusValidator),
  featuredImageId: v.optional(v.id("media")),
  scanMediaId: v.optional(v.id("media")),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  categoryIds: v.optional(v.array(v.id("recipe_categories"))),
  prepMinutes: v.optional(v.number()),
  cookMinutes: v.optional(v.number()),
  totalMinutes: v.optional(v.number()),
  servings: v.optional(v.string()),
  yieldText: v.optional(v.string()),
  difficulty: v.optional(recipeDifficultyValidator),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  ingredients: v.optional(v.array(v.string())),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  instructions: v.optional(v.array(v.string())),
  notes: v.optional(v.string()),
  nutrition: v.optional(recipeNutritionValidator),
  scannedText: v.optional(v.string()),
  aiExtractedFromScan: v.optional(v.boolean()),
  isFeatured: v.optional(v.boolean()),
};

export const updateRecipeArgs = {
  recipeId: v.id("recipes"),
  title: v.optional(v.string()),
  slug: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  description: v.optional(v.string()),
  status: v.optional(recipeStatusValidator),
  featuredImageId: v.optional(v.id("media")),
  scanMediaId: v.optional(v.id("media")),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  categoryIds: v.optional(v.array(v.id("recipe_categories"))),
  prepMinutes: v.optional(v.number()),
  cookMinutes: v.optional(v.number()),
  totalMinutes: v.optional(v.number()),
  servings: v.optional(v.string()),
  yieldText: v.optional(v.string()),
  difficulty: v.optional(recipeDifficultyValidator),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  ingredients: v.optional(v.array(v.string())),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  instructions: v.optional(v.array(v.string())),
  notes: v.optional(v.string()),
  nutrition: v.optional(recipeNutritionValidator),
  scannedText: v.optional(v.string()),
  aiExtractedFromScan: v.optional(v.boolean()),
  isFeatured: v.optional(v.boolean()),
  publishedAt: v.optional(v.number()),
};

export const trashRecipeArgs = {
  recipeId: v.id("recipes"),
};

export const extractRecipeFromImageArgs = {
  mediaId: v.id("media"),
};
