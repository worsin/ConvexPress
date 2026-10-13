import { validateSaleSchedule } from "./saleSchedule";
import { resolveProductTags, readProductTagAssignments } from "./productTags";
import { activePriceAmount } from "./activePrice";
import { publicProductDetail, publicProductSummary } from "./publicProduct";
import { createPublicProductAccessReader } from "./publicProductAccess";
import { filterPublicCategoryHierarchy } from "./categoryVisibility";
import type { Doc, Id } from "../_generated/dataModel";
import type { WithoutSystemFields } from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
// ============================================
// ADVANCED PRODUCT FEATURES — Option types, option values,
// product variants, bulk actions, archive / restore
// Ported from VexCart products.ts, adapted to ConvexPress patterns
// (commerce_products, commerce_product_variants schema)
// ============================================

import { requireAssignableBrand } from "./brands";
import { ConvexError, v } from "convex/values";

import {
  query,
  mutation,
} from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { sanitizeSlug } from "../helpers/slug";
import { emitEvent } from "../helpers/events";
import { PRODUCT_EVENTS, SYSTEM } from "../events/constants";
import {
  ensureDefaultProductCategory,
  recomputeAllProductCategoryCounts,
} from "./categories";
import { requireCommerceEnabled } from "./helpers";
import { syncProductSearch } from "../search/products";
import {
  normalizeVariantSelections,
  buildSelectionKey,
  buildOptionSummaryFromSelections,
  normalizeName,
  validateVariantSelectionsResult,
  getVariantDisplayPrice,
  validateOptionTypesShape,
  readOptionTypes,
  type OptionType,
  type OptionValue,
  type VariantSelectionInput,
} from "./variantHelpers";
import {
  createCommerceProductArgs,
  getCommerceProductArgs,
  getCommerceProductBySlugArgs,
  listCommerceProductsArgs,
  listPublishedCommerceProductsArgs,
  productBulkArgs,
  productBulkUpdateStatusArgs,
  productCountsArgs,
  updateCommerceProductArgs,
} from "./validators";
import { deleteWithMediaReferences, insertWithMediaReferences, patchWithMediaReferences } from "../media/attachmentGuard";

import { commerceDocs } from "../schema/commerce.docs.generated";
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

type ReadCtx = Pick<QueryCtx, "db">;
type ProductId = Id<"commerce_products">;
type VariantId = Id<"commerce_product_variants">;
type CategoryId = Id<"commerce_product_categories">;
type ProductDoc = Doc<"commerce_products">;

async function listVariantsByProduct(ctx: ReadCtx, productId: ProductId) {
  return ctx.db
    .query("commerce_product_variants")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .collect();
}

function getProductStatusEvent(previousStatus: string | undefined, nextStatus: string | undefined) {
  if (previousStatus === nextStatus) return PRODUCT_EVENTS.UPDATED;
  if (nextStatus === "publish") return PRODUCT_EVENTS.PUBLISHED;
  if (nextStatus === "trash") return PRODUCT_EVENTS.TRASHED;
  if (previousStatus === "trash") return PRODUCT_EVENTS.RESTORED;
  if (previousStatus === "publish" && nextStatus !== "publish") {
    return PRODUCT_EVENTS.UNPUBLISHED;
  }
  return PRODUCT_EVENTS.UPDATED;
}

async function getProductSlugForEvent(ctx: ReadCtx, productId: ProductId) {
  const product = await ctx.db.get(productId);
  return product?.slug;
}

/**
 * Variant `shippingClassId` arrives as a string; the column holds an Id. An
 * empty string clears it; anything that is not a shipping class id is rejected
 * (the write used to fail schema validation instead).
 */
function resolveShippingClassId(
  ctx: ReadCtx,
  value: string | undefined,
): Id<"commerce_shipping_classes"> | undefined {
  if (value === undefined || value === "") return undefined;
  const id = ctx.db.normalizeId("commerce_shipping_classes", value);
  if (!id) {
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "Unknown shipping class." });
  }
  return id;
}

function validateVariantSelections(optionTypes: OptionType[], selections: VariantSelectionInput[] | undefined) {
  const result = validateVariantSelectionsResult(optionTypes, selections);
  if (!result.ok) {
    throw new ConvexError({ ...result.error });
  }
  return result.selections;
}

async function getVariantReferenceSummary(ctx: ReadCtx, variantId: VariantId) {
  const { db } = ctx;
  const tables: Array<{ label: string; rows: () => Promise<Array<{ variantId?: VariantId }>> }> = [
    { label: "cart items", rows: () => db.query("commerce_cart_items").collect() },
    { label: "order items", rows: () => db.query("commerce_order_items").collect() },
    { label: "wishlist items", rows: () => db.query("commerce_wishlist_items").collect() },
    { label: "digital files", rows: () => db.query("commerce_digital_files").collect() },
    { label: "license keys", rows: () => db.query("commerce_license_keys").collect() },
    { label: "bundle components", rows: () => db.query("commerce_bundle_components").collect() },
    { label: "subscription items", rows: () => db.query("commerce_subscription_items").collect() },
    { label: "return items", rows: () => db.query("commerce_return_items").collect() },
    { label: "stock reservations", rows: () => db.query("commerce_stock_reservations").collect() },
    { label: "inventory adjustments", rows: () => db.query("commerce_inventory_adjustments").collect() },
  ];

  const references: Array<{ label: string; count: number }> = [];

  for (const table of tables) {
    const rows = (await table.rows()).filter(
      (row) => row.variantId?.toString() === variantId.toString(),
    );
    if (rows.length > 0) {
      references.push({ label: table.label, count: rows.length });
    }
  }

  const bundleSelections = await ctx.db.query("commerce_bundle_selections").collect();
  const bundleSelectionCount = bundleSelections.filter((row) =>
    (row.selections ?? []).some(
      (selection) => selection.variantId?.toString() === variantId.toString(),
    ),
  ).length;
  if (bundleSelectionCount > 0) {
    references.push({ label: "bundle selections", count: bundleSelectionCount });
  }

  return references;
}

async function getBundleProductReferenceSummary(ctx: ReadCtx, productId: ProductId) {
  const references: Array<{ label: string; count: number }> = [];

  const owningBundle = await ctx.db
    .query("commerce_bundles")
    .withIndex("by_product", (q) => q.eq("productId", productId))
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
    .withIndex("by_product", (q) => q.eq("productId", productId))
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
  ctx: ReadCtx,
  productId: ProductId,
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
  ctx: ReadCtx,
  value: string,
  excludeId?: string,
): Promise<string> {
  const base = slugifyCommerceProduct(value);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await ctx.db
      .query("commerce_products")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique();

    if (!existing || existing._id.toString() === excludeId) {
      return candidate;
    }

    candidate = `${base}-${suffix++}`;
  }
}

