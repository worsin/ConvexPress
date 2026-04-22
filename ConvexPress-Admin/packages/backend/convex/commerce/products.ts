// @ts-nocheck
// ============================================
// ADVANCED PRODUCT FEATURES — Option types, option values,
// product variants, bulk actions, archive / restore
// Ported from VexCart products.ts, adapted to ConvexPress patterns
// (commerce_products, commerce_product_variants schema)
// ============================================

import { ConvexError, v } from "convex/values";

import {
  query,
  mutation,
} from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { sanitizeSlug } from "../helpers/slug";
import {
  ensureDefaultProductCategory,
  recomputeAllProductCategoryCounts,
} from "./categories";
import { requireCommerceEnabled } from "./helpers";
import {
  normalizeVariantSelections,
  buildSelectionKey,
  buildOptionSummaryFromSelections,
  normalizeName,
  validateVariantSelectionsResult,
  getVariantDisplayPrice,
  validateOptionTypesShape,
} from "./variantHelpers";
import {
  createCommerceProductArgs,
  getCommerceProductArgs,
  getCommerceProductBySlugArgs,
  listCommerceProductsArgs,
  listPublishedCommerceProductsArgs,
  updateCommerceProductArgs,
} from "./validators";

function slugifyCommerceProduct(value: string) {
  return (
    (sanitizeSlug(value) ??
      value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120)) ||
    `product-${Date.now()}`
  );
}

async function listVariantsByProduct(ctx: any, productId: any) {
  return ctx.db
    .query("commerce_product_variants")
    .withIndex("by_product", (q: any) => q.eq("productId", productId))
    .collect();
}

function validateVariantSelections(optionTypes: any[], selections: any[] | undefined) {
  const result = validateVariantSelectionsResult(optionTypes, selections);
  if (!result.ok) {
    throw new ConvexError(result.error);
  }
  return result.selections;
}

async function getVariantReferenceSummary(ctx: any, variantId: any) {
  const tables = [
    { table: "commerce_cart_items", label: "cart items" },
    { table: "commerce_order_items", label: "order items" },
    { table: "commerce_wishlist_items", label: "wishlist items" },
    { table: "commerce_digital_files", label: "digital files" },
    { table: "commerce_license_keys", label: "license keys" },
    { table: "commerce_bundle_components", label: "bundle components" },
    { table: "commerce_subscription_items", label: "subscription items" },
    { table: "commerce_return_items", label: "return items" },
    { table: "commerce_stock_reservations", label: "stock reservations" },
    { table: "commerce_inventory_adjustments", label: "inventory adjustments" },
  ];

  const references: Array<{ label: string; count: number }> = [];

  for (const table of tables) {
    const rows = (await ctx.db.query(table.table).collect()).filter(
      (row: any) => row.variantId?.toString() === variantId.toString(),
    );
    if (rows.length > 0) {
      references.push({ label: table.label, count: rows.length });
    }
  }

  const bundleSelections = await ctx.db.query("commerce_bundle_selections").collect();
  const bundleSelectionCount = bundleSelections.filter((row: any) =>
    (row.selections ?? []).some(
      (selection: any) => selection.variantId?.toString() === variantId.toString(),
    ),
  ).length;
  if (bundleSelectionCount > 0) {
    references.push({ label: "bundle selections", count: bundleSelectionCount });
  }

  return references;
}

async function getBundleProductReferenceSummary(ctx: any, productId: any) {
  const references: Array<{ label: string; count: number }> = [];

  const owningBundle = await ctx.db
    .query("commerce_bundles")
    .withIndex("by_product", (q: any) => q.eq("productId", productId))
    .unique();
  if (owningBundle) {
    references.push({
      label:
        owningBundle.status === "active"
          ? "active owning bundle"
          : "owning bundle",
      count: 1,
    });
  }

  const bundleComponents = await ctx.db
    .query("commerce_bundle_components")
    .withIndex("by_product", (q: any) => q.eq("productId", productId))
    .collect();
  if (bundleComponents.length > 0) {
    const activeBundleIds = new Set<string>();
    for (const component of bundleComponents) {
      const bundle = await ctx.db.get(component.bundleId);
      if (bundle?.status === "active") {
        activeBundleIds.add(bundle._id.toString());
      }
    }

    references.push({
      label:
        activeBundleIds.size > 0
          ? "active bundle components"
          : "bundle components",
      count: bundleComponents.length,
    });
  }

  return references;
}

async function assertProductBundleLifecycleAllowed(
  ctx: any,
  productId: any,
  action: "unpublish" | "delete",
) {
  const references = await getBundleProductReferenceSummary(ctx, productId);
  if (references.length === 0) return;

  const blockingReferences =
    action === "delete"
      ? references
      : references.filter((reference) => reference.label.startsWith("active "));
  if (blockingReferences.length === 0) return;

  throw new ConvexError({
    code: "bundle_product_in_use",
    message: `Cannot ${action} a product that is still referenced by ${blockingReferences.map((reference) => reference.label).join(", ")}.`,
  });
}

async function getUniqueProductSlug(
  ctx: any,
  value: string,
  excludeId?: string,
): Promise<string> {
  const base = slugifyCommerceProduct(value);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("commerce_products")
      .withIndex("by_slug", (q: any) => q.eq("slug", candidate))
      .unique();

    if (!existing || existing._id.toString() === excludeId) {
      return candidate;
    }

    candidate = `${base}-${suffix++}`;
  }
}

async function assertCategoriesExist(ctx: any, categoryIds: any[]) {
  for (const categoryId of categoryIds) {
    const category = await ctx.db.get(
      "commerce_product_categories",
      categoryId,
    );
    if (!category) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "One or more categories no longer exist.",
      });
    }
  }
}

