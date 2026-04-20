// @ts-nocheck
/**
 * Commerce Wishlists — Queries
 *
 * Ported from VexCart wishlists.ts queries, adapted to ConvexPress
 * schema (commerce_wishlist* tables) and auth patterns.
 *
 * Functions:
 *   Customer:
 *   - getMyWishlists      Get current user's wishlists with item counts
 *   - getWishlist          Get a single wishlist with enriched items
 *   - isInWishlist         Check if a product is in any of the user's wishlists
 *
 *   Public:
 *   - getSharedWishlist    Get a public wishlist by share token
 *
 *   Admin:
 *   - getAnalytics         Global wishlist analytics (admin only)
 *   - getPopularItems      Most-wishlisted products (admin only)
 *   - getRecentActivity    Recent wishlist item additions (admin only)
 */

import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceWishlistsEnabled } from "./helpers";
import { isPluginEnabled } from "../helpers/plugins";

// ============================================
// CUSTOMER QUERIES
// ============================================

/**
 * Get user's wishlists with item counts
 */
export const getMyWishlists = query({
  args: {},
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "commerceWishlists"))) return null;
    await requireCommerceWishlistsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const wishlists = await ctx.db
      .query("commerce_wishlists")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    const enriched = await Promise.all(
      wishlists.map(async (wishlist: any) => {
        const items = await ctx.db
          .query("commerce_wishlist_items")
          .withIndex("by_wishlist", (q: any) =>
            q.eq("wishlistId", wishlist._id),
          )
          .collect();

        return {
          ...wishlist,
          itemCount: items.length,
        };
      }),
    );

    return enriched;
  },
});

/**
 * Get a single wishlist with enriched items
 */
export const getWishlist = query({
  args: { wishlistId: v.id("commerce_wishlists") },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "commerceWishlists"))) return null;
    await requireCommerceWishlistsEnabled(ctx);

    const wishlist = await ctx.db.get(args.wishlistId);
    if (!wishlist) return null;

    // Get items
    const items = await ctx.db
      .query("commerce_wishlist_items")
      .withIndex("by_wishlist", (q: any) =>
        q.eq("wishlistId", args.wishlistId),
      )
      .collect();

    // Enrich items with product data
    const enrichedItems = await Promise.all(
      items.map(async (item: any) => {
        const product = await ctx.db.get(item.productId);
        const variant = item.variantId
          ? await ctx.db.get(item.variantId)
          : null;

        // Calculate effective price
        let effectivePrice = product?.basePrice?.amount || 0;
        if (variant?.price?.amount) {
          effectivePrice = variant.price.amount;
        } else if (product?.salePrice?.amount) {
          effectivePrice = product.salePrice.amount;
        }

        return {
          ...item,
          product,
          variant,
          effectivePrice,
          isAvailable:
            product?.status === "publish" &&
            (!product.trackInventory ||
              (product.stockQuantity ?? 0) > 0 ||
              product.allowBackorders),
        };
      }),
    );

    return {
      ...wishlist,
      items: enrichedItems.filter((item: any) => item.product),
    };
  },
});

/**
 * Get shared wishlist (public access, no auth required)
 */
export const getSharedWishlist = query({
  args: { shareToken: v.string() },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "commerceWishlists"))) return null;
    await requireCommerceWishlistsEnabled(ctx);

    const wishlist = await ctx.db
      .query("commerce_wishlists")
      .withIndex("by_share_token", (q: any) =>
        q.eq("shareToken", args.shareToken),
      )
      .unique();

    if (!wishlist || !wishlist.isPublic) {
      return null;
    }

    // Get items
    const items = await ctx.db
      .query("commerce_wishlist_items")
      .withIndex("by_wishlist", (q: any) =>
        q.eq("wishlistId", wishlist._id),
      )
      .collect();

    // Enrich with product data
    const enrichedItems = await Promise.all(
      items.map(async (item: any) => {
        const product = await ctx.db.get(item.productId);
        const variant = item.variantId
          ? await ctx.db.get(item.variantId)
          : null;

        let effectivePrice = product?.basePrice?.amount || 0;
        if (variant?.price?.amount) {
          effectivePrice = variant.price.amount;
        } else if (product?.salePrice?.amount) {
          effectivePrice = product.salePrice.amount;
        }

        return {
          ...item,
          product,
          variant,
          effectivePrice,
        };
      }),
    );

    // Get owner info (limited — no private data)
    const owner = await ctx.db.get(wishlist.userId);

    return {
      ...wishlist,
      items: enrichedItems.filter((item: any) => item.product),
      ownerName: owner?.displayName || owner?.firstName || "Someone",
    };
  },
});

/**
 * Check if product is in any of the user's wishlists
 */
