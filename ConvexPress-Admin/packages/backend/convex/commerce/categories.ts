// @ts-nocheck
import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { CATEGORY_EVENTS, SYSTEM } from "../events/constants";
import { emitEvent } from "../helpers/events";
import { requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";
import {
  createCommerceCategoryArgs,
  moveCommerceCategoryArgs,
  removeCommerceCategoryArgs,
  reorderCommerceCategoriesArgs,
  updateCommerceCategoryArgs,
} from "./validators";

const MAX_CATEGORY_DEPTH = 5;
const DEFAULT_PRODUCT_CATEGORY_NAME = "Uncategorized";
const DEFAULT_PRODUCT_CATEGORY_SLUG = "uncategorized";

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || `category-${Date.now()}`
  );
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sameId(left: unknown, right: unknown) {
  return left?.toString() === right?.toString();
}

function normalizeCategory(category: any) {
  const depth = category.depth ?? category.path?.length ?? 0;
  const productCount = category.productCount ?? 0;
  return {
    ...category,
    depth,
    path: category.path ?? [],
    sortOrder: category.sortOrder ?? 0,
    totalProductCount: category.totalProductCount ?? productCount,
    isVisible: category.isVisible ?? true,
    isFeatured: category.isFeatured ?? false,
    showInNav: category.showInNav ?? false,
  };
}

function sortCategories(categories: any[]) {
  return [...categories].sort((a, b) => {
    const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return order !== 0 ? order : a.name.localeCompare(b.name);
  });
}

function buildTree(categories: any[], parentId?: unknown): any[] {
  const normalized = categories.map(normalizeCategory);
  const children = normalized.filter((category) =>
    parentId === undefined
      ? category.parentId === undefined
      : sameId(category.parentId, parentId),
  );

  return sortCategories(children).map((category) => ({
    ...category,
    children: buildTree(normalized, category._id),
  }));
}

function collectDescendantIds(categories: any[], categoryId: unknown): Set<string> {
  const descendants = new Set<string>();
  const visit = (parentId: unknown) => {
    for (const category of categories) {
      if (sameId(category.parentId, parentId)) {
        descendants.add(category._id.toString());
        visit(category._id);
      }
    }
  };
  visit(categoryId);
  return descendants;
}

async function getUniqueCategorySlug(
  ctx: any,
  value: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(value);
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

async function getParentState(ctx: any, parentId: any) {
  if (!parentId) {
    return { path: [], depth: 0 };
  }

  const parent = await ctx.db.get("commerce_product_categories", parentId);
  if (!parent) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Parent category not found.",
    });
  }

  const parentPath = parent.path ?? [];
  const depth = parentPath.length + 1;
  if (depth >= MAX_CATEGORY_DEPTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Product categories support ${MAX_CATEGORY_DEPTH} levels.`,
    });
  }

  return { path: [...parentPath, parent._id], depth };
}

async function validateParentMove(ctx: any, categoryId: any, parentId: any) {
  if (sameId(categoryId, parentId)) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "A category cannot be its own parent.",
    });
  }

  if (parentId) {
    const parent = await ctx.db.get("commerce_product_categories", parentId);
    if (!parent) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Parent category not found.",
      });
    }

    if ((parent.path ?? []).some((id: any) => sameId(id, categoryId))) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "A category cannot be moved under one of its descendants.",
      });
    }
  }

  const categories = await ctx.db
    .query("commerce_product_categories")
    .take(10000);
  const category = categories.find((candidate: any) =>
    sameId(candidate._id, categoryId),
  );
  if (!category) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Category not found.",
    });
  }

  const parentState = await getParentState(ctx, parentId);
  let maxRelativeDepth = 0;
  const visit = (currentId: any, relativeDepth: number) => {
    maxRelativeDepth = Math.max(maxRelativeDepth, relativeDepth);
    for (const child of categories) {
      if (sameId(child.parentId, currentId)) {
        visit(child._id, relativeDepth + 1);
      }
    }
  };
  visit(categoryId, 0);

  const targetMaxDepth = parentState.depth + maxRelativeDepth;
  if (targetMaxDepth >= MAX_CATEGORY_DEPTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Moving this category would exceed the ${MAX_CATEGORY_DEPTH}-level product category limit.`,
    });
  }
}

