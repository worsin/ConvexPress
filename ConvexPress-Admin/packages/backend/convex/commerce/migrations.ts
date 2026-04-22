import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { requireCommerceEnabled } from "./helpers";
import {
  normalizeVariantSelections,
  buildSelectionKey,
  inferSelectionsFromOptionSummary,
} from "./variantHelpers";

function pushSample(target: any[], value: any, limit: number) {
  if (target.length < limit) {
    target.push(value);
  }
}

async function auditReferenceRows(
  ctx: any,
  args: {
    rows: any[];
    sampleLimit: number;
    tableName: string;
    productIdField?: string;
    variantIdField?: string;
    getVariantProductId?: (row: any) => any;
    getRowId?: (row: any) => any;
  },
) {
  const missingVariantRefs: any[] = [];
  const crossProductVariantRefs: any[] = [];
  let missingCount = 0;
  let crossProductCount = 0;

  for (const row of args.rows) {
    const variantId =
      args.getVariantProductId === undefined
        ? row[args.variantIdField ?? "variantId"]
        : undefined;

    if (args.getVariantProductId) {
      const variantProductId = args.getVariantProductId(row);
      if (!variantProductId) {
        crossProductCount += 1;
        pushSample(crossProductVariantRefs, { table: args.tableName, rowId: args.getRowId?.(row) ?? row._id }, args.sampleLimit);
      }
      continue;
    }

    if (!variantId) continue;

    const variant = await ctx.db.get(variantId);
    if (!variant) {
      missingCount += 1;
      pushSample(
        missingVariantRefs,
        {
          table: args.tableName,
          rowId: args.getRowId?.(row) ?? row._id,
          productId: row[args.productIdField ?? "productId"],
          variantId,
        },
        args.sampleLimit,
      );
      continue;
    }

    if (
      row[args.productIdField ?? "productId"] &&
      variant.productId.toString() !== row[args.productIdField ?? "productId"].toString()
    ) {
      crossProductCount += 1;
      pushSample(
        crossProductVariantRefs,
        {
          table: args.tableName,
          rowId: args.getRowId?.(row) ?? row._id,
          productId: row[args.productIdField ?? "productId"],
          variantId,
          variantProductId: variant.productId,
        },
        args.sampleLimit,
      );
    }
  }

  return { missingCount, crossProductCount, missingVariantRefs, crossProductVariantRefs };
}

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const auditVariantIntegrity = query({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    productId: v.optional(v.id("commerce_products")),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    sampleLimit: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const sampleLimit = args.sampleLimit ?? 25;
    const scopedProduct = args.productId ? await ctx.db.get(args.productId) : null;
    if (args.productId && !scopedProduct) {
      throw new Error("Product not found");
    }

    const products = args.productId
      ? [scopedProduct]
      : await ctx.db.query("commerce_products").collect();
    const variants = args.productId
      ? await ctx.db
          .query("commerce_product_variants")
          .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
          .collect()
      : await ctx.db.query("commerce_product_variants").collect();
    const scopedVariantIds = new Set(
      (variants as any[]).map((variant: any) => variant._id.toString()),
    );

    const productsById = new Map(products.map((product: any) => [product._id.toString(), product]));
    const variantsByProduct = new Map<string, any[]>();
    const duplicateSelectionKeyGroups: Array<{ productId: any; selectionKey: string; variantIds: any[] }> = [];
    const variableProductsWithoutDefault: any[] = [];
    const variableProductsWithMultipleDefaults: any[] = [];
    const variableProductsWithMissingVariant: any[] = [];
    const productsWithTypeDrift: any[] = [];
    const variantsMissingSelections: any[] = [];
    const variantsMissingSelectionKey: any[] = [];
    const variantsWithInvalidSelections: any[] = [];
    const variantsNeedingManualSelectionRepair: any[] = [];
    const variableOrderItemsMissingVariant: any[] = [];
    let duplicateSelectionKeyGroupCount = 0;
    let variableProductsWithoutDefaultCount = 0;
    let variableProductsWithMultipleDefaultsCount = 0;
    let variableProductsWithMissingVariantCount = 0;
    let productsWithTypeDriftCount = 0;
    let variantsMissingSelectionsCount = 0;
    let variantsMissingSelectionKeyCount = 0;
    let variantsWithInvalidSelectionsCount = 0;
    let variantsNeedingManualSelectionRepairCount = 0;
    let variableOrderItemsMissingVariantCount = 0;

    for (const variant of variants) {
      const key = variant.productId.toString();
      const group = variantsByProduct.get(key) ?? [];
      group.push(variant);
      variantsByProduct.set(key, group);
    }

    for (const product of products) {
      const productVariants = (variantsByProduct.get(product._id.toString()) ?? []).sort(
        (a: any, b: any) => a.createdAt - b.createdAt,
      );

      if (product.productType === "variable" && productVariants.length === 0) {
        variableProductsWithMissingVariantCount += 1;
        pushSample(
          variableProductsWithMissingVariant,
          { productId: product._id, title: product.title },
          sampleLimit,
        );
      }

      if (productVariants.length > 0 && product.productType !== "variable") {
        productsWithTypeDriftCount += 1;
        pushSample(
          productsWithTypeDrift,
          { productId: product._id, title: product.title, currentType: product.productType },
          sampleLimit,
        );
      }

      if (product.productType === "variable" && productVariants.length > 0) {
        const defaults = productVariants.filter((variant: any) => variant.isDefault);
        if (defaults.length === 0) {
          variableProductsWithoutDefaultCount += 1;
          pushSample(
            variableProductsWithoutDefault,
            { productId: product._id, title: product.title, variantIds: productVariants.map((variant: any) => variant._id) },
            sampleLimit,
          );
        } else if (defaults.length > 1) {
          variableProductsWithMultipleDefaultsCount += 1;
          pushSample(
            variableProductsWithMultipleDefaults,
            { productId: product._id, title: product.title, variantIds: defaults.map((variant: any) => variant._id) },
            sampleLimit,
          );
        }
      }

      const duplicates = new Map<string, any[]>();
      for (const variant of productVariants) {
        if (variant.selectionKey) {
          const bucket = duplicates.get(variant.selectionKey) ?? [];
          bucket.push(variant._id);
          duplicates.set(variant.selectionKey, bucket);
        }
      }

      for (const [selectionKey, variantIds] of Array.from(duplicates.entries())) {
        if (variantIds.length > 1) {
          duplicateSelectionKeyGroupCount += 1;
          pushSample(
            duplicateSelectionKeyGroups,
            { productId: product._id, selectionKey, variantIds },
            sampleLimit,
          );
        }
      }
    }

    for (const variant of variants) {
      const product: any = productsById.get(variant.productId.toString());
      const optionTypes = product?.optionTypes ?? [];
      const normalizedSelections = normalizeVariantSelections(variant.selections);
      const computedSelectionKey = buildSelectionKey(normalizedSelections);

      if (!normalizedSelections?.length) {
        const inferredSelections = inferSelectionsFromOptionSummary(optionTypes, variant.optionSummary);
        if (inferredSelections?.length) {
          variantsMissingSelectionsCount += 1;
          pushSample(
            variantsMissingSelections,
            { variantId: variant._id, productId: variant.productId, optionSummary: variant.optionSummary },
            sampleLimit,
          );
        } else {
          variantsNeedingManualSelectionRepairCount += 1;
          pushSample(
            variantsNeedingManualSelectionRepair,
            { variantId: variant._id, productId: variant.productId, optionSummary: variant.optionSummary },
            sampleLimit,
          );
        }
      } else {
        const invalidSelection = normalizedSelections.some((selection: any) => {
          const optionType = optionTypes.find(
            (candidate: any) => candidate.id === selection.optionTypeId,
          );
          if (!optionType) return true;
          return !(optionType.values ?? []).some(
            (candidate: any) => candidate.id === selection.optionValueId,
          );
        });

        if (invalidSelection) {
          variantsWithInvalidSelectionsCount += 1;
          pushSample(
            variantsWithInvalidSelections,
            { variantId: variant._id, productId: variant.productId, selectionKey: variant.selectionKey },
            sampleLimit,
          );
        }
      }

      if (computedSelectionKey && variant.selectionKey !== computedSelectionKey) {
        variantsMissingSelectionKeyCount += 1;
        pushSample(
          variantsMissingSelectionKey,
          {
            variantId: variant._id,
            productId: variant.productId,
            storedSelectionKey: variant.selectionKey,
            computedSelectionKey,
          },
          sampleLimit,
        );
      }
    }

    const isRowRelevant = (row: any, productIdField = "productId", variantIdField = "variantId") => {
      if (!args.productId) return true;
      if (row?.[productIdField]?.toString() === args.productId.toString()) return true;
      return scopedVariantIds.has(row?.[variantIdField]?.toString());
    };

    const cartRefs = await auditReferenceRows(ctx, {
      rows: (await ctx.db.query("commerce_cart_items").collect()).filter((row: any) =>
        isRowRelevant(row),
      ),
      sampleLimit,
      tableName: "commerce_cart_items",
    });
    const orderRefs = await auditReferenceRows(ctx, {
      rows: (await ctx.db.query("commerce_order_items").collect()).filter((row: any) =>
        isRowRelevant(row),
      ),
      sampleLimit,
      tableName: "commerce_order_items",
    });
    const wishlistRefs = await auditReferenceRows(ctx, {
      rows: (await ctx.db.query("commerce_wishlist_items").collect()).filter((row: any) =>
        isRowRelevant(row),
      ),
      sampleLimit,
      tableName: "commerce_wishlist_items",
    });
    const digitalFileRefs = await auditReferenceRows(ctx, {
      rows: (await ctx.db.query("commerce_digital_files").collect()).filter((row: any) =>
        isRowRelevant(row),
      ),
      sampleLimit,
      tableName: "commerce_digital_files",
    });
    const licenseKeyRefs = await auditReferenceRows(ctx, {
      rows: (await ctx.db.query("commerce_license_keys").collect()).filter((row: any) =>
        isRowRelevant(row),
      ),
      sampleLimit,
      tableName: "commerce_license_keys",
    });
    const bundleComponentRefs = await auditReferenceRows(ctx, {
      rows: (await ctx.db.query("commerce_bundle_components").collect()).filter((row: any) =>
        isRowRelevant(row),
      ),
      sampleLimit,
      tableName: "commerce_bundle_components",
    });
    const subscriptionItemRefs = await auditReferenceRows(ctx, {
      rows: (await ctx.db.query("commerce_subscription_items").collect()).filter((row: any) =>
        isRowRelevant(row),
      ),
      sampleLimit,
      tableName: "commerce_subscription_items",
    });
    const returnItemRefs = await auditReferenceRows(ctx, {
      rows: (await ctx.db.query("commerce_return_items").collect()).filter((row: any) =>
        isRowRelevant(row),
      ),
      sampleLimit,
      tableName: "commerce_return_items",
    });
    const reservationRefs = await auditReferenceRows(ctx, {
      rows: (await ctx.db.query("commerce_stock_reservations").collect()).filter((row: any) =>
        isRowRelevant(row),
      ),
      sampleLimit,
      tableName: "commerce_stock_reservations",
    });
    const adjustmentRefs = await auditReferenceRows(ctx, {
      rows: (await ctx.db.query("commerce_inventory_adjustments").collect()).filter((row: any) =>
        isRowRelevant(row),
      ),
      sampleLimit,
      tableName: "commerce_inventory_adjustments",
    });

    const bundleSelections = await ctx.db.query("commerce_bundle_selections").collect();
    const bundleSelectionRefs = await auditReferenceRows(ctx, {
      rows: bundleSelections
        .flatMap((row: any) =>
          (row.selections ?? []).map((selection: any, index: number) => ({
            ...selection,
            _id: `${row._id.toString()}:${index}`,
          })),
        )
        .filter((row: any) => isRowRelevant(row)),
      sampleLimit,
      tableName: "commerce_bundle_selections",
      getRowId: (row: any) => row._id,
    });

    const orderItems = (await ctx.db.query("commerce_order_items").collect()).filter((row: any) =>
      !args.productId || row.productId?.toString() === args.productId.toString(),
    );
    for (const item of orderItems) {
      const product: any = productsById.get(item.productId.toString());
      if (product?.productType === "variable" && !item.variantId) {
        variableOrderItemsMissingVariantCount += 1;
        pushSample(
          variableOrderItemsMissingVariant,
          { orderItemId: item._id, orderId: item.orderId, productId: item.productId },
          sampleLimit,
        );
      }
    }

    const missingVariantRefs = [
      ...cartRefs.missingVariantRefs,
      ...orderRefs.missingVariantRefs,
      ...wishlistRefs.missingVariantRefs,
      ...digitalFileRefs.missingVariantRefs,
      ...licenseKeyRefs.missingVariantRefs,
      ...bundleComponentRefs.missingVariantRefs,
      ...bundleSelectionRefs.missingVariantRefs,
      ...subscriptionItemRefs.missingVariantRefs,
      ...returnItemRefs.missingVariantRefs,
      ...reservationRefs.missingVariantRefs,
      ...adjustmentRefs.missingVariantRefs,
    ].slice(0, sampleLimit);

    const crossProductVariantRefs = [
      ...cartRefs.crossProductVariantRefs,
      ...orderRefs.crossProductVariantRefs,
      ...wishlistRefs.crossProductVariantRefs,
      ...digitalFileRefs.crossProductVariantRefs,
      ...licenseKeyRefs.crossProductVariantRefs,
      ...bundleComponentRefs.crossProductVariantRefs,
      ...bundleSelectionRefs.crossProductVariantRefs,
      ...subscriptionItemRefs.crossProductVariantRefs,
      ...returnItemRefs.crossProductVariantRefs,
      ...reservationRefs.crossProductVariantRefs,
      ...adjustmentRefs.crossProductVariantRefs,
    ].slice(0, sampleLimit);

    return {
      totals: {
        products: products.length,
        variants: variants.length,
        duplicateSelectionKeyGroups: duplicateSelectionKeyGroupCount,
        variableProductsWithoutDefault: variableProductsWithoutDefaultCount,
        variableProductsWithMultipleDefaults: variableProductsWithMultipleDefaultsCount,
        variableProductsWithMissingVariant: variableProductsWithMissingVariantCount,
        productsWithTypeDrift: productsWithTypeDriftCount,
        variantsMissingSelections: variantsMissingSelectionsCount,
        variantsMissingSelectionKey: variantsMissingSelectionKeyCount,
        variantsWithInvalidSelections: variantsWithInvalidSelectionsCount,
        variantsNeedingManualSelectionRepair: variantsNeedingManualSelectionRepairCount,
        missingVariantRefs:
          cartRefs.missingCount +
          orderRefs.missingCount +
          wishlistRefs.missingCount +
          digitalFileRefs.missingCount +
          licenseKeyRefs.missingCount +
          bundleComponentRefs.missingCount +
          bundleSelectionRefs.missingCount +
          subscriptionItemRefs.missingCount +
          returnItemRefs.missingCount +
          reservationRefs.missingCount +
          adjustmentRefs.missingCount,
        crossProductVariantRefs:
          cartRefs.crossProductCount +
          orderRefs.crossProductCount +
          wishlistRefs.crossProductCount +
          digitalFileRefs.crossProductCount +
          licenseKeyRefs.crossProductCount +
          bundleComponentRefs.crossProductCount +
          bundleSelectionRefs.crossProductCount +
          subscriptionItemRefs.crossProductCount +
          returnItemRefs.crossProductCount +
          reservationRefs.crossProductCount +
          adjustmentRefs.crossProductCount,
        variableOrderItemsMissingVariant: variableOrderItemsMissingVariantCount,
      },
      samples: {
        duplicateSelectionKeyGroups,
        variableProductsWithoutDefault,
        variableProductsWithMultipleDefaults,
        variableProductsWithMissingVariant,
        productsWithTypeDrift,
        variantsMissingSelections,
        variantsMissingSelectionKey,
        variantsWithInvalidSelections,
        variantsNeedingManualSelectionRepair,
        missingVariantRefs,
        crossProductVariantRefs,
        variableOrderItemsMissingVariant,
      },
    };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const repairVariantIntegrity = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    dryRun: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    productId: v.optional(v.id("commerce_products")),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const dryRun = args.dryRun ?? true;
    const now = Date.now();
    const scopedProduct = args.productId ? await ctx.db.get(args.productId) : null;
    if (args.productId && !scopedProduct) {
      throw new Error("Product not found");
    }

    const products = args.productId
      ? [scopedProduct]
      : await ctx.db.query("commerce_products").collect();
    const variants = args.productId
      ? await ctx.db
          .query("commerce_product_variants")
          .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
          .collect()
      : await ctx.db.query("commerce_product_variants").collect();
    const variantsByProduct = new Map<string, any[]>();

    for (const variant of variants) {
      const group = variantsByProduct.get(variant.productId.toString()) ?? [];
      group.push(variant);
      variantsByProduct.set(variant.productId.toString(), group);
    }

    const summary = {
      productTypePromotions: 0,
      defaultVariantRepairs: 0,
      selectionRepairs: 0,
      selectionKeyRepairs: 0,
      productsTouched: 0,
    };

    const touchedProducts = new Set<string>();

    for (const product of products as any[]) {
      const productVariants = (variantsByProduct.get(product._id.toString()) ?? []).sort(
        (a: any, b: any) => a.createdAt - b.createdAt,
      );

      if (productVariants.length > 0 && product.productType !== "variable") {
        if (!dryRun) {
          await ctx.db.patch(product._id, {
            productType: "variable",
            updatedAt: now,
          });
        }
        summary.productTypePromotions += 1;
        touchedProducts.add(product._id.toString());
      }

      for (const variant of productVariants) {
        const normalizedSelections = normalizeVariantSelections(variant.selections);
        const inferredSelections =
          normalizedSelections?.length
            ? normalizedSelections
            : inferSelectionsFromOptionSummary(product.optionTypes ?? [], variant.optionSummary);
        const computedSelectionKey = buildSelectionKey(inferredSelections);
        const patch: Record<string, unknown> = {};

        if (!normalizedSelections?.length && inferredSelections?.length) {
          patch.selections = inferredSelections;
          summary.selectionRepairs += 1;
        }

        if (computedSelectionKey && variant.selectionKey !== computedSelectionKey) {
          patch.selectionKey = computedSelectionKey;
          summary.selectionKeyRepairs += 1;
        }

        if (Object.keys(patch).length > 0 && !dryRun) {
          await ctx.db.patch(variant._id, {
            ...patch,
            updatedAt: now,
          });
        }

        if (Object.keys(patch).length > 0) {
          touchedProducts.add(product._id.toString());
        }
      }

      if (product.productType === "variable" && productVariants.length > 0) {
        const defaults = productVariants.filter((variant: any) => variant.isDefault);
        const canonicalDefault =
          defaults.sort((a: any, b: any) => a.createdAt - b.createdAt)[0] ?? productVariants[0];

        if (defaults.length !== 1 || !canonicalDefault?.isDefault) {
          summary.defaultVariantRepairs += 1;
          touchedProducts.add(product._id.toString());

          if (!dryRun) {
            for (const variant of productVariants) {
              await ctx.db.patch(variant._id, {
                isDefault: variant._id.toString() === canonicalDefault._id.toString(),
                updatedAt: now,
              });
            }
          }
        }
      }
    }

    summary.productsTouched = touchedProducts.size;

    const totalRepairs =
      summary.productTypePromotions +
      summary.defaultVariantRepairs +
      summary.selectionRepairs +
      summary.selectionKeyRepairs;

    if (totalRepairs > 0) {
      await emitEvent(ctx, "commerce.variant_integrity_repair", "commerce", {
        dryRun,
        productId: args.productId ?? null,
        productsTouched: summary.productsTouched,
        productTypePromotions: summary.productTypePromotions,
        defaultVariantRepairs: summary.defaultVariantRepairs,
        selectionRepairs: summary.selectionRepairs,
        selectionKeyRepairs: summary.selectionKeyRepairs,
        totalRepairs,
        timestamp: Date.now(),
      });
    }

    return {
      dryRun,
      ...summary,
    };
  },
});
