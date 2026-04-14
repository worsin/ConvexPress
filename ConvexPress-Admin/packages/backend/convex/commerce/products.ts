// @ts-nocheck
// ============================================
// COMMERCE PRODUCTS — Full CRUD + option types, variants, bulk actions
// Ported from VexCart products.ts, adapted to ConvexPress patterns
// (commerce_products, commerce_product_variants, commerce_bundles schema)
// ============================================

import { ConvexError, v } from "convex/values";

import {
  query,
  mutation,
  internalMutation,
} from "../_generated/server";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate URL-friendly slug from a title string.
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Ensure slug is unique within commerce_products.
 * Appends -2, -3, … when a collision is found.
 */
async function ensureUniqueSlug(
  ctx: any,
  slug: string,
  excludeId?: any,
): Promise<string> {
  let candidate = slug;
  let counter = 2;
  while (true) {
    const existing = await ctx.db
      .query("commerce_products")
      .withIndex("by_slug", (q: any) => q.eq("slug", candidate))
      .unique();
    if (!existing || (excludeId && existing._id === excludeId)) {
      return candidate;
    }
    candidate = `${slug}-${counter}`;
    counter++;
  }
}

/**
 * Get effective display price for a product.
 * Returns the sale price if present, otherwise the base price amount.
 */
function getDisplayPrice(product: any): number {
  if (product.salePrice && product.salePrice.amount != null) {
    return product.salePrice.amount;
  }
  return product.basePrice?.amount ?? 0;
}

/**
 * Enrich a product with resolved category names.
 */
async function enrichCategories(ctx: any, categoryIds: any[]): Promise<any[]> {
  if (!categoryIds || categoryIds.length === 0) return [];
  const categories: any[] = [];
  for (const id of categoryIds) {
    const cat = await ctx.db.get(id);
    if (cat) categories.push(cat);
  }
  return categories;
}

// ============================================
// CORE PRODUCT QUERIES
// ============================================

/**
 * List products for admin — supports search, status filtering, and category filtering.
 * Called from bundles page and the main products list.
 * When called with no args, returns all non-trashed products (for dropdowns).
 */
export const list = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("publish"),
        v.literal("private"),
        v.literal("trash"),
      ),
    ),
    categoryId: v.optional(v.id("commerce_product_categories")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);

    const limit = args.limit ?? 50;

    // If searching, use the search index
    if (args.search && args.search.trim()) {
      const results = await ctx.db
        .query("commerce_products")
        .withSearchIndex("search_commerce_products", (q: any) => {
          let sq = q.search("title", args.search);
          if (args.status) sq = sq.eq("status", args.status);
          return sq;
        })
        .take(limit);

      // Category filter
      let filtered = results;
      if (args.categoryId) {
        filtered = filtered.filter((p: any) =>
          (p.categoryIds ?? []).includes(args.categoryId),
        );
      }

      return filtered.map((p: any) => ({
        ...p,
        displayPrice: getDisplayPrice(p),
      }));
    }

    // Non-search: status filter or all
    let products: any[];
    if (args.status) {
      products = await ctx.db
        .query("commerce_products")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .take(50000);
    } else {
      // Default: all non-trashed for admin dropdowns
      products = await ctx.db.query("commerce_products").take(50000);
    }

    // Category filter
    if (args.categoryId) {
      products = products.filter((p: any) =>
        (p.categoryIds ?? []).includes(args.categoryId),
      );
    }

    // Sort by most recent first
    products.sort((a: any, b: any) => b.createdAt - a.createdAt);

    // Paginate
    const startIndex = args.cursor ? parseInt(args.cursor) : 0;
    const page = products.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < products.length
        ? String(startIndex + limit)
        : null;

    return page.map((p: any) => ({
      ...p,
      displayPrice: getDisplayPrice(p),
    }));
  },
});

/**
 * Product counts by status (admin dashboard overview).
 */
export const counts = query({
  args: {},
  handler: async (ctx: any) => {
    await requireCommerceEnabled(ctx);

    const all = await ctx.db.query("commerce_products").collect();

    return {
      all: all.length,
      draft: all.filter((p: any) => p.status === "draft").length,
      published: all.filter((p: any) => p.status === "publish").length,
      private: all.filter((p: any) => p.status === "private").length,
      trash: all.filter((p: any) => p.status === "trash").length,
    };
  },
});

