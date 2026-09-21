// @ts-nocheck
// ============================================
// INVENTORY SYSTEM - Stock tracking, reservations, alerts
// Ported from VexCart inventory.ts, adapted to ConvexPress patterns
// ============================================

import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { mutation, query, internalMutation } from "../_generated/server";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";
import { activePriceAmount } from "./activePrice";
import { resolveStockPolicy, canOrderQuantity } from "./stockPolicy";
import { prepareReservationCommit } from "./reservationCommit";
import { readStockTarget, readReservedStock, readCheckoutReservations } from "./stockTarget";
import { patchDynamicWithMediaReferences } from "../media/attachmentGuard";


// Default low stock threshold when none is configured per-product.
// ConvexPress products don't carry a per-product threshold field yet,
// so we use a sensible default and allow callers to pass one.
const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const inventoryAdjustmentResultValidator = v.object({
  productId:v.id("commerce_products"),variantId:v.optional(v.id("commerce_product_variants")),
  success:v.boolean(),error:v.optional(v.string()),previousStock:v.optional(v.number()),newStock:v.optional(v.number()),
});

// ============================================
// HELPERS
// ============================================

function getMoneyAmount(money: any): number {
  if (typeof money === "number") return money;
  return money?.amount ?? 0;
}

/**
 * Compute the total reserved quantity for a product from active reservations.
 * ConvexPress doesn't store reservedCount on the product row; we derive it.
 */
async function getReservedCount(ctx: any, productId: any, variantId?: any) {
  return readReservedStock(ctx, productId, variantId);
}

async function resolveInventoryTarget(ctx: any, productId: any, variantId?: any) {
  const target = await readStockTarget(ctx, productId, variantId);
  return {...target, reservedCount: target.policy.tracked ? await getReservedCount(ctx,productId,target.inventoryVariantId) : 0};
}

/**
 * Create or update a low stock / out-of-stock alert.
 */
async function createAlert(
  ctx: any,
  productId: any,
  stockQuantity: number,
  threshold: number,
  _type: "low_stock" | "out_of_stock",
) {
  // Check if active alert already exists for this product
  const existingAlert = await ctx.db
    .query("commerce_low_stock_alerts")
    .withIndex("by_product", (q: any) => q.eq("productId", productId))
    .filter((q: any) => q.eq(q.field("status"), "active"))
    .first();

  if (existingAlert) {
    // Update existing alert with current stock level
    await patchDynamicWithMediaReferences(ctx, existingAlert._id, {
      stockQuantity,
    });
    return;
  }

  // Create new alert
  await ctx.db.insert("commerce_low_stock_alerts", {
    productId,
    stockQuantity,
    threshold,
    status: "active",
    createdAt: Date.now(),
  });
}

async function getInventoryEntriesForProduct(ctx: any, product: any) {
  const variants = product.productType === "variable" ? await ctx.db
    .query("commerce_product_variants").withIndex("by_product",(q:any)=>q.eq("productId",product._id)).take(1001) : [null];
  if(variants.length>1000)throw new ConvexError({code:"INVENTORY_CAPACITY",message:"Product variants exceed the supported inventory request budget."});
  const entries:any[]=[];
  const seen=new Set<string>();
  for(const selected of variants){
    const policy=resolveStockPolicy(product,selected);
    const variant=policy.mode === "parent" ? null : selected;
    const entryId=variant?`${product._id}:${variant._id}`:String(product._id);
    if(seen.has(entryId))continue;
    seen.add(entryId);
    const reservedCount=policy.tracked?await getReservedCount(ctx,product._id,variant?._id):0;
    const stock=resolveStockPolicy(product,selected,reservedCount);
    entries.push({entryId,productId:product._id,variantId:variant?._id,
      title:variant?`${product.title} - ${variant.title}`:product.title,productTitle:product.title,variantTitle:variant?.title,
      slug:product.slug,sku:variant?.sku??product.sku,featuredMediaId:variant?.featuredMediaId??product.featuredMediaId,
      productType:product.productType,trackInventory:stock.tracked,allowBackorders:stock.allowBackorders,
      stockQuantity:stock.stockQuantity,reservedCount,availableStock:stock.available,lowStockThreshold:DEFAULT_LOW_STOCK_THRESHOLD,
      isLowStock:stock.tracked && stock.available>0 && stock.available<=DEFAULT_LOW_STOCK_THRESHOLD,
      isOutOfStock:!canOrderQuantity(stock,1),
      valueAmount:stock.tracked?activePriceAmount(variant?.price??product.basePrice,variant?.salePrice??product.salePrice,variant??product)*stock.stockQuantity:0});
  }
  return entries;
}

