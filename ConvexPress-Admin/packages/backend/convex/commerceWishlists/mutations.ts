// @ts-nocheck
/**
 * Commerce Wishlists — Mutations
 *
 * Ported from VexCart wishlists.ts mutations, adapted to ConvexPress
 * schema (commerce_wishlist* tables) and auth patterns.
 *
 * Functions:
 *   Customer:
 *   - createWishlist       Create a new wishlist
 *   - updateWishlist       Update wishlist name/description/visibility
 *   - deleteWishlist       Delete a wishlist and its items
 *   - addItem              Add product to wishlist (auto-creates default if needed)
 *   - removeItem           Remove item from wishlist
 *   - moveToCart            Move wishlist item into cart and remove from wishlist
 *   - toggleShare          Toggle public/private and regenerate share token
 *   - mergeGuestWishlist   Merge guest product IDs into account wishlist on sign-in
 */

import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceWishlistsEnabled } from "./helpers";
import { requirePluginEnabled } from "../helpers/plugins";

// ============================================
// HELPER: Generate share token
// ============================================

function generateShareToken(): string {
  const now = Date.now();
  return `wl_${now}_${Math.random().toString(36).substring(2, 15)}`;
}

// ============================================
// CUSTOMER MUTATIONS
// ============================================

/**
 * Create a new wishlist
 */
export const createWishlist = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceWishlists");
    await requireCommerceWishlistsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "auth_required",
        message: "Authentication required.",
      });
    }

    const now = Date.now();

    return await ctx.db.insert("commerce_wishlists", {
      userId: user._id,
      name: args.name,
      description: args.description,
      isDefault: false,
      isPublic: args.isPublic ?? false,
      shareToken: generateShareToken(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a wishlist
 */
export const updateWishlist = mutation({
  args: {
    wishlistId: v.id("commerce_wishlists"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceWishlists");
    await requireCommerceWishlistsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "auth_required",
        message: "Authentication required.",
      });
    }

    const wishlist = await ctx.db.get(args.wishlistId);
    if (!wishlist) {
      throw new ConvexError({
        code: "not_found",
        message: "Wishlist not found.",
      });
    }

    // Verify ownership
    if (wishlist.userId !== user._id) {
      throw new ConvexError({
        code: "unauthorized",
        message: "You do not own this wishlist.",
      });
    }

    const updates: any = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.isPublic !== undefined) updates.isPublic = args.isPublic;

    await ctx.db.patch(args.wishlistId, updates);
    return args.wishlistId;
  },
});

/**
 * Delete a wishlist and all its items
 */
export const deleteWishlist = mutation({
  args: { wishlistId: v.id("commerce_wishlists") },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceWishlists");
    await requireCommerceWishlistsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "auth_required",
        message: "Authentication required.",
      });
    }

    const wishlist = await ctx.db.get(args.wishlistId);
    if (!wishlist) {
      throw new ConvexError({
        code: "not_found",
        message: "Wishlist not found.",
      });
    }

    // Verify ownership
    if (wishlist.userId !== user._id) {
      throw new ConvexError({
        code: "unauthorized",
        message: "You do not own this wishlist.",
      });
    }

    // Delete all items first
    const items = await ctx.db
      .query("commerce_wishlist_items")
      .withIndex("by_wishlist", (q: any) =>
        q.eq("wishlistId", args.wishlistId),
      )
      .collect();

    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    // Delete wishlist
    await ctx.db.delete(args.wishlistId);
    return args.wishlistId;
  },
});

/**
 * Add item to wishlist (auto-creates default wishlist if none specified / none exists)
 */
export const addItem = mutation({
  args: {
    wishlistId: v.optional(v.id("commerce_wishlists")),
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceWishlists");
    await requireCommerceWishlistsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "auth_required",
        message: "Authentication required.",
      });
    }

    // Verify product exists
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new ConvexError({
        code: "not_found",
        message: "Product not found.",
      });
    }

    let wishlistId = args.wishlistId;

    // If no wishlist specified, use or create default wishlist
    if (!wishlistId) {
      const existingWishlists = await ctx.db
        .query("commerce_wishlists")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect();

      const firstExisting = existingWishlists[0];
      if (firstExisting) {
        wishlistId = firstExisting._id;
      } else {
        // Create default wishlist
        const now = Date.now();
        wishlistId = await ctx.db.insert("commerce_wishlists", {
          userId: user._id,
          name: "My Wishlist",
          isDefault: true,
          isPublic: false,
          shareToken: generateShareToken(),
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Check if already in wishlist
    const existing = await ctx.db
      .query("commerce_wishlist_items")
      .withIndex("by_wishlist", (q: any) =>
        q.eq("wishlistId", wishlistId!),
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

    if (existing) {
      return existing._id; // Already exists
    }

    const now = Date.now();

    return await ctx.db.insert("commerce_wishlist_items", {
      wishlistId: wishlistId!,
      productId: args.productId,
      variantId: args.variantId,
      notes: args.notes,
      addedAt: now,
    });
  },
});

/**
 * Remove item from wishlist
 */
export const removeItem = mutation({
  args: { itemId: v.id("commerce_wishlist_items") },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceWishlists");
    await requireCommerceWishlistsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "auth_required",
        message: "Authentication required.",
      });
    }

    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new ConvexError({
        code: "not_found",
        message: "Item not found.",
      });
    }

    // Verify ownership via wishlist
    const wishlist = await ctx.db.get(item.wishlistId);
    if (!wishlist) {
      throw new ConvexError({
        code: "not_found",
        message: "Wishlist not found.",
      });
    }

    if (wishlist.userId !== user._id) {
      throw new ConvexError({
        code: "unauthorized",
        message: "You do not own this wishlist.",
      });
    }

    await ctx.db.delete(args.itemId);
    return args.itemId;
  },
});

