// @ts-nocheck
/**
 * WordPress Sync - WooCommerce Catalog Import Phase
 *
 * Imports WooCommerce product categories, products, and variations into the
 * ConvexPress commerce tables as a single capability-gated sync phase.
 */

import { internalAction, internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { PhaseResult } from "../internals";
import type { PhaseProgress, SyncError } from "../validators";
import { createDefaultImportConfig, FINDING_CODES } from "../validators";
import { createFinding } from "../helpers/idMapping";
import { createHash } from "crypto";

// ─── Source Hash Helper ───────────────────────────────────────────────────

function computeSourceHashCC(fields: Record<string, unknown>): string {
  return createHash("md5").update(JSON.stringify(fields)).digest("hex");
}
import {
  fetchWooProductCategories,
  fetchWooProducts,
  fetchWooProductVariations,
  type WooProduct,
  type WooProductAttribute,
  type WooProductCategory,
  type WooProductVariation,
} from "../helpers/wooClient";

const COMMERCE_BATCH_SIZE = 25;
const VARIATION_BATCH_SIZE = 100;

export const importBatch = internalAction({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
    credentials: v.object({
      siteUrl: v.string(),
      username: v.string(),
      applicationPassword: v.string(),
    }),
  },
  handler: async (ctx, { jobId, siteId, credentials }): Promise<PhaseResult> => {
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, { siteId });

    // Get import config
    const importConfig = job?.importConfig ?? createDefaultImportConfig();
    const isDryRun = importConfig.behavior.dryRun;

    if (!job || !site) {
      return {
        progress: { total: 0, imported: 0, failed: 0 },
        errors: [{
          phase: "commerceCatalog",
          wpId: 0,
          message: !job ? "Job not found" : "Site not found",
          timestamp: Date.now(),
        }],
        hasMore: false,
      };
    }

    const progress: PhaseProgress = { ...job.progress.commerceCatalog };
    const errors: SyncError[] = [];

    if (site.capabilities?.woocommerceApi !== true) {
      return {
        progress,
        errors,
        hasMore: false,
      };
    }

    const [categoryCountResult, productCountResult] = await Promise.all([
      fetchWooProductCategories(credentials, 1, 1).catch(() => ({ total: 0 })),
      fetchWooProducts(credentials, 1, 1).catch(() => ({ total: 0 })),
    ]);

    const categoryTotal = categoryCountResult.total ?? 0;
    const productTotal = productCountResult.total ?? 0;
    if (progress.total < categoryTotal + productTotal) {
      progress.total = categoryTotal + productTotal;
    }

    const cursor = progress.cursor || 0;
    if (cursor < categoryTotal) {
      const result = await importCategoryBatch(ctx, {
        siteId,
        credentials,
        progress,
        categoryTotal,
        isDryRun,
      });
      return result;
    }

    const result = await importProductBatch(ctx, {
      siteId,
      jobId,
      credentials,
      progress,
      siteCreatedBy: site.createdBy,
      categoryTotal,
      productTotal,
      isDryRun,
    });
    errors.push(...result.errors);

    return {
      progress: result.progress,
      errors,
      hasMore: result.hasMore,
    };
  },
});

