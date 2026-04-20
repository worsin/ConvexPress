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
import { normalizeImportConfig, FINDING_CODES, siteCredentialsValidator } from "../validators";
import { createFinding } from "../helpers/idMapping";


// ─── Source Hash Helper ───────────────────────────────────────────────────

function computeSourceHashCC(fields: Record<string, unknown>): string {
  const str = JSON.stringify(fields); let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; } return h.toString(36);
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
    credentials: siteCredentialsValidator,
  },
  handler: async (ctx, { jobId, siteId, credentials }): Promise<PhaseResult> => {
    const job = await ctx.runQuery(internal.wordpressSync.internals.getJobInternal, { jobId });
    const site = await ctx.runQuery(internal.wordpressSync.internals.getSiteWithCredentials, { siteId });

    // Get import config
    const importConfig = normalizeImportConfig(job?.importConfig);
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

    const entityLimit =
      typeof importConfig.filters.entityLimit === "number"
        ? importConfig.filters.entityLimit
        : undefined;
    const categoryTotal =
      entityLimit !== undefined
        ? Math.min(categoryCountResult.total ?? 0, entityLimit)
        : (categoryCountResult.total ?? 0);
    const productTotal =
      entityLimit !== undefined
        ? Math.min(productCountResult.total ?? 0, entityLimit)
        : (productCountResult.total ?? 0);
    if (progress.total < categoryTotal + productTotal) {
      progress.total = categoryTotal + productTotal;
    }

    const cursor = progress.cursor || 0;
    if (cursor < categoryTotal) {
      const result = await importCategoryBatch(ctx, {
        siteId,
        jobId,
        credentials,
        progress,
        categoryTotal,
        isDryRun,
        importConfig,
      });
      if (!result.hasMore && !isDryRun) {
        await repairCommerceCategoryHierarchy(ctx, siteId, credentials);
      }
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
      importConfig,
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
    jobId: Id<"wordpressSyncJobs">;
    credentials: { siteUrl: string; username: string; applicationPassword: string };
    progress: PhaseProgress;
    categoryTotal: number;
    isDryRun: boolean;
    importConfig: any;
  }
): Promise<PhaseResult> {
  const errors: SyncError[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = args.progress.cursor || 0;
  const page = Math.floor(cursor / COMMERCE_BATCH_SIZE) + 1;
  const { data: fetchedCategories } = await fetchWooProductCategories(
    args.credentials,
    page,
    COMMERCE_BATCH_SIZE
  );
  const categories = fetchedCategories.slice(
    0,
    Math.max(0, args.categoryTotal - cursor),
  );

  const sortedCategories = [...categories].sort((a, b) => {
    if (a.parent === 0 && b.parent !== 0) return -1;
    if (a.parent !== 0 && b.parent === 0) return 1;
    return a.id - b.id;
  });

  for (const category of sortedCategories) {
    try {
      const sourceHash = computeSourceHashCC({
        name: category.name,
        slug: category.slug,
        description: category.description,
        parent: category.parent,
        image: category.image?.id,
        count: category.count,
      });
      const existingMapping = await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getFullMappingByWpId, {
        siteId: args.siteId,
        objectType: "commerceCategory",
        wpId: category.id,
      });
      const existingId = existingMapping?.convexId;

      if (existingMapping && !args.isDryRun) {
        await ctx.runMutation(internal.wordpressSync.helpers.idMapping.touch, {
          siteId: args.siteId,
          objectType: "commerceCategory",
          wpId: category.id,
          jobId: args.jobId,
        });
      }

      if (existingMapping?.sourceHash === sourceHash) {
        skipped++;
        args.progress.imported++;
        continue;
      }

      if (existingMapping && !args.importConfig.behavior.updateExisting) {
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
        const categoryMediaIds = await resolveCommerceMediaIds(
          ctx,
          args.siteId,
          category.image?.id ? [category.image.id] : []
        );

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
              thumbnailMediaId: categoryMediaIds[0],
            },
          }
        );

        if (!existingId) {
          await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
            siteId: args.siteId,
            objectType: "commerceCategory",
            wpId: category.id,
            convexId: categoryId,
            sourceHash,
            jobId: args.jobId,
          });
        } else {
          await ctx.runMutation(internal.wordpressSync.helpers.idMapping.updateSourceHash, {
            siteId: args.siteId,
            objectType: "commerceCategory",
            wpId: category.id,
            sourceHash,
          });
        }
      }

      if (existingId) updated++;
      else created++;
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
    importConfig: any;
  }
): Promise<PhaseResult> {
  const errors: SyncError[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = args.progress.cursor || 0;
  const productCursor = Math.max(0, cursor - args.categoryTotal);
  const page = Math.floor(productCursor / COMMERCE_BATCH_SIZE) + 1;
  const { data: fetchedProducts } = await fetchWooProducts(args.credentials, page, COMMERCE_BATCH_SIZE);
  const products = fetchedProducts.slice(
    0,
    Math.max(0, args.productTotal - productCursor),
  );

  for (let index = 0; index < products.length; index++) {
    const product = products[index];

    try {
      let forcedExistingId: string | undefined;
      const existingProductMapping = await ctx.runQuery(
        internal.wordpressSync.helpers.idMapping.getByWpId,
        { siteId: args.siteId, objectType: "commerceProduct", wpId: product.id }
      );

      // SKU collision detection for products with SKUs
      if (product.sku && args.jobId) {
        const existingBySku = await ctx.runQuery(
          internal.wordpressSync.internals.findProductBySku,
          { sku: product.sku }
        );
        if (existingBySku) {
          if (!existingProductMapping) {
            await createFinding(ctx, {
              siteId: args.siteId, jobId: args.jobId, severity: "warning",
              phase: "commerceCatalog",
              code: FINDING_CODES.SKU_COLLISION,
              message: `Product with SKU "${product.sku}" already exists locally (ID: ${existingBySku._id})`,
              sourceType: "product", sourceId: String(product.id),
              destinationTable: "commerce_products", wpId: product.id,
              convexId: existingBySku._id,
            });

            if (args.importConfig.behavior.updateExisting) {
              forcedExistingId = existingBySku._id;
            } else {
              skipped++;
              args.progress.imported++;
              continue;
            }
          }
        }
      }

      if (!args.isDryRun) {
        const productResult = await importSingleProduct(ctx, {
          siteId: args.siteId,
          siteCreatedBy: args.siteCreatedBy,
          product,
          forcedExistingId,
          importConfig: args.importConfig,
          jobId: args.jobId,
        });
        const productId = productResult.productId;

        if (productResult.status === "skipped") {
          skipped++;
          args.progress.imported++;
          continue;
        }
        if (productResult.status === "updated") updated++;
        else created++;

        if (product.type === "variable") {
          const variationResult = await importProductVariations(ctx, {
            siteId: args.siteId,
            credentials: args.credentials,
            product,
            productId,
            importConfig: args.importConfig,
            jobId: args.jobId,
          });
          args.progress.total += variationResult.discoveredTotal;
          args.progress.imported += variationResult.imported;
          args.progress.failed += variationResult.failed;
          created += variationResult.created;
          updated += variationResult.updated;
          skipped += variationResult.skipped;
          errors.push(...variationResult.errors);
        }
      } else {
        created++;
      }

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
    forcedExistingId?: string;
    importConfig: any;
    jobId: Id<"wordpressSyncJobs">;
  }
): Promise<{ productId: string; status: "created" | "updated" | "skipped" }> {
  // Compute source hash for change detection
  const productSourceHash = computeSourceHashCC({
    name: args.product.name,
    slug: args.product.slug,
    sku: args.product.sku,
    status: args.product.status,
    type: args.product.type,
    description: args.product.description,
    short_description: args.product.short_description,
    price: args.product.price,
    regular_price: args.product.regular_price,
    sale_price: args.product.sale_price,
    date_on_sale_from: args.product.date_on_sale_from,
    date_on_sale_to: args.product.date_on_sale_to,
    weight: args.product.weight,
    dimensions: args.product.dimensions,
    stock_quantity: args.product.stock_quantity,
    manage_stock: args.product.manage_stock,
    backorders: args.product.backorders,
    virtual: args.product.virtual,
    downloadable: args.product.downloadable,
    categories: args.product.categories?.map((category) => category.id),
    images: args.product.images?.map((image) => image.id),
    attributes: args.product.attributes,
    upsell_ids: args.product.upsell_ids,
    cross_sell_ids: args.product.cross_sell_ids,
  });

  const existingMapping = await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getFullMappingByWpId, {
    siteId: args.siteId,
    objectType: "commerceProduct",
    wpId: args.product.id,
  });
  const mappedExistingId = existingMapping?.convexId;
  const existingId = args.forcedExistingId ?? mappedExistingId;

  if (existingMapping) {
    await ctx.runMutation(internal.wordpressSync.helpers.idMapping.touch, {
      siteId: args.siteId,
      objectType: "commerceProduct",
      wpId: args.product.id,
      jobId: args.jobId,
    });
  }

  if (existingMapping?.sourceHash === productSourceHash) {
    return { productId: existingMapping.convexId, status: "skipped" };
  }

  if (existingMapping && !args.importConfig.behavior.updateExisting) {
    return { productId: existingMapping.convexId, status: "skipped" };
  }

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

  const shippingWeightOz = convertWeightToOz(args.product.weight);
  const shippingLengthIn = convertDimensionToInches(args.product.dimensions?.length);
  const shippingWidthIn = convertDimensionToInches(args.product.dimensions?.width);
  const shippingHeightIn = convertDimensionToInches(args.product.dimensions?.height);
  const salePriceFrom = wooDateToTimestamp(args.product.date_on_sale_from);
  const salePriceTo = wooDateToTimestamp(args.product.date_on_sale_to);
  const rawSourceMeta = buildProductRawSourceMeta(args.product);

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
        shippingWeightOz,
        shippingLengthIn,
        shippingWidthIn,
        shippingHeightIn,
        salePriceFrom,
        salePriceTo,
        rawSourceMeta,
      },
    }
  );

  await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
    siteId: args.siteId,
    objectType: "commerceProduct",
    wpId: args.product.id,
    convexId: productId,
    sourceHash: productSourceHash,
    jobId: args.jobId,
  });

  return { productId, status: existingId ? "updated" : "created" };
}