async function updateDescendantPaths(ctx: any, categoryId: any) {
  const parent = await ctx.db.get("commerce_product_categories", categoryId);
  if (!parent) return;

  const children = await ctx.db
    .query("commerce_product_categories")
    .withIndex("by_parent", (q: any) => q.eq("parentId", categoryId))
    .collect();

  for (const child of children) {
    const path = [...(parent.path ?? []), parent._id];
    await ctx.db.patch("commerce_product_categories", child._id, {
      path,
      depth: path.length,
      updatedAt: Date.now(),
    });
    await updateDescendantPaths(ctx, child._id);
  }
}

export async function recomputeAllProductCategoryCounts(ctx: any) {
  const [categories, products] = await Promise.all([
    ctx.db.query("commerce_product_categories").take(10000),
    ctx.db.query("commerce_products").take(10000),
  ]);

  const directCounts = new Map<string, number>();
  for (const category of categories) {
    directCounts.set(category._id.toString(), 0);
  }

  for (const product of products) {
    if (product.status !== "publish") continue;
    for (const categoryId of product.categoryIds ?? []) {
      const key = categoryId.toString();
      directCounts.set(key, (directCounts.get(key) ?? 0) + 1);
    }
  }

  const descendantMap = new Map<string, Set<string>>();
  for (const category of categories) {
    descendantMap.set(
      category._id.toString(),
      collectDescendantIds(categories, category._id),
    );
  }

  for (const category of categories) {
    const key = category._id.toString();
    let total = directCounts.get(key) ?? 0;
    for (const descendantId of descendantMap.get(key) ?? []) {
      total += directCounts.get(descendantId) ?? 0;
    }

    const direct = directCounts.get(key) ?? 0;
    if (
      category.productCount !== direct ||
      (category.totalProductCount ?? category.productCount ?? 0) !== total
    ) {
      await ctx.db.patch("commerce_product_categories", category._id, {
        productCount: direct,
        totalProductCount: total,
        updatedAt: Date.now(),
      });
    }
  }
}

export async function ensureDefaultProductCategory(ctx: any) {
  const existing = await ctx.db
    .query("commerce_product_categories")
    .withIndex("by_slug", (q: any) =>
      q.eq("slug", DEFAULT_PRODUCT_CATEGORY_SLUG),
    )
    .unique();

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (!existing.name?.trim()) patch.name = DEFAULT_PRODUCT_CATEGORY_NAME;
    if (existing.parentId !== undefined) patch.parentId = undefined;
    if ((existing.path ?? []).length > 0) patch.path = [];
    if ((existing.depth ?? 0) !== 0) patch.depth = 0;
    if (existing.isVisible === undefined) patch.isVisible = true;
    if (existing.isFeatured === undefined) patch.isFeatured = false;
    if (existing.showInNav === undefined) patch.showInNav = false;
    if (existing.totalProductCount === undefined) {
      patch.totalProductCount = existing.productCount ?? 0;
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = Date.now();
      await ctx.db.patch("commerce_product_categories", existing._id, patch);
      return { ...existing, ...patch };
    }

    return existing;
  }

  const now = Date.now();
  const categoryId = await ctx.db.insert("commerce_product_categories", {
    name: DEFAULT_PRODUCT_CATEGORY_NAME,
    slug: DEFAULT_PRODUCT_CATEGORY_SLUG,
    depth: 0,
    path: [],
    sortOrder: now,
    productCount: 0,
    totalProductCount: 0,
    isVisible: true,
    isFeatured: false,
    showInNav: false,
    createdAt: now,
    updatedAt: now,
  });

  return await ctx.db.get("commerce_product_categories", categoryId);
}

export const list = query({
  args: {
    includeHidden: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const categories = await ctx.db
      .query("commerce_product_categories")
      .take(1000);

    const normalized = categories.map(normalizeCategory);
    const visible =
      args.includeHidden === false
        ? normalized.filter((category) => category.isVisible)
        : normalized;
    return sortCategories(visible);
  },
});

