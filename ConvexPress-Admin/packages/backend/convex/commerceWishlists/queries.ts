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
import {ownerWidgetArgs,ownerWidgetValidator,readOwnerWidget,type OwnerWidgetArgs,type OwnerWidgetSnapshot} from "./ownerQueries";
import { paginationOptsValidator, type RegisteredQuery } from "convex/server";
import { lookupSavedProduct, type WishlistLookupArgs, type WishlistLookupPage } from "./lookup";
import { readRecentWishlistActivity, type RecentWishlistItem } from "./recentActivity";
import { readWishlistItems } from "./publicItems";
import { wishlistDetailValidator, sharedWishlistValidator, type WishlistDetail, type SharedWishlist } from "./validators";

import { query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { requireCommerceWishlistsEnabled, getActiveWishlistUser as getCurrentUser } from "./helpers";
import { isPluginEnabled } from "../helpers/plugins";

// ============================================
// CUSTOMER QUERIES
// ============================================

/**
 * Get user's wishlists with item counts
 */
export const getMyWishlists:RegisteredQuery<"public",OwnerWidgetArgs,Promise<OwnerWidgetSnapshot|null>>=query({
 args:ownerWidgetArgs,returns:ownerWidgetValidator,handler:readOwnerWidget,
});

/**
 * Get a single wishlist with enriched items
 */
export const getWishlist = query({
  args: { wishlistId: v.id("commerce_wishlists") },
  returns: wishlistDetailValidator,
  handler: async (ctx, args): Promise<WishlistDetail | null> => {
    if (!(await isPluginEnabled(ctx, "commerceWishlists"))) return null;
    await requireCommerceWishlistsEnabled(ctx);
    const user=await getCurrentUser(ctx);if(!user)return null;
    const wishlist=await ctx.db.get(args.wishlistId);
    if(!wishlist||wishlist.userId!==user._id)return null;
    return {_id:wishlist._id,name:wishlist.name,isPublic:wishlist.isPublic,isDefault:wishlist.isDefault,shareToken:wishlist.shareToken,createdAt:wishlist.createdAt,updatedAt:wishlist.updatedAt,items:await readWishlistItems(ctx,wishlist._id)};
  },
});

/**
 * Get shared wishlist (public access, no auth required)
 */
export const getSharedWishlist = query({
  args: { shareToken:v.string() },
  returns: sharedWishlistValidator,
  handler: async(ctx,args): Promise<SharedWishlist | null> => {
    if(!(await isPluginEnabled(ctx,"commerceWishlists")))return null;
    await requireCommerceWishlistsEnabled(ctx);
    if(!args.shareToken||args.shareToken.length>256)return null;
    const wishlist=await ctx.db.query("commerce_wishlists").withIndex("by_share_token",q=>q.eq("shareToken",args.shareToken)).unique();
    if(!wishlist?.isPublic)return null;
    const owner=await ctx.db.get(wishlist.userId);if(owner?.status!=="active")return null;
    const items=(await readWishlistItems(ctx,wishlist._id)).filter(item=>item.product!==null);
    return {_id:wishlist._id,name:wishlist.name,ownerName:owner.displayName||owner.firstName||"Someone",items};
  },
});

/**
 * Check if product is in any of the user's wishlists
 */
export const isInWishlist: RegisteredQuery<"public", WishlistLookupArgs, Promise<WishlistLookupPage>> = query({
  args: { instanceKey:v.string(), productId:v.id("commerce_products"), variantId:v.optional(v.id("commerce_product_variants")), paginationOpts:paginationOptsValidator },
  returns: v.object({
    page:v.array(v.union(v.object({state:v.literal("unavailable")}),v.object({state:v.literal("saved"),wishlistId:v.id("commerce_wishlists"),itemId:v.id("commerce_wishlist_items")}))),
    isDone:v.boolean(),continueCursor:v.string(),
    splitCursor:v.optional(v.union(v.string(),v.null())),
    pageStatus:v.optional(v.union(v.literal("SplitRecommended"),v.literal("SplitRequired"),v.null())),
  }),
  handler:lookupSavedProduct,
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
  args: { limit: v.optional(v.number()) },
  returns: v.union(v.null(), v.array(v.object({
    _id: v.id("commerce_wishlist_items"), addedAt: v.number(), productName: v.string(),
    productSlug: v.optional(v.string()), userName: v.string(),
  }))),
  handler: async (ctx, args): Promise<RecentWishlistItem[] | null> => readRecentWishlistActivity(ctx, args),
});