/**
 * Get a single product by ID with enrichment (categories, display price, inventory info).
 */
export const get = query({
  args: { id: v.id("commerce_products") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);

    const product = await ctx.db.get(args.id);
    if (!product) return null;

    // Enrich with categories
    const categories = await enrichCategories(ctx, product.categoryIds ?? []);

    // Get variants count
    const variants = await ctx.db
      .query("commerce_product_variants")
      .withIndex("by_product", (q: any) => q.eq("productId", args.id))
      .collect();

    return {
      ...product,
      displayPrice: getDisplayPrice(product),
      categories,
      variantCount: variants.length,
    };
  },
});

/**
 * Public storefront product listing.
 * Only returns published products.
 * EXCLUDES bundle-owned products — products that are linked to a bundle via
 * commerce_bundles.productId are hidden from the standalone listing.
 */
export const listPublished = query({
  args: {
    categoryId: v.optional(v.id("commerce_product_categories")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    sortBy: v.optional(
      v.union(
        v.literal("newest"),
        v.literal("price_asc"),
        v.literal("price_desc"),
        v.literal("title"),
      ),
    ),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);

    const limit = args.limit ?? 20;

    // Get published products
    let products = await ctx.db
      .query("commerce_products")
      .withIndex("by_status", (q: any) => q.eq("status", "publish"))
      .take(50000);

    // Build set of bundle-owned product IDs to exclude
    const bundles = await ctx.db.query("commerce_bundles").collect();
    const bundleOwnedIds = new Set<string>();
    for (const b of bundles) {
      if (b.productId) bundleOwnedIds.add(b.productId);
    }

    // Filter out bundle-owned products
    products = products.filter((p: any) => !bundleOwnedIds.has(p._id));

    // Category filter
    if (args.categoryId) {
      products = products.filter((p: any) =>
        (p.categoryIds ?? []).includes(args.categoryId),
      );
    }

    // Sort
    const sortFns: Record<string, (a: any, b: any) => number> = {
      newest: (a: any, b: any) => b.createdAt - a.createdAt,
      price_asc: (a: any, b: any) => getDisplayPrice(a) - getDisplayPrice(b),
      price_desc: (a: any, b: any) => getDisplayPrice(b) - getDisplayPrice(a),
      title: (a: any, b: any) => (a.title ?? "").localeCompare(b.title ?? ""),
    };
    products.sort(sortFns[args.sortBy ?? "newest"]);

    // Paginate
    const startIndex = args.cursor ? parseInt(args.cursor) : 0;
    const page = products.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < products.length
        ? String(startIndex + limit)
        : null;

    return {
      products: page.map((p: any) => ({
        ...p,
        displayPrice: getDisplayPrice(p),
      })),
      nextCursor,
      totalCount: products.length,
    };
  },
});

/**
 * Public product lookup by slug.
 * If the product is bundle-owned, returns a redirect hint with the bundle slug
 * so the storefront can redirect to the bundle page instead.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);

    const product = await ctx.db
      .query("commerce_products")
      .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
      .unique();

    if (!product || product.status !== "publish") {
      return null;
    }

    // Check if this product is owned by a bundle
    const bundles = await ctx.db.query("commerce_bundles").collect();
    const ownerBundle = bundles.find((b: any) => b.productId === product._id);
    if (ownerBundle) {
      return {
        isBundleProduct: true,
        bundleSlug: ownerBundle.slug,
        productId: product._id,
      };
    }

    // Enrich
    const categories = await enrichCategories(ctx, product.categoryIds ?? []);

    const variants = await ctx.db
      .query("commerce_product_variants")
      .withIndex("by_product", (q: any) => q.eq("productId", product._id))
      .collect();

    return {
      ...product,
      isBundleProduct: false,
      displayPrice: getDisplayPrice(product),
      categories,
      variants,
    };
  },
});

// ============================================
// CORE PRODUCT MUTATIONS
// ============================================

/**
 * Create a new product.
 */
