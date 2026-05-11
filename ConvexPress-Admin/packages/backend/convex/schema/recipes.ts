import { defineTable } from "convex/server";
import { v } from "convex/values";

export const recipeStatusValidator = v.union(
  v.literal("draft"),
  v.literal("publish"),
  v.literal("trash"),
);

export const recipeDifficultyValidator = v.union(
  v.literal("easy"),
  v.literal("medium"),
  v.literal("hard"),
);

export const recipeNutritionValidator = v.object({
  calories: v.optional(v.string()),
  protein: v.optional(v.string()),
  carbs: v.optional(v.string()),
  fat: v.optional(v.string()),
  fiber: v.optional(v.string()),
  sugar: v.optional(v.string()),
});

export const recipeTables = {
  recipe_categories: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    recipeCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_name", ["name"])
    .index("by_count", ["recipeCount"]),

  recipes: defineTable({
    title: v.string(),
    slug: v.string(),
    excerpt: v.optional(v.string()),
    description: v.optional(v.string()),
    status: recipeStatusValidator,
    authorId: v.id("users"),
    featuredImageId: v.optional(v.id("media")),
    scanMediaId: v.optional(v.id("media")),
    categoryIds: v.array(v.id("recipe_categories")),
    prepMinutes: v.optional(v.number()),
    cookMinutes: v.optional(v.number()),
    totalMinutes: v.optional(v.number()),
    servings: v.optional(v.string()),
    yieldText: v.optional(v.string()),
    difficulty: v.optional(recipeDifficultyValidator),
    ingredients: v.array(v.string()),
    instructions: v.array(v.string()),
    notes: v.optional(v.string()),
    nutrition: v.optional(recipeNutritionValidator),
    scannedText: v.optional(v.string()),
    aiExtractedFromScan: v.boolean(),
    isFeatured: v.boolean(),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_author", ["authorId"])
    .index("by_status_published", ["status", "publishedAt"])
    .index("by_featured", ["isFeatured"])
    .searchIndex("search_recipes", {
      searchField: "title",
      filterFields: ["status", "authorId"],
    }),
};