export const isInWishlist = query({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "commerceWishlists"))) return { inWishlist: false };
    await requireCommerceWishlistsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      return { inWishlist: false };
    }

    // Get user's wishlists
    const wishlists = await ctx.db
      .query("commerce_wishlists")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    // Check each wishlist for the product
    for (const wishlist of wishlists) {
      const item = await ctx.db
        .query("commerce_wishlist_items")
        .withIndex("by_wishlist", (q: any) =>
          q.eq("wishlistId", wishlist._id),
        )
        .filter((q: any) =>
          args.variantId
            ? q.and(
                q.eq(q.field("productId"), args.productId),
                q.eq(q.field("variantId"), args.variantId),
              )
            : q.eq(q.field("productId"), args.productId),
        )
        .first();

      if (item) {
        return {
          inWishlist: true,
          wishlistId: wishlist._id,
          itemId: item._id,
        };
      }
    }

    return { inWishlist: false };
  },
});

// ============================================
// ADMIN ANALYTICS QUERIES
// ============================================

/**
 * Get wishlist analytics (admin only)
 */
export const getAnalytics = query({
  args: {},
  handler: async (ctx: any) => {
    if (!(await isPluginEnabled(ctx, "commerceWishlists"))) return null;
    await requireCommerceWishlistsEnabled(ctx);
    await requireCan(ctx, "commerce.wishlists.manage");

    // Get all wishlists
    const wishlists = await ctx.db
      .query("commerce_wishlists")
      .collect();

    // Get all wishlist items
    const items = await ctx.db
      .query("commerce_wishlist_items")
      .collect();

    // Calculate stats
    const totalWishlists = wishlists.length;
    const totalItems = items.length;
    const publicWishlists = wishlists.filter((w: any) => w.isPublic).length;

    // Get unique users with wishlists
    const uniqueUsers = new Set(wishlists.map((w: any) => w.userId)).size;

    // Calculate average items per wishlist
    const avgItemsPerWishlist =
      totalWishlists > 0
        ? Math.round((totalItems / totalWishlists) * 10) / 10
        : 0;

    // Items added in last 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentItems = items.filter(
      (i: any) => i.addedAt > sevenDaysAgo,
    ).length;

    // Items added in last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const monthlyItems = items.filter(
      (i: any) => i.addedAt > thirtyDaysAgo,
    ).length;

    return {
      totalWishlists,
      totalItems,
      publicWishlists,
      uniqueUsers,
      avgItemsPerWishlist,
      recentItems,
      monthlyItems,
    };
  },
});

/**
 * Get popular wishlist items (admin only)
 */
export const getPopularItems = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "commerceWishlists"))) return null;
    await requireCommerceWishlistsEnabled(ctx);
    await requireCan(ctx, "commerce.wishlists.manage");

    const limit = args.limit ?? 10;

    // Get all wishlist items
    const items = await ctx.db.query("commerce_wishlist_items").collect();

    // Group by productId and count
    const productCounts = new Map<string, number>();
    for (const item of items) {
      const key = item.productId;
      productCounts.set(key, (productCounts.get(key) || 0) + 1);
    }

    // Sort by count and take top N
    const sortedProducts = Array.from(productCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    // Fetch product details
    const popularItems = await Promise.all(
      sortedProducts.map(async ([productId, count]) => {
        const product = await ctx.db.get(productId as any);
        if (!product) return null;

        // Get product image
        let imageUrl: string | undefined;
        if (product.featuredMediaId) {
          const media = await ctx.db.get(product.featuredMediaId);
          imageUrl = media?.url;
        }

        return {
          productId,
          name: product.title,
          slug: product.slug,
          imageUrl,
          wishlistCount: count,
          status: product.status,
        };
      }),
    );

    return popularItems.filter(Boolean);
  },
});

/**
 * Get recent wishlist activity (admin only)
 */
export const getRecentActivity = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "commerceWishlists"))) return null;
    await requireCommerceWishlistsEnabled(ctx);
    await requireCan(ctx, "commerce.wishlists.manage");

    const limit = args.limit ?? 20;

    // Get recent wishlist items
    const items = await ctx.db.query("commerce_wishlist_items").collect();

    // Sort by addedAt descending and take limit
    const recentItems = items
      .sort((a: any, b: any) => b.addedAt - a.addedAt)
      .slice(0, limit);

    // Enrich with product and user info
    const enriched = await Promise.all(
      recentItems.map(async (item: any) => {
        const product = await ctx.db.get(item.productId);
        const wishlist = await ctx.db.get(item.wishlistId);
        const wishlistUser = wishlist
          ? await ctx.db.get(wishlist.userId)
          : null;

        return {
          _id: item._id,
          addedAt: item.addedAt,
          productName: product?.title || "Unknown Product",
          productSlug: product?.slug,
          userName:
            wishlistUser?.displayName ||
            `${wishlistUser?.firstName || ""} ${wishlistUser?.lastName || ""}`.trim() ||
            "Unknown User",
        };
      }),
    );

    return enriched;
  },
});