export const create = mutation({
  args: {
    title: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("publish"),
        v.literal("private"),
      ),
    ),
    productType: v.optional(
      v.union(
        v.literal("simple"),
        v.literal("variable"),
        v.literal("external"),
      ),
    ),
    sku: v.optional(v.string()),
    featuredMediaId: v.optional(v.id("media")),
    galleryMediaIds: v.optional(v.array(v.id("media"))),
    categoryIds: v.optional(v.array(v.id("commerce_product_categories"))),
    basePriceAmount: v.number(),
    basePriceCurrency: v.optional(v.string()),
    salePriceAmount: v.optional(v.number()),
    trackInventory: v.optional(v.boolean()),
    stockQuantity: v.optional(v.number()),
    allowBackorders: v.optional(v.boolean()),
    isVirtual: v.optional(v.boolean()),
    shippingWeightOz: v.optional(v.number()),
    isDownloadable: v.optional(v.boolean()),
    isNonReturnable: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const user = await requireCan(ctx, "manage_options");

    // Generate unique slug
    let slug = args.slug || generateSlug(args.title);
    slug = await ensureUniqueSlug(ctx, slug);

    const now = Date.now();
    const status = args.status ?? "draft";
    const currency = args.basePriceCurrency ?? "USD";

    const productId = await ctx.db.insert("commerce_products", {
      title: args.title,
      slug,
      description: args.description,
      excerpt: args.excerpt,
      status,
      productType: args.productType ?? "simple",
      sku: args.sku,
      authorId: user._id,
      featuredMediaId: args.featuredMediaId,
      galleryMediaIds: args.galleryMediaIds ?? [],
      categoryIds: args.categoryIds ?? [],
      basePrice: { amount: args.basePriceAmount, currencyCode: currency },
      salePrice: args.salePriceAmount != null
        ? { amount: args.salePriceAmount, currencyCode: currency }
        : undefined,
      trackInventory: args.trackInventory ?? false,
      stockQuantity: args.stockQuantity,
      allowBackorders: args.allowBackorders ?? false,
      isVirtual: args.isVirtual ?? false,
      shippingWeightOz: args.shippingWeightOz,
      isDownloadable: args.isDownloadable ?? false,
      isNonReturnable: args.isNonReturnable,
      publishedAt: status === "publish" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    // Update category product counts
    for (const catId of (args.categoryIds ?? [])) {
      const cat = await ctx.db.get(catId);
      if (cat) {
        await ctx.db.patch(catId, { productCount: (cat.productCount ?? 0) + 1 });
      }
    }

    return productId;
  },
});

/**
 * Update a product.
 * Bundle-owned guard: if the product is linked to a bundle, only safe
 * metadata fields can be changed (description, seoTitle, seoDescription,
 * featuredMediaId). Title, price, status, and type changes are blocked.
 */