async function getPublishedInventoryEntries(ctx: any, includeDrafts = false) {
  const publishedProducts = await ctx.db
    .query("commerce_products")
    .withIndex("by_status", (q: any) => q.eq("status", "publish"))
    .collect();

  const draftProducts = includeDrafts
    ? await ctx.db
        .query("commerce_products")
        .withIndex("by_status", (q: any) => q.eq("status", "draft"))
        .collect()
    : [];

  const products = [...publishedProducts, ...draftProducts];
  const entries = await Promise.all(
    products.map((product: any) => getInventoryEntriesForProduct(ctx, product)),
  );

  return entries.flat();
}

async function findInventoryLevel(
  ctx: any,
  args: {
    productId: any;
    variantId?: any;
    locationId: any;
  },
) {
  const rows = await ctx.db
    .query("commerce_inventory_levels")
    .withIndex("by_product_location", (q: any) =>
      q.eq("productId", args.productId).eq("locationId", args.locationId),
    )
    .collect();
  return rows.find(
    (row: any) =>
      (row.variantId?.toString() ?? null) ===
      (args.variantId?.toString() ?? null),
  ) ?? null;
}

async function getReservedCountAtLocation(ctx: any, args: {productId:any; variantId?:any; locationId:any}) {
  return readReservedStock(ctx,args.productId,args.variantId,args.locationId);
}

// ============================================
// QUERIES
// ============================================

/**
 * Get available stock for a product.
 */
export const getAvailable = query({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const target = await resolveInventoryTarget(ctx, args.productId, args.variantId);
    const { product, stockQuantity, reservedCount } = target;
    const available = stockQuantity - reservedCount;
    const threshold = DEFAULT_LOW_STOCK_THRESHOLD;

    return {
      productId: args.productId,
      stockQuantity,
      reservedCount,
      available,
      lowThreshold: threshold,
      isLowStock:
        target.policy.tracked &&
        stockQuantity > 0 &&
        stockQuantity <= threshold,
      isOutOfStock: !canOrderQuantity(resolveStockPolicy(product,target.variant,reservedCount),1),
      trackInventory: target.policy.tracked,
      allowBackorders: target.policy.allowBackorders,
    };
  },
});

/**
 * List location inventory levels for a product or variant.
 */
export const listLocationLevels = query({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const rows = await ctx.db
      .query("commerce_inventory_levels")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .collect();
    const scopedRows = rows.filter(
      (row: any) =>
        args.variantId === undefined ||
        row.variantId?.toString() === args.variantId.toString(),
    );

    return Promise.all(
      scopedRows.map(async (row: any) => {
        const location = await ctx.db.get(row.locationId);
        const reservedCount = await getReservedCountAtLocation(ctx, {
          productId: row.productId,
          variantId: row.variantId,
          locationId: row.locationId,
        });
        const safetyStock = Number(row.safetyStockQuantity ?? 0);
        return {
          ...row,
          location,
          reservedCount,
          availableStock: Number(row.stockQuantity ?? 0) - safetyStock - reservedCount,
        };
      }),
    );
  },
});

/**
 * Check if a set of order items can be fulfilled.
 */