async function importProductVariations(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  args: {
    siteId: Id<"wordpressSites">;
    credentials: { siteUrl: string; username: string; applicationPassword: string };
    product: WooProduct;
    productId: string;
    importConfig: any;
    jobId: Id<"wordpressSyncJobs">;
  }
): Promise<{ imported: number; created: number; updated: number; skipped: number; failed: number; discoveredTotal: number; errors: SyncError[] }> {
  const errors: SyncError[] = [];
  let imported = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
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
        const sourceHash = computeSourceHashCC({
          sku: variation.sku,
          price: variation.price,
          regular_price: variation.regular_price,
          sale_price: variation.sale_price,
          attributes: variation.attributes,
          stock_quantity: variation.stock_quantity,
          manage_stock: variation.manage_stock,
          stock_status: variation.stock_status,
          backorders: variation.backorders,
          image: variation.image?.id,
          dimensions: variation.dimensions,
          status: variation.status,
          menu_order: variation.menu_order,
        });
        const existingMapping = await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getFullMappingByWpId, {
          siteId: args.siteId,
          objectType: "commerceProductVariant",
          wpId: variation.id,
        });
        const existingId = existingMapping?.convexId;

        if (existingMapping) {
          await ctx.runMutation(internal.wordpressSync.helpers.idMapping.touch, {
            siteId: args.siteId,
            objectType: "commerceProductVariant",
            wpId: variation.id,
            jobId: args.jobId,
          });
        }

        if (existingMapping?.sourceHash === sourceHash) {
          skipped++;
          imported++;
          continue;
        }

        if (existingMapping && !args.importConfig.behavior.updateExisting) {
          skipped++;
          imported++;
          continue;
        }

        const selections = buildVariantSelections(
          args.product.attributes,
          variation.attributes,
        );
        const optionSummary = selections
          ?.map((selection) => `${selection.optionTypeName}: ${selection.optionValueLabel}`)
          .join(" / ") || variation.attributes?.map((attr) => attr.option).filter(Boolean).join(" / ") || "Default";
        const variantMediaIds = await resolveCommerceMediaIds(
          ctx,
          args.siteId,
          variation.image?.id ? [variation.image.id] : []
        );

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
              featuredMediaId: variantMediaIds[0],
              isDefault: Boolean(!existingId && page === 1 && index === 0),
              description: variation.description || undefined,
              globalUniqueId: variation.global_unique_id || undefined,
              salePriceFrom: variation.date_on_sale_from ? new Date(variation.date_on_sale_from).getTime() : undefined,
              salePriceTo: variation.date_on_sale_to ? new Date(variation.date_on_sale_to).getTime() : undefined,
              manageStock: variation.manage_stock === true ? "yes" : variation.manage_stock === "parent" ? "parent" : variation.manage_stock === false ? "no" : undefined,
              stockStatus: variation.stock_status || undefined,
              backorders: variation.backorders || undefined,
              lowStockAmount: variation.low_stock_amount ?? undefined,
              weight: variation.weight || undefined,
              shippingLengthIn: variation.dimensions?.length || undefined,
              shippingWidthIn: variation.dimensions?.width || undefined,
              shippingHeightIn: variation.dimensions?.height || undefined,
              shippingClassId: variation.shipping_class_id ? String(variation.shipping_class_id) : undefined,
              taxClass: variation.tax_class || undefined,
              isVirtual: variation.virtual ?? undefined,
              isDownloadable: variation.downloadable ?? undefined,
              downloadLimit: variation.download_limit ?? undefined,
              downloadExpiry: variation.download_expiry ?? undefined,
              status: variation.status || undefined,
              menuOrder: variation.menu_order ?? undefined,
            },
          }
        );

        await ctx.runMutation(internal.wordpressSync.helpers.idMapping.create, {
          siteId: args.siteId,
          objectType: "commerceProductVariant",
          wpId: variation.id,
            convexId: variantId,
            sourceHash,
            jobId: args.jobId,
          });
        if (existingId) updated++;
        else created++;

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

  return { imported, created, updated, skipped, failed, discoveredTotal, errors };
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