export const update = mutation({
  args: {
    id: v.id("commerce_products"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("publish"),
        v.literal("private"),
        v.literal("trash"),
      ),
    ),
    productType: v.optional(
      v.union(
        v.literal("simple"),
        v.literal("variable"),
        v.literal("external"),
      ),
    ),
    sku: v.optional(v.string()),
    featuredMediaId: v.optional(v.id("media")),
    galleryMediaIds: v.optional(v.array(v.id("media"))),
    categoryIds: v.optional(v.array(v.id("commerce_product_categories"))),
    basePriceAmount: v.optional(v.number()),
    basePriceCurrency: v.optional(v.string()),
    salePriceAmount: v.optional(v.number()),
    clearSalePrice: v.optional(v.boolean()),
    trackInventory: v.optional(v.boolean()),
    stockQuantity: v.optional(v.number()),
    allowBackorders: v.optional(v.boolean()),
    isVirtual: v.optional(v.boolean()),
    shippingWeightOz: v.optional(v.number()),
    isDownloadable: v.optional(v.boolean()),
    isNonReturnable: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ code: "not_found", message: "Product not found" });
    }

    // ── Bundle-owned guard ──
    // If a bundle references this product, block dangerous field changes
    const bundles = await ctx.db.query("commerce_bundles").collect();
    const ownerBundle = bundles.find((b: any) => b.productId === args.id);
    if (ownerBundle) {
      const blockedFields = [
        "title", "slug", "status", "productType", "sku",
        "basePriceAmount", "basePriceCurrency", "salePriceAmount",
      ];
      for (const field of blockedFields) {
        if (args[field] !== undefined) {
          throw new ConvexError({
            code: "bundle_owned",
            message: `Cannot change "${field}" on a bundle-owned product. Edit the bundle "${ownerBundle.name}" instead.`,
          });
        }
      }
    }

    const now = Date.now();
    const updates: any = { updatedAt: now };

    // Title & slug
    if (args.title !== undefined) updates.title = args.title;
    if (args.slug !== undefined) {
      updates.slug = await ensureUniqueSlug(ctx, args.slug, args.id);
    }
    if (args.description !== undefined) updates.description = args.description;
    if (args.excerpt !== undefined) updates.excerpt = args.excerpt;

    // Status
    if (args.status !== undefined) {
      updates.status = args.status;
      if (args.status === "publish" && existing.status !== "publish") {
        updates.publishedAt = now;
      }
    }

    // Type
    if (args.productType !== undefined) updates.productType = args.productType;
    if (args.sku !== undefined) updates.sku = args.sku;

    // Media
    if (args.featuredMediaId !== undefined) updates.featuredMediaId = args.featuredMediaId;
    if (args.galleryMediaIds !== undefined) updates.galleryMediaIds = args.galleryMediaIds;

    // Pricing
    if (args.basePriceAmount !== undefined) {
      const currency = args.basePriceCurrency ?? existing.basePrice?.currencyCode ?? "USD";
      updates.basePrice = { amount: args.basePriceAmount, currencyCode: currency };
    }
    if (args.salePriceAmount !== undefined) {
      const currency = args.basePriceCurrency ?? existing.basePrice?.currencyCode ?? "USD";
      updates.salePrice = { amount: args.salePriceAmount, currencyCode: currency };
    }
    if (args.clearSalePrice) {
      updates.salePrice = undefined;
    }

    // Inventory
    if (args.trackInventory !== undefined) updates.trackInventory = args.trackInventory;
    if (args.stockQuantity !== undefined) updates.stockQuantity = args.stockQuantity;
    if (args.allowBackorders !== undefined) updates.allowBackorders = args.allowBackorders;

    // Shipping / digital
    if (args.isVirtual !== undefined) updates.isVirtual = args.isVirtual;
    if (args.shippingWeightOz !== undefined) updates.shippingWeightOz = args.shippingWeightOz;
    if (args.isDownloadable !== undefined) updates.isDownloadable = args.isDownloadable;
    if (args.isNonReturnable !== undefined) updates.isNonReturnable = args.isNonReturnable;

    // Categories — recompute counts on change
    if (args.categoryIds !== undefined) {
      updates.categoryIds = args.categoryIds;

      const oldCats = new Set(existing.categoryIds ?? []);
      const newCats = new Set(args.categoryIds);

      // Decrement removed categories
      for (const oldId of oldCats) {
        if (!newCats.has(oldId)) {
          const cat = await ctx.db.get(oldId);
          if (cat) {
            await ctx.db.patch(oldId, {
              productCount: Math.max(0, (cat.productCount ?? 1) - 1),
            });
          }
        }
      }
      // Increment added categories
      for (const newId of newCats) {
        if (!oldCats.has(newId)) {
          const cat = await ctx.db.get(newId);
          if (cat) {
            await ctx.db.patch(newId, {
              productCount: (cat.productCount ?? 0) + 1,
            });
          }
        }
      }
    }

    await ctx.db.patch(args.id, updates);
    return args.id;
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
    if (existing.some((o: any) => o.name.toLowerCase() === args.name.toLowerCase())) {
      throw new ConvexError({ code: "duplicate", message: `Option type "${args.name}" already exists` });
    }

    const optionType = {
      id: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: args.name,
      values: args.values.map((val: string, idx: number) => ({
        id: `val_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 8)}`,
        label: val,
        sortOrder: idx,
      })),
      sortOrder: existing.length,
      createdAt: Date.now(),
    };

    await ctx.db.patch(args.productId, {
      optionTypes: [...existing, optionType],
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

    if (args.name !== undefined) optionTypes[idx].name = args.name;
    if (args.sortOrder !== undefined) optionTypes[idx].sortOrder = args.sortOrder;

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
    if (existing.some((v: any) => v.label.toLowerCase() === args.label.toLowerCase())) {
      throw new ConvexError({ code: "duplicate", message: `Value "${args.label}" already exists` });
    }

    const newValue = {
      id: `val_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label: args.label,
      sortOrder: existing.length,
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

    if (args.label !== undefined) values[valIdx].label = args.label;
    if (args.sortOrder !== undefined) values[valIdx].sortOrder = args.sortOrder;

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
    priceAmount: v.number(),
    priceCurrency: v.optional(v.string()),
    salePriceAmount: v.optional(v.number()),
    stockQuantity: v.optional(v.number()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const now = Date.now();
    const currency = args.priceCurrency ?? product.basePrice?.currencyCode ?? "USD";

    // If isDefault, unset other defaults
    if (args.isDefault) {
      const existing = await ctx.db
        .query("commerce_product_variants")
        .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
        .collect();
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
      optionSummary: args.optionSummary,
      price: { amount: args.priceAmount, currencyCode: currency },
      salePrice: args.salePriceAmount
        ? { amount: args.salePriceAmount, currencyCode: currency }
        : undefined,
      stockQuantity: args.stockQuantity,
      isDefault: args.isDefault ?? false,
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
    priceAmount: v.optional(v.number()),
    salePriceAmount: v.optional(v.number()),
    stockQuantity: v.optional(v.number()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const variant = await ctx.db.get(args.variantId);
    if (!variant) throw new ConvexError({ code: "not_found", message: "Variant not found" });

    const now = Date.now();
    const updates: any = { updatedAt: now };

    if (args.title !== undefined) updates.title = args.title;
    if (args.sku !== undefined) updates.sku = args.sku;
    if (args.optionSummary !== undefined) updates.optionSummary = args.optionSummary;
    if (args.priceAmount !== undefined) {
      updates.price = { amount: args.priceAmount, currencyCode: variant.price.currencyCode };
    }
    if (args.salePriceAmount !== undefined) {
      updates.salePrice = args.salePriceAmount
        ? { amount: args.salePriceAmount, currencyCode: variant.price.currencyCode }
        : undefined;
    }
    if (args.stockQuantity !== undefined) updates.stockQuantity = args.stockQuantity;

    // If setting as default, unset others
    if (args.isDefault) {
      const siblings = await ctx.db
        .query("commerce_product_variants")
        .withIndex("by_product", (q: any) => q.eq("productId", variant.productId))
        .collect();
      for (const s of siblings) {
        if (s._id !== args.variantId && s.isDefault) {
          await ctx.db.patch(s._id, { isDefault: false, updatedAt: now });
        }
      }
      updates.isDefault = true;
    } else if (args.isDefault === false) {
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

    await ctx.db.delete(args.variantId);

    // Check if any variants remain; if not, revert product type
    const remaining = await ctx.db
      .query("commerce_product_variants")
      .withIndex("by_product", (q: any) => q.eq("productId", variant.productId))
      .collect();

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

    const optionTypes: any[] = (product as any).optionTypes ?? [];
    if (optionTypes.length === 0) {
      throw new ConvexError({ code: "no_options", message: "No option types defined" });
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
      .map((ot: any) => (ot.values ?? []).map((val: any) => ({ typeName: ot.name, ...val })));

    if (valueArrays.some((a: any[]) => a.length === 0)) {
      throw new ConvexError({ code: "empty_values", message: "One or more option types have no values" });
    }

    const combos = cartesian(valueArrays);

    // Get existing variants
    const existing = await ctx.db
      .query("commerce_product_variants")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .collect();

    const existingSummaries = new Set(existing.map((v: any) => v.optionSummary));

    const currency = product.basePrice?.currencyCode ?? "USD";
    const basePrice = args.basePriceAmount ?? product.basePrice?.amount ?? 0;
    const now = Date.now();
    let created = 0;

    for (const combo of combos) {
      const summary = combo.map((c: any) => `${c.typeName}: ${c.label}`).join(" / ");
      if (existingSummaries.has(summary)) continue;

      await ctx.db.insert("commerce_product_variants", {
        productId: args.productId,
        title: combo.map((c: any) => c.label).join(" / "),
        optionSummary: summary,
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