function dedupeIds(ids: any[]) {
  return ids.filter(
    (value: any, index: number, array: any[]) =>
      array.findIndex((candidate) => candidate.toString() === value.toString()) ===
      index,
  );
}

async function resolveProductCategoryIds(ctx: any, categoryIds: any[] | undefined) {
  const nextCategoryIds = dedupeIds(categoryIds ?? []);
  if (nextCategoryIds.length > 0) {
    await assertCategoriesExist(ctx, nextCategoryIds);
    return nextCategoryIds;
  }

  const defaultCategory = await ensureDefaultProductCategory(ctx);
  if (!defaultCategory) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Default product category could not be created.",
    });
  }
  return [defaultCategory._id];
}

async function recomputeCategoryCounts(ctx: any, categoryIds: any[]) {
  void categoryIds;
  await recomputeAllProductCategoryCounts(ctx);
}

async function loadCategoriesByIds(ctx: any, categoryIds: any[]) {
  const categories = await Promise.all(
    categoryIds.map((categoryId: any) =>
      ctx.db.get("commerce_product_categories", categoryId),
    ),
  );

  return categories
    .filter(Boolean)
    .sort((a: any, b: any) => a.name.localeCompare(b.name));
}

function collectCategoryDescendants(categories: any[], categoryId: any) {
  const ids = new Set<string>([categoryId.toString()]);
  const visit = (parentId: any) => {
    for (const category of categories) {
      if (category.parentId?.toString() === parentId.toString()) {
        ids.add(category._id.toString());
        visit(category._id);
      }
    }
  };
  visit(categoryId);
  return ids;
}

async function computeDisplayPrice(ctx: any, product: any) {
  if (product.productType !== "variable") {
    return typeof product.salePrice?.amount === "number"
      ? product.salePrice.amount
      : product.basePrice.amount;
  }

  const variants = await ctx.db
    .query("commerce_product_variants")
    .withIndex("by_product", (q: any) => q.eq("productId", product._id))
    .collect();

  if (variants.length === 0) {
    return typeof product.salePrice?.amount === "number"
      ? product.salePrice.amount
      : product.basePrice.amount;
  }

  const defaultVariant = variants.find((variant: any) => variant.isDefault);
  if (defaultVariant) {
    return getVariantDisplayPrice(defaultVariant);
  }

  return variants.reduce(
    (lowest: number, variant: any) =>
      Math.min(lowest, getVariantDisplayPrice(variant)),
    Number.POSITIVE_INFINITY,
  );
}

async function serializeProductSummary(ctx: any, product: any) {
  const [categories, displayPrice] = await Promise.all([
    loadCategoriesByIds(ctx, product.categoryIds ?? []),
    computeDisplayPrice(ctx, product),
  ]);

  return {
    ...product,
    categories,
    displayPrice: Number.isFinite(displayPrice) ? displayPrice : undefined,
  };
}

async function serializeProductDetail(ctx: any, product: any) {
  const [categories, displayPrice, inventoryAdjustments, variants] = await Promise.all([
    loadCategoriesByIds(ctx, product.categoryIds ?? []),
    computeDisplayPrice(ctx, product),
    ctx.db
      .query("commerce_inventory_adjustments")
      .withIndex("by_product", (q: any) => q.eq("productId", product._id))
      .order("desc")
      .take(10),
    ctx.db
      .query("commerce_product_variants")
      .withIndex("by_product", (q: any) => q.eq("productId", product._id))
      .collect(),
  ]);

  return {
    ...product,
    categories,
    displayPrice: Number.isFinite(displayPrice) ? displayPrice : undefined,
    inventoryAdjustments,
    variants: variants.sort((a: any, b: any) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.title.localeCompare(b.title);
    }),
  };
}

export const list = query({
  args: listCommerceProductsArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let products = await ctx.db.query("commerce_products").take(2000);

    if (args.status) {
      products = products.filter((product: any) => product.status === args.status);
    }

    if (args.search?.trim()) {
      const search = args.search.trim().toLowerCase();
      products = products.filter((product: any) => {
        const haystack = [
          product.title,
          product.slug,
          product.sku,
          product.excerpt,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      });
    }

    products.sort((a: any, b: any) => b.updatedAt - a.updatedAt);
    return Promise.all(products.map((product: any) => serializeProductSummary(ctx, product)));
  },
});

export const counts = query({
  args: {},
  handler: async (ctx: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const products = await ctx.db.query("commerce_products").take(5000);
    return {
      all: products.length,
      draft: products.filter((product: any) => product.status === "draft").length,
      published: products.filter((product: any) => product.status === "publish").length,
      private: products.filter((product: any) => product.status === "private").length,
      trash: products.filter((product: any) => product.status === "trash").length,
    };
  },
});

export const get = query({
  args: getCommerceProductArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    return product ? serializeProductDetail(ctx, product) : null;
  },
});

export const getBySlug = query({
  args: getCommerceProductBySlugArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);

    const slug = slugifyCommerceProduct(args.slug);
    const product = await ctx.db
      .query("commerce_products")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .unique();

    if (!product || product.status !== "publish") {
      return null;
    }

    // Check if this product is owned by a bundle — if so, include a redirect hint
    const owningBundle = await ctx.db
      .query("commerce_bundles")
      .withIndex("by_product", (q: any) => q.eq("productId", product._id))
      .first();
    if (owningBundle) {
      const detail = await serializeProductDetail(ctx, product);
      return { ...detail, isBundleProduct: true, bundleSlug: owningBundle.slug };
    }

    return serializeProductDetail(ctx, product);
  },
});