export const canFulfill = query({
  args: {
    items: v.array(
      v.object({
        productId: v.id("commerce_products"),
        variantId: v.optional(v.id("commerce_product_variants")),
        quantity: v.number(),
      }),
    ),
  },
  returns: v.object({
    canFulfillAll:v.boolean(),
    items:v.array(v.object({productId:v.id("commerce_products"),variantId:v.optional(v.id("commerce_product_variants")),quantity:v.number(),canFulfill:v.boolean(),reason:v.optional(v.string()),available:v.optional(v.number()),backordered:v.optional(v.number())})),
  }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    if (args.items.length > 100) throw new ConvexError({code:"INVENTORY_CAPACITY", message:"Check at most 100 inventory lines per request."});
    const results = [];
    const planned = new Map<string,number>();
    const reservedByOwner = new Map<string,number>();
    for (const item of args.items) {
      try {
        const target = await readStockTarget(ctx, item.productId, item.variantId);
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || (!target.policy.tracked && target.policy.stockStatus === "outofstock")) {
          results.push({...item, canFulfill:false, reason:"Item is unavailable or quantity is invalid"});
          continue;
        }
        if (!target.policy.tracked) {
          results.push({...item, canFulfill:true, reason:"Not tracking inventory"});
          continue;
        }
        const owner = String(target.patchId);
        if (!reservedByOwner.has(owner)) reservedByOwner.set(owner, await readReservedStock(ctx,item.productId,target.inventoryVariantId));
        const requested = planned.get(owner) ?? 0;
        const available = target.stockQuantity - reservedByOwner.get(owner)! - requested;
        if (available >= item.quantity) {
          planned.set(owner, requested + item.quantity);
          results.push({...item, canFulfill:true, available});
        } else if (target.policy.allowBackorders) {
          planned.set(owner, requested + item.quantity);
          results.push({...item, canFulfill:true, reason:"Backorder", backordered:item.quantity-Math.max(0,available)});
        } else {
          results.push({...item, canFulfill:false, reason:"Insufficient stock", available});
        }
      } catch (error) {
        if (!(error instanceof ConvexError) || !["NOT_FOUND","VALIDATION_ERROR"].includes(error.data?.code)) throw error;
        results.push({...item, canFulfill:false, reason:error.data.message});
      }
    }

    return {
      canFulfillAll: results.every((r: any) => r.canFulfill),
      items: results,
    };
  },
});

/**
 * Get low stock products (admin).
 */
export const getLowStock = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const entries = await getPublishedInventoryEntries(ctx);

    return entries
      .filter((entry: any) => entry.isLowStock)
      .sort((a: any, b: any) => a.stockQuantity - b.stockQuantity)
      .slice(0, args.limit ?? 50);
  },
});

/**
 * Get out of stock products (admin).
 */
export const getOutOfStock = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const entries = await getPublishedInventoryEntries(ctx);

    return entries
      .filter((entry: any) => entry.isOutOfStock)
      .slice(0, args.limit ?? 50);
  },
});

/**
 * Get inventory overview stats (admin dashboard).
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const entries = await getPublishedInventoryEntries(ctx);
    const tracked = entries.filter((entry: any) => entry.trackInventory);
    const lowStock = tracked.filter((entry: any) => entry.isLowStock);
    const outOfStock = tracked.filter((entry: any) => entry.isOutOfStock);

    // Active alerts count
    const activeAlerts = await ctx.db
      .query("commerce_low_stock_alerts")
      .withIndex("by_status", (q: any) => q.eq("status", "active"))
      .collect();

    // Recent adjustments (last 24h)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentAdjustments = await ctx.db
      .query("commerce_inventory_adjustments")
      .withIndex("by_date")
      .filter((q: any) => q.gte(q.field("createdAt"), oneDayAgo))
      .collect();

    // Total inventory value
    const totalValue = tracked.reduce((sum: number, entry: any) => {
      return sum + entry.valueAmount;
    }, 0);

    return {
      totalProducts: entries.length,
      trackedProducts: tracked.length,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      activeAlertsCount: activeAlerts.length,
      recentAdjustmentsCount: recentAdjustments.length,
      totalInventoryValue: totalValue,
    };
  },
});

/**
 * Get inventory adjustments history log.
 */