async function importCategoryBatch(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  args: {
    siteId: Id<"wordpressSites">;
    credentials: { siteUrl: string; username: string; applicationPassword: string };
    progress: PhaseProgress;
    categoryTotal: number;
    isDryRun: boolean;
  }
): Promise<PhaseResult> {
  const errors: SyncError[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = args.progress.cursor || 0;
  const page = Math.floor(cursor / COMMERCE_BATCH_SIZE) + 1;
  const { data: categories } = await fetchWooProductCategories(
    args.credentials,
    page,
    COMMERCE_BATCH_SIZE
  );

  const sortedCategories = [...categories].sort((a, b) => {
    if (a.parent === 0 && b.parent !== 0) return -1;
    if (a.parent !== 0 && b.parent === 0) return 1;
    return a.id - b.id;
  });

  for (const category of sortedCategories) {
    try {
      const existingId = await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
        siteId: args.siteId,
        objectType: "commerceCategory",
        wpId: category.id,
      });

      if (existingId) {
        skipped++;
        args.progress.imported++;
        continue;
      }

      if (!args.isDryRun) {
        let parentId: string | undefined;
        if (category.parent > 0) {
          parentId = (await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
            siteId: args.siteId,
            objectType: "commerceCategory",
            wpId: category.parent,
          })) ?? undefined;
        }

        const categoryId = await ctx.runMutation(
          internal.wordpressSync.phases.commerceCatalog.upsertCategory,
          {
            existingId: existingId ?? undefined,
            parentId,
            wpCategory: {
              id: category.id,
              name: category.name,
              slug: category.slug,
              description: category.description || undefined,
              count: category.count ?? 0,
            },
          }
        );

        await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
          siteId: args.siteId,
          objectType: "commerceCategory",
          wpId: category.id,
          convexId: categoryId,
        });
      }

      created++;
      args.progress.imported++;
    } catch (error) {
      errors.push({
        phase: "commerceCatalog",
        wpId: category.id,
        message: `Category: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
      });
      args.progress.failed++;
    }
  }

  args.progress.cursor = cursor + categories.length;

  return {
    progress: {
      ...args.progress,
      created,
      updated,
      skipped,
      conflicted: 0,
    },
    errors,
    hasMore: (args.progress.cursor || 0) < args.categoryTotal,
  };
}

async function importProductBatch(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  args: {
    siteId: Id<"wordpressSites">;
    jobId: Id<"wordpressSyncJobs">;
    credentials: { siteUrl: string; username: string; applicationPassword: string };
    progress: PhaseProgress;
    siteCreatedBy: Id<"users">;
    categoryTotal: number;
    productTotal: number;
    isDryRun: boolean;
  }
): Promise<PhaseResult> {
  const errors: SyncError[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = args.progress.cursor || 0;
  const productCursor = Math.max(0, cursor - args.categoryTotal);
  const page = Math.floor(productCursor / COMMERCE_BATCH_SIZE) + 1;
  const { data: products } = await fetchWooProducts(args.credentials, page, COMMERCE_BATCH_SIZE);

  for (let index = 0; index < products.length; index++) {
    const product = products[index];

    try {
      // SKU collision detection for products with SKUs
      if (product.sku && args.jobId) {
        const existingBySku = await ctx.runQuery(
          internal.wordpressSync.internals.findProductBySku,
          { sku: product.sku }
        );
        if (existingBySku) {
          // Check if this product is already mapped
          const existingMapping = await ctx.runQuery(
            internal.wordpressSync.helpers.idMapping.getByWpId,
            { siteId: args.siteId, objectType: "commerceProduct", wpId: product.id }
          );
          if (!existingMapping) {
            await createFinding(ctx, {
              siteId: args.siteId, jobId: args.jobId, severity: "warning",
              phase: "commerceCatalog",
              code: FINDING_CODES.SKU_COLLISION,
              message: `Product with SKU "${product.sku}" already exists locally (ID: ${existingBySku._id})`,
              sourceType: "product", sourceId: String(product.id),
              destinationTable: "commerce_products", wpId: product.id,
              convexId: existingBySku._id,
            });
          }
        }
      }

      if (!args.isDryRun) {
        const productId = await importSingleProduct(ctx, {
          siteId: args.siteId,
          siteCreatedBy: args.siteCreatedBy,
          product,
        });

        if (product.type === "variable") {
          const variationResult = await importProductVariations(ctx, {
            siteId: args.siteId,
            credentials: args.credentials,
            product,
            productId,
          });
          args.progress.total += variationResult.discoveredTotal;
          args.progress.imported += variationResult.imported;
          args.progress.failed += variationResult.failed;
          created += variationResult.imported;
          errors.push(...variationResult.errors);
        }
      }

      created++;
      args.progress.imported++;
    } catch (error) {
      errors.push({
        phase: "commerceCatalog",
        wpId: product.id,
        message: `Product: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
      });
      args.progress.failed++;
    }
  }

  args.progress.cursor = args.categoryTotal + productCursor + products.length;

  return {
    progress: {
      ...args.progress,
      created,
      updated,
      skipped,
      conflicted: 0,
    },
    errors,
    hasMore: productCursor + products.length < args.productTotal,
  };
}

