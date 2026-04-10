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

/**
 * Compute the total reserved quantity for a product from active reservations.
 * ConvexPress doesn't store reservedCount on the product row; we derive it.
 */
async function getReservedCount(ctx: any, productId: any): Promise<number> {
  const reservations = await ctx.db
    .query("commerce_stock_reservations")
    .withIndex("by_product_status", (q: any) =>
      q.eq("productId", productId).eq("status", "active"),
    )
    .collect();

  return reservations.reduce((sum: number, r: any) => sum + r.quantity, 0);
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

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Product not found.",
      });
    }

    const stockQuantity =
      typeof product.stockQuantity === "number" ? product.stockQuantity : 0;
    const reservedCount = await getReservedCount(ctx, args.productId);
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
        const product = await ctx.db.get(item.productId);
        if (!product) {
          return { ...item, canFulfill: false, reason: "Product not found" };
        }

        if (!product.trackInventory) {
          return {
            ...item,
            canFulfill: true,
            reason: "Not tracking inventory",
          };
        }

        const stockQuantity =
          typeof product.stockQuantity === "number"
            ? product.stockQuantity
            : 0;
        const reservedCount = await getReservedCount(ctx, item.productId);
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

    const products = await ctx.db
      .query("commerce_products")
      .withIndex("by_status", (q: any) => q.eq("status", "publish"))
      .collect();

    const lowStock = products.filter((p: any) => {
      const stock =
        typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
      return (
        p.trackInventory &&
        stock > 0 &&
        stock <= DEFAULT_LOW_STOCK_THRESHOLD
      );
    });

    return lowStock
      .sort(
        (a: any, b: any) =>
          (typeof a.stockQuantity === "number" ? a.stockQuantity : 0) -
          (typeof b.stockQuantity === "number" ? b.stockQuantity : 0),
      )
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

    const products = await ctx.db
      .query("commerce_products")
      .withIndex("by_status", (q: any) => q.eq("status", "publish"))
      .collect();

    return products
      .filter((p: any) => {
        const stock =
          typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
        return p.trackInventory && stock === 0 && !p.allowBackorders;
      })
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

    const products = await ctx.db
      .query("commerce_products")
      .withIndex("by_status", (q: any) => q.eq("status", "publish"))
      .collect();

    const tracked = products.filter((p: any) => p.trackInventory);
    const lowStock = tracked.filter((p: any) => {
      const stock =
        typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
      return stock > 0 && stock <= DEFAULT_LOW_STOCK_THRESHOLD;
    });
    const outOfStock = tracked.filter((p: any) => {
      const stock =
        typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
      return stock === 0 && !p.allowBackorders;
    });

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
    const totalValue = tracked.reduce((sum: number, p: any) => {
      const stock =
        typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
      const price =
        typeof p.basePrice?.amount === "number" ? p.basePrice.amount : 0;
      return sum + price * stock;
    }, 0);

    return {
      totalProducts: products.length,
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
        const product = await ctx.db.get(adj.productId);
        const user = adj.actorUserId
          ? await ctx.db.get(adj.actorUserId)
          : null;
        return {
          ...adj,
          productTitle: product?.title ?? "Unknown Product",
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
        const product = await ctx.db.get(res.productId);
        return {
          ...res,
          productTitle: product?.title ?? "Unknown",
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
            typeof product?.stockQuantity === "number"
              ? product.stockQuantity
              : 0,
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

    let products = await ctx.db
      .query("commerce_products")
      .withIndex("by_status", (q: any) => q.eq("status", "publish"))
      .collect();

    // Also include draft products in the inventory view
    const draftProducts = await ctx.db
      .query("commerce_products")
      .withIndex("by_status", (q: any) => q.eq("status", "draft"))
      .collect();
    products = [...products, ...draftProducts];

    // Apply filter
    if (args.filter === "lowStock") {
      products = products.filter((p: any) => {
        const stock =
          typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
        return (
          p.trackInventory &&
          stock > 0 &&
          stock <= DEFAULT_LOW_STOCK_THRESHOLD
        );
      });
    } else if (args.filter === "outOfStock") {
      products = products.filter((p: any) => {
        const stock =
          typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
        return p.trackInventory && stock === 0 && !p.allowBackorders;
      });
    } else if (args.filter === "tracked") {
      products = products.filter((p: any) => p.trackInventory);
    } else if (args.filter === "untracked") {
      products = products.filter((p: any) => !p.trackInventory);
    }

    // Apply search
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      products = products.filter(
        (p: any) =>
          p.title.toLowerCase().includes(searchLower) ||
          (p.sku ?? "").toLowerCase().includes(searchLower),
      );
    }

    // Apply sorting
    const sortBy = args.sortBy ?? "title";
    const sortOrder = args.sortOrder ?? "asc";
    products.sort((a: any, b: any) => {
      let aVal: string | number =
        sortBy === "stockQuantity"
          ? typeof a.stockQuantity === "number"
            ? a.stockQuantity
            : 0
          : a.title;
      let bVal: string | number =
        sortBy === "stockQuantity"
          ? typeof b.stockQuantity === "number"
            ? b.stockQuantity
            : 0
          : b.title;

      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    // Apply limit
    if (args.limit) {
      products = products.slice(0, args.limit);
    }

    // Enrich each product with computed inventory data
    return Promise.all(
      products.map(async (p: any) => {
        const stockQuantity =
          typeof p.stockQuantity === "number" ? p.stockQuantity : 0;
        const reservedCount = await getReservedCount(ctx, p._id);

        return {
          _id: p._id,
          title: p.title,
          slug: p.slug,
          sku: p.sku,
          featuredMediaId: p.featuredMediaId,
          stockQuantity,
          reservedCount,
          availableStock: stockQuantity - reservedCount,
          lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
          trackInventory: p.trackInventory,
          allowBackorders: p.allowBackorders,
          isLowStock:
            p.trackInventory &&
            stockQuantity > 0 &&
            stockQuantity <= DEFAULT_LOW_STOCK_THRESHOLD,
          isOutOfStock:
            p.trackInventory && stockQuantity === 0 && !p.allowBackorders,
        };
      }),
    );
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

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Product not found.",
      });
    }

    const previousStock =
      typeof product.stockQuantity === "number" ? product.stockQuantity : 0;
    const newStock = previousStock + args.quantity;

    if (newStock < 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cannot adjust to negative stock.",
      });
    }

    const wasOutOfStock = previousStock === 0;
    const isNowInStock = newStock > 0;

    await ctx.db.patch(args.productId, {
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
      success: boolean;
      error?: string;
      previousStock?: number;
      newStock?: number;
    }> = [];

    for (const adj of args.adjustments) {
      try {
        const product = await ctx.db.get(adj.productId);
        if (!product) {
          results.push({
            productId: adj.productId,
            success: false,
            error: "Product not found",
          });
          continue;
        }

        const previousStock =
          typeof product.stockQuantity === "number"
            ? product.stockQuantity
            : 0;
        const newStock = previousStock + adj.quantity;

        if (newStock < 0) {
          results.push({
            productId: adj.productId,
            success: false,
            error: "Would result in negative stock",
          });
          continue;
        }

        await ctx.db.patch(adj.productId, {
          stockQuantity: newStock,
          updatedAt: Date.now(),
        });

        await ctx.db.insert("commerce_inventory_adjustments", {
          productId: adj.productId,
          adjustmentType: args.adjustmentType,
          quantityDelta: adj.quantity,
          reason: args.reason,
          actorUserId: user._id,
          createdAt: Date.now(),
        });

        results.push({
          productId: adj.productId,
          success: true,
          previousStock,
          newStock,
        });
      } catch (error: any) {
        results.push({
          productId: adj.productId,
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
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Product not found.",
      });
    }

    // Skip reservation for non-tracked or backorder products
    if (!product.trackInventory || product.allowBackorders) {
      return { success: true, reserved: 0, skipped: true };
    }

    const stockQuantity =
      typeof product.stockQuantity === "number" ? product.stockQuantity : 0;
    const reservedCount = await getReservedCount(ctx, args.productId);
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

    const product = await ctx.db.get(reservation.productId);
    if (!product) {
      return { success: false, reason: "Product not found" };
    }

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
      const product = await ctx.db.get(reservation.productId);
      if (!product) continue;

      const currentStock =
        typeof product.stockQuantity === "number"
          ? product.stockQuantity
          : 0;
      const newStock = currentStock - reservation.quantity;

      // Deduct from stockQuantity
      await ctx.db.patch(reservation.productId, {
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
        product.trackInventory &&
        !product.allowBackorders
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
        product.trackInventory
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