async function repairCommerceCategoryHierarchy(
  ctx: Parameters<typeof internalAction>[0]["handler"] extends (ctx: infer C, ...args: unknown[]) => unknown ? C : never,
  siteId: Id<"wordpressSites">,
  credentials: { siteUrl: string; username: string; applicationPassword: string },
) {
  let page = 1;

  while (true) {
    const { data: categories, total } = await fetchWooProductCategories(credentials, page, COMMERCE_BATCH_SIZE);

    for (const category of categories) {
      const categoryId = await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
        siteId,
        objectType: "commerceCategory",
        wpId: category.id,
      });
      if (!categoryId) continue;

      let parentId: string | undefined;
      if (category.parent > 0) {
        parentId = (await ctx.runQuery(internal.wordpressSync.helpers.idMapping.getByWpId, {
          siteId,
          objectType: "commerceCategory",
          wpId: category.parent,
        })) ?? undefined;
      }

      await ctx.runMutation(internal.wordpressSync.phases.commerceCatalog.setCategoryParent, {
        categoryId,
        parentId,
      });
    }

    if (page * COMMERCE_BATCH_SIZE >= total || categories.length === 0) break;
    page++;
  }
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

/**
 * Convert WooCommerce weight (string) to ounces.
 * WooCommerce stores weights as strings; unit is configured per-site.
 * We assume the site uses lbs if no unit is detectable.
 * 1 lb = 16 oz. 1 kg = 35.274 oz.
 */