async function importSingleProduct(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  args: {
    siteId: Id<"wordpressSites">;
    siteCreatedBy: Id<"users">;
    product: WooProduct;
  }
): Promise<string> {
  // Compute source hash for change detection
  const productSourceHash = computeSourceHashCC({
    name: args.product.name,
    slug: args.product.slug,
    sku: args.product.sku,
    status: args.product.status,
    price: args.product.price,
    regular_price: args.product.regular_price,
  });

  const existingId = await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
    siteId: args.siteId,
    objectType: "commerceProduct",
    wpId: args.product.id,
  });

  const categoryIds = await resolveCommerceCategoryIds(
    ctx,
    args.siteId,
    args.product.categories?.map((category) => category.id) ?? []
  );
  const mediaIds = await resolveCommerceMediaIds(
    ctx,
    args.siteId,
    args.product.images?.map((image) => image.id).filter(Boolean) ?? []
  );
  const optionTypes = buildOptionTypes(args.product.attributes);

  const productId = await ctx.runMutation(
    internal.wordpressSync.phases.commerceCatalog.upsertProduct,
    {
      existingId: existingId ?? undefined,
      authorId: args.siteCreatedBy,
      product: {
        title: args.product.name || `Product ${args.product.id}`,
        slug: args.product.slug || `woo-product-${args.product.id}`,
        description: stripHtml(args.product.description),
        excerpt: stripHtml(args.product.short_description),
        status: mapWooStatus(args.product.status),
        productType: mapWooProductType(args.product.type),
        sku: args.product.sku || undefined,
        featuredMediaId: mediaIds[0],
        galleryMediaIds: mediaIds,
        categoryIds,
        optionTypes,
        basePrice: toMoney(
          args.product.regular_price || args.product.price,
          inferCurrencyCode(args.product)
        ),
        salePrice: args.product.sale_price
          ? toMoney(args.product.sale_price, inferCurrencyCode(args.product))
          : undefined,
        trackInventory: Boolean(args.product.manage_stock),
        stockQuantity: normalizeStockQuantity(args.product.stock_quantity),
        allowBackorders: args.product.backorders === "yes" || args.product.backorders === "notify",
        isVirtual: Boolean(args.product.virtual),
        isDownloadable: Boolean(args.product.downloadable),
        publishedAt: args.product.status === "publish" && args.product.date_created
          ? new Date(args.product.date_created).getTime()
          : undefined,
      },
    }
  );

  await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
    siteId: args.siteId,
    objectType: "commerceProduct",
    wpId: args.product.id,
    convexId: productId,
    sourceHash: productSourceHash,
  });

  return productId;
}

