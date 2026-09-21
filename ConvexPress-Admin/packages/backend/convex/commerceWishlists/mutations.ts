// @ts-nocheck
import { insertCountedWishlist, insertCountedWishlistItem } from "./counts";
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
import { mergeGuestProducts } from "./guestMerge";
import { beginWishlistDeletion } from "./deletion";

import { makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";

import { requireCommerceWishlistsEnabled, getActiveWishlistUser as getCurrentUser, requireSaveableWishlistProduct } from "./helpers";
import { requirePluginEnabled } from "../helpers/plugins";
import { emitEvent } from "../helpers/events";
import { SYSTEM, WISHLIST_EVENTS } from "../events/constants";
import { patchDynamicWithMediaReferences, deleteDynamicWithMediaReferences } from "../media/attachmentGuard";


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

    return await insertCountedWishlist(ctx, {
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

    await patchDynamicWithMediaReferences(ctx, args.wishlistId, updates);
    return args.wishlistId;
  },
});

/**
 * Delete a wishlist and all its items
 */
export const deleteWishlist = mutation({
  args: { wishlistId: v.id("commerce_wishlists") },
  returns: v.id("commerce_wishlists"),
  handler: beginWishlistDeletion,
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

    // Authorize a supplied list before even disclosing an existing item ID.
    if (args.wishlistId) {
      const wishlist = await ctx.db.get(args.wishlistId);
      if (!wishlist || wishlist.userId !== user._id) throw new ConvexError({code:"unauthorized",message:"You do not own this wishlist."});
    }
    await requireSaveableWishlistProduct(ctx, args.productId, args.variantId);

    let wishlistId = args.wishlistId;

    // If no wishlist specified, use or create default wishlist
    if (!wishlistId) {
      const firstExisting = await ctx.db
        .query("commerce_wishlists")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .first();
      if (firstExisting) {
        wishlistId = firstExisting._id;
      } else {
        // Create default wishlist
        const now = Date.now();
        wishlistId = await insertCountedWishlist(ctx, {
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

    // One indexed product/variant identity, including the no-choice state.
    const existing = await ctx.db.query("commerce_wishlist_items")
      .withIndex("by_wishlist_product_variant", (q: any) => q.eq("wishlistId", wishlistId!)
        .eq("productId", args.productId).eq("variantId", args.variantId))
      .first();

    if (existing) {
      return existing._id; // Already exists
    }

    const now = Date.now();

    const itemId = await insertCountedWishlistItem(ctx, {
      wishlistId: wishlistId!,
      productId: args.productId,
      variantId: args.variantId,
      notes: args.notes,
      addedAt: now,
    });

    await emitEvent(ctx, WISHLIST_EVENTS.ITEM_ADDED, SYSTEM.WISHLIST, {
      wishlistId,
      itemId,
      productId: args.productId,
      variantId: args.variantId,
    });

    return itemId;
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

    await deleteDynamicWithMediaReferences(ctx, args.itemId);
    await emitEvent(ctx, WISHLIST_EVENTS.ITEM_REMOVED, SYSTEM.WISHLIST, {
      wishlistId: item.wishlistId,
      itemId: args.itemId,
      productId: item.productId,
      variantId: item.variantId,
    });
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

    const user = await getCurrentUser(ctx);
    if (!user) throw new ConvexError({ code: "auth_required", message: "Authentication required." });
    const wishlist = await ctx.db.get(item.wishlistId);
    if (!wishlist || wishlist.userId !== user._id) {
      throw new ConvexError({ code: "forbidden", message: "You do not own this wishlist." });
    }

    const product = await requireSaveableWishlistProduct(ctx, item.productId, item.variantId);
    if (product.productType === "variable" && !item.variantId) {
      throw new ConvexError({ code: "product_options_required", message: "Choose a product option before adding it to the basket." });
    }

    const quantity = args.quantity ?? 1;
    const cartId = await ctx.runMutation(
      makeFunctionReference<"mutation", { sessionToken: string; productId: Id<"commerce_products">; variantId?: Id<"commerce_product_variants">; quantity: number }, Id<"commerce_carts">>("commerce/cart:addItem"),
      { sessionToken: args.sessionToken, productId: item.productId, variantId: item.variantId, quantity },
    );
    const cartLines = await ctx.db.query("commerce_cart_items")
      .withIndex("by_cart_product", (q) => q.eq("cartId", cartId).eq("productId", item.productId))
      .collect();
    const cartItemId = cartLines.find((line) =>
      (line.variantId ?? null) === (item.variantId ?? null) && (line.metadata?.lineType ?? "product") === "product"
    )?._id;
    // Only remove the saved item after the normal add mutation succeeds.
    await deleteDynamicWithMediaReferences(ctx, args.itemId);
    await emitEvent(ctx, WISHLIST_EVENTS.MOVED_TO_CART, SYSTEM.WISHLIST, {
      wishlistId: item.wishlistId,
      itemId: args.itemId,
      cartId,
      cartItemId,
      productId: item.productId,
      variantId: item.variantId,
      quantity,
    });

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

    await patchDynamicWithMediaReferences(ctx, args.wishlistId, {
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
  args: { guestProductIds: v.array(v.id("commerce_products")) },
  returns: v.object({ merged: v.number() }),
  handler: async (ctx, args): Promise<{ merged: number }> =>
    mergeGuestProducts(ctx, args, generateShareToken),
});