export const getHistory = query({
  args: {
    productId: v.optional(v.id("commerce_products")),
    adjustmentType: v.optional(
      v.union(
        v.literal("restock"),
        v.literal("sale"),
        v.literal("return"),
        v.literal("damage"),
        v.literal("correction"),
        v.literal("reservation"),
        v.literal("release"),
        v.literal("order_allocation"),
        v.literal("order_release"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let adjustments: any[];
    const limit = args.limit ?? 50;

    if (args.productId) {
      adjustments = await ctx.db
        .query("commerce_inventory_adjustments")
        .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
        .order("desc")
        .take(limit);
    } else if (args.adjustmentType) {
      adjustments = await ctx.db
        .query("commerce_inventory_adjustments")
        .withIndex("by_type", (q: any) =>
          q.eq("adjustmentType", args.adjustmentType),
        )
        .order("desc")
        .take(limit);
    } else {
      adjustments = await ctx.db
        .query("commerce_inventory_adjustments")
        .withIndex("by_date")
        .order("desc")
        .take(limit);
    }

    // Enrich with product and user info
    return Promise.all(
      adjustments.map(async (adj: any) => {
        const [product, variant] = await Promise.all([
          ctx.db.get(adj.productId),
          adj.variantId ? ctx.db.get(adj.variantId) : Promise.resolve(null),
        ]);
        const user = adj.actorUserId
          ? await ctx.db.get(adj.actorUserId)
          : null;
        return {
          ...adj,
          productTitle: product?.title ?? "Unknown Product",
          variantTitle: variant?.title,
          productSlug: product?.slug,
          userName: user
            ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
              user.email
            : "System",
        };
      }),
    );
  },
});

/**
 * Get active stock reservations (admin).
 */
export const getActiveReservations = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const reservations = await ctx.db
      .query("commerce_stock_reservations")
      .filter((q: any) => q.eq(q.field("status"), "active"))
      .order("desc")
      .take(args.limit ?? 50);

    return Promise.all(
      reservations.map(async (res: any) => {
        const [product, variant] = await Promise.all([
          ctx.db.get(res.productId),
          res.variantId ? ctx.db.get(res.variantId) : Promise.resolve(null),
        ]);
        return {
          ...res,
          productTitle: product?.title ?? "Unknown",
          variantTitle: variant?.title,
          productSlug: product?.slug,
          isExpired: res.expiresAt < Date.now(),
        };
      }),
    );
  },
});

/**
 * Get low stock alerts (admin).
 */
export const getAlerts = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("acknowledged"),
        v.literal("resolved"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let alerts: any[];
    const limit = args.limit ?? 50;

    if (args.status) {
      alerts = await ctx.db
        .query("commerce_low_stock_alerts")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .order("desc")
        .take(limit);
    } else {
      alerts = await ctx.db
        .query("commerce_low_stock_alerts")
        .order("desc")
        .take(limit);
    }

    return Promise.all(
      alerts.map(async (alert: any) => {
        const product = await ctx.db.get(alert.productId);
        const acknowledgedByUser = alert.acknowledgedBy
          ? await ctx.db.get(alert.acknowledgedBy)
          : null;
        return {
          ...alert,
          productTitle: product?.title ?? "Unknown",
          productSlug: product?.slug,
          currentStock:
            product?.productType === "variable"
              ? undefined
              : typeof product?.stockQuantity === "number"
                ? product.stockQuantity
                : 0,
          tracksVariantInventory: product?.productType === "variable",
          acknowledgedByName: acknowledgedByUser
            ? `${acknowledgedByUser.firstName ?? ""} ${acknowledgedByUser.lastName ?? ""}`.trim()
            : null,
        };
      }),
    );
  },
});

/**
 * Get inventory for all products (admin table view).
 */
