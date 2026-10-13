import { ConvexError, v } from "convex/values";

import { query, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getCurrentUser, currentUserCan } from "../helpers/permissions";
import { createPublicRecipeReader, publicCategory, publicRecipeCategoryValidator, publicRecipeValidator, publicRecipeListValidator, type PublicRecipe, type PublicRecipeCategory, type PublicRecipeList } from "./publicRead";
import {
  getRecipeArgs,
  getRecipeBySlugArgs,
  listPublicRecipesArgs,
  listRecipesArgs,
} from "./validators";
import { isPluginEnabled } from "../helpers/plugins";
import { recipeTables } from "../schema/recipes";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

type ReadCtx = Pick<QueryCtx, "db">;

async function getRoleLevel(ctx: ReadCtx, roleId: Id<"roles"> | undefined) {
  if (!roleId) return 0;
  const role = await ctx.db.get("roles", roleId);
  return role?.level ?? 0;
}

async function isRecipesEnabled(ctx: ReadCtx) {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", "plugins"))
    .unique();
  const values: unknown = doc?.values;
  return !(
    typeof values === "object" &&
    values !== null &&
    "recipesEnabled" in values &&
    values.recipesEnabled === false
  );
}

interface RecipeCategorySummary {
  _id: Id<"recipe_categories">;
  name: string;
  slug: string;
  color?: string;
}

async function enrichCategories(
  ctx: ReadCtx,
  categoryIds: readonly Id<"recipe_categories">[],
): Promise<RecipeCategorySummary[]> {
  const categories = await Promise.all(
    categoryIds.map(async (categoryId): Promise<RecipeCategorySummary | null> => {
      const category = await ctx.db.get("recipe_categories", categoryId);
      if (!category) return null;
      return {
        _id: category._id,
        name: category.name,
        slug: category.slug,
        color: category.color,
      };
    }),
  );
  return categories.filter((category): category is RecipeCategorySummary => category !== null);
}

export const listCategories = query({
  args: {},
  returns: v.union(v.array(v.object({ _id: v.id("recipe_categories"), _creationTime: v.number(), ...recipeTables.recipe_categories.validator.fields })), v.null()),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "recipes"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user || user.status !== "active" || !(await currentUserCan(ctx, "post.create") || await currentUserCan(ctx, "post.update") || await currentUserCan(ctx, "manage_options"))) return [];
    const categories = await ctx.db.query("recipe_categories").withIndex("by_name").take(200);
    categories.sort((a, b) => a.name.localeCompare(b.name));
    return categories;
  },
});

export const list = query({
  args: listRecipesArgs,
  returns: v.array(v.object({
    categories: v.array(v.object({
      _id: v.id("recipe_categories"),
      name: v.string(),
      slug: v.string(),
      color: v.optional(v.string()),
    })),
    _id: v.id("recipes"),
    _creationTime: v.number(),
    description: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    featuredImageId: v.optional(v.id("media")),
    publishedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    scanMediaId: v.optional(v.id("media")),
    prepMinutes: v.optional(v.number()),
    cookMinutes: v.optional(v.number()),
    totalMinutes: v.optional(v.number()),
    servings: v.optional(v.string()),
    yieldText: v.optional(v.string()),
    difficulty: v.optional(v.union(v.literal("medium"), v.literal("easy"), v.literal("hard"))),
    nutrition: v.optional(v.object({
      calories: v.optional(v.string()),
      protein: v.optional(v.string()),
      carbs: v.optional(v.string()),
      fat: v.optional(v.string()),
      fiber: v.optional(v.string()),
      sugar: v.optional(v.string()),
    })),
    scannedText: v.optional(v.string()),
    title: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
    status: v.union(v.literal("draft"), v.literal("trash"), v.literal("publish")),
    slug: v.string(),
    authorId: v.id("users"),
    instructions: v.array(v.string()),
    isFeatured: v.boolean(),
    categoryIds: v.array(v.id("recipe_categories")),
    ingredients: v.array(v.string()),
    aiExtractedFromScan: v.boolean(),
  })),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "recipes"))) return [];
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const roleLevel = await getRoleLevel(ctx, user.roleId);
    const allRecipes = await ctx.db.query("recipes").take(500);
    const searchLower = args.search?.trim().toLowerCase();

    let filtered = allRecipes.filter((recipe) =>
      roleLevel >= 80 ? true : recipe.authorId.toString() === user._id.toString(),
    );

    if (args.status) {
      filtered = filtered.filter((recipe) => recipe.status === args.status);
    } else {
      filtered = filtered.filter((recipe) => recipe.status !== "trash");
    }

    if (searchLower) {
      filtered = filtered.filter(
        (recipe) =>
          recipe.title.toLowerCase().includes(searchLower) ||
          recipe.slug.toLowerCase().includes(searchLower),
      );
    }

    filtered.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

    return Promise.all(
      filtered.map(async (recipe) => ({
        ...recipe,
        categories: await enrichCategories(ctx, recipe.categoryIds),
      })),
    );
  },
});

export const counts = query({
  args: {},
  returns: v.union(v.null(), v.object({
    enabled: v.boolean(),
    all: v.number(),
    draft: v.number(),
    published: v.number(),
    trash: v.number(),
  })),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "recipes"))) return null;
    const enabled = await isRecipesEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const roleLevel = await getRoleLevel(ctx, user.roleId);
    const visibleRecipes = (await ctx.db.query("recipes").take(1000)).filter(
      (recipe) =>
        roleLevel >= 80 || recipe.authorId.toString() === user._id.toString(),
    );

    return {
      enabled,
      all: visibleRecipes.filter((recipe) => recipe.status !== "trash").length,
      draft: visibleRecipes.filter((recipe) => recipe.status === "draft")
        .length,
      published: visibleRecipes.filter((recipe) => recipe.status === "publish")
        .length,
      trash: visibleRecipes.filter((recipe) => recipe.status === "trash")
        .length,
    };
  },
});

