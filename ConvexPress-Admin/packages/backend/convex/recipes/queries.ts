import { ConvexError, v } from "convex/values";

import { query } from "../_generated/server";
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

async function enrichCategories(ctx: any, categoryIds: readonly string[]): Promise<Array<{ _id: string; name: string; slug: string; color?: string } | null>> {
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

export const listCategories: import("convex/server").RegisteredQuery<"public", Record<string, never>, import("../_generated/dataModel").Doc<"recipe_categories">[] | null> = query({
  args: {},
  returns: v.union(v.array(v.object({ _id: v.id("recipe_categories"), _creationTime: v.number(), ...recipeTables.recipe_categories.validator.fields })), v.null()),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "recipes"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user || user.status !== "active" || !(await currentUserCan(ctx, "post.create") || await currentUserCan(ctx, "post.update") || await currentUserCan(ctx, "manage_options"))) return [];
    const categories = await ctx.db.query("recipe_categories").withIndex("by_name").take(200);
    categories.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return categories;
  },
});

export const list: import("convex/server").RegisteredQuery<"public", { search?: string; status?: import("../_generated/dataModel").Doc<"recipes">["status"] }, Array<import("../_generated/dataModel").Doc<"recipes"> & { categories: Awaited<ReturnType<typeof enrichCategories>> }>> = query({
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

export const counts: import("convex/server").RegisteredQuery<"public", Record<string, never>, { enabled: boolean; all: number; draft: number; published: number; trash: number } | null> = query({
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const get = query({
  args: getRecipeArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "recipes"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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

/** Legacy numbered-page archive. Refuse overflow instead of claiming a truncated
 * total is complete. Cursor-based archive replacement remains tracked separately. */
export const listPublished: import("convex/server").RegisteredQuery<"public", { page?: number; perPage?: number; categorySlug?: string }, PublicRecipeList | null> = query({
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

export const getBySlug: import("convex/server").RegisteredQuery<"public", {slug:string}, PublicRecipe | null> = query({
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

export const getCategoryBySlug: import("convex/server").RegisteredQuery<"public", {slug:string}, PublicRecipeCategory | null> = query({
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