export const listAll = query({
  args: {
    sortBy: v.optional(
      v.union(
        v.literal("title"),
        v.literal("stockQuantity"),
      ),
    ),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    filter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("lowStock"),
        v.literal("outOfStock"),
        v.literal("tracked"),
        v.literal("untracked"),
      ),
    ),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    let entries = await getPublishedInventoryEntries(ctx, true);

    // Apply filter
    if (args.filter === "lowStock") {
      entries = entries.filter((entry: any) => entry.isLowStock);
    } else if (args.filter === "outOfStock") {
      entries = entries.filter((entry: any) => entry.isOutOfStock);
    } else if (args.filter === "tracked") {
      entries = entries.filter((entry: any) => entry.trackInventory);
    } else if (args.filter === "untracked") {
      entries = entries.filter((entry: any) => !entry.trackInventory);
    }

    // Apply search
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      entries = entries.filter(
        (entry: any) =>
          entry.title.toLowerCase().includes(searchLower) ||
          (entry.sku ?? "").toLowerCase().includes(searchLower),
      );
    }

    // Apply sorting
    const sortBy = args.sortBy ?? "title";
    const sortOrder = args.sortOrder ?? "asc";
    entries.sort((a: any, b: any) => {
      let aVal: string | number =
        sortBy === "stockQuantity" ? a.stockQuantity : a.title;
      let bVal: string | number =
        sortBy === "stockQuantity" ? b.stockQuantity : b.title;

      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    // Apply limit
    if (args.limit) {
      entries = entries.slice(0, args.limit);
    }

    return entries.map((entry: any) => ({
      _id: entry.variantId ?? entry.productId,
      entryId: entry.entryId,
      productId: entry.productId,
      variantId: entry.variantId,
      title: entry.title,
      productTitle: entry.productTitle,
      variantTitle: entry.variantTitle,
      slug: entry.slug,
      sku: entry.sku,
      featuredMediaId: entry.featuredMediaId,
      productType: entry.productType,
      stockQuantity: entry.stockQuantity,
      reservedCount: entry.reservedCount,
      availableStock: entry.availableStock,
      lowStockThreshold: entry.lowStockThreshold,
      trackInventory: entry.trackInventory,
      allowBackorders: entry.allowBackorders,
      isLowStock: entry.isLowStock,
      isOutOfStock: entry.isOutOfStock,
    }));
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Manual stock adjustment (admin).
 */
export const adjust = mutation({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    locationId: v.optional(v.id("commerce_ship_from_locations")),
    adjustmentType: v.union(
      v.literal("restock"),
      v.literal("damage"),
      v.literal("correction"),
      v.literal("return"),
    ),
    quantity: v.number(),
    reason: v.string(),
  },
  returns: v.object({success:v.literal(true),previousStock:v.number(),newStock:v.number()}),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await requireCan(ctx, "manage_options");
    const target = await readStockTarget(ctx, args.productId, args.variantId, {allowParent:true});
    const locationLevel = args.locationId
      ? await findInventoryLevel(ctx, {
          productId: args.productId,
          variantId: target.inventoryVariantId,
          locationId: args.locationId,
        })
      : null;
    const previousStock = locationLevel
      ? Number(locationLevel.stockQuantity ?? 0)
      : target.stockQuantity;
    const newStock = previousStock + args.quantity;

    if (newStock < 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cannot adjust to negative stock.",
      });
    }

    const wasOutOfStock = previousStock === 0;
    const isNowInStock = newStock > 0;

    const now = Date.now();
    if (args.locationId) {
      if (locationLevel) {
        await patchDynamicWithMediaReferences(ctx, locationLevel._id, {
          stockQuantity: newStock,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("commerce_inventory_levels", {
          productId: args.productId,
          variantId: target.inventoryVariantId,
          locationId: args.locationId,
          stockQuantity: newStock,
          incomingQuantity: 0,
          safetyStockQuantity: 0,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    } else {
      await patchDynamicWithMediaReferences(ctx, target.patchId, {
        stockQuantity: newStock,
        updatedAt: now,
      });
    }

    await ctx.db.insert("commerce_inventory_adjustments", {
      productId: args.productId,
      variantId: target.inventoryVariantId,
      locationId: args.locationId,
      adjustmentType: args.adjustmentType,
      quantityDelta: args.quantity,
      reason: args.reason,
      actorUserId: user._id,
      createdAt: now,
    });

    // Resolve any low stock alerts if stock is now healthy
    if (newStock > DEFAULT_LOW_STOCK_THRESHOLD) {
      const activeAlerts = await ctx.db
        .query("commerce_low_stock_alerts")
        .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
        .filter((q: any) => q.eq(q.field("status"), "active"))
        .collect();

      for (const alert of activeAlerts) {
        await ctx.db.patch("commerce_low_stock_alerts", alert._id, { status: "resolved" });
      }
    }

    // Check for back in stock (could trigger event)
    if (wasOutOfStock && isNowInStock) {
      // Future: emit "back_in_stock" event via event dispatcher
    }

    return { success: true, previousStock, newStock };
  },
});

/**
 * Create or update a product/variant inventory level at a fulfillment location.
 */
export const upsertLocationLevel = mutation({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    locationId: v.id("commerce_ship_from_locations"),
    stockQuantity: v.number(),
    incomingQuantity: v.optional(v.number()),
    safetyStockQuantity: v.optional(v.number()),
    allowBackorders: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    externalInventoryItemId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  returns: v.id("commerce_inventory_levels"),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const target = await readStockTarget(ctx, args.productId, args.variantId, {allowParent:true});

    const location = await ctx.db.get(args.locationId);
    if (!location) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Fulfillment location not found.",
      });
    }

    const now = Date.now();
    const existing = await findInventoryLevel(ctx, {...args, variantId:target.inventoryVariantId});
    const patch = {
      stockQuantity: args.stockQuantity,
      incomingQuantity: args.incomingQuantity ?? 0,
      safetyStockQuantity: args.safetyStockQuantity ?? 0,
      allowBackorders: args.allowBackorders,
      isActive: args.isActive ?? true,
      externalInventoryItemId: args.externalInventoryItemId,
      metadata: args.metadata,
      updatedAt: now,
    };

    if (existing) {
      await patchDynamicWithMediaReferences(ctx, existing._id, patch);
      return existing._id;
    }

    return ctx.db.insert("commerce_inventory_levels", {
      productId: args.productId,
      variantId: target.inventoryVariantId,
      locationId: args.locationId,
      ...patch,
      createdAt: now,
    });
  },
});