export const getTree = query({
  args: {
    includeHidden: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const categories = await ctx.db
      .query("commerce_product_categories")
      .take(1000);
    const visible =
      args.includeHidden === true
        ? categories
        : categories.filter((category: any) => category.isVisible ?? true);
    return buildTree(visible);
  },
});

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    await requireCommerceEnabled(ctx);
    const categories = await ctx.db
      .query("commerce_product_categories")
      .take(1000);
    return sortCategories(
      categories
        .map(normalizeCategory)
        .filter(
          (category) =>
            category.isVisible &&
            (category.totalProductCount ?? category.productCount ?? 0) > 0,
        ),
    );
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const category = await ctx.db
      .query("commerce_product_categories")
      .withIndex("by_slug", (q: any) => q.eq("slug", slugify(args.slug)))
      .unique();

    if (!category || (category.isVisible ?? true) === false) {
      return null;
    }

    const allCategories = await ctx.db
      .query("commerce_product_categories")
      .take(1000);
    const normalized = normalizeCategory(category);
    const ancestorIds = normalized.path ?? [];
    const ancestors = ancestorIds
      .map((id: any) =>
        allCategories.find((candidate: any) => sameId(candidate._id, id)),
      )
      .filter(Boolean)
      .map(normalizeCategory);
    const children = sortCategories(
      allCategories
        .filter((candidate: any) => sameId(candidate.parentId, category._id))
        .map(normalizeCategory)
        .filter((candidate: any) => candidate.isVisible),
    );

    return {
      ...normalized,
      ancestors,
      children,
    };
  },
});

export const getFeatured = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const limit = Math.min(24, Math.max(1, args.limit ?? 8));
    const categories = await ctx.db
      .query("commerce_product_categories")
      .withIndex("by_featured", (q: any) => q.eq("isFeatured", true))
      .take(100);

    return sortCategories(
      categories
        .map(normalizeCategory)
        .filter(
          (category) =>
            category.isVisible &&
            (category.totalProductCount ?? category.productCount ?? 0) > 0,
        ),
    ).slice(0, limit);
  },
});

export const getNavCategories = query({
  args: {},
  handler: async (ctx) => {
    await requireCommerceEnabled(ctx);
    const categories = await ctx.db
      .query("commerce_product_categories")
      .withIndex("by_nav", (q: any) => q.eq("showInNav", true))
      .take(1000);

    return buildTree(
      categories
        .map(normalizeCategory)
        .filter(
          (category) =>
            category.isVisible &&
            (category.totalProductCount ?? category.productCount ?? 0) > 0,
        ),
    );
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

    const parentId = args.parentId ?? undefined;
    const parentState = await getParentState(ctx, parentId);
    const now = Date.now();
    const categoryId = await ctx.db.insert("commerce_product_categories", {
      name,
      slug: await getUniqueCategorySlug(ctx, args.slug?.trim() || name),
      description: cleanText(args.description),
      parentId,
      depth: parentState.depth,
      path: parentState.path,
      thumbnailMediaId: args.thumbnailMediaId,
      icon: cleanText(args.icon),
      sortOrder: args.sortOrder ?? now,
      productCount: 0,
      totalProductCount: 0,
      isVisible: args.isVisible ?? true,
      isFeatured: args.isFeatured ?? false,
      showInNav: args.showInNav ?? false,
      metaTitle: cleanText(args.metaTitle),
      metaDescription: cleanText(args.metaDescription),
      createdAt: now,
      updatedAt: now,
    });

    await emitEvent(ctx, CATEGORY_EVENTS.CREATED, SYSTEM.CATEGORY, {
      categoryId,
      name,
      parentId,
    });

    return categoryId;
  },
});