async function assertCategoriesExist(ctx: ReadCtx, categoryIds: CategoryId[]) {
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

function dedupeIds<T extends string>(ids: T[]): T[] {
  return ids.filter(
    (value, index, array) =>
      array.findIndex((candidate) => candidate.toString() === value.toString()) ===
      index,
  );
}

async function resolveProductCategoryIds(ctx: MutationCtx, categoryIds: CategoryId[] | undefined): Promise<CategoryId[]> {
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

async function recomputeCategoryCounts(ctx: MutationCtx, categoryIds: CategoryId[]) {
  void categoryIds;
  await recomputeAllProductCategoryCounts(ctx);
}

async function loadCategoriesByIds(ctx: ReadCtx, categoryIds: CategoryId[]) {
  const categories = await Promise.all(
    categoryIds.map((categoryId) =>
      ctx.db.get("commerce_product_categories", categoryId),
    ),
  );

  return categories
    .filter((category): category is Doc<"commerce_product_categories"> => category !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function collectCategoryDescendants(categories: Doc<"commerce_product_categories">[], categoryId: CategoryId) {
  const ids = new Set<string>([categoryId.toString()]);
  const visit = (parentId: CategoryId) => {
    for (const category of categories) {
      if (category.parentId?.toString() === parentId.toString() && !ids.has(category._id.toString())) {
        ids.add(category._id.toString());
        visit(category._id);
      }
    }
  };
  visit(categoryId);
  return ids;
}

async function computeDisplayPrice(ctx: ReadCtx, product: ProductDoc) {
  if (product.productType !== "variable") {
    return activePriceAmount(product.basePrice, product.salePrice, product);
  }

  const allVariants = await ctx.db
    .query("commerce_product_variants")
    .withIndex("by_product", (q) => q.eq("productId", product._id))
    .collect();
  const variants = allVariants.filter((variant) => !variant.status || variant.status === "publish");

  if (variants.length === 0) {
    return activePriceAmount(product.basePrice, product.salePrice, product);
  }

  const defaultVariant = variants.find((variant) => variant.isDefault);
  if (defaultVariant) {
    return getVariantDisplayPrice(defaultVariant);
  }

  return variants.reduce(
    (lowest: number, variant) =>
      Math.min(lowest, getVariantDisplayPrice(variant)),
    Number.POSITIVE_INFINITY,
  );
}


async function serializeProductSummary(ctx: QueryCtx, product: Doc<"commerce_products">) {
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

async function serializeProductDetail(ctx: QueryCtx, product: Doc<"commerce_products">) {
  const [categories, displayPrice, inventoryAdjustments, variants] = await Promise.all([
    loadCategoriesByIds(ctx, product.categoryIds ?? []),
    computeDisplayPrice(ctx, product),
    ctx.db
      .query("commerce_inventory_adjustments")
      .withIndex("by_product", (q) => q.eq("productId", product._id))
      .order("desc")
      .take(10),
    ctx.db
      .query("commerce_product_variants")
      .withIndex("by_product", (q) => q.eq("productId", product._id))
      .collect(),
  ]);

  return {
    ...product,
    categories,
    displayPrice: Number.isFinite(displayPrice) ? displayPrice : undefined,
    inventoryAdjustments,
    variants: variants.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.title.localeCompare(b.title);
    }),
  };
}

const PRODUCT_STATUSES = ["draft", "publish", "private", "trash"] as const;

/** A product row as the admin lists show it: the document plus its categories and display price. */
const productSummaryFields = {
  ...commerceDocs.commerce_products.fields,
  categories: v.array(commerceDocs.commerce_product_categories),
  displayPrice: v.optional(v.number()),
};

const optionValueValidator = v.object({
  id: v.string(),
  label: v.string(),
  sortOrder: v.number(),
  active: v.optional(v.boolean()),
});

const optionTypeValidator = v.object({
  id: v.string(),
  name: v.string(),
  values: v.array(optionValueValidator),
  sortOrder: v.number(),
  createdAt: v.optional(v.number()),
});
const PRODUCTS_DEFAULT_PER_PAGE = 20;
const PRODUCTS_MAX_PER_PAGE = 100;

function applyProductFilters(
  products: ProductDoc[],
  args: { status?: string; productType?: string; authorId?: string },
): ProductDoc[] {
  let out = products;
  const { status, productType, authorId } = args;
  if (status) out = out.filter((p) => p.status === status);
  if (productType) out = out.filter((p) => p.productType === productType);
  if (authorId) out = out.filter((p) => p.authorId?.toString() === authorId.toString());
  return out;
}

function sortProducts(products: ProductDoc[], orderBy?: string, orderDir?: "asc" | "desc") {
  const dir = orderDir === "asc" ? 1 : -1;
  const key = orderBy ?? "updatedAt";
  products.sort((a, b) => {
    let av: string | number;
    let bv: string | number;
    switch (key) {
      case "title":
        av = (a.title ?? "").toLowerCase();
        bv = (b.title ?? "").toLowerCase();
        break;
      case "sku":
        av = a.sku ?? "";
        bv = b.sku ?? "";
        break;
      case "status":
        av = a.status ?? "";
        bv = b.status ?? "";
        break;
      case "createdAt":
        av = a.createdAt ?? 0;
        bv = b.createdAt ?? 0;
        break;
      case "updatedAt":
      default:
        av = a.updatedAt ?? 0;
        bv = b.updatedAt ?? 0;
        break;
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

/**
 * Lightweight unpaginated list for pickers (bundle component picker,
 * digital file picker, membership resource picker, etc.). Returns up to
 * 5000 products as a plain array. Each item has only identification +
 * status fields — no category/price enrichment. Use `list` for paginated
 * admin tables; use this for searchable pickers that need the whole set.
 */
export const listAll = query({
  args: {
    status: v.optional(v.string()),
    isDownloadable: v.optional(v.boolean()),
  },
  returns: v.array(v.object({
    _id: v.id("commerce_products"),
    title: v.string(),
    slug: v.string(),
    status: v.union(v.literal("draft"), v.literal("trash"), v.literal("publish"), v.literal("private")),
    sku: v.optional(v.string()),
    productType: v.union(v.literal("simple"), v.literal("variable"), v.literal("external")),
    isDownloadable: v.boolean(),
  })),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let products: ProductDoc[];
    if (args.status) {
      // Unknown statuses match no rows, as the index lookup did before.
      const status = PRODUCT_STATUSES.find((candidate) => candidate === args.status);
      products = status
        ? await ctx.db
            .query("commerce_products")
            .withIndex("by_status", (q) => q.eq("status", status))
            .take(5000)
        : [];
    } else {
      products = await ctx.db.query("commerce_products").take(5000);
    }
    if (args.isDownloadable !== undefined) {
      products = products.filter((p) => Boolean(p.isDownloadable) === args.isDownloadable);
    }
    products.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
    return products.map((p) => ({
      _id: p._id,
      title: p.title,
      slug: p.slug,
      status: p.status,
      sku: p.sku,
      productType: p.productType,
      isDownloadable: p.isDownloadable,
    }));
  },
});

export const list = query({
  args: listCommerceProductsArgs,
  returns: v.object({
    items: v.array(v.object(productSummaryFields)),
    total: v.number(),
    page: v.number(),
    perPage: v.number(),
    totalPages: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(PRODUCTS_MAX_PER_PAGE, Math.max(1, args.perPage ?? PRODUCTS_DEFAULT_PER_PAGE));

    let scoped: ProductDoc[];
    const { status, authorId } = args;

    // ── Search path ──────────────────────────────────────────────────────
    if (args.search && args.search.trim()) {
      const term = args.search.trim();
      scoped = await ctx.db
        .query("commerce_products")
        .withSearchIndex("search_commerce_products", (q) => {
          let sq = q.search("title", term);
          if (status) sq = sq.eq("status", status);
          if (authorId) sq = sq.eq("authorId", authorId);
          return sq;
        })
        .take(2000);
    } else if (status) {
      scoped = await ctx.db
        .query("commerce_products")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(20000);
    } else {
      scoped = await ctx.db.query("commerce_products").take(20000);
    }

    const filtered = applyProductFilters(scoped, args);
    sortProducts(filtered, args.orderBy, args.orderDir);

    const total = filtered.length;
    const totalPages = Math.ceil(total / perPage);
    const slice = filtered.slice((page - 1) * perPage, page * perPage);
    const items = await Promise.all(slice.map((p) => serializeProductSummary(ctx, p)));

    return { items, total, page, perPage, totalPages };
  },
});

export const counts = query({
  args: productCountsArgs,
  returns: v.record(v.string(), v.number()),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let products: ProductDoc[];
    const term = args.search?.trim();
    if (term) {
      products = await ctx.db
        .query("commerce_products")
        .withSearchIndex("search_commerce_products", (q) =>
          q.search("title", term),
        )
        .take(2000);
    } else {
      products = await ctx.db.query("commerce_products").take(20000);
    }

    const filtered = applyProductFilters(products, { productType: args.productType, authorId: args.authorId });

    const out: Record<string, number> = {
      all: filtered.length,
      draft: 0,
      publish: 0,
      private: 0,
      trash: 0,
    };
    for (const p of filtered) {
      if (out[p.status] !== undefined) out[p.status]++;
    }
    // Compatibility alias used by older UI code
    out.published = out.publish;
    return out;
  },
});

// ─── Bulk mutations ─────────────────────────────────────────────────────────
// Note: bulkUpdateStatus and bulkDelete are defined later in this file with
// richer logic (publishedAt handling, variant cascade, bundle lifecycle).
// Trash + Restore are added here since the existing file did not have them.

export const bulkTrash = mutation({
  args: productBulkArgs,
  returns: v.object({ count: v.number() }),
  handler: async (ctx, args): Promise<{ count: number }> => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const now = Date.now();
    let count = 0;
    for (const id of args.productIds) {
      const product = await ctx.db.get(id);
      if (!product) continue;
      if (product.status === "trash") continue;
      await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", id, { status: "trash", updatedAt: now });
      await emitEvent(ctx, PRODUCT_EVENTS.TRASHED, SYSTEM.PRODUCT, {
        productId: id,
        previousStatus: product.status,
        nextStatus: "trash",
      });
      count++;
    }
    return { count };
  },
});

export const bulkRestore = mutation({
  args: productBulkArgs,
  returns: v.object({ count: v.number() }),
  handler: async (ctx, args): Promise<{ count: number }> => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const now = Date.now();
    let count = 0;
    for (const id of args.productIds) {
      const product = await ctx.db.get(id);
      if (!product) continue;
      if (product.status !== "trash") continue;
      await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", id, { status: "draft", updatedAt: now });
      await emitEvent(ctx, PRODUCT_EVENTS.RESTORED, SYSTEM.PRODUCT, {
        productId: id,
        previousStatus: product.status,
        nextStatus: "draft",
      });
      count++;
    }
    return { count };
  },
});

export const get = query({
  args: getCommerceProductArgs,
  returns: v.union(
    v.null(),
    v.object({
      ...productSummaryFields,
      inventoryAdjustments: v.array(commerceDocs.commerce_inventory_adjustments),
      variants: v.array(commerceDocs.commerce_product_variants),
      tagNames: v.array(v.string()),
      missingTagIds: v.array(v.id("commerce_product_tags")),
    }),
  ),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) return null;
    const tags = await readProductTagAssignments(ctx,product.tagIds);
    return {...await serializeProductDetail(ctx,product),tagNames:tags.names,missingTagIds:tags.missingIds};
  },
});

export const getBySlug = query({
  args: getCommerceProductBySlugArgs,
  returns: v.union(v.null(), v.object({
    title: v.string(),
    slug: v.string(),
    excerpt: v.optional(v.string()),
    sku: v.optional(v.string()),
    productType: v.string(),
    basePrice: v.object({ amount: v.number(), currencyCode: v.optional(v.string()) }),
    featuredMediaId: v.optional(v.id("media")),
    galleryMediaIds: v.array(v.id("media")),
    salePrice: v.optional(v.object({ amount: v.number(), currencyCode: v.optional(v.string()) })),
    trackInventory: v.boolean(),
    stockQuantity: v.optional(v.number()),
    allowBackorders: v.boolean(),
    isVirtual: v.boolean(),
    salePriceFrom: v.optional(v.number()),
    salePriceTo: v.optional(v.number()),
    isDownloadable: v.boolean(),
    _id: v.id("commerce_products"),
    displayPrice: v.optional(v.number()),
    categories: v.array(v.object({ _id: v.id("commerce_product_categories"), name: v.string(), slug: v.string() })),
    compareAtPrice: v.optional(v.number()),
    pricedAt: v.number(),
    description: v.optional(v.string()),
    variants: v.array(v.object({
      salePriceFrom: v.optional(v.number()),
      salePriceTo: v.optional(v.number()),
      _id: v.id("commerce_product_variants"),
      title: v.string(),
      sku: v.optional(v.string()),
      optionSummary: v.string(),
      price: v.object({ amount: v.number(), currencyCode: v.optional(v.string()) }),
      salePrice: v.optional(v.object({ amount: v.number(), currencyCode: v.optional(v.string()) })),
      selections: v.optional(v.array(v.object({ optionTypeId: v.string(), optionValueId: v.string(), optionValueLabel: v.string() }))),
      featuredMediaId: v.optional(v.id("media")),
      galleryMediaIds: v.optional(v.array(v.id("media"))),
      stockQuantity: v.optional(v.number()),
      stockStatus: v.optional(v.union(v.literal("instock"), v.literal("outofstock"), v.literal("onbackorder"))),
      backorders: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("notify"))),
      manageStock: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("parent"))),
      description: v.optional(v.string()),
      isDefault: v.boolean(),
      status: v.optional(v.union(v.literal("draft"), v.literal("publish"), v.literal("private"))),
    })),
    optionTypes: v.array(v.object({
      id: v.string(),
      name: v.string(),
      values: v.array(v.object({ id: v.string(), label: v.string() })),
    })),
  }), v.object({
    isBundleProduct: v.boolean(),
    bundleSlug: v.string(),
    title: v.string(),
    slug: v.string(),
    excerpt: v.optional(v.string()),
    sku: v.optional(v.string()),
    productType: v.string(),
    basePrice: v.object({ amount: v.number(), currencyCode: v.optional(v.string()) }),
    featuredMediaId: v.optional(v.id("media")),
    galleryMediaIds: v.array(v.id("media")),
    salePrice: v.optional(v.object({ amount: v.number(), currencyCode: v.optional(v.string()) })),
    trackInventory: v.boolean(),
    stockQuantity: v.optional(v.number()),
    allowBackorders: v.boolean(),
    isVirtual: v.boolean(),
    salePriceFrom: v.optional(v.number()),
    salePriceTo: v.optional(v.number()),
    isDownloadable: v.boolean(),
    _id: v.id("commerce_products"),
    displayPrice: v.optional(v.number()),
    categories: v.array(v.object({ _id: v.id("commerce_product_categories"), name: v.string(), slug: v.string() })),
    compareAtPrice: v.optional(v.number()),
    pricedAt: v.number(),
    description: v.optional(v.string()),
    variants: v.array(v.object({
      salePriceFrom: v.optional(v.number()),
      salePriceTo: v.optional(v.number()),
      _id: v.id("commerce_product_variants"),
      title: v.string(),
      sku: v.optional(v.string()),
      optionSummary: v.string(),
      price: v.object({ amount: v.number(), currencyCode: v.optional(v.string()) }),
      salePrice: v.optional(v.object({ amount: v.number(), currencyCode: v.optional(v.string()) })),
      selections: v.optional(v.array(v.object({ optionTypeId: v.string(), optionValueId: v.string(), optionValueLabel: v.string() }))),
      featuredMediaId: v.optional(v.id("media")),
      galleryMediaIds: v.optional(v.array(v.id("media"))),
      stockQuantity: v.optional(v.number()),
      stockStatus: v.optional(v.union(v.literal("instock"), v.literal("outofstock"), v.literal("onbackorder"))),
      backorders: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("notify"))),
      manageStock: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("parent"))),
      description: v.optional(v.string()),
      isDefault: v.boolean(),
      status: v.optional(v.union(v.literal("draft"), v.literal("publish"), v.literal("private"))),
    })),
    optionTypes: v.array(v.object({
      id: v.string(),
      name: v.string(),
      values: v.array(v.object({ id: v.string(), label: v.string() })),
    })),
  })),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);

    const requestedSlug = args.slug.trim().toLowerCase();
    const normalizedSlug = slugifyCommerceProduct(args.slug);
    const exactProduct = await ctx.db
      .query("commerce_products")
      .withIndex("by_slug", (q) => q.eq("slug", requestedSlug))
      .unique();
    const product =
      exactProduct ??
      (normalizedSlug !== requestedSlug
        ? await ctx.db
            .query("commerce_products")
            .withIndex("by_slug", (q) => q.eq("slug", normalizedSlug))
            .unique()
        : null);

    if (!product || !(await createPublicProductAccessReader(ctx)(product))) {
      return null;
    }

    const serialized = await serializeProductDetail(ctx, product);
    serialized.categories = await filterPublicCategoryHierarchy(ctx, serialized.categories);
    const detail = publicProductDetail(serialized);

    // Check if this product is owned by a bundle — if so, include a redirect hint
    const owningBundle = await ctx.db
      .query("commerce_bundles")
      .withIndex("by_product", (q) => q.eq("productId", product._id))
      .first();
    if (owningBundle) {
      return { ...detail, isBundleProduct: true, bundleSlug: owningBundle.slug };
    }

    return detail;
  },
});