export const listPublished = query({
  args: listPublishedCommerceProductsArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);

    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(100, Math.max(1, args.perPage ?? 12));
    const categorySlug = args.categorySlug?.trim().toLowerCase();
    const search = args.search?.trim().toLowerCase();

    const [products, categories] = await Promise.all([
      ctx.db
        .query("commerce_products")
        .withIndex("by_status", (q: any) => q.eq("status", "publish"))
        .collect(),
      categorySlug
        ? ctx.db.query("commerce_product_categories").collect()
        : Promise.resolve([]),
    ]);

    const category = categorySlug
      ? categories.find((entry: any) => entry.slug === categorySlug) ?? null
      : null;

    const categoryIds = category
      ? collectCategoryDescendants(categories, category._id)
      : null;
    const categoryFiltered =
      categorySlug && !category
        ? []
        : categoryIds
          ? products.filter((product: any) =>
              product.categoryIds.some((id: any) => categoryIds.has(id.toString())),
            )
          : products;
    const filtered = search
      ? categoryFiltered.filter((product: any) => {
          const haystack = [
            product.title,
            product.slug,
            product.sku,
            product.excerpt,
            product.description,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(search);
        })
      : categoryFiltered;

    // Filter out bundle-owned products (they're purchased through bundle pages)
    const bundles = await ctx.db.query("commerce_bundles").collect();
    const bundleProductIds = new Set<string>();
    for (const b of bundles) {
      if (b.productId) bundleProductIds.add(b.productId.toString());
    }
    const catalogProducts = filtered.filter(
      (p: any) => !bundleProductIds.has(p._id.toString()),
    );

    catalogProducts.sort((a: any, b: any) => {
      const aTime = a.publishedAt ?? a.updatedAt ?? a.createdAt;
      const bTime = b.publishedAt ?? b.updatedAt ?? b.createdAt;
      return bTime - aTime;
    });

    const total = catalogProducts.length;
    const totalPages = total === 0 ? 1 : Math.ceil(total / perPage);
    const start = (page - 1) * perPage;
    const pageItems = catalogProducts.slice(start, start + perPage);

    return {
      products: await Promise.all(
        pageItems.map((product: any) => serializeProductSummary(ctx, product)),
      ),
      page,
      perPage,
      total,
      totalPages,
    };
  },
});

export const create = mutation({
  args: createCommerceProductArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const actor = await requireCan(ctx, "manage_options");

    const title = args.title.trim();
    if (!title) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Product title is required.",
      });
    }

    const categoryIds = await resolveProductCategoryIds(ctx, args.categoryIds);

    const now = Date.now();
    const status = args.status ?? "draft";
    const productId = await ctx.db.insert("commerce_products", {
      title,
      slug: await getUniqueProductSlug(ctx, args.slug?.trim() || title),
      description: args.description?.trim() || undefined,
      excerpt: args.excerpt?.trim() || undefined,
      status,
      productType: "simple",
      sku: args.sku?.trim() || undefined,
      authorId: actor._id,
      featuredMediaId: args.featuredMediaId,
      galleryMediaIds: args.galleryMediaIds ?? [],
      categoryIds,
      basePrice: args.basePrice,
      salePrice: args.salePrice,
      trackInventory: args.trackInventory ?? true,
      stockQuantity: args.trackInventory === false ? undefined : args.stockQuantity,
      allowBackorders: args.allowBackorders ?? false,
      isVirtual: args.isVirtual ?? false,
      shippingWeightOz:
        args.isVirtual === true ? undefined : args.shippingWeightOz,
      isDownloadable: args.isDownloadable ?? false,
      taxClass: args.taxClass?.trim() || undefined,
      publishedAt: status === "publish" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    await recomputeCategoryCounts(ctx, categoryIds);
    return productId;
  },
});

export const update = mutation({
  args: updateCommerceProductArgs,
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Product not found.",
      });
    }

    // Check if this product is owned by a bundle
    const owningBundle = await ctx.db
      .query("commerce_bundles")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .first();

    if (owningBundle) {
      // Only allow safe fields to be updated on bundle-owned products
      const SAFE_BUNDLE_PRODUCT_FIELDS = new Set(["description", "seoTitle", "seoDescription", "featuredMediaId"]);
      const attemptedFields = Object.keys(args).filter((k: string) => k !== "productId" && args[k] !== undefined);
      const unsafeFields = attemptedFields.filter((f: string) => !SAFE_BUNDLE_PRODUCT_FIELDS.has(f));
      if (unsafeFields.length > 0) {
        throw new ConvexError({
          code: "BUNDLE_OWNED",
          message: `This product is managed by bundle "${owningBundle.name}". Edit the bundle to change: ${unsafeFields.join(", ")}`,
        });
      }
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Product title is required.",
        });
      }
      patch.title = title;
    }

    if (args.slug !== undefined) {
      const slugSeed = args.slug.trim() || String(patch.title ?? product.title);
      patch.slug = await getUniqueProductSlug(ctx, slugSeed, args.productId.toString());
    }

    if (args.description !== undefined) patch.description = args.description?.trim() || undefined;
    if (args.excerpt !== undefined) patch.excerpt = args.excerpt?.trim() || undefined;
    if (args.sku !== undefined) patch.sku = args.sku?.trim() || undefined;
    if (args.featuredMediaId !== undefined) patch.featuredMediaId = args.featuredMediaId;
    if (args.galleryMediaIds !== undefined) patch.galleryMediaIds = args.galleryMediaIds;
    if (args.basePrice !== undefined) patch.basePrice = args.basePrice;
    if (args.salePrice !== undefined) patch.salePrice = args.salePrice ?? undefined;
    if (args.trackInventory !== undefined) patch.trackInventory = args.trackInventory;
    if (args.stockQuantity !== undefined) patch.stockQuantity = args.stockQuantity ?? undefined;
    if (args.allowBackorders !== undefined) patch.allowBackorders = args.allowBackorders;
    if (args.isVirtual !== undefined) patch.isVirtual = args.isVirtual;
    if (args.shippingWeightOz !== undefined) patch.shippingWeightOz = args.shippingWeightOz ?? undefined;
    if (args.isDownloadable !== undefined) patch.isDownloadable = args.isDownloadable;
    if (args.taxClass !== undefined) patch.taxClass = args.taxClass?.trim() || undefined;

    if (args.categoryIds !== undefined) {
      patch.categoryIds = await resolveProductCategoryIds(ctx, args.categoryIds);
    }

    if (args.status !== undefined) {
      if (args.status !== "publish") {
        await assertProductBundleLifecycleAllowed(
          ctx,
          args.productId,
          "unpublish",
        );
      }
      patch.status = args.status;
      if (args.status === "publish" && product.status !== "publish") {
        patch.publishedAt = Date.now();
      }
      if (args.status !== "publish") {
        patch.publishedAt = product.publishedAt;
      }
    }

    if ((patch.isVirtual ?? product.isVirtual) === true) {
      patch.shippingWeightOz = undefined;
    }

    if ((patch.trackInventory ?? product.trackInventory) === false) {
      patch.stockQuantity = undefined;
    }

    await ctx.db.patch("commerce_products", args.productId, patch);

    const nextCategoryIds = (patch.categoryIds as any[] | undefined) ?? product.categoryIds;
    const affectedCategoryIds = dedupeIds([
      ...product.categoryIds,
      ...nextCategoryIds,
    ]);
    await recomputeCategoryCounts(ctx, affectedCategoryIds);

    return args.productId;
  },
});