function convertWeightToOz(weight: string | undefined, unitHint?: string): number | undefined {
  if (!weight) return undefined;
  const parsed = Number.parseFloat(weight);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  const unit = (unitHint || "lbs").toLowerCase();
  if (unit === "kg") return Math.round(parsed * 35.274 * 100) / 100;
  if (unit === "g") return Math.round(parsed * 0.035274 * 100) / 100;
  if (unit === "oz") return Math.round(parsed * 100) / 100;
  // Default: assume lbs
  return Math.round(parsed * 16 * 100) / 100;
}

/**
 * Convert WooCommerce dimension (string) to inches.
 * WooCommerce stores dimensions as strings; unit is configured per-site.
 * We assume the site uses cm if no unit is detectable (WC default is cm).
 * 1 cm = 0.393701 in. 1 mm = 0.0393701 in. 1 m = 39.3701 in.
 */
function convertDimensionToInches(value: string | undefined, unitHint?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  const unit = (unitHint || "cm").toLowerCase();
  if (unit === "in" || unit === "inch" || unit === "inches") return Math.round(parsed * 100) / 100;
  if (unit === "mm") return Math.round(parsed * 0.0393701 * 100) / 100;
  if (unit === "m") return Math.round(parsed * 39.3701 * 100) / 100;
  // Default: assume cm
  return Math.round(parsed * 0.393701 * 100) / 100;
}

/**
 * Parse a WooCommerce date string to a timestamp.
 */
function wooDateToTimestamp(value: string | undefined | null): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

/**
 * Build the rawSourceMeta JSON string for a WooCommerce product.
 * Preserves fields we don't have dedicated columns for so no data is lost.
 */