export const update = mutation({
  args: updateCommerceCategoryArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const category = await ctx.db.get(
      "commerce_product_categories",
      args.categoryId,
    );
    if (!category) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Category not found.",
      });
    }

    const isDefaultCategory = category.slug === DEFAULT_PRODUCT_CATEGORY_SLUG;
    const changedFields: string[] = [];
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
      changedFields.push("name");
    }

    if (args.slug !== undefined) {
      if (
        isDefaultCategory &&
        slugify(args.slug) !== DEFAULT_PRODUCT_CATEGORY_SLUG
      ) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "The default product category slug cannot be changed.",
        });
      }
      patch.slug = await getUniqueCategorySlug(
        ctx,
        args.slug.trim() || String(patch.name ?? category.name),
        args.categoryId.toString(),
      );
      changedFields.push("slug");
    } else if (args.name !== undefined) {
      patch.slug = await getUniqueCategorySlug(
        ctx,
        String(patch.name),
        args.categoryId.toString(),
      );
      changedFields.push("slug");
    }

    if (args.description !== undefined) {
      patch.description = cleanText(args.description);
      changedFields.push("description");
    }

    if (args.parentId !== undefined) {
      if (isDefaultCategory && args.parentId) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "The default product category must remain a root category.",
        });
      }
      const parentId = args.parentId ?? undefined;
      await validateParentMove(ctx, args.categoryId, parentId);
      const parentState = await getParentState(ctx, parentId);
      patch.parentId = parentId;
      patch.path = parentState.path;
      patch.depth = parentState.depth;
      changedFields.push("parentId");
    }

    if (args.thumbnailMediaId !== undefined) {
      patch.thumbnailMediaId = args.thumbnailMediaId ?? undefined;
      changedFields.push("thumbnailMediaId");
    }

    if (args.icon !== undefined) {
      patch.icon = cleanText(args.icon);
      changedFields.push("icon");
    }

    if (args.sortOrder !== undefined) {
      patch.sortOrder = args.sortOrder;
      changedFields.push("sortOrder");
    }

    for (const field of ["isVisible", "isFeatured", "showInNav"] as const) {
      if (args[field] !== undefined) {
        patch[field] = args[field];
        changedFields.push(field);
      }
    }

    if (args.metaTitle !== undefined) {
      patch.metaTitle = cleanText(args.metaTitle);
      changedFields.push("metaTitle");
    }

    if (args.metaDescription !== undefined) {
      patch.metaDescription = cleanText(args.metaDescription);
      changedFields.push("metaDescription");
    }

    await ctx.db.patch("commerce_product_categories", args.categoryId, patch);
    if (changedFields.includes("parentId")) {
      await updateDescendantPaths(ctx, args.categoryId);
      await recomputeAllProductCategoryCounts(ctx);
    }

    await emitEvent(ctx, CATEGORY_EVENTS.UPDATED, SYSTEM.CATEGORY, {
      categoryId: args.categoryId,
      name: patch.name ?? category.name,
      fields: changedFields,
    });

    return args.categoryId;
  },
});

export const move = mutation({
  args: moveCommerceCategoryArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const category = await ctx.db.get(
      "commerce_product_categories",
      args.categoryId,
    );
    if (!category) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Category not found.",
      });
    }

    const parentId = args.parentId ?? undefined;
    await validateParentMove(ctx, args.categoryId, parentId);
    const parentState = await getParentState(ctx, parentId);
    await ctx.db.patch("commerce_product_categories", args.categoryId, {
      parentId,
      path: parentState.path,
      depth: parentState.depth,
      sortOrder: args.sortOrder ?? category.sortOrder ?? Date.now(),
      updatedAt: Date.now(),
    });
    await updateDescendantPaths(ctx, args.categoryId);
    await recomputeAllProductCategoryCounts(ctx);

    await emitEvent(ctx, CATEGORY_EVENTS.UPDATED, SYSTEM.CATEGORY, {
      categoryId: args.categoryId,
      name: category.name,
      fields: ["parentId", "path", "depth", "sortOrder"],
    });

    return args.categoryId;
  },
});

export const reorder = mutation({
  args: reorderCommerceCategoriesArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const now = Date.now();
    for (const [index, categoryId] of args.orderedIds.entries()) {
      const category = await ctx.db.get(
        "commerce_product_categories",
        categoryId,
      );
      if (!category || !sameId(category.parentId, args.parentId)) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Reorder list contains a category outside the selected parent.",
        });
      }

      await ctx.db.patch("commerce_product_categories", categoryId, {
        sortOrder: index,
        updatedAt: now,
      });
    }

    await emitEvent(ctx, CATEGORY_EVENTS.REORDERED, SYSTEM.CATEGORY, {
      parentId: args.parentId,
      newOrder: args.orderedIds,
    });

    return args.orderedIds;
  },
});

