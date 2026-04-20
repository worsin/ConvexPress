// @ts-nocheck
// ============================================
// INVENTORY SYSTEM - Stock tracking, reservations, alerts
// Ported from VexCart inventory.ts, adapted to ConvexPress patterns
// ============================================

import { ConvexError, v } from "convex/values";

import { mutation, query, internalMutation } from "../_generated/server";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";

// Default low stock threshold when none is configured per-product.
// ConvexPress products don't carry a per-product threshold field yet,
// so we use a sensible default and allow callers to pass one.
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

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
async function getReservedCount(
  ctx: any,
  productId: any,
  variantId?: any,
): Promise<number> {
  const reservations = await ctx.db
    .query("commerce_stock_reservations")
    .withIndex("by_product_status", (q: any) =>
      q.eq("productId", productId).eq("status", "active"),
    )
    .collect();

  return reservations
    .filter((reservation: any) =>
      variantId
        ? reservation.variantId?.toString() === variantId.toString()
        : !reservation.variantId,
    )
    .reduce((sum: number, reservation: any) => sum + reservation.quantity, 0);
}

async function resolveInventoryTarget(
  ctx: any,
  productId: any,
  variantId?: any,
) {
  const product = await ctx.db.get(productId);
  if (!product) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Product not found.",
    });
  }

  if (product.productType === "variable") {
    if (!variantId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Variable product "${product.title}" requires a variant selection.`,
      });
    }

    const variant = await ctx.db.get(variantId);
    if (!variant || variant.productId !== productId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Variant does not belong to "${product.title}".`,
      });
    }

    // When manageStock === "parent", inventory is tracked at the product level
    if (variant.manageStock === "parent") {
      return {
        product,
        variant,
        patchId: product._id,
        stockQuantity:
          typeof product.stockQuantity === "number" ? product.stockQuantity : 0,
        reservedCount: await getReservedCount(ctx, productId),
        label: `${product.title} - ${variant.title}`,
      };
    }

    return {
      product,
      variant,
      patchId: variant._id,
      stockQuantity:
        typeof variant.stockQuantity === "number" ? variant.stockQuantity : 0,
      reservedCount: await getReservedCount(ctx, productId, variantId),
      label: `${product.title} - ${variant.title}`,
    };
  }

  return {
    product,
    variant: null,
    patchId: product._id,
    stockQuantity:
      typeof product.stockQuantity === "number" ? product.stockQuantity : 0,
    reservedCount: await getReservedCount(ctx, productId),
    label: product.title,
  };
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
    await ctx.db.patch(existingAlert._id, {
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
  if (product.productType === "variable") {
    const variants = await ctx.db
      .query("commerce_product_variants")
      .withIndex("by_product", (q: any) => q.eq("productId", product._id))
      .collect();

    return Promise.all(
      variants.map(async (variant: any) => {
        const stockQuantity =
          typeof variant.stockQuantity === "number" ? variant.stockQuantity : 0;
        const reservedCount = await getReservedCount(ctx, product._id, variant._id);
        return {
          entryId: `${product._id.toString()}:${variant._id.toString()}`,
          productId: product._id,
          variantId: variant._id,
          title: `${product.title} - ${variant.title}`,
          productTitle: product.title,
          variantTitle: variant.title,
          slug: product.slug,
          sku: variant.sku ?? product.sku,
          featuredMediaId: product.featuredMediaId,
          productType: product.productType,
          trackInventory: product.trackInventory,
          allowBackorders: product.allowBackorders,
          stockQuantity,
          reservedCount,
          availableStock: stockQuantity - reservedCount,
          lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
          isLowStock:
            product.trackInventory &&
            stockQuantity > 0 &&
            stockQuantity <= DEFAULT_LOW_STOCK_THRESHOLD,
          isOutOfStock:
            product.trackInventory && stockQuantity === 0 && !product.allowBackorders,
          valueAmount: getMoneyAmount(variant.salePrice ?? variant.price) * stockQuantity,
        };
      }),
    );
  }

  const stockQuantity =
    typeof product.stockQuantity === "number" ? product.stockQuantity : 0;
  const reservedCount = await getReservedCount(ctx, product._id);
  return [
    {
      entryId: product._id.toString(),
      productId: product._id,
      variantId: undefined,
      title: product.title,
      productTitle: product.title,
      variantTitle: undefined,
      slug: product.slug,
      sku: product.sku,
      featuredMediaId: product.featuredMediaId,
      productType: product.productType,
      trackInventory: product.trackInventory,
      allowBackorders: product.allowBackorders,
      stockQuantity,
      reservedCount,
      availableStock: stockQuantity - reservedCount,
      lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
      isLowStock:
        product.trackInventory &&
        stockQuantity > 0 &&
        stockQuantity <= DEFAULT_LOW_STOCK_THRESHOLD,
      isOutOfStock:
        product.trackInventory && stockQuantity === 0 && !product.allowBackorders,
      valueAmount: getMoneyAmount(product.basePrice) * stockQuantity,
    },
  ];
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
        product.trackInventory &&
        stockQuantity > 0 &&
        stockQuantity <= threshold,
      isOutOfStock:
        product.trackInventory &&
        stockQuantity === 0 &&
        !product.allowBackorders,
      trackInventory: product.trackInventory,
      allowBackorders: product.allowBackorders,
    };
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
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);

    const results = await Promise.all(
      args.items.map(async (item: any) => {
        try {
          const target = await resolveInventoryTarget(ctx, item.productId, item.variantId);
          const { product, stockQuantity, reservedCount } = target;

          if (!product.trackInventory) {
            return {
              ...item,
              canFulfill: true,
              reason: "Not tracking inventory",
            };
          }

          const available = stockQuantity - reservedCount;

          if (available >= item.quantity) {
            return { ...item, canFulfill: true, available };
          }

          if (product.allowBackorders) {
            return {
              ...item,
              canFulfill: true,
              reason: "Backorder",
              backordered: item.quantity - Math.max(0, available),
            };
          }

          return {
            ...item,
            canFulfill: false,
            reason: "Insufficient stock",
            available,
          };
        } catch (error: any) {
          return {
            ...item,
            canFulfill: false,
            reason: error?.message ?? "Inventory target not found",
          };
        }
      }),
    );

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
    adjustmentType: v.union(
      v.literal("restock"),
      v.literal("damage"),
      v.literal("correction"),
      v.literal("return"),
    ),
    quantity: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await requireCan(ctx, "manage_options");
    const target = await resolveInventoryTarget(ctx, args.productId, args.variantId);
    const previousStock = target.stockQuantity;
    const newStock = previousStock + args.quantity;

    if (newStock < 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cannot adjust to negative stock.",
      });
    }

    const wasOutOfStock = previousStock === 0;
    const isNowInStock = newStock > 0;

    await ctx.db.patch(target.patchId, {
      stockQuantity: newStock,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("commerce_inventory_adjustments", {
      productId: args.productId,
      variantId: args.variantId,
      adjustmentType: args.adjustmentType,
      quantityDelta: args.quantity,
      reason: args.reason,
      actorUserId: user._id,
      createdAt: Date.now(),
    });

    // Resolve any low stock alerts if stock is now healthy
    if (newStock > DEFAULT_LOW_STOCK_THRESHOLD) {
      const activeAlerts = await ctx.db
        .query("commerce_low_stock_alerts")
        .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
        .filter((q: any) => q.eq(q.field("status"), "active"))
        .collect();

      for (const alert of activeAlerts) {
        await ctx.db.patch(alert._id, { status: "resolved" });
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
        const target = await resolveInventoryTarget(ctx, adj.productId, adj.variantId);
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

        await ctx.db.patch(target.patchId, {
          stockQuantity: newStock,
          updatedAt: Date.now(),
        });

        await ctx.db.insert("commerce_inventory_adjustments", {
          productId: adj.productId,
          variantId: adj.variantId,
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

    await ctx.db.patch(args.alertId, {
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
    quantity: v.number(),
    checkoutSessionId: v.id("commerce_checkout_sessions"),
  },
  handler: async (ctx, args) => {
    const target = await resolveInventoryTarget(ctx, args.productId, args.variantId);
    const product = target.product;

    // Skip reservation for non-tracked or backorder products
    if (!product.trackInventory || product.allowBackorders) {
      return { success: true, reserved: 0, skipped: true };
    }

    const stockQuantity = target.stockQuantity;
    const reservedCount = target.reservedCount;
    const available = stockQuantity - reservedCount;

    if (available < args.quantity) {
      throw new ConvexError({
        code: "INSUFFICIENT_STOCK",
        message: `Insufficient stock. Only ${available} available.`,
      });
    }

    const now = Date.now();

    // Create reservation record
    const reservationId = await ctx.db.insert("commerce_stock_reservations", {
      productId: args.productId,
      variantId: args.variantId,
      checkoutSessionId: args.checkoutSessionId,
      quantity: args.quantity,
      expiresAt: now + 15 * 60 * 1000, // 15 minutes
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Log adjustment
    await ctx.db.insert("commerce_inventory_adjustments", {
      productId: args.productId,
      variantId: args.variantId,
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
  handler: async (ctx, args) => {
    let reservation: any = null;

    if (args.reservationId) {
      reservation = await ctx.db.get(args.reservationId);
    } else if (args.checkoutSessionId) {
      reservation = await ctx.db
        .query("commerce_stock_reservations")
        .withIndex("by_checkout", (q: any) =>
          q.eq("checkoutSessionId", args.checkoutSessionId),
        )
        .filter((q: any) => q.eq(q.field("status"), "active"))
        .first();
    }

    if (!reservation || reservation.status !== "active") {
      return { success: false, reason: "No active reservation found" };
    }

    await resolveInventoryTarget(ctx, reservation.productId, reservation.variantId);

    const now = Date.now();

    // Update reservation status
    await ctx.db.patch(reservation._id, {
      status: "released",
      updatedAt: now,
    });

    // Log adjustment
    await ctx.db.insert("commerce_inventory_adjustments", {
      productId: reservation.productId,
      variantId: reservation.variantId,
      adjustmentType: "release",
      quantityDelta: reservation.quantity,
      reason: args.reason ?? "Reservation released",
      createdAt: now,
    });

    return { success: true, released: reservation.quantity };
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
  handler: async (ctx, args) => {
    const reservations = await ctx.db
      .query("commerce_stock_reservations")
      .withIndex("by_checkout", (q: any) =>
        q.eq("checkoutSessionId", args.checkoutSessionId),
      )
      .filter((q: any) => q.eq(q.field("status"), "active"))
      .collect();

    const committed: any[] = [];
    const now = Date.now();

    for (const reservation of reservations) {
      const target = await resolveInventoryTarget(
        ctx,
        reservation.productId,
        reservation.variantId,
      );
      const newStock = target.stockQuantity - reservation.quantity;

      // Deduct from stockQuantity
      await ctx.db.patch(target.patchId, {
        stockQuantity: newStock,
        updatedAt: now,
      });

      // Mark reservation as converted
      await ctx.db.patch(reservation._id, {
        status: "converted",
        updatedAt: now,
      });

      // Log adjustment
      await ctx.db.insert("commerce_inventory_adjustments", {
        productId: reservation.productId,
        variantId: reservation.variantId,
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
        target.product.trackInventory &&
        !target.product.allowBackorders
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
        newStock > 0 &&
        target.product.trackInventory
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

    return { success: true, committed: committed.length };
  },
});

/**
 * Release expired reservations (scheduled job).
 * Should be called periodically via a cron job.
 */
export const releaseExpiredReservations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("commerce_stock_reservations")
      .filter((q: any) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.lt(q.field("expiresAt"), now),
        ),
      )
      .take(100);

    let released = 0;

    for (const reservation of expired) {
      const product = await ctx.db.get(reservation.productId);
      if (!product) {
        // Product deleted, just mark as expired
        await ctx.db.patch(reservation._id, {
          status: "expired",
          updatedAt: now,
        });
        released++;
        continue;
      }

      // Mark as expired
      await ctx.db.patch(reservation._id, {
        status: "expired",
        updatedAt: now,
      });

      // Log adjustment
      await ctx.db.insert("commerce_inventory_adjustments", {
        productId: reservation.productId,
        variantId: reservation.variantId,
        adjustmentType: "release",
        quantityDelta: reservation.quantity,
        reason: "Reservation expired",
        createdAt: now,
      });

      released++;
    }

    return { released };
  },
});