/**
 * Move wishlist item to cart, then remove from wishlist
 */
export const moveToCart = mutation({
  args: {
    itemId: v.id("commerce_wishlist_items"),
    sessionToken: v.string(),
    quantity: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceWishlists");
    await requireCommerceWishlistsEnabled(ctx);

    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new ConvexError({
        code: "not_found",
        message: "Item not found.",
      });
    }

    const product = await ctx.db.get(item.productId);
    if (!product || product.status !== "publish") {
      throw new ConvexError({
        code: "product_unavailable",
        message: "Product is not available.",
      });
    }

    // Get or create cart
    let cart = await ctx.db
      .query("commerce_carts")
      .withIndex("by_session", (q: any) =>
        q.eq("sessionToken", args.sessionToken),
      )
      .unique();

    const user = await getCurrentUser(ctx);
    const now = Date.now();

    if (!cart) {
      const cartId = await ctx.db.insert("commerce_carts", {
        sessionToken: args.sessionToken,
        userId: user?._id,
        status: "active",
        currencyCode: product.basePrice?.currencyCode || "USD",
        subtotalAmount: 0,
        discountAmount: 0,
        shippingAmount: 0,
        taxAmount: 0,
        totalAmount: 0,
        itemCount: 0,
        lastActiveAt: now,
        createdAt: now,
        updatedAt: now,
      });
      cart = await ctx.db.get(cartId);
    }

    // Resolve unit price
    const variant = item.variantId
      ? await ctx.db.get(item.variantId)
      : null;
    let unitPriceAmount = product.basePrice?.amount || 0;
    if (variant?.price?.amount) {
      unitPriceAmount = variant.price.amount;
    } else if (product.salePrice?.amount) {
      unitPriceAmount = product.salePrice.amount;
    }

    const quantity = args.quantity || 1;

    // Add to cart
    await ctx.db.insert("commerce_cart_items", {
      cartId: cart._id,
      productId: item.productId,
      variantId: item.variantId,
      quantity,
      unitPriceAmount,
      lineTotalAmount: unitPriceAmount * quantity,
      createdAt: now,
      updatedAt: now,
    });

    // Remove from wishlist
    await ctx.db.delete(args.itemId);

    return { success: true };
  },
});

/**
 * Toggle share status and regenerate token if making public
 */
export const toggleShare = mutation({
  args: { wishlistId: v.id("commerce_wishlists") },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceWishlists");
    await requireCommerceWishlistsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "auth_required",
        message: "Authentication required.",
      });
    }

    const wishlist = await ctx.db.get(args.wishlistId);
    if (!wishlist) {
      throw new ConvexError({
        code: "not_found",
        message: "Wishlist not found.",
      });
    }

    if (wishlist.userId !== user._id) {
      throw new ConvexError({
        code: "unauthorized",
        message: "You do not own this wishlist.",
      });
    }

    const now = Date.now();
    const newIsPublic = !wishlist.isPublic;

    // Generate new token if making public
    const shareToken = newIsPublic
      ? generateShareToken()
      : wishlist.shareToken;

    await ctx.db.patch(args.wishlistId, {
      isPublic: newIsPublic,
      shareToken,
      updatedAt: now,
    });

    return { isPublic: newIsPublic, shareToken };
  },
});

/**
 * Merge guest wishlist product IDs into authenticated user's wishlist
 */
export const mergeGuestWishlist = mutation({
  args: {
    guestProductIds: v.array(v.id("commerce_products")),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceWishlists");
    await requireCommerceWishlistsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "auth_required",
        message: "Authentication required.",
      });
    }

    // Get or create default wishlist
    const wishlists = await ctx.db
      .query("commerce_wishlists")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    let wishlistId;
    const now = Date.now();

    const firstWishlist = wishlists[0];
    if (firstWishlist) {
      wishlistId = firstWishlist._id;
    } else {
      wishlistId = await ctx.db.insert("commerce_wishlists", {
        userId: user._id,
        name: "My Wishlist",
        isDefault: true,
        isPublic: false,
        shareToken: generateShareToken(),
        createdAt: now,
        updatedAt: now,
      });
    }

    // Add each guest product (deduplicate)
    let mergedCount = 0;
    for (const productId of args.guestProductIds) {
      const product = await ctx.db.get(productId);
      if (!product) continue;

      // Check if already exists
      const existing = await ctx.db
        .query("commerce_wishlist_items")
        .withIndex("by_wishlist", (q: any) =>
          q.eq("wishlistId", wishlistId),
        )
        .filter((q: any) => q.eq(q.field("productId"), productId))
        .first();

      if (!existing) {
        await ctx.db.insert("commerce_wishlist_items", {
          wishlistId,
          productId,
          addedAt: now,
        });
        mergedCount++;
      }
    }

    return { merged: mergedCount };
  },
});