function buildProductRawSourceMeta(product: WooProduct): string | undefined {
  const meta: Record<string, unknown> = {};
  if (product.meta_data) meta.meta_data = product.meta_data;
  if (product.tax_class) meta.tax_class = product.tax_class;
  if (product.tax_status) meta.tax_status = product.tax_status;
  if (product.stock_status) meta.stock_status = product.stock_status;
  if (product.total_sales !== undefined) meta.total_sales = product.total_sales;
  if (product.purchase_note) meta.purchase_note = product.purchase_note;
  if (product.external_url) meta.external_url = product.external_url;
  if (product.button_text) meta.button_text = product.button_text;
  if (product.grouped_products && product.grouped_products.length > 0) {
    meta.grouped_products_wp_ids = product.grouped_products;
  }
  // Preserve raw upsell/cross-sell WP IDs for reconciliation pass to resolve later
  if (product.upsell_ids && product.upsell_ids.length > 0) {
    meta.upsell_ids_wp = product.upsell_ids;
  }
  if (product.cross_sell_ids && product.cross_sell_ids.length > 0) {
    meta.cross_sell_ids_wp = product.cross_sell_ids;
  }
  // Preserve grouped product type since we map it to "simple"
  if (product.type === "grouped") {
    meta.original_product_type = "grouped";
  }
  return Object.keys(meta).length > 0 ? JSON.stringify(meta) : undefined;
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
      thumbnailMediaId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { existingId, parentId, wpCategory }) => {
    const now = Date.now();
    const patch = {
      name: wpCategory.name,
      slug: wpCategory.slug,
      description: wpCategory.description,
      parentId: parentId ? (parentId as Id<"commerce_product_categories">) : undefined,
      thumbnailMediaId: wpCategory.thumbnailMediaId
        ? (wpCategory.thumbnailMediaId as Id<"media">)
        : undefined,
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

export const setCategoryParent = internalMutation({
  args: {
    categoryId: v.string(),
    parentId: v.optional(v.string()),
  },
  handler: async (ctx, { categoryId, parentId }) => {
    await ctx.db.patch(categoryId as Id<"commerce_product_categories">, {
      parentId: parentId ? (parentId as Id<"commerce_product_categories">) : undefined,
      updatedAt: Date.now(),
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
      shippingWeightOz: v.optional(v.number()),
      shippingLengthIn: v.optional(v.number()),
      shippingWidthIn: v.optional(v.number()),
      shippingHeightIn: v.optional(v.number()),
      salePriceFrom: v.optional(v.number()),
      salePriceTo: v.optional(v.number()),
      rawSourceMeta: v.optional(v.string()),
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
      shippingWeightOz: product.shippingWeightOz,
      shippingLengthIn: product.shippingLengthIn,
      shippingWidthIn: product.shippingWidthIn,
      shippingHeightIn: product.shippingHeightIn,
      salePriceFrom: product.salePriceFrom,
      salePriceTo: product.salePriceTo,
      rawSourceMeta: product.rawSourceMeta,
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
      featuredMediaId: v.optional(v.string()),
      isDefault: v.boolean(),
      description: v.optional(v.string()),
      globalUniqueId: v.optional(v.string()),
      salePriceFrom: v.optional(v.number()),
      salePriceTo: v.optional(v.number()),
      manageStock: v.optional(v.string()),
      stockStatus: v.optional(v.string()),
      backorders: v.optional(v.string()),
      lowStockAmount: v.optional(v.number()),
      weight: v.optional(v.string()),
      shippingLengthIn: v.optional(v.string()),
      shippingWidthIn: v.optional(v.string()),
      shippingHeightIn: v.optional(v.string()),
      shippingClassId: v.optional(v.string()),
      taxClass: v.optional(v.string()),
      isVirtual: v.optional(v.boolean()),
      isDownloadable: v.optional(v.boolean()),
      downloadLimit: v.optional(v.number()),
      downloadExpiry: v.optional(v.number()),
      status: v.optional(v.string()),
      menuOrder: v.optional(v.number()),
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
      featuredMediaId: variant.featuredMediaId
        ? (variant.featuredMediaId as Id<"media">)
        : undefined,
      isDefault: variant.isDefault,
      description: variant.description,
      globalUniqueId: variant.globalUniqueId,
      salePriceFrom: variant.salePriceFrom,
      salePriceTo: variant.salePriceTo,
      manageStock: variant.manageStock,
      stockStatus: variant.stockStatus,
      backorders: variant.backorders,
      lowStockAmount: variant.lowStockAmount,
      weight: variant.weight,
      shippingLengthIn: variant.shippingLengthIn,
      shippingWidthIn: variant.shippingWidthIn,
      shippingHeightIn: variant.shippingHeightIn,
      shippingClassId: variant.shippingClassId,
      taxClass: variant.taxClass,
      isVirtual: variant.isVirtual,
      isDownloadable: variant.isDownloadable,
      downloadLimit: variant.downloadLimit,
      downloadExpiry: variant.downloadExpiry,
      status: variant.status,
      menuOrder: variant.menuOrder,
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