async function importProductVariations(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  args: {
    siteId: Id<"wordpressSites">;
    credentials: { siteUrl: string; username: string; applicationPassword: string };
    product: WooProduct;
    productId: string;
  }
): Promise<{ imported: number; failed: number; discoveredTotal: number; errors: SyncError[] }> {
  const errors: SyncError[] = [];
  let imported = 0;
  let failed = 0;
  let discoveredTotal = 0;
  let page = 1;
  let countedTotal = false;

  while (true) {
    const result = await fetchWooProductVariations(
      args.credentials,
      args.product.id,
      page,
      VARIATION_BATCH_SIZE
    );

    if (!countedTotal) {
      discoveredTotal = result.total || 0;
      countedTotal = true;
    }

    for (let index = 0; index < result.data.length; index++) {
      const variation = result.data[index];

      try {
        const existingId = await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
          siteId: args.siteId,
          objectType: "commerceProductVariant",
          wpId: variation.id,
        });

        const selections = buildVariantSelections(
          args.product.attributes,
          variation.attributes,
        );
        const optionSummary = selections
          ?.map((selection) => `${selection.optionTypeName}: ${selection.optionValueLabel}`)
          .join(" / ") || variation.attributes?.map((attr) => attr.option).filter(Boolean).join(" / ") || "Default";

        const variantId = await ctx.runMutation(
          internal.wordpressSync.phases.commerceCatalog.upsertVariant,
          {
            existingId: existingId ?? undefined,
            productId: args.productId,
            variant: {
              title: buildVariantTitle(args.product.name, optionSummary),
              sku: variation.sku || undefined,
              optionSummary,
              selections,
              price: toMoney(
                variation.regular_price || variation.price || args.product.regular_price || args.product.price,
                inferCurrencyCode(args.product)
              ),
              salePrice: variation.sale_price
                ? toMoney(variation.sale_price, inferCurrencyCode(args.product))
                : undefined,
              stockQuantity: normalizeStockQuantity(variation.stock_quantity),
              isDefault: Boolean(!existingId && page === 1 && index === 0),
            },
          }
        );

        await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
          siteId: args.siteId,
          objectType: "commerceProductVariant",
          wpId: variation.id,
          convexId: variantId,
        });

        imported++;
      } catch (error) {
        errors.push({
          phase: "commerceCatalog",
          wpId: variation.id,
          message: `Variation: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        });
        failed++;
      }
    }

    if (page >= result.totalPages || result.data.length === 0) {
      break;
    }

    page++;
  }

  return { imported, failed, discoveredTotal, errors };
}

async function resolveCommerceCategoryIds(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  siteId: Id<"wordpressSites">,
  wpIds: number[],
): Promise<string[]> {
  const resolved: string[] = [];

  for (const wpId of wpIds) {
    const categoryId = await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
      siteId,
      objectType: "commerceCategory",
      wpId,
    });
    if (categoryId) resolved.push(categoryId);
  }

  return resolved;
}

async function resolveCommerceMediaIds(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  siteId: Id<"wordpressSites">,
  wpIds: number[],
): Promise<string[]> {
  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const wpId of wpIds) {
    const mediaId = await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
      siteId,
      objectType: "media",
      wpId,
    });
    if (mediaId && !seen.has(mediaId)) {
      seen.add(mediaId);
      resolved.push(mediaId);
    }
  }

  return resolved;
}

function mapWooStatus(status: string | undefined): "draft" | "publish" | "private" | "trash" {
  switch (status) {
    case "publish":
      return "publish";
    case "private":
      return "private";
    case "trash":
      return "trash";
    default:
      return "draft";
  }
}

function mapWooProductType(type: string | undefined): "simple" | "variable" | "external" {
  if (type === "variable") return "variable";
  if (type === "external") return "external";
  return "simple";
}

function inferCurrencyCode(product: WooProduct): string {
  const currency = (product as Record<string, unknown>).currency;
  return typeof currency === "string" && currency.trim() ? currency.trim().toUpperCase() : "USD";
}

function normalizeStockQuantity(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toMoney(raw: string | undefined, currencyCode: string) {
  const normalized = Number.parseFloat(raw || "0");
  return {
    amount: Number.isFinite(normalized) ? Math.round(normalized * 100) : 0,
    currencyCode,
  };
}

function buildOptionTypes(attributes: WooProductAttribute[] | undefined) {
  const variableAttributes = (attributes ?? []).filter((attribute) => attribute.variation);
  if (variableAttributes.length === 0) return undefined;

  return variableAttributes.map((attribute, index) => ({
    id: buildOptionTypeId(attribute),
    name: attribute.name || `Option ${index + 1}`,
    values: (attribute.options ?? [])
      .filter(Boolean)
      .map((value, valueIndex) => ({
        id: buildOptionValueId(attribute, value),
        label: value,
        sortOrder: valueIndex,
        active: true,
      })),
    sortOrder: attribute.position ?? index,
    createdAt: Date.now(),
  }));
}

function buildVariantSelections(
  productAttributes: WooProductAttribute[] | undefined,
  variationAttributes: WooProductAttribute[] | undefined,
) {
  const variationEnabled = (productAttributes ?? []).filter((attribute) => attribute.variation);
  if (variationEnabled.length === 0 || !(variationAttributes ?? []).length) {
    return undefined;
  }

  const selections = variationAttributes
    ?.map((attribute) => {
      const optionType = variationEnabled.find(
        (candidate) =>
          candidate.id === attribute.id ||
          candidate.name?.toLowerCase() === attribute.name?.toLowerCase()
      );
      const optionLabel = attribute.option?.trim();
      if (!optionType || !optionLabel) return null;

      return {
        optionTypeId: buildOptionTypeId(optionType),
        optionTypeName: optionType.name || attribute.name || "Option",
        optionValueId: buildOptionValueId(optionType, optionLabel),
        optionValueLabel: optionLabel,
        sortOrder: optionType.position ?? 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return selections?.length ? selections : undefined;
}

function buildOptionTypeId(attribute: WooProductAttribute) {
  return `woo-attribute-${attribute.id || slugify(attribute.name || "option")}`;
}

function buildOptionValueId(attribute: WooProductAttribute, value: string) {
  return `${buildOptionTypeId(attribute)}-${slugify(value)}`;
}

function buildVariantTitle(productName: string | undefined, optionSummary: string) {
  return productName ? `${productName} (${optionSummary})` : optionSummary;
}

function stripHtml(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || undefined;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const upsertCategory = internalMutation({
  args: {
    existingId: v.optional(v.string()),
    parentId: v.optional(v.string()),
    wpCategory: v.object({
      id: v.number(),
      name: v.string(),
      slug: v.string(),
      description: v.optional(v.string()),
      count: v.number(),
    }),
  },
  handler: async (ctx, { existingId, parentId, wpCategory }) => {
    const now = Date.now();
    const patch = {
      name: wpCategory.name,
      slug: wpCategory.slug,
      description: wpCategory.description,
      parentId: parentId ? (parentId as Id<"commerce_product_categories">) : undefined,
      productCount: wpCategory.count,
      updatedAt: now,
    };

    let targetId = existingId as Id<"commerce_product_categories"> | undefined;
    if (!targetId) {
      const bySlug = await ctx.db
        .query("commerce_product_categories")
        .withIndex("by_slug", (q) => q.eq("slug", wpCategory.slug))
        .unique();
      targetId = bySlug?._id;
    }

    if (targetId) {
      await ctx.db.patch(targetId, patch);
      return targetId;
    }

    return await ctx.db.insert("commerce_product_categories", {
      ...patch,
      createdAt: now,
    });
  },
});

export const upsertProduct = internalMutation({
  args: {
    existingId: v.optional(v.string()),
    authorId: v.id("users"),
    product: v.object({
      title: v.string(),
      slug: v.string(),
      description: v.optional(v.string()),
      excerpt: v.optional(v.string()),
      status: v.union(
        v.literal("draft"),
        v.literal("publish"),
        v.literal("private"),
        v.literal("trash")
      ),
      productType: v.union(
        v.literal("simple"),
        v.literal("variable"),
        v.literal("external")
      ),
      sku: v.optional(v.string()),
      featuredMediaId: v.optional(v.string()),
      galleryMediaIds: v.array(v.string()),
      categoryIds: v.array(v.string()),
      optionTypes: v.optional(v.any()),
      basePrice: v.object({
        amount: v.number(),
        currencyCode: v.string(),
      }),
      salePrice: v.optional(v.object({
        amount: v.number(),
        currencyCode: v.string(),
      })),
      trackInventory: v.boolean(),
      stockQuantity: v.optional(v.number()),
      allowBackorders: v.boolean(),
      isVirtual: v.boolean(),
      isDownloadable: v.boolean(),
      publishedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { existingId, authorId, product }) => {
    const now = Date.now();
    const patch = {
      title: product.title,
      slug: product.slug,
      description: product.description,
      excerpt: product.excerpt,
      status: product.status,
      productType: product.productType,
      sku: product.sku,
      authorId,
      featuredMediaId: product.featuredMediaId
        ? (product.featuredMediaId as Id<"media">)
        : undefined,
      galleryMediaIds: product.galleryMediaIds.map((id) => id as Id<"media">),
      categoryIds: product.categoryIds.map((id) => id as Id<"commerce_product_categories">),
      optionTypes: product.optionTypes,
      basePrice: product.basePrice,
      salePrice: product.salePrice,
      trackInventory: product.trackInventory,
      stockQuantity: product.trackInventory ? product.stockQuantity : undefined,
      allowBackorders: product.allowBackorders,
      isVirtual: product.isVirtual,
      shippingWeightOz: undefined,
      isDownloadable: product.isDownloadable,
      publishedAt: product.status === "publish" ? (product.publishedAt ?? now) : undefined,
      updatedAt: now,
    };

    let targetId = existingId as Id<"commerce_products"> | undefined;
    if (!targetId) {
      const bySlug = await ctx.db
        .query("commerce_products")
        .withIndex("by_slug", (q) => q.eq("slug", product.slug))
        .unique();
      targetId = bySlug?._id;
    }

    if (targetId) {
      await ctx.db.patch(targetId, patch);
      return targetId;
    }

    return await ctx.db.insert("commerce_products", {
      ...patch,
      createdAt: now,
    });
  },
});

export const upsertVariant = internalMutation({
  args: {
    existingId: v.optional(v.string()),
    productId: v.string(),
    variant: v.object({
      title: v.string(),
      sku: v.optional(v.string()),
      optionSummary: v.string(),
      selections: v.optional(v.any()),
      price: v.object({
        amount: v.number(),
        currencyCode: v.string(),
      }),
      salePrice: v.optional(v.object({
        amount: v.number(),
        currencyCode: v.string(),
      })),
      stockQuantity: v.optional(v.number()),
      isDefault: v.boolean(),
    }),
  },
  handler: async (ctx, { existingId, productId, variant }) => {
    const now = Date.now();
    const targetProductId = productId as Id<"commerce_products">;
    const selectionKey = Array.isArray(variant.selections)
      ? variant.selections
          .map((selection) => `${selection.optionTypeId}:${selection.optionValueId}`)
          .join("|")
      : undefined;

    let targetId = existingId as Id<"commerce_product_variants"> | undefined;
    if (!targetId) {
      if (selectionKey) {
        const existingBySelection = await ctx.db
          .query("commerce_product_variants")
          .withIndex("by_product_selection_key", (q) =>
            q.eq("productId", targetProductId).eq("selectionKey", selectionKey)
          )
          .first();
        targetId = existingBySelection?._id;
      }

      if (!targetId && variant.sku) {
        const siblings = await ctx.db
          .query("commerce_product_variants")
          .withIndex("by_product", (q) => q.eq("productId", targetProductId))
          .collect();
        targetId = siblings.find((sibling) => sibling.sku === variant.sku)?._id;
      }
    }

    if (variant.isDefault) {
      const siblings = await ctx.db
        .query("commerce_product_variants")
        .withIndex("by_product", (q) => q.eq("productId", targetProductId))
        .collect();
      for (const sibling of siblings) {
        if (!targetId || sibling._id !== targetId) {
          if (sibling.isDefault) {
            await ctx.db.patch(sibling._id, { isDefault: false, updatedAt: now });
          }
        }
      }
    }

    const patch = {
      productId: targetProductId,
      title: variant.title,
      sku: variant.sku,
      optionSummary: variant.optionSummary,
      selections: variant.selections,
      selectionKey,
      price: variant.price,
      salePrice: variant.salePrice,
      stockQuantity: variant.stockQuantity,
      isDefault: variant.isDefault,
      updatedAt: now,
    };

    if (targetId) {
      await ctx.db.patch(targetId, patch);
      await ctx.db.patch(targetProductId, {
        productType: "variable",
        updatedAt: now,
      });
      return targetId;
    }

    const variantId = await ctx.db.insert("commerce_product_variants", {
      ...patch,
      createdAt: now,
    });
    await ctx.db.patch(targetProductId, {
      productType: "variable",
      updatedAt: now,
    });
    return variantId;
  },
});