export const rebuildMetadata = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const categories = await ctx.db
      .query("commerce_product_categories")
      .take(10000);
    const byId = new Map(
      categories.map((category: any) => [category._id.toString(), category]),
    );
    const visited = new Set<string>();
    let repaired = 0;

    const visit = async (category: any, path: any[], index: number) => {
      const key = category._id.toString();
      if (visited.has(key)) return;
      visited.add(key);

      const nextPatch: Record<string, unknown> = {
        depth: path.length,
        path,
        sortOrder: category.sortOrder ?? index,
        totalProductCount: category.totalProductCount ?? category.productCount ?? 0,
        isVisible: category.isVisible ?? true,
        isFeatured: category.isFeatured ?? false,
        showInNav: category.showInNav ?? false,
        updatedAt: Date.now(),
      };

      if (
        category.parentId &&
        !byId.has(category.parentId.toString())
      ) {
        nextPatch.parentId = undefined;
      }

      await ctx.db.patch(
        "commerce_product_categories",
        category._id,
        nextPatch,
      );
      repaired++;

      const children = sortCategories(
        categories.filter((candidate: any) =>
          sameId(candidate.parentId, category._id),
        ),
      );
      for (const [childIndex, child] of children.entries()) {
        await visit(child, [...path, category._id], childIndex);
      }
    };

    const roots = sortCategories(
      categories.filter(
        (category: any) =>
          !category.parentId || !byId.has(category.parentId.toString()),
      ),
    );
    for (const [index, root] of roots.entries()) {
      await visit(root, [], index);
    }

    await recomputeAllProductCategoryCounts(ctx);
    return { repaired };
  },
});

export const remove = mutation({
  args: removeCommerceCategoryArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const category = await ctx.db.get(
      "commerce_product_categories",
      args.categoryId,
    );
    if (!category) return null;

    if (category.slug === DEFAULT_PRODUCT_CATEGORY_SLUG) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "The default product category cannot be deleted.",
      });
    }

    const children = await ctx.db
      .query("commerce_product_categories")
      .withIndex("by_parent", (q: any) => q.eq("parentId", args.categoryId))
      .take(1);
    if (children.length > 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Delete or move subcategories before deleting this category.",
      });
    }

    if (args.moveProductsTo && sameId(args.moveProductsTo, args.categoryId)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Products cannot be moved to the category being deleted.",
      });
    }

    if (args.moveProductsTo) {
      const target = await ctx.db.get(
        "commerce_product_categories",
        args.moveProductsTo,
      );
      if (!target) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Move target category not found.",
        });
      }
    }

    const products = await ctx.db.query("commerce_products").take(10000);
    let productsMoved = 0;
    for (const product of products) {
      if (
        !(product.categoryIds ?? []).some((id: any) =>
          sameId(id, args.categoryId),
        )
      ) {
        continue;
      }

      if (!args.moveProductsTo) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message:
            "Choose a target category for assigned products before deleting this category.",
        });
      }

      const nextCategoryIds = [
        ...product.categoryIds.filter(
          (id: any) => !sameId(id, args.categoryId),
        ),
        args.moveProductsTo,
      ].filter(
        (value: any, index: number, array: any[]) =>
          array.findIndex((candidate) => sameId(candidate, value)) === index,
      );

      await ctx.db.patch("commerce_products", product._id, {
        categoryIds: nextCategoryIds,
        updatedAt: Date.now(),
      });
      productsMoved++;
    }

    await ctx.db.delete("commerce_product_categories", args.categoryId);
    await recomputeAllProductCategoryCounts(ctx);

    await emitEvent(ctx, CATEGORY_EVENTS.DELETED, SYSTEM.CATEGORY, {
      categoryId: args.categoryId,
      name: category.name,
      productsMoved,
      moveProductsTo: args.moveProductsTo,
    });

    return args.categoryId;
  },
});