/**
 * Bulk stock adjustment (admin).
 */
export const bulkAdjust = mutation({
  args: {
    adjustments: v.array(
      v.object({
        productId: v.id("commerce_products"),
        variantId: v.optional(v.id("commerce_product_variants")),
        quantity: v.number(),
      }),
    ),
    adjustmentType: v.union(v.literal("restock"), v.literal("correction")),
    reason: v.string(),
  },
  returns: v.object({
    successful:v.number(),
    failed:v.array(inventoryAdjustmentResultValidator),
    results:v.array(inventoryAdjustmentResultValidator),
  }),
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await requireCan(ctx, "manage_options");

    const results: Array<{
      productId: any;
      variantId?: any;
      success: boolean;
      error?: string;
      previousStock?: number;
      newStock?: number;
    }> = [];

    for (const adj of args.adjustments) {
      try {
        const target = await readStockTarget(ctx, adj.productId, adj.variantId, {allowParent:true});
        const previousStock = target.stockQuantity;
        const newStock = previousStock + adj.quantity;

        if (newStock < 0) {
          results.push({
            productId: adj.productId,
            variantId: adj.variantId,
            success: false,
            error: "Would result in negative stock",
          });
          continue;
        }

        await patchDynamicWithMediaReferences(ctx, target.patchId, {
          stockQuantity: newStock,
          updatedAt: Date.now(),
        });

        await ctx.db.insert("commerce_inventory_adjustments", {
          productId: adj.productId,
          variantId: target.inventoryVariantId,
          adjustmentType: args.adjustmentType,
          quantityDelta: adj.quantity,
          reason: args.reason,
          actorUserId: user._id,
          createdAt: Date.now(),
        });

        results.push({
          productId: adj.productId,
          variantId: adj.variantId,
          success: true,
          previousStock,
          newStock,
        });
      } catch (error: any) {
        results.push({
          productId: adj.productId,
          variantId: adj.variantId,
          success: false,
          error:
            error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      total: results.length,
      successful: results.filter((r: any) => r.success).length,
      failed: results.filter((r: any) => !r.success),
      results,
    };
  },
});

/**
 * Acknowledge a low stock alert (admin).
 */
export const acknowledgeAlert = mutation({
  args: {
    alertId: v.id("commerce_low_stock_alerts"),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await requireCan(ctx, "manage_options");

    const alert = await ctx.db.get(args.alertId);
    if (!alert) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Alert not found.",
      });
    }

    await ctx.db.patch("commerce_low_stock_alerts", args.alertId, {
      status: "acknowledged",
      acknowledgedBy: user._id,
      acknowledgedAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================
// INTERNAL MUTATIONS
// ============================================

/**
 * Reserve stock for checkout (ATOMIC - no race conditions).
 * Called internally by the checkout system.
 */
export const reserve = internalMutation({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    locationId: v.optional(v.id("commerce_ship_from_locations")),
    quantity: v.number(),
    checkoutSessionId: v.id("commerce_checkout_sessions"),
  },
  returns: v.union(
    v.object({success:v.literal(true),reserved:v.number(),skipped:v.literal(true)}),
    v.object({success:v.literal(true),reserved:v.number(),reservationId:v.id("commerce_stock_reservations")}),
  ),
  handler: async (ctx, args) => {
    const target = await resolveInventoryTarget(ctx, args.productId, args.variantId);
    const product = target.product;
    const locationLevel = args.locationId
      ? await findInventoryLevel(ctx, {
          productId: args.productId,
          variantId: target.inventoryVariantId,
          locationId: args.locationId,
        })
      : null;

    if (args.locationId && !locationLevel) throw new ConvexError({code:"INVENTORY_TARGET_MISSING",message:"The selected inventory location is unavailable."});
    if (!Number.isSafeInteger(args.quantity) || args.quantity <= 0) throw new ConvexError({code:"VALIDATION_ERROR",message:"Quantity must be a positive whole number."});
    if (!target.policy.tracked && target.policy.stockStatus === "outofstock") throw new ConvexError({code:"INSUFFICIENT_STOCK",message:"This item is out of stock."});
    // Tracked backorders still reserve and deduct stock; untracked items do not.
    if (!target.policy.tracked) {
      return { success: true, reserved: 0, skipped: true };
    }

    const stockQuantity = locationLevel
      ? Number(locationLevel.stockQuantity ?? 0) -
        Number(locationLevel.safetyStockQuantity ?? 0)
      : target.stockQuantity;
    const reservedCount = args.locationId
      ? await getReservedCountAtLocation(ctx, {
          productId: args.productId,
          variantId: target.inventoryVariantId,
          locationId: args.locationId,
        })
      : target.reservedCount;
    const available = stockQuantity - reservedCount;

    if (available < args.quantity && !target.policy.allowBackorders) {
      throw new ConvexError({
        code: "INSUFFICIENT_STOCK",
        message: `Insufficient stock. Only ${available} available.`,
      });
    }

    const now = Date.now();

    // Create reservation record
    const reservationId = await ctx.db.insert("commerce_stock_reservations", {
      productId: args.productId,
      variantId: target.inventoryVariantId,
      locationId: args.locationId,
      checkoutSessionId: args.checkoutSessionId,
      quantity: args.quantity,
      allowBackorders: target.policy.allowBackorders,
      expiresAt: now + 15 * 60 * 1000, // 15 minutes
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Log adjustment
    await ctx.db.insert("commerce_inventory_adjustments", {
      productId: args.productId,
      variantId: target.inventoryVariantId,
      locationId: args.locationId,
      adjustmentType: "reservation",
      quantityDelta: -args.quantity,
      reason: "Stock reserved for checkout",
      createdAt: now,
    });

    return { success: true, reservationId, reserved: args.quantity };
  },
});

/**
 * Release reserved stock.
 * Called internally by the checkout system.
 */
export const release = internalMutation({
  args: {
    reservationId: v.optional(v.id("commerce_stock_reservations")),
    checkoutSessionId: v.optional(v.id("commerce_checkout_sessions")),
    reason: v.optional(v.string()),
  },
  returns: v.union(
    v.object({success:v.literal(true), released:v.number()}),
    v.object({success:v.literal(false), reason:v.string()}),
  ),
  handler: async (ctx, args) => {
    const reservations = args.reservationId
      ? [await ctx.db.get(args.reservationId)].filter(Boolean)
      : args.checkoutSessionId ? await readCheckoutReservations(ctx, args.checkoutSessionId) : [];
    if (args.checkoutSessionId && reservations.some(row => row.checkoutSessionId !== args.checkoutSessionId)) {
      throw new ConvexError({code:"VALIDATION_ERROR", message:"Reservation does not belong to this checkout."});
    }
    const active = reservations.filter(row => row.status === "active");
    if (!active.length) return {success:false, reason:"No active reservation found"};

    const now = Date.now();
    let released = 0;
    for (const reservation of active) {
      // Releasing a hold changes no physical stock. Keep it possible after the
      // product/variant is removed or its inventory ownership mode changes.
      await ctx.db.patch("commerce_stock_reservations", reservation._id, {status:"released", updatedAt:now});
      await ctx.db.insert("commerce_inventory_adjustments", {
        productId:reservation.productId,
        variantId:reservation.variantId,
        locationId:reservation.locationId,
        adjustmentType:"release",
        quantityDelta:reservation.quantity,
        reason:args.reason ?? "Reservation released",
        createdAt:now,
      });
      released += reservation.quantity;
    }
    return {success:true, released};
  },
});

/**
 * Commit reserved stock (order placed successfully).
 * Called internally by the checkout system.
 * Deducts from actual stockQuantity and marks reservation as converted.
 */
export const commit = internalMutation({
  args: {
    checkoutSessionId: v.id("commerce_checkout_sessions"),
    orderId: v.id("commerce_orders"),
  },
  returns: v.object({success:v.literal(true),committed:v.number()}),
  handler: async (ctx, args) => {
    const now = Date.now();
    const plan = await prepareReservationCommit(ctx,args.checkoutSessionId,args.orderId,now);
    if (plan.alreadyCommitted) return {success:true,committed:0};
    const committed: any[] = [];
    for (const {reservation,target,locationLevel,nextStock:newStock} of plan.entries) {

      if (locationLevel) {
        await patchDynamicWithMediaReferences(ctx, locationLevel._id, {
          stockQuantity: newStock,
          updatedAt: now,
        });
      } else {
        await patchDynamicWithMediaReferences(ctx, target.patchId, {
          stockQuantity: newStock,
          updatedAt: now,
        });
      }

      // Mark reservation as converted
      await ctx.db.patch("commerce_stock_reservations", reservation._id, {
        status: "converted",
        updatedAt: now,
      });

      // Log adjustment
      await ctx.db.insert("commerce_inventory_adjustments", {
        productId: reservation.productId,
        variantId: reservation.variantId,
        locationId: reservation.locationId,
        adjustmentType: "sale",
        quantityDelta: -reservation.quantity,
        orderId: args.orderId,
        reason: "Stock committed for order",
        createdAt: now,
      });

      committed.push(reservation.productId);

      // Check for low stock / out of stock alerts
      const threshold = DEFAULT_LOW_STOCK_THRESHOLD;
      if (
        newStock === 0 &&
        !reservation.allowBackorders
      ) {
        await createAlert(
          ctx,
          reservation.productId,
          newStock,
          threshold,
          "out_of_stock",
        );
      } else if (
        newStock <= threshold &&
        newStock > 0
      ) {
        await createAlert(
          ctx,
          reservation.productId,
          newStock,
          threshold,
          "low_stock",
        );
      }
    }

    await ctx.db.patch("commerce_orders",args.orderId,{inventoryCommittedAt:now,inventoryPolicyVersion:1});
    return { success: true, committed: committed.length };
  },
});

/**
 * Release expired reservations (scheduled job).
 * Should be called periodically via a cron job.
 */
export const releaseExpiredReservations = internalMutation({
  args: {},
  returns: v.object({released:v.number()}),
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db.query("commerce_stock_reservations")
      .withIndex("by_status_expiry", q => q.eq("status", "active").lte("expiresAt", now))
      .take(101);
    for (const reservation of expired.slice(0,100)) {
      await ctx.db.patch("commerce_stock_reservations", reservation._id, {status:"expired", updatedAt:now});
      await ctx.db.insert("commerce_inventory_adjustments", {
        productId:reservation.productId,
        variantId:reservation.variantId,
        locationId:reservation.locationId,
        adjustmentType:"release",
        quantityDelta:reservation.quantity,
        reason:"Reservation expired",
        createdAt:now,
      });
    }
    if (expired.length > 100) {
      await ctx.scheduler.runAfter(0, internal.commerce.inventory.releaseExpiredReservations, {});
    }
    return {released:Math.min(expired.length,100)};
  },
});
