import { ConvexError } from "convex/values";

import { query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import {
  getRecipeArgs,
  getRecipeBySlugArgs,
  listPublicRecipesArgs,
  listRecipesArgs,
} from "./validators";
import { isPluginEnabled } from "../helpers/plugins";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function getRoleLevel(ctx: any, roleId: string | undefined) {
  if (!roleId) return 0;
  const role = await ctx.db.get("roles", roleId as any);
  return role?.level ?? 0;
}

async function isRecipesEnabled(ctx: any) {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q: any) => q.eq("section", "plugins"))
    .unique();
  const values = (doc?.values as Record<string, unknown> | undefined) ?? {};
  return values.recipesEnabled !== false;
}

async function enrichCategories(ctx: any, categoryIds: readonly string[]) {
  return (
    await Promise.all(
      categoryIds.map(async (categoryId) => {
        const category = await ctx.db.get(
          "recipe_categories",
          categoryId as any,
        );
        if (!category) return null;
        return {
          _id: category._id,
          name: category.name,
          slug: category.slug,
          color: category.color,
        };
      }),
    )
  ).filter(Boolean);
}

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "recipes"))) return null;
    const categories = await ctx.db.query("recipe_categories").take(200);
    categories.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return categories;
  },
});

export const list = query({
  args: listRecipesArgs,
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "recipes"))) return [];
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const roleLevel = await getRoleLevel(ctx, user.roleId?.toString());
    const allRecipes = await ctx.db.query("recipes").take(500);
    const searchLower = args.search?.trim().toLowerCase();

    let filtered = allRecipes.filter((recipe: any) =>
      roleLevel >= 80 ? true : recipe.authorId.toString() === user._id.toString(),
    );

    if (args.status) {
      filtered = filtered.filter((recipe: any) => recipe.status === args.status);
    } else {
      filtered = filtered.filter((recipe: any) => recipe.status !== "trash");
    }

    if (searchLower) {
      filtered = filtered.filter(
        (recipe: any) =>
          recipe.title.toLowerCase().includes(searchLower) ||
          recipe.slug.toLowerCase().includes(searchLower),
      );
    }

    filtered.sort((a: any, b: any) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

    return Promise.all(
      filtered.map(async (recipe: any) => ({
        ...recipe,
        categories: await enrichCategories(
          ctx,
          recipe.categoryIds.map((id: any) => id.toString()),
        ),
      })),
    );
  },
});

export const counts = query({
  args: {},
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

    const roleLevel = await getRoleLevel(ctx, user.roleId?.toString());
    const visibleRecipes = (await ctx.db.query("recipes").take(1000)).filter(
      (recipe: any) =>
        roleLevel >= 80 || recipe.authorId.toString() === user._id.toString(),
    );

    return {
      enabled,
      all: visibleRecipes.filter((recipe: any) => recipe.status !== "trash").length,
      draft: visibleRecipes.filter((recipe: any) => recipe.status === "draft")
        .length,
      published: visibleRecipes.filter((recipe: any) => recipe.status === "publish")
        .length,
      trash: visibleRecipes.filter((recipe: any) => recipe.status === "trash")
        .length,
    };
  },
});

export const get = query({
  args: getRecipeArgs,
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

    const roleLevel = await getRoleLevel(ctx, user.roleId?.toString());
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
        recipe.categoryIds.map((id: any) => id.toString()),
      ),
    };
  },
});

export const listPublished = query({
  args: listPublicRecipesArgs,
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "recipes"))) return null;
    if (!(await isRecipesEnabled(ctx))) {
      return {
        recipes: [],
        page: 1,
        perPage: 12,
        total: 0,
        totalPages: 0,
        category: null,
      };
    }

    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(24, Math.max(1, args.perPage ?? 12));
    const allRecipes = await ctx.db.query("recipes").take(1000);
    const categories = await ctx.db.query("recipe_categories").take(500);
    const category =
      args.categorySlug && args.categorySlug.length > 0
        ? categories.find((entry: any) => entry.slug === args.categorySlug) ?? null
        : null;

    let filtered = allRecipes.filter((recipe: any) => recipe.status === "publish");
    if (args.categorySlug) {
      filtered = category
        ? filtered.filter((recipe: any) =>
            recipe.categoryIds.some(
              (categoryId: any) => categoryId.toString() === category._id.toString(),
            ),
          )
        : [];
    }

    filtered.sort(
      (a: any, b: any) => (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt),
    );

    const total = filtered.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
    const start = (page - 1) * perPage;
    const items = filtered.slice(start, start + perPage);

    return {
      recipes: await Promise.all(
        items.map(async (recipe: any) => ({
          ...recipe,
          categories: await enrichCategories(
            ctx,
            recipe.categoryIds.map((id: any) => id.toString()),
          ),
        })),
      ),
      page,
      perPage,
      total,
      totalPages,
      category,
    };
  },
});

export const getBySlug = query({
  args: getRecipeBySlugArgs,
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "recipes"))) return null;
    if (!(await isRecipesEnabled(ctx))) {
      return null;
    }

    const recipe = await ctx.db
      .query("recipes")
      .withIndex("by_slug", (q: any) => q.eq("slug", slugify(args.slug)))
      .unique();

    if (!recipe || recipe.status !== "publish") {
      return null;
    }

    return {
      ...recipe,
      categories: await enrichCategories(
        ctx,
        recipe.categoryIds.map((id: any) => id.toString()),
      ),
    };
  },
});

export const getCategoryBySlug = query({
  args: { slug: getRecipeBySlugArgs.slug },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "recipes"))) return null;
    if (!(await isRecipesEnabled(ctx))) {
      return null;
    }

    return (
      (await ctx.db
        .query("recipe_categories")
        .withIndex("by_slug", (q: any) => q.eq("slug", slugify(args.slug)))
        .unique()) ?? null
    );
  },
});