// ============================================
// OPTION TYPE CRUD
// ============================================

/**
 * List option types (e.g. Color, Size) for a product.
 * Stored as JSON in the product's metadata; we model them in-memory.
 * ConvexPress stores option types as an optional field on the product row.
 * We treat `optionTypes` as v.optional(v.any()) on commerce_products.
 */
export const listOptionTypes = query({
  args: { productId: v.id("commerce_products") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });
    return (product as any).optionTypes ?? [];
  },
});

/**
 * Create an option type on a product.
 * Example: { name: "Color", values: ["Red", "Blue"] }
 */
export const createOptionType = mutation({
  args: {
    productId: v.id("commerce_products"),
    name: v.string(),
    values: v.array(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const existing: any[] = (product as any).optionTypes ?? [];
    if (existing.some((o: any) => normalizeName(o.name) === normalizeName(args.name))) {
      throw new ConvexError({ code: "duplicate", message: `Option type "${args.name}" already exists` });
    }

    const optionType = {
      id: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: args.name,
      values: args.values.map((val: string, idx: number) => ({
        id: `val_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 8)}`,
        label: val,
        sortOrder: idx,
        active: true,
      })),
      sortOrder: existing.length,
      createdAt: Date.now(),
    };

    const nextOptionTypes = [...existing, optionType];
    const shapeIssues = validateOptionTypesShape(nextOptionTypes);
    if (shapeIssues.length > 0) {
      throw new ConvexError({
        code: "validation_error",
        message: `Invalid option types shape: ${shapeIssues[0].message} at ${shapeIssues[0].path}`,
      });
    }

    await ctx.db.patch(args.productId, {
      optionTypes: nextOptionTypes,
      updatedAt: Date.now(),
    });

    return optionType;
  },
});

/**
 * Update an option type (rename or reorder).
 */
export const updateOptionType = mutation({
  args: {
    productId: v.id("commerce_products"),
    optionTypeId: v.string(),
    name: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const optionTypes: any[] = [...((product as any).optionTypes ?? [])];
    const idx = optionTypes.findIndex((o: any) => o.id === args.optionTypeId);
    if (idx === -1) throw new ConvexError({ code: "not_found", message: "Option type not found" });

    const variants = await listVariantsByProduct(ctx, args.productId);

    if (
      args.name !== undefined &&
      optionTypes.some(
        (optionType: any, optionTypeIndex: number) =>
          optionTypeIndex !== idx && normalizeName(optionType.name) === normalizeName(args.name),
      )
    ) {
      throw new ConvexError({ code: "duplicate", message: `Option type "${args.name}" already exists` });
    }

    if (args.name !== undefined) optionTypes[idx].name = args.name;
    if (args.sortOrder !== undefined) optionTypes[idx].sortOrder = args.sortOrder;

    if (args.name !== undefined || args.sortOrder !== undefined) {
      for (const variant of variants) {
        if (!variant.selections?.length) continue;
        const nextSelections = variant.selections.map((selection: any) =>
          selection.optionTypeId === args.optionTypeId
            ? {
                ...selection,
                optionTypeName: optionTypes[idx].name,
              }
            : selection,
        );

        await ctx.db.patch(variant._id, {
          selections: normalizeVariantSelections(nextSelections),
          optionSummary: buildOptionSummaryFromSelections(nextSelections),
          selectionKey: buildSelectionKey(nextSelections),
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.patch(args.productId, { optionTypes, updatedAt: Date.now() });
    return optionTypes[idx];
  },
});

/**
 * Delete an option type from a product.
 */
export const deleteOptionType = mutation({
  args: {
    productId: v.id("commerce_products"),
    optionTypeId: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const variants = await listVariantsByProduct(ctx, args.productId);
    const variantsUsingOptionType = variants.filter((variant: any) =>
      (variant.selections ?? []).some(
        (selection: any) => selection.optionTypeId === args.optionTypeId,
      ),
    );
    if (variantsUsingOptionType.length > 0) {
      throw new ConvexError({
        code: "validation_error",
        message: "Cannot delete an option type that is still used by existing variants.",
      });
    }

    const optionTypes: any[] = ((product as any).optionTypes ?? []).filter(
      (o: any) => o.id !== args.optionTypeId,
    );

    await ctx.db.patch(args.productId, { optionTypes, updatedAt: Date.now() });
    return { success: true };
  },
});

// ============================================
// OPTION VALUE CRUD
// ============================================

/**
 * Add an option value to an existing option type.
 */
export const createOptionValue = mutation({
  args: {
    productId: v.id("commerce_products"),
    optionTypeId: v.string(),
    label: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const optionTypes: any[] = [...((product as any).optionTypes ?? [])];
    const typeIdx = optionTypes.findIndex((o: any) => o.id === args.optionTypeId);
    if (typeIdx === -1) throw new ConvexError({ code: "not_found", message: "Option type not found" });

    const existing = optionTypes[typeIdx].values ?? [];
    if (existing.some((v: any) => normalizeName(v.label) === normalizeName(args.label))) {
      throw new ConvexError({ code: "duplicate", message: `Value "${args.label}" already exists` });
    }

    const newValue = {
      id: `val_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label: args.label,
      sortOrder: existing.length,
      active: true,
    };

    optionTypes[typeIdx] = {
      ...optionTypes[typeIdx],
      values: [...existing, newValue],
    };

    await ctx.db.patch(args.productId, { optionTypes, updatedAt: Date.now() });
    return newValue;
  },
});

/**
 * Update an option value label.
 */
export const updateOptionValue = mutation({
  args: {
    productId: v.id("commerce_products"),
    optionTypeId: v.string(),
    valueId: v.string(),
    label: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const optionTypes: any[] = [...((product as any).optionTypes ?? [])];
    const typeIdx = optionTypes.findIndex((o: any) => o.id === args.optionTypeId);
    if (typeIdx === -1) throw new ConvexError({ code: "not_found", message: "Option type not found" });

    const values = [...(optionTypes[typeIdx].values ?? [])];
    const valIdx = values.findIndex((v: any) => v.id === args.valueId);
    if (valIdx === -1) throw new ConvexError({ code: "not_found", message: "Option value not found" });

    if (
      args.label !== undefined &&
      values.some(
        (value: any, valueIndex: number) =>
          valueIndex !== valIdx && normalizeName(value.label) === normalizeName(args.label),
      )
    ) {
      throw new ConvexError({ code: "duplicate", message: `Value "${args.label}" already exists` });
    }

    if (args.label !== undefined) values[valIdx].label = args.label;
    if (args.sortOrder !== undefined) values[valIdx].sortOrder = args.sortOrder;

    const variants = await listVariantsByProduct(ctx, args.productId);
    if (args.label !== undefined || args.sortOrder !== undefined) {
      for (const variant of variants) {
        if (!variant.selections?.length) continue;
        const nextSelections = variant.selections.map((selection: any) =>
          selection.optionValueId === args.valueId
            ? {
                ...selection,
                optionValueLabel: values[valIdx].label,
              }
            : selection,
        );

        await ctx.db.patch(variant._id, {
          selections: normalizeVariantSelections(nextSelections),
          optionSummary: buildOptionSummaryFromSelections(nextSelections),
          selectionKey: buildSelectionKey(nextSelections),
          updatedAt: Date.now(),
        });
      }
    }

    optionTypes[typeIdx] = { ...optionTypes[typeIdx], values };
    await ctx.db.patch(args.productId, { optionTypes, updatedAt: Date.now() });
    return values[valIdx];
  },
});

/**
 * Delete an option value.
 */
export const deleteOptionValue = mutation({
  args: {
    productId: v.id("commerce_products"),
    optionTypeId: v.string(),
    valueId: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const variants = await listVariantsByProduct(ctx, args.productId);
    const variantsUsingValue = variants.filter((variant: any) =>
      (variant.selections ?? []).some(
        (selection: any) => selection.optionTypeId === args.optionTypeId && selection.optionValueId === args.valueId,
      ),
    );
    if (variantsUsingValue.length > 0) {
      throw new ConvexError({
        code: "validation_error",
        message: "Cannot delete an option value that is still used by existing variants.",
      });
    }

    const optionTypes: any[] = [...((product as any).optionTypes ?? [])];
    const typeIdx = optionTypes.findIndex((o: any) => o.id === args.optionTypeId);
    if (typeIdx === -1) throw new ConvexError({ code: "not_found", message: "Option type not found" });

    optionTypes[typeIdx] = {
      ...optionTypes[typeIdx],
      values: (optionTypes[typeIdx].values ?? []).filter((v: any) => v.id !== args.valueId),
    };

    await ctx.db.patch(args.productId, { optionTypes, updatedAt: Date.now() });
    return { success: true };
  },
});

// ============================================
// VARIANT CRUD
// ============================================

/**
 * List variants for a product.
 */
export const listVariants = query({
  args: { productId: v.id("commerce_products") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    return ctx.db
      .query("commerce_product_variants")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .collect();
  },
});

/**
 * Create a single product variant.
 */
export const createVariant = mutation({
  args: {
    productId: v.id("commerce_products"),
    title: v.string(),
    sku: v.optional(v.string()),
    optionSummary: v.string(),
    selections: v.optional(
      v.array(
        v.object({
          optionTypeId: v.string(),
          optionTypeName: v.string(),
          optionValueId: v.string(),
          optionValueLabel: v.string(),
          sortOrder: v.optional(v.number()),
        }),
      ),
    ),
    priceAmount: v.number(),
    priceCurrency: v.optional(v.string()),
    salePriceAmount: v.optional(v.number()),
    stockQuantity: v.optional(v.number()),
    featuredMediaId: v.optional(v.id("media")),
    isDefault: v.optional(v.boolean()),
    description: v.optional(v.string()),
    globalUniqueId: v.optional(v.string()),
    weight: v.optional(v.string()),
    shippingLengthIn: v.optional(v.string()),
    shippingWidthIn: v.optional(v.string()),
    shippingHeightIn: v.optional(v.string()),
    manageStock: v.optional(
      v.union(v.literal("yes"), v.literal("no"), v.literal("parent")),
    ),
    stockStatus: v.optional(
      v.union(
        v.literal("instock"),
        v.literal("outofstock"),
        v.literal("onbackorder"),
      ),
    ),
    backorders: v.optional(
      v.union(v.literal("yes"), v.literal("no"), v.literal("notify")),
    ),
    lowStockAmount: v.optional(v.number()),
    taxClass: v.optional(v.string()),
    shippingClassId: v.optional(v.string()),
    isVirtual: v.optional(v.boolean()),
    isDownloadable: v.optional(v.boolean()),
    downloadLimit: v.optional(v.number()),
    downloadExpiry: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("publish"), v.literal("private"), v.literal("draft")),
    ),
    menuOrder: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    // Prevent variant creation on bundle-owned products
    const owningBundleForVariant = await ctx.db
      .query("commerce_bundles")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .first();
    if (owningBundleForVariant) {
      throw new ConvexError({
        code: "BUNDLE_OWNED",
        message: `Cannot create variants on bundle-owned product "${owningBundleForVariant.name}". Bundles use simple products.`,
      });
    }

    const optionTypes: any[] = (product as any).optionTypes ?? [];
    const selections = validateVariantSelections(optionTypes, args.selections);

    const now = Date.now();
    const currency = args.priceCurrency ?? product.basePrice?.currencyCode ?? "USD";
    const selectionKey = buildSelectionKey(selections);
    const optionSummary = args.optionSummary?.trim() || buildOptionSummaryFromSelections(selections);

    const existing = await listVariantsByProduct(ctx, args.productId);

    if (selectionKey && existing.some((variant: any) => variant.selectionKey === selectionKey)) {
      throw new ConvexError({
        code: "duplicate",
        message: "A variant with the same option selection already exists.",
      });
    }

    const shouldBeDefault = args.isDefault ?? existing.length === 0;

    if (shouldBeDefault) {
      for (const v of existing) {
        if (v.isDefault) {
          await ctx.db.patch(v._id, { isDefault: false, updatedAt: now });
        }
      }
    }

    const variantId = await ctx.db.insert("commerce_product_variants", {
      productId: args.productId,
      title: args.title,
      sku: args.sku,
      optionSummary,
      selections,
      selectionKey,
      price: { amount: args.priceAmount, currencyCode: currency },
      salePrice: args.salePriceAmount
        ? { amount: args.salePriceAmount, currencyCode: currency }
        : undefined,
      stockQuantity: args.stockQuantity,
      featuredMediaId: args.featuredMediaId,
      description: args.description,
      globalUniqueId: args.globalUniqueId,
      weight: args.weight,
      shippingLengthIn: args.shippingLengthIn,
      shippingWidthIn: args.shippingWidthIn,
      shippingHeightIn: args.shippingHeightIn,
      manageStock: args.manageStock,
      stockStatus: args.stockStatus,
      backorders: args.backorders,
      lowStockAmount: args.lowStockAmount,
      taxClass: args.taxClass,
      shippingClassId: args.shippingClassId,
      isVirtual: args.isVirtual,
      isDownloadable: args.isDownloadable,
      downloadLimit: args.downloadLimit,
      downloadExpiry: args.downloadExpiry,
      status: args.status,
      menuOrder: args.menuOrder,
      isDefault: shouldBeDefault,
      createdAt: now,
      updatedAt: now,
    });

    // Mark product as variable type with variants
    if (product.productType !== "variable") {
      await ctx.db.patch(args.productId, {
        productType: "variable",
        updatedAt: now,
      });
    }

    return variantId;
  },
});

/**
 * Update an existing variant.
 */
export const updateVariant = mutation({
  args: {
    variantId: v.id("commerce_product_variants"),
    title: v.optional(v.string()),
    sku: v.optional(v.string()),
    optionSummary: v.optional(v.string()),
    selections: v.optional(
      v.array(
        v.object({
          optionTypeId: v.string(),
          optionTypeName: v.string(),
          optionValueId: v.string(),
          optionValueLabel: v.string(),
          sortOrder: v.optional(v.number()),
        }),
      ),
    ),
    priceAmount: v.optional(v.number()),
    salePriceAmount: v.optional(v.number()),
    salePriceFrom: v.optional(v.number()),
    salePriceTo: v.optional(v.number()),
    stockQuantity: v.optional(v.number()),
    featuredMediaId: v.optional(v.id("media")),
    isDefault: v.optional(v.boolean()),
    description: v.optional(v.string()),
    globalUniqueId: v.optional(v.string()),
    weight: v.optional(v.string()),
    shippingLengthIn: v.optional(v.string()),
    shippingWidthIn: v.optional(v.string()),
    shippingHeightIn: v.optional(v.string()),
    manageStock: v.optional(
      v.union(v.literal("yes"), v.literal("no"), v.literal("parent")),
    ),
    stockStatus: v.optional(
      v.union(
        v.literal("instock"),
        v.literal("outofstock"),
        v.literal("onbackorder"),
      ),
    ),
    backorders: v.optional(
      v.union(v.literal("yes"), v.literal("no"), v.literal("notify")),
    ),
    lowStockAmount: v.optional(v.number()),
    taxClass: v.optional(v.string()),
    shippingClassId: v.optional(v.string()),
    isVirtual: v.optional(v.boolean()),
    isDownloadable: v.optional(v.boolean()),
    downloadLimit: v.optional(v.number()),
    downloadExpiry: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("publish"), v.literal("private"), v.literal("draft")),
    ),
    menuOrder: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const variant = await ctx.db.get(args.variantId);
    if (!variant) throw new ConvexError({ code: "not_found", message: "Variant not found" });
    const product = await ctx.db.get(variant.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const now = Date.now();
    const updates: any = { updatedAt: now };
    const siblings = await listVariantsByProduct(ctx, variant.productId);

    if (args.title !== undefined) updates.title = args.title;
    if (args.sku !== undefined) updates.sku = args.sku;
    if (args.optionSummary !== undefined) updates.optionSummary = args.optionSummary;
    if (args.selections !== undefined) {
      const selections = validateVariantSelections((product as any).optionTypes ?? [], args.selections);
      const selectionKey = buildSelectionKey(selections);
      if (
        selectionKey &&
        siblings.some(
          (sibling: any) =>
            sibling._id !== args.variantId && sibling.selectionKey === selectionKey,
        )
      ) {
        throw new ConvexError({
          code: "duplicate",
          message: "A variant with the same option selection already exists.",
        });
      }
      updates.selections = selections;
      updates.selectionKey = selectionKey;
      if (args.optionSummary === undefined) {
        updates.optionSummary = buildOptionSummaryFromSelections(selections);
      }
    }
    if (args.priceAmount !== undefined) {
      updates.price = { amount: args.priceAmount, currencyCode: variant.price.currencyCode };
    }
    if (args.salePriceAmount !== undefined) {
      updates.salePrice = args.salePriceAmount
        ? { amount: args.salePriceAmount, currencyCode: variant.price.currencyCode }
        : undefined;
    }
    if (args.salePriceFrom !== undefined) updates.salePriceFrom = args.salePriceFrom;
    if (args.salePriceTo !== undefined) updates.salePriceTo = args.salePriceTo;
    if (args.stockQuantity !== undefined) updates.stockQuantity = args.stockQuantity;
    if (args.featuredMediaId !== undefined) updates.featuredMediaId = args.featuredMediaId;
    if (args.description !== undefined) updates.description = args.description;
    if (args.globalUniqueId !== undefined) updates.globalUniqueId = args.globalUniqueId;
    if (args.weight !== undefined) updates.weight = args.weight;
    if (args.shippingLengthIn !== undefined) updates.shippingLengthIn = args.shippingLengthIn;
    if (args.shippingWidthIn !== undefined) updates.shippingWidthIn = args.shippingWidthIn;
    if (args.shippingHeightIn !== undefined) updates.shippingHeightIn = args.shippingHeightIn;
    if (args.manageStock !== undefined) updates.manageStock = args.manageStock;
    if (args.stockStatus !== undefined) updates.stockStatus = args.stockStatus;
    if (args.backorders !== undefined) updates.backorders = args.backorders;
    if (args.lowStockAmount !== undefined) updates.lowStockAmount = args.lowStockAmount;
    if (args.taxClass !== undefined) updates.taxClass = args.taxClass;
    if (args.shippingClassId !== undefined) updates.shippingClassId = args.shippingClassId;
    if (args.isVirtual !== undefined) updates.isVirtual = args.isVirtual;
    if (args.isDownloadable !== undefined) updates.isDownloadable = args.isDownloadable;
    if (args.downloadLimit !== undefined) updates.downloadLimit = args.downloadLimit;
    if (args.downloadExpiry !== undefined) updates.downloadExpiry = args.downloadExpiry;
    if (args.status !== undefined) updates.status = args.status;
    if (args.menuOrder !== undefined) updates.menuOrder = args.menuOrder;

    // If setting as default, unset others
    if (args.isDefault) {
      for (const s of siblings) {
        if (s._id !== args.variantId && s.isDefault) {
          await ctx.db.patch(s._id, { isDefault: false, updatedAt: now });
        }
      }
      updates.isDefault = true;
    } else if (args.isDefault === false) {
      const otherDefault = siblings.some(
        (s: any) => s._id !== args.variantId && s.isDefault,
      );
      if (!otherDefault) {
        throw new ConvexError({
          code: "validation_error",
          message: "Variable products must always have a default variant.",
        });
      }
      updates.isDefault = false;
    }

    await ctx.db.patch(args.variantId, updates);
    return args.variantId;
  },
});

/**
 * Delete a variant.
 */
export const deleteVariant = mutation({
  args: { variantId: v.id("commerce_product_variants") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const variant = await ctx.db.get(args.variantId);
    if (!variant) throw new ConvexError({ code: "not_found", message: "Variant not found" });

    const references = await getVariantReferenceSummary(ctx, args.variantId);
    if (references.length > 0) {
      throw new ConvexError({
        code: "validation_error",
        message: `Cannot delete a variant that is still referenced by ${references.map((reference) => reference.label).join(", ")}.`,
      });
    }

    const siblings = await listVariantsByProduct(ctx, variant.productId);
    if (variant.isDefault && siblings.length > 1) {
      throw new ConvexError({
        code: "validation_error",
        message: "Cannot delete the default variant. Reassign the default variant first.",
      });
    }

    await ctx.db.delete(args.variantId);

    // Check if any variants remain; if not, revert product type
    const remaining = siblings.filter((sibling: any) => sibling._id !== args.variantId);

    if (remaining.length === 0) {
      await ctx.db.patch(variant.productId, {
        productType: "simple",
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/**
 * Generate all variant combinations from the product's option types.
 * Creates missing variants only (skips existing option combos).
 */
export const generateVariants = mutation({
  args: {
    productId: v.id("commerce_products"),
    basePriceAmount: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    // Prevent variant generation on bundle-owned products
    const owningBundleForGenerate = await ctx.db
      .query("commerce_bundles")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .first();
    if (owningBundleForGenerate) {
      throw new ConvexError({
        code: "BUNDLE_OWNED",
        message: `Cannot create variants on bundle-owned product "${owningBundleForGenerate.name}". Bundles use simple products.`,
      });
    }

    const optionTypes: any[] = (product as any).optionTypes ?? [];
    if (optionTypes.length === 0) {
      throw new ConvexError({ code: "no_options", message: "No option types defined" });
    }

    const shapeIssues = validateOptionTypesShape(optionTypes);
    if (shapeIssues.length > 0) {
      throw new ConvexError({
        code: "validation_error",
        message: `Cannot generate variants: malformed option types — ${shapeIssues[0].message} at ${shapeIssues[0].path}`,
      });
    }

    // Build cartesian product of all option values
    function cartesian(arrays: any[][]): any[][] {
      return arrays.reduce(
        (acc: any[][], arr: any[]) =>
          acc.flatMap((combo: any[]) => arr.map((item: any) => [...combo, item])),
        [[]] as any[][],
      );
    }

    const valueArrays = optionTypes
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((ot: any) =>
        (ot.values ?? []).map((val: any) => ({
          typeId: ot.id,
          typeName: ot.name,
          ...val,
        })),
      );

    if (valueArrays.some((a: any[]) => a.length === 0)) {
      throw new ConvexError({ code: "empty_values", message: "One or more option types have no values" });
    }

    const combos = cartesian(valueArrays);

    // Get existing variants
    const existing = await ctx.db
      .query("commerce_product_variants")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .collect();

    const existingSelectionKeys = new Set(
      existing.map((v: any) => v.selectionKey).filter(Boolean),
    );

    const currency = product.basePrice?.currencyCode ?? "USD";
    const basePrice = args.basePriceAmount ?? product.basePrice?.amount ?? 0;
    const now = Date.now();
    let created = 0;

    for (const combo of combos) {
      const selections = combo.map((c: any, index: number) => ({
        optionTypeId: c.typeId,
        optionTypeName: c.typeName,
        optionValueId: c.id,
        optionValueLabel: c.label,
        sortOrder: index,
      }));
      const summary = selections
        .map((selection: any) => `${selection.optionTypeName}: ${selection.optionValueLabel}`)
        .join(" / ");
      const selectionKey = buildSelectionKey(selections);
      if (selectionKey && existingSelectionKeys.has(selectionKey)) continue;

      await ctx.db.insert("commerce_product_variants", {
        productId: args.productId,
        title: selections.map((selection: any) => selection.optionValueLabel).join(" / "),
        optionSummary: summary,
        selections,
        selectionKey,
        price: { amount: basePrice, currencyCode: currency },
        isDefault: created === 0 && existing.length === 0,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    // Update product type if we created variants
    if (created > 0 && product.productType !== "variable") {
      await ctx.db.patch(args.productId, { productType: "variable", updatedAt: now });
    }

    return { created, total: combos.length };
  },
});

// ============================================
// BULK ACTIONS
// ============================================

/**
 * Bulk update product status.
 */
export const bulkUpdateStatus = mutation({
  args: {
    productIds: v.array(v.id("commerce_products")),
    status: v.union(
      v.literal("draft"),
      v.literal("publish"),
      v.literal("private"),
      v.literal("trash"),
    ),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const now = Date.now();
    let updated = 0;

    for (const id of args.productIds) {
      const product = await ctx.db.get(id);
      if (!product) continue;
      if (args.status !== "publish") {
        await assertProductBundleLifecycleAllowed(ctx, id, "unpublish");
      }

      const patch: any = { status: args.status, updatedAt: now };
      if (args.status === "publish" && product.status !== "publish") {
        patch.publishedAt = now;
      }

      await ctx.db.patch(id, patch);
      updated++;
    }

    return { updated };
  },
});

/**
 * Bulk delete products (permanent).
 */
export const bulkDelete = mutation({
  args: {
    productIds: v.array(v.id("commerce_products")),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let deleted = 0;
    const errors: string[] = [];

    for (const id of args.productIds) {
      try {
        const product = await ctx.db.get(id);
        if (!product) continue;
        await assertProductBundleLifecycleAllowed(ctx, id, "delete");

        // Delete variants
        const variants = await ctx.db
          .query("commerce_product_variants")
          .withIndex("by_product", (q: any) => q.eq("productId", id))
          .collect();
        for (const v of variants) {
          await ctx.db.delete(v._id);
        }

        await ctx.db.delete(id);
        deleted++;
      } catch (e: any) {
        errors.push(`${id}: ${e?.message ?? "Unknown error"}`);
      }
    }

    return { deleted, errors };
  },
});

/**
 * Archive a product (set status to trash).
 */
export const archiveProduct = mutation({
  args: { productId: v.id("commerce_products") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });
    await assertProductBundleLifecycleAllowed(ctx, args.productId, "unpublish");

    await ctx.db.patch(args.productId, {
      status: "trash",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Restore a trashed product (set status to draft).
 */
export const restoreProduct = mutation({
  args: { productId: v.id("commerce_products") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    if (product.status !== "trash") {
      throw new ConvexError({ code: "invalid_status", message: "Product is not in trash" });
    }

    await ctx.db.patch(args.productId, {
      status: "draft",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