export const get = query({
  args: getRecipeArgs,
  returns: v.union(v.null(), v.object({
    categories: v.array(v.object({
      _id: v.id("recipe_categories"),
      name: v.string(),
      slug: v.string(),
      color: v.optional(v.string()),
    })),
    _id: v.id("recipes"),
    _creationTime: v.number(),
    description: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    featuredImageId: v.optional(v.id("media")),
    publishedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    scanMediaId: v.optional(v.id("media")),
    prepMinutes: v.optional(v.number()),
    cookMinutes: v.optional(v.number()),
    totalMinutes: v.optional(v.number()),
    servings: v.optional(v.string()),
    yieldText: v.optional(v.string()),
    difficulty: v.optional(v.union(v.literal("medium"), v.literal("easy"), v.literal("hard"))),
    nutrition: v.optional(v.object({
      calories: v.optional(v.string()),
      protein: v.optional(v.string()),
      carbs: v.optional(v.string()),
      fat: v.optional(v.string()),
      fiber: v.optional(v.string()),
      sugar: v.optional(v.string()),
    })),
    scannedText: v.optional(v.string()),
    title: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
    status: v.union(v.literal("draft"), v.literal("trash"), v.literal("publish")),
    slug: v.string(),
    authorId: v.id("users"),
    instructions: v.array(v.string()),
    isFeatured: v.boolean(),
    categoryIds: v.array(v.id("recipe_categories")),
    ingredients: v.array(v.string()),
    aiExtractedFromScan: v.boolean(),
  })),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "recipes"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const recipe = await ctx.db.get("recipes", args.recipeId);
    if (!recipe) return null;

    const roleLevel = await getRoleLevel(ctx, user.roleId);
    if (roleLevel < 80 && recipe.authorId.toString() !== user._id.toString()) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot access this recipe",
      });
    }

    return {
      ...recipe,
      categories: await enrichCategories(
        ctx,
        recipe.categoryIds,
      ),
    };
  },
});

/** Legacy numbered-page archive. Refuse overflow instead of claiming a truncated
 * total is complete. Cursor-based archive replacement remains tracked separately. */
export const listPublished = query({
  args: listPublicRecipesArgs,
  returns: v.union(publicRecipeListValidator, v.null()),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "recipes"))) return null;
    const page = Math.max(1, Number.isFinite(args.page) ? Math.floor(args.page ?? 1) : 1);
    const perPage = Math.min(24, Math.max(1, Number.isFinite(args.perPage) ? Math.floor(args.perPage ?? 12) : 12));
    const empty: PublicRecipeList = { recipes: [], page, perPage, total: 0, totalPages: 0, category: null };
    const reader = createPublicRecipeReader(ctx);
    if (!await reader.allowed("/recipes")) return empty;
    let category: PublicRecipeCategory | null = null;
    if (args.categorySlug) {
      const slug = slugify(args.categorySlug);
      if (!await reader.allowed(`/recipes/category/${slug}`)) return empty;
      reader.budget.beforeRead();
      const row = reader.budget.record(await ctx.db.query("recipe_categories").withIndex("by_slug", q => q.eq("slug", slug)).unique());
      if (!row) return empty;
      category = publicCategory(row);
    }
    reader.budget.beforeRead();
    const rows = await ctx.db.query("recipes").withIndex("by_status_published", q => q.eq("status", "publish").lte("publishedAt", Date.now())).order("desc").take(1001);
    if (rows.length > 1000) throw new ConvexError({ code: "RECIPE_ARCHIVE_LIMIT", message: "This recipe archive exceeds the numbered-page read limit." });
    const visible = [];
    for (const row of rows) {
      reader.budget.record(row);
      if (category && !row.categoryIds.includes(category._id)) continue;
      if (await reader.visible(row)) visible.push(row);
    }
    visible.sort((a,b) => (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt));
    const total = visible.length;
    const recipes: PublicRecipe[] = [];
    for (const row of visible.slice((page - 1) * perPage, page * perPage)) recipes.push(await reader.project(row));
    return { recipes, page, perPage, total, totalPages: total === 0 ? 0 : Math.ceil(total / perPage), category };
  },
});

export const getBySlug = query({
  args: getRecipeBySlugArgs,
  returns: v.union(publicRecipeValidator, v.null()),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "recipes"))) return null;
    const reader = createPublicRecipeReader(ctx);
    const slug = slugify(args.slug);
    if (!await reader.allowed("/recipes") || !await reader.allowed(`/recipes/${slug}`)) return null;
    reader.budget.beforeRead();
    const recipe = reader.budget.record(await ctx.db.query("recipes").withIndex("by_slug", q => q.eq("slug", slug)).unique());
    return recipe && await reader.visible(recipe) ? reader.project(recipe) : null;
  },
});

export const getCategoryBySlug = query({
  args: { slug: getRecipeBySlugArgs.slug },
  returns: v.union(publicRecipeCategoryValidator, v.null()),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "recipes"))) return null;
    const reader = createPublicRecipeReader(ctx);
    const slug = slugify(args.slug);
    if (!await reader.allowed("/recipes") || !await reader.allowed(`/recipes/category/${slug}`)) return null;
    reader.budget.beforeRead();
    const category = reader.budget.record(await ctx.db.query("recipe_categories").withIndex("by_slug", q => q.eq("slug", slug)).unique());
    return category ? publicCategory(category) : null;
  },
});
