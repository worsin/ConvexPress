import { v, type Validator } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { recipeDifficultyValidator, recipeNutritionValidator } from "../schema/recipes";
import { createMembershipAccessEvaluator } from "../membership/access";
import { RequestReadLedger } from "../helpers/requestReadLedger";

export interface PublicRecipeCategory {
  _id: Id<"recipe_categories">; name: string; slug: string; description?: string; color?: string;
}
export interface PublicRecipe {
  _id: Id<"recipes">; title: string; slug: string; excerpt?: string; description?: string;
  featuredImageId?: Id<"media">; categories: PublicRecipeCategory[];
  prepMinutes?: number; cookMinutes?: number; totalMinutes?: number; servings?: string; yieldText?: string;
  difficulty?: "easy" | "medium" | "hard"; ingredients: string[]; instructions: string[]; notes?: string;
  nutrition?: { calories?: string; protein?: string; carbs?: string; fat?: string; fiber?: string; sugar?: string };
}
export interface PublicRecipeList {
  recipes: PublicRecipe[]; page: number; perPage: number; total: number; totalPages: number; category: PublicRecipeCategory | null;
}

export const publicRecipeCategoryValidator: Validator<PublicRecipeCategory> = v.object({
  _id: v.id("recipe_categories"), name: v.string(), slug: v.string(),
  description: v.optional(v.string()), color: v.optional(v.string()),
});
export const publicRecipeValidator: Validator<PublicRecipe> = v.object({
  _id: v.id("recipes"), title: v.string(), slug: v.string(),
  excerpt: v.optional(v.string()), description: v.optional(v.string()),
  featuredImageId: v.optional(v.id("media")),
  categories: v.array(publicRecipeCategoryValidator),
  prepMinutes: v.optional(v.number()), cookMinutes: v.optional(v.number()), totalMinutes: v.optional(v.number()),
  servings: v.optional(v.string()), yieldText: v.optional(v.string()), difficulty: v.optional(recipeDifficultyValidator),
  ingredients: v.array(v.string()), instructions: v.array(v.string()), notes: v.optional(v.string()),
  nutrition: v.optional(recipeNutritionValidator),
});
export const publicRecipeListValidator: Validator<PublicRecipeList> = v.object({
  recipes: v.array(publicRecipeValidator), page: v.number(), perPage: v.number(),
  total: v.number(), totalPages: v.number(), category: v.union(publicRecipeCategoryValidator, v.null()),
});

export function publicCategory(row: Doc<"recipe_categories">): PublicRecipeCategory {
  return { _id: row._id, name: row.name, slug: row.slug, description: row.description, color: row.color };
}

/** Request-local authority and projection caches; never shared between viewers. */
export function createPublicRecipeReader(ctx: QueryCtx, now = Date.now()) {
  const budget = new RequestReadLedger();
  const evaluate = createMembershipAccessEvaluator(ctx, budget);
  const routeResults = new Map<string, Promise<boolean>>();
  const categoryResults = new Map<string, Promise<PublicRecipeCategory | null>>();
  const imageResults = new Map<string, Promise<Id<"media"> | undefined>>();
  function allowed(route: string): Promise<boolean> {
    let result = routeResults.get(route);
    if (!result) {
      result = evaluate({ resourceType: "route", resourceIdOrKey: route }).then(result => result.allowed);
      routeResults.set(route, result);
    }
    return result;
  }
  async function category(id: Id<"recipe_categories">): Promise<PublicRecipeCategory | null> {
    let result = categoryResults.get(id);
    if (!result) {
      result = (async () => {
        budget.beforeRead();
        const row = budget.record(await ctx.db.get("recipe_categories", id));
        return row && await allowed(`/recipes/category/${row.slug}`) ? publicCategory(row) : null;
      })();
      categoryResults.set(id, result);
    }
    return result;
  }
  async function image(id: Id<"media">): Promise<Id<"media"> | undefined> {
    let result = imageResults.get(id);
    if (!result) {
      result = (async () => {
        budget.beforeRead();
        const row = budget.record(await ctx.db.get("media", id));
        return row?.status === "active" && row.mimeType?.startsWith("image/") ? row._id : undefined;
      })();
      imageResults.set(id, result);
    }
    return result;
  }
  async function visible(recipe: Doc<"recipes">): Promise<boolean> {
    return recipe.status === "publish" && (recipe.publishedAt === undefined || recipe.publishedAt <= now)
      && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipe.slug) && recipe.slug.length <= 120
      && await allowed("/recipes") && await allowed(`/recipes/${recipe.slug}`);
  }
  async function project(recipe: Doc<"recipes">): Promise<PublicRecipe> {
    const categories: PublicRecipeCategory[] = [];
    for (const id of recipe.categoryIds) {
      const value = await category(id);
      if (value) categories.push(value);
    }
    return {
      _id: recipe._id, title: recipe.title, slug: recipe.slug,
      excerpt: recipe.excerpt, description: recipe.description,
      featuredImageId: recipe.featuredImageId ? await image(recipe.featuredImageId) : undefined,
      categories, prepMinutes: recipe.prepMinutes, cookMinutes: recipe.cookMinutes, totalMinutes: recipe.totalMinutes,
      servings: recipe.servings, yieldText: recipe.yieldText, difficulty: recipe.difficulty,
      ingredients: recipe.ingredients, instructions: recipe.instructions, notes: recipe.notes, nutrition: recipe.nutrition,
    };
  }
  return { budget, allowed, visible, project };
}