export const listPublished = query({
  args: listPublishedCommerceProductsArgs,
  returns: v.object({
    products: v.array(v.object({
      title: v.string(),
      slug: v.string(),
      excerpt: v.optional(v.string()),
      sku: v.optional(v.string()),
      productType: v.string(),
      basePrice: v.object({ amount: v.number(), currencyCode: v.optional(v.string()) }),
      featuredMediaId: v.optional(v.id("media")),
      galleryMediaIds: v.array(v.id("media")),
      salePrice: v.optional(v.object({ amount: v.number(), currencyCode: v.optional(v.string()) })),
      trackInventory: v.boolean(),
      stockQuantity: v.optional(v.number()),
      allowBackorders: v.boolean(),
      isVirtual: v.boolean(),
      salePriceFrom: v.optional(v.number()),
      salePriceTo: v.optional(v.number()),
      isDownloadable: v.boolean(),
      _id: v.id("commerce_products"),
      displayPrice: v.optional(v.number()),
      categories: v.array(v.object({ _id: v.id("commerce_product_categories"), name: v.string(), slug: v.string() })),
      compareAtPrice: v.optional(v.number()),
      pricedAt: v.number(),
    })),
    page: v.number(),
    perPage: v.number(),
    total: v.number(),
    totalPages: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);

    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(100, Math.max(1, args.perPage ?? 12));
    const categorySlug = args.categorySlug?.trim().toLowerCase();
    const search = args.search?.trim().toLowerCase();

    const [products, categories] = await Promise.all([
      ctx.db
        .query("commerce_products")
        .withIndex("by_status", (q) => q.eq("status", "publish"))
        .collect(),
      categorySlug
        ? ctx.db.query("commerce_product_categories").collect()
        : Promise.resolve([]),
    ]);

    const visibleCategories = await filterPublicCategoryHierarchy(ctx, categories);
    const category = categorySlug
      ? visibleCategories.find((entry) => entry.slug === categorySlug) ?? null
      : null;

    const categoryIds = category
      ? collectCategoryDescendants(visibleCategories, category._id)
      : null;
    const categoryFiltered =
      categorySlug && !category
        ? []
        : categoryIds
          ? products.filter((product) =>
              product.categoryIds.some((id) => categoryIds.has(id.toString())),
            )
          : products;
    const filtered = search
      ? categoryFiltered.filter((product) => {
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
    const readAccess = createPublicProductAccessReader(ctx);
    const catalogProducts: Doc<"commerce_products">[] = [];
    for (const product of filtered) {
      if (!bundleProductIds.has(product._id.toString()) && await readAccess(product))
        catalogProducts.push(product);
    }

    catalogProducts.sort((a, b) => {
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
        pageItems.map(async (product) => {
          const serialized = await serializeProductSummary(ctx, product);
          serialized.categories = await filterPublicCategoryHierarchy(ctx, serialized.categories);
          return publicProductSummary(serialized);
        }),
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
  returns: v.id("commerce_products"),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const actor = await requireCan(ctx, "manage_options");

    const title = args.title.trim();
    if (!title) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Product title is required.",
      });
    }

    validateSaleSchedule(args);
    if (args.brandId) await requireAssignableBrand(ctx, args.brandId);
    const categoryIds = await resolveProductCategoryIds(ctx, args.categoryIds);

    const tagIds = await resolveProductTags(ctx,args.tagNames ?? []);
    const now = Date.now();
    const status = args.status ?? "draft";
    const productId: ProductId = await insertWithMediaReferences<"commerce_products">(ctx, "commerce_products", {
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
      brandId: args.brandId,
      tagIds,
      isFeatured: args.isFeatured ?? false,
      basePrice: args.basePrice,
      salePrice: args.salePrice,
      salePriceFrom: args.salePriceFrom,
      salePriceTo: args.salePriceTo,
      trackInventory: args.trackInventory ?? true,
      stockQuantity: args.trackInventory === false ? undefined : args.stockQuantity,
      allowBackorders: args.allowBackorders ?? false,
	      isVirtual: args.isVirtual ?? false,
	      shippingWeightOz:
	        args.isVirtual === true ? undefined : args.shippingWeightOz,
	      isDownloadable: args.isDownloadable ?? false,
	      requiresLicense: args.requiresLicense,
	      digitalDeliveryMode: args.digitalDeliveryMode,
	      downloadLimit: args.downloadLimit,
	      downloadExpiryDays: args.downloadExpiryDays,
	      licenseKeyType: args.licenseKeyType,
	      maxActivations: args.maxActivations,
	      licenseExpiresAfterDays: args.licenseExpiresAfterDays,
	      taxClass: args.taxClass?.trim() || undefined,
      isNonReturnable: args.isNonReturnable,
      publishedAt: status === "publish" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    await recomputeCategoryCounts(ctx, categoryIds);
    await syncProductSearch(ctx, productId);
    await emitEvent(ctx, PRODUCT_EVENTS.CREATED, SYSTEM.PRODUCT, {
      productId,
      title,
      slug: await getProductSlugForEvent(ctx, productId),
      status,
    });
    return productId;
  },
});

export const update = mutation({
  args: updateCommerceProductArgs,
  returns: v.id("commerce_products"),
  handler: async (ctx, args) => {
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
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .first();

    if (owningBundle) {
      // Only allow safe fields to be updated on bundle-owned products
      const SAFE_BUNDLE_PRODUCT_FIELDS = new Set(["description", "seoTitle", "seoDescription", "featuredMediaId"]);
      const attemptedFields = Object.entries(args)
        .filter(([key, value]) => key !== "productId" && value !== undefined)
        .map(([key]) => key);
      const unsafeFields = attemptedFields.filter((f) => !SAFE_BUNDLE_PRODUCT_FIELDS.has(f));
      if (unsafeFields.length > 0) {
        throw new ConvexError({
          code: "BUNDLE_OWNED",
          message: `This product is managed by bundle "${owningBundle.name}". Edit the bundle to change: ${unsafeFields.join(", ")}`,
        });
      }
    }

    const patch: Partial<WithoutSystemFields<ProductDoc>> = {
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

    if (args.brandId !== undefined) {
      if (args.brandId && args.brandId !== product.brandId) await requireAssignableBrand(ctx, args.brandId);
      patch.brandId = args.brandId ?? undefined;
    }
    if (args.tagNames !== undefined) patch.tagIds = await resolveProductTags(ctx,args.tagNames);
    if (args.isFeatured !== undefined) patch.isFeatured = args.isFeatured;
    if (args.description !== undefined) patch.description = args.description?.trim() || undefined;
    if (args.excerpt !== undefined) patch.excerpt = args.excerpt?.trim() || undefined;
    if (args.sku !== undefined) patch.sku = args.sku?.trim() || undefined;
    if (args.featuredMediaId !== undefined) patch.featuredMediaId = args.featuredMediaId ?? undefined;
    if (args.galleryMediaIds !== undefined) patch.galleryMediaIds = args.galleryMediaIds;
    if (args.basePrice !== undefined) patch.basePrice = args.basePrice;
    if (args.salePrice !== undefined) patch.salePrice = args.salePrice ?? undefined;
    if (args.salePriceFrom !== undefined || args.salePriceTo !== undefined) {
      validateSaleSchedule({
        salePriceFrom: args.salePriceFrom === undefined ? product.salePriceFrom : args.salePriceFrom,
        salePriceTo: args.salePriceTo === undefined ? product.salePriceTo : args.salePriceTo,
      });
      if (args.salePriceFrom !== undefined) patch.salePriceFrom = args.salePriceFrom ?? undefined;
      if (args.salePriceTo !== undefined) patch.salePriceTo = args.salePriceTo ?? undefined;
    }
    if (args.trackInventory !== undefined) patch.trackInventory = args.trackInventory;
    if (args.stockQuantity !== undefined) patch.stockQuantity = args.stockQuantity ?? undefined;
	    if (args.allowBackorders !== undefined) patch.allowBackorders = args.allowBackorders;
	    if (args.isVirtual !== undefined) patch.isVirtual = args.isVirtual;
	    if (args.shippingWeightOz !== undefined) patch.shippingWeightOz = args.shippingWeightOz ?? undefined;
	    if (args.isDownloadable !== undefined) patch.isDownloadable = args.isDownloadable;
	    if (args.requiresLicense !== undefined) patch.requiresLicense = args.requiresLicense;
	    if (args.digitalDeliveryMode !== undefined) patch.digitalDeliveryMode = args.digitalDeliveryMode;
	    if (args.downloadLimit !== undefined) patch.downloadLimit = args.downloadLimit ?? undefined;
	    if (args.downloadExpiryDays !== undefined) patch.downloadExpiryDays = args.downloadExpiryDays ?? undefined;
	    if (args.licenseKeyType !== undefined) patch.licenseKeyType = args.licenseKeyType;
	    if (args.maxActivations !== undefined) patch.maxActivations = args.maxActivations ?? undefined;
	    if (args.licenseExpiresAfterDays !== undefined) patch.licenseExpiresAfterDays = args.licenseExpiresAfterDays ?? undefined;
	    if (args.taxClass !== undefined) patch.taxClass = args.taxClass?.trim() || undefined;
    if (args.isNonReturnable !== undefined) patch.isNonReturnable = args.isNonReturnable;

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

    await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", args.productId, patch);
    const nextStatus = patch.status ?? product.status;
    await emitEvent(
      ctx,
      getProductStatusEvent(product.status, nextStatus),
      SYSTEM.PRODUCT,
      {
        productId: args.productId,
        previousStatus: product.status,
        nextStatus,
        changedFields: Object.keys(patch).filter((key) => key !== "updatedAt"),
      },
    );

    const nextCategoryIds = patch.categoryIds ?? product.categoryIds;
    const affectedCategoryIds = dedupeIds([
      ...product.categoryIds,
      ...nextCategoryIds,
    ]);
    await recomputeCategoryCounts(ctx, affectedCategoryIds);
    await syncProductSearch(ctx, args.productId);

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
  returns: v.array(optionTypeValidator),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    await requireCommerceEnabled(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });
    return readOptionTypes(product.optionTypes);
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
  returns: v.object({
    id: v.string(),
    name: v.string(),
    values: v.array(v.object({ id: v.string(), label: v.string(), sortOrder: v.number(), active: v.boolean() })),
    sortOrder: v.number(),
    createdAt: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const existing = readOptionTypes(product.optionTypes);
    if (existing.some((o) => normalizeName(o.name) === normalizeName(args.name))) {
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

    await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", args.productId, {
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
  returns: optionTypeValidator,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const optionTypes = readOptionTypes(product.optionTypes);
    const idx = optionTypes.findIndex((o) => o.id === args.optionTypeId);
    if (idx === -1) throw new ConvexError({ code: "not_found", message: "Option type not found" });

    const variants = await listVariantsByProduct(ctx, args.productId);

    if (
      args.name !== undefined &&
      optionTypes.some(
        (optionType, optionTypeIndex) =>
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
        const nextSelections = variant.selections.map((selection) =>
          selection.optionTypeId === args.optionTypeId
            ? {
                ...selection,
                optionTypeName: optionTypes[idx].name,
              }
            : selection,
        );

        await patchWithMediaReferences<"commerce_product_variants">(ctx, "commerce_product_variants", variant._id, {
          selections: normalizeVariantSelections(nextSelections),
          optionSummary: buildOptionSummaryFromSelections(nextSelections),
          selectionKey: buildSelectionKey(nextSelections),
          updatedAt: Date.now(),
        });
      }
    }

    await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", args.productId, { optionTypes, updatedAt: Date.now() });
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
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const variants = await listVariantsByProduct(ctx, args.productId);
    const variantsUsingOptionType = variants.filter((variant) =>
      (variant.selections ?? []).some(
        (selection) => selection.optionTypeId === args.optionTypeId,
      ),
    );
    if (variantsUsingOptionType.length > 0) {
      throw new ConvexError({
        code: "validation_error",
        message: "Cannot delete an option type that is still used by existing variants.",
      });
    }

    const optionTypes = readOptionTypes(product.optionTypes).filter(
      (o) => o.id !== args.optionTypeId,
    );

    await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", args.productId, { optionTypes, updatedAt: Date.now() });
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
  returns: optionValueValidator,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const optionTypes = readOptionTypes(product.optionTypes);
    const typeIdx = optionTypes.findIndex((o) => o.id === args.optionTypeId);
    if (typeIdx === -1) throw new ConvexError({ code: "not_found", message: "Option type not found" });

    const existing = optionTypes[typeIdx].values;
    if (existing.some((v) => normalizeName(v.label) === normalizeName(args.label))) {
      throw new ConvexError({ code: "duplicate", message: `Value "${args.label}" already exists` });
    }

    const newValue: OptionValue = {
      id: `val_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label: args.label,
      sortOrder: existing.length,
      active: true,
    };

    optionTypes[typeIdx] = {
      ...optionTypes[typeIdx],
      values: [...existing, newValue],
    };

    await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", args.productId, { optionTypes, updatedAt: Date.now() });
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
  returns: optionValueValidator,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const optionTypes = readOptionTypes(product.optionTypes);
    const typeIdx = optionTypes.findIndex((o) => o.id === args.optionTypeId);
    if (typeIdx === -1) throw new ConvexError({ code: "not_found", message: "Option type not found" });

    const values = [...optionTypes[typeIdx].values];
    const valIdx = values.findIndex((v) => v.id === args.valueId);
    if (valIdx === -1) throw new ConvexError({ code: "not_found", message: "Option value not found" });

    if (
      args.label !== undefined &&
      values.some(
        (value, valueIndex) =>
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
        const nextSelections = variant.selections.map((selection) =>
          selection.optionValueId === args.valueId
            ? {
                ...selection,
                optionValueLabel: values[valIdx].label,
              }
            : selection,
        );

        await patchWithMediaReferences<"commerce_product_variants">(ctx, "commerce_product_variants", variant._id, {
          selections: normalizeVariantSelections(nextSelections),
          optionSummary: buildOptionSummaryFromSelections(nextSelections),
          selectionKey: buildSelectionKey(nextSelections),
          updatedAt: Date.now(),
        });
      }
    }

    optionTypes[typeIdx] = { ...optionTypes[typeIdx], values };
    await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", args.productId, { optionTypes, updatedAt: Date.now() });
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
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    const variants = await listVariantsByProduct(ctx, args.productId);
    const variantsUsingValue = variants.filter((variant) =>
      (variant.selections ?? []).some(
        (selection) => selection.optionTypeId === args.optionTypeId && selection.optionValueId === args.valueId,
      ),
    );
    if (variantsUsingValue.length > 0) {
      throw new ConvexError({
        code: "validation_error",
        message: "Cannot delete an option value that is still used by existing variants.",
      });
    }

    const optionTypes = readOptionTypes(product.optionTypes);
    const typeIdx = optionTypes.findIndex((o) => o.id === args.optionTypeId);
    if (typeIdx === -1) throw new ConvexError({ code: "not_found", message: "Option type not found" });

    optionTypes[typeIdx] = {
      ...optionTypes[typeIdx],
      values: optionTypes[typeIdx].values.filter((value) => value.id !== args.valueId),
    };

    await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", args.productId, { optionTypes, updatedAt: Date.now() });
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
  returns: v.array(commerceDocs.commerce_product_variants),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    await requireCommerceEnabled(ctx);
    return ctx.db
      .query("commerce_product_variants")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
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
	    requiresLicense: v.optional(v.boolean()),
	    digitalDeliveryMode: v.optional(
	      v.union(
	        v.literal("download"),
	        v.literal("license"),
	        v.literal("download_and_license"),
	      ),
	    ),
	    downloadLimit: v.optional(v.number()),
	    downloadExpiry: v.optional(v.number()),
	    downloadExpiryDays: v.optional(v.number()),
	    licenseKeyType: v.optional(
	      v.union(
	        v.literal("single"),
	        v.literal("multi"),
	        v.literal("unlimited"),
	        v.literal("subscription"),
	      ),
	    ),
	    maxActivations: v.optional(v.number()),
	    licenseExpiresAfterDays: v.optional(v.number()),
	    status: v.optional(
      v.union(v.literal("publish"), v.literal("private"), v.literal("draft")),
    ),
    menuOrder: v.optional(v.number()),
  },
  returns: v.id("commerce_product_variants"),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    // Prevent variant creation on bundle-owned products
    const owningBundleForVariant = await ctx.db
      .query("commerce_bundles")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .first();
    if (owningBundleForVariant) {
      throw new ConvexError({
        code: "BUNDLE_OWNED",
        message: `Cannot create variants on bundle-owned product "${owningBundleForVariant.name}". Bundles use simple products.`,
      });
    }

    const optionTypes = readOptionTypes(product.optionTypes);
    const selections = validateVariantSelections(optionTypes, args.selections);

    const now = Date.now();
    const currency = args.priceCurrency ?? product.basePrice?.currencyCode ?? "USD";
    const selectionKey = buildSelectionKey(selections);
    const optionSummary = args.optionSummary?.trim() || buildOptionSummaryFromSelections(selections);

    const existing = await listVariantsByProduct(ctx, args.productId);

    if (selectionKey && existing.some((variant) => variant.selectionKey === selectionKey)) {
      throw new ConvexError({
        code: "duplicate",
        message: "A variant with the same option selection already exists.",
      });
    }

    const shouldBeDefault = args.isDefault ?? existing.length === 0;

    if (shouldBeDefault) {
      for (const v of existing) {
        if (v.isDefault) {
          await patchWithMediaReferences<"commerce_product_variants">(ctx, "commerce_product_variants", v._id, { isDefault: false, updatedAt: now });
        }
      }
    }

    const shippingClassId = resolveShippingClassId(ctx, args.shippingClassId);
    const variantId: VariantId = await insertWithMediaReferences<"commerce_product_variants">(ctx, "commerce_product_variants", {
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
      shippingClassId,
	      isVirtual: args.isVirtual,
	      isDownloadable: args.isDownloadable,
	      requiresLicense: args.requiresLicense,
	      digitalDeliveryMode: args.digitalDeliveryMode,
	      downloadLimit: args.downloadLimit,
	      downloadExpiry: args.downloadExpiry,
	      downloadExpiryDays: args.downloadExpiryDays,
	      licenseKeyType: args.licenseKeyType,
	      maxActivations: args.maxActivations,
	      licenseExpiresAfterDays: args.licenseExpiresAfterDays,
	      status: args.status,
      menuOrder: args.menuOrder,
      isDefault: shouldBeDefault,
      createdAt: now,
      updatedAt: now,
    });

    // Mark product as variable type with variants
    if (product.productType !== "variable") {
      await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", args.productId, {
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
    salePriceAmount: v.optional(v.union(v.number(), v.null())),
    salePriceFrom: v.optional(v.union(v.number(), v.null())),
    salePriceTo: v.optional(v.union(v.number(), v.null())),
    stockQuantity: v.optional(v.number()),
    featuredMediaId: v.optional(v.union(v.id("media"), v.null())),
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
	    requiresLicense: v.optional(v.boolean()),
	    digitalDeliveryMode: v.optional(
	      v.union(
	        v.literal("download"),
	        v.literal("license"),
	        v.literal("download_and_license"),
	      ),
	    ),
	    downloadLimit: v.optional(v.number()),
	    downloadExpiry: v.optional(v.number()),
	    downloadExpiryDays: v.optional(v.number()),
	    licenseKeyType: v.optional(
	      v.union(
	        v.literal("single"),
	        v.literal("multi"),
	        v.literal("unlimited"),
	        v.literal("subscription"),
	      ),
	    ),
	    maxActivations: v.optional(v.number()),
	    licenseExpiresAfterDays: v.optional(v.number()),
	    status: v.optional(
      v.union(v.literal("publish"), v.literal("private"), v.literal("draft")),
    ),
    menuOrder: v.optional(v.number()),
  },
  returns: v.id("commerce_product_variants"),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const variant = await ctx.db.get(args.variantId);
    if (!variant) throw new ConvexError({ code: "not_found", message: "Variant not found" });
    const product = await ctx.db.get(variant.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    for (const amount of [args.priceAmount, args.salePriceAmount]) {
      if (amount !== undefined && amount !== null && (!Number.isSafeInteger(amount) || amount < 0)) throw new ConvexError({ code: "VALIDATION_ERROR", message: "Prices must be nonnegative whole minor currency units." });
    }
    for (const time of [args.salePriceFrom, args.salePriceTo]) {
      if (time !== undefined && time !== null && !Number.isSafeInteger(time)) throw new ConvexError({ code: "VALIDATION_ERROR", message: "Sale dates must be valid timestamps." });
    }
    const now = Date.now();
    const updates: Partial<WithoutSystemFields<Doc<"commerce_product_variants">>> = { updatedAt: now };
    const siblings = await listVariantsByProduct(ctx, variant.productId);

    if (args.title !== undefined) updates.title = args.title;
    if (args.sku !== undefined) updates.sku = args.sku;
    if (args.optionSummary !== undefined) updates.optionSummary = args.optionSummary;
    if (args.selections !== undefined) {
      const selections = validateVariantSelections(readOptionTypes(product.optionTypes), args.selections);
      const selectionKey = buildSelectionKey(selections);
      if (
        selectionKey &&
        siblings.some(
          (sibling) =>
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
      updates.salePrice = args.salePriceAmount === null
        ? undefined
        : { amount: args.salePriceAmount, currencyCode: variant.price.currencyCode };
    }
    if (args.salePriceFrom !== undefined) updates.salePriceFrom = args.salePriceFrom ?? undefined;
    if (args.salePriceTo !== undefined) updates.salePriceTo = args.salePriceTo ?? undefined;
    if (args.stockQuantity !== undefined) updates.stockQuantity = args.stockQuantity;
    if (args.featuredMediaId !== undefined) updates.featuredMediaId = args.featuredMediaId ?? undefined;
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
    if (args.shippingClassId !== undefined) updates.shippingClassId = resolveShippingClassId(ctx, args.shippingClassId);
	    if (args.isVirtual !== undefined) updates.isVirtual = args.isVirtual;
	    if (args.isDownloadable !== undefined) updates.isDownloadable = args.isDownloadable;
	    if (args.requiresLicense !== undefined) updates.requiresLicense = args.requiresLicense;
	    if (args.digitalDeliveryMode !== undefined) updates.digitalDeliveryMode = args.digitalDeliveryMode;
	    if (args.downloadLimit !== undefined) updates.downloadLimit = args.downloadLimit;
	    if (args.downloadExpiry !== undefined) updates.downloadExpiry = args.downloadExpiry;
	    if (args.downloadExpiryDays !== undefined) updates.downloadExpiryDays = args.downloadExpiryDays;
	    if (args.licenseKeyType !== undefined) updates.licenseKeyType = args.licenseKeyType;
	    if (args.maxActivations !== undefined) updates.maxActivations = args.maxActivations;
	    if (args.licenseExpiresAfterDays !== undefined) updates.licenseExpiresAfterDays = args.licenseExpiresAfterDays;
    if (args.status !== undefined) updates.status = args.status;
    if (args.menuOrder !== undefined) updates.menuOrder = args.menuOrder;

    // If setting as default, unset others
    if (args.isDefault) {
      for (const s of siblings) {
        if (s._id !== args.variantId && s.isDefault) {
          await patchWithMediaReferences<"commerce_product_variants">(ctx, "commerce_product_variants", s._id, { isDefault: false, updatedAt: now });
        }
      }
      updates.isDefault = true;
    } else if (args.isDefault === false) {
      const otherDefault = siblings.some(
        (s) => s._id !== args.variantId && s.isDefault,
      );
      if (!otherDefault) {
        throw new ConvexError({
          code: "validation_error",
          message: "Variable products must always have a default variant.",
        });
      }
      updates.isDefault = false;
    }

    await patchWithMediaReferences<"commerce_product_variants">(ctx, "commerce_product_variants", args.variantId, updates);
    return args.variantId;
  },
});

/**
 * Delete a variant.
 */
export const deleteVariant = mutation({
  args: { variantId: v.id("commerce_product_variants") },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
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

    await deleteWithMediaReferences<"commerce_product_variants">(ctx, "commerce_product_variants", args.variantId);

    // Check if any variants remain; if not, revert product type
    const remaining = siblings.filter((sibling) => sibling._id !== args.variantId);

    if (remaining.length === 0) {
      await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", variant.productId, {
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
  returns: v.object({ created: v.number(), total: v.number() }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    // Prevent variant generation on bundle-owned products
    const owningBundleForGenerate = await ctx.db
      .query("commerce_bundles")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .first();
    if (owningBundleForGenerate) {
      throw new ConvexError({
        code: "BUNDLE_OWNED",
        message: `Cannot create variants on bundle-owned product "${owningBundleForGenerate.name}". Bundles use simple products.`,
      });
    }

    const optionTypes = readOptionTypes(product.optionTypes);
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
    function cartesian<T>(arrays: T[][]): T[][] {
      return arrays.reduce<T[][]>(
        (acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
        [[]],
      );
    }

    const valueArrays = optionTypes
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((ot) =>
        (ot.values ?? []).map((val) => ({
          typeId: ot.id,
          typeName: ot.name,
          ...val,
        })),
      );

    if (valueArrays.some((a) => a.length === 0)) {
      throw new ConvexError({ code: "empty_values", message: "One or more option types have no values" });
    }

    const combos = cartesian(valueArrays);

    // Get existing variants
    const existing = await ctx.db
      .query("commerce_product_variants")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    const existingSelectionKeys = new Set(
      existing.map((v) => v.selectionKey).filter(Boolean),
    );

    const currency = product.basePrice?.currencyCode ?? "USD";
    const basePrice = args.basePriceAmount ?? product.basePrice?.amount ?? 0;
    const now = Date.now();
    let created = 0;

    for (const combo of combos) {
      const selections = combo.map((c, index) => ({
        optionTypeId: c.typeId,
        optionTypeName: c.typeName,
        optionValueId: c.id,
        optionValueLabel: c.label,
        sortOrder: index,
      }));
      const summary = selections
        .map((selection) => `${selection.optionTypeName}: ${selection.optionValueLabel}`)
        .join(" / ");
      const selectionKey = buildSelectionKey(selections);
      if (selectionKey && existingSelectionKeys.has(selectionKey)) continue;

      await insertWithMediaReferences<"commerce_product_variants">(ctx, "commerce_product_variants", {
        productId: args.productId,
        title: selections.map((selection) => selection.optionValueLabel).join(" / "),
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
      await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", args.productId, { productType: "variable", updatedAt: now });
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
  returns: v.object({ updated: v.number() }),
  handler: async (ctx, args) => {
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

      const patch: Partial<WithoutSystemFields<ProductDoc>> = { status: args.status, updatedAt: now };
      if (args.status === "publish" && product.status !== "publish") {
        patch.publishedAt = now;
      }

      await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", id, patch);
      await syncProductSearch(ctx, id);
      await emitEvent(ctx, getProductStatusEvent(product.status, args.status), SYSTEM.PRODUCT, {
        productId: id,
        previousStatus: product.status,
        nextStatus: args.status,
      });
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
  returns: v.object({ deleted: v.number(), errors: v.array(v.string()) }),
  handler: async (ctx, args) => {
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
          .withIndex("by_product", (q) => q.eq("productId", id))
          .collect();
        for (const v of variants) {
          await deleteWithMediaReferences<"commerce_product_variants">(ctx, "commerce_product_variants", v._id);
        }

        await deleteWithMediaReferences<"commerce_products">(ctx, "commerce_products", id);
        await emitEvent(ctx, PRODUCT_EVENTS.DELETED, SYSTEM.PRODUCT, {
          productId: id,
          previousStatus: product.status,
          title: product.title,
        });
        deleted++;
      } catch (e) {
        errors.push(`${id}: ${e instanceof Error ? e.message : "Unknown error"}`);
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
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });
    await assertProductBundleLifecycleAllowed(ctx, args.productId, "unpublish");

    await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", args.productId, {
      status: "trash",
      updatedAt: Date.now(),
    });
    await emitEvent(ctx, PRODUCT_EVENTS.TRASHED, SYSTEM.PRODUCT, {
      productId: args.productId,
      previousStatus: product.status,
      nextStatus: "trash",
    });

    return { success: true };
  },
});

/**
 * Restore a trashed product (set status to draft).
 */
export const restoreProduct = mutation({
  args: { productId: v.id("commerce_products") },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", message: "Product not found" });

    if (product.status !== "trash") {
      throw new ConvexError({ code: "invalid_status", message: "Product is not in trash" });
    }

    await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", args.productId, {
      status: "draft",
      updatedAt: Date.now(),
    });
    await emitEvent(ctx, PRODUCT_EVENTS.RESTORED, SYSTEM.PRODUCT, {
      productId: args.productId,
      previousStatus: product.status,
      nextStatus: "draft",
    });

    return { success: true };
  },
});
