import { ConvexError } from "convex/values";

import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { getCommerceSettings, requireCommerceEnabled } from "./helpers";
import { calculateTaxFromRules } from "./tax";
import {
  addCartItemArgs,
  applyCartDiscountCodeArgs,
  clearCartArgs,
  getCartArgs,
  removeCartDiscountCodeArgs,
  removeCartItemArgs,
  updateCartItemArgs,
} from "./validators";

async function findCartBySession(ctx: any, sessionToken: string) {
  return ctx.db
    .query("commerce_carts")
    .withIndex("by_session", (q: any) => q.eq("sessionToken", sessionToken))
    .unique();
}

async function findDiscountByCode(ctx: any, code: string) {
  return ctx.db
    .query("commerce_discount_codes")
    .withIndex("by_code", (q: any) => q.eq("code", code))
    .unique();
}

function computeDiscountAmount(discount: any, items: any[], subtotalAmount: number) {
  if (!discount || subtotalAmount <= 0) return 0;

  if (discount.discountType === "percent") {
    return Math.min(
      subtotalAmount,
      Math.max(0, Math.round((subtotalAmount * discount.amount) / 100)),
    );
  }

  if (discount.discountType === "fixed_product") {
    return Math.min(
      subtotalAmount,
      items.reduce(
        (sum: number, item: any) =>
          sum + Math.min(item.lineTotalAmount, item.quantity * discount.amount),
        0,
      ),
    );
  }

  return Math.min(subtotalAmount, Math.max(0, discount.amount));
}

async function resolveActiveDiscount(ctx: any, code?: string) {
  const normalizedCode = code?.trim().toUpperCase();
  if (!normalizedCode) return null;

  const discount = await findDiscountByCode(ctx, normalizedCode);
  if (!discount || discount.status !== "active") return null;

  const now = Date.now();
  if (discount.startsAt && discount.startsAt > now) return null;
  if (discount.endsAt && discount.endsAt < now) return null;
  if (
    typeof discount.usageLimit === "number" &&
    discount.usageCount >= discount.usageLimit
  ) {
    return null;
  }

  return discount;
}

async function recalculateCart(ctx: any, cartId: any) {
  const cart = await ctx.db.get(cartId);
  if (!cart) return;

  const items = await ctx.db
    .query("commerce_cart_items")
    .withIndex("by_cart", (q: any) => q.eq("cartId", cartId))
    .collect();

  const subtotalAmount = items.reduce(
    (sum: number, item: any) => sum + item.lineTotalAmount,
    0,
  );
  const discount = await resolveActiveDiscount(ctx, cart.appliedDiscountCode);
  const discountAmount = discount
    ? computeDiscountAmount(discount, items, subtotalAmount)
    : 0;

  // Tax calculation requires a shipping address which the cart does not store.
  // Tax is computed at checkout when the address is provided (see checkout.ts).
  // If the cart ever gains an address field, calculate here using:
  //   const rules = await ctx.db.query("commerce_tax_rules")
  //     .withIndex("by_active", (q: any) => q.eq("isActive", true)).collect();
  //   const { taxAmount } = calculateTaxFromRules(rules, address, taxableAmount);
  const taxableAmount = Math.max(0, subtotalAmount - discountAmount);
  const taxAmount = 0;

  await ctx.db.patch(cartId, {
    subtotalAmount,
    appliedDiscountCode: discount?.code,
    appliedDiscountDescription: discount?.description,
    discountAmount,
    shippingAmount: 0,
    taxAmount,
    totalAmount: taxableAmount,
    itemCount: items.reduce((sum: number, item: any) => sum + item.quantity, 0),
    lastActiveAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function ensureCart(ctx: any, sessionToken: string, userId?: any) {
  let cart = await findCartBySession(ctx, sessionToken);
  if (cart) return cart;
  const settings = await getCommerceSettings(ctx);

  const now = Date.now();
  const cartId = await ctx.db.insert("commerce_carts", {
    userId,
    sessionToken,
    status: "active",
    currencyCode: settings.currencyCode || "USD",
    appliedDiscountCode: undefined,
    appliedDiscountDescription: undefined,
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

  return ctx.db.get(cartId);
}

export const getMine = query({
  args: getCartArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    const sessionToken = args.sessionToken?.trim();

    const cart =
      sessionToken
        ? await findCartBySession(ctx, sessionToken)
        : user
          ? await ctx.db
              .query("commerce_carts")
              .withIndex("by_user", (q: any) => q.eq("userId", user._id))
              .unique()
          : null;

    if (!cart) return null;

    const items = await ctx.db
      .query("commerce_cart_items")
      .withIndex("by_cart", (q: any) => q.eq("cartId", cart._id))
      .collect();

    const enrichedItems = await Promise.all(
      items.map(async (item: any) => {
        const product = await ctx.db.get(item.productId);
        const variant = item.variantId ? await ctx.db.get(item.variantId) : null;
        return {
          ...item,
          product,
          variant,
        };
      }),
    );

    return {
      ...cart,
      items: enrichedItems,
    };
  },
});

export const addItem = mutation({
  args: addCartItemArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    const product = await ctx.db.get(args.productId);

    if (!product || product.status !== "publish") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Product not found.",
      });
    }

    const quantity = Math.max(1, args.quantity);
    const cart = await ensureCart(ctx, args.sessionToken, user?._id);

    const existing = (
      await ctx.db
        .query("commerce_cart_items")
        .withIndex("by_cart_product", (q: any) =>
          q.eq("cartId", cart._id).eq("productId", args.productId),
        )
        .collect()
    ).find(
      (item: any) =>
        (item.variantId?.toString() ?? null) ===
        (args.variantId?.toString() ?? null),
    );

    const unitPriceAmount = (product.salePrice ?? product.basePrice).amount;
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        quantity: existing.quantity + quantity,
        unitPriceAmount,
        lineTotalAmount: (existing.quantity + quantity) * unitPriceAmount,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("commerce_cart_items", {
        cartId: cart._id,
        productId: args.productId,
        variantId: args.variantId,
        quantity,
        unitPriceAmount,
        lineTotalAmount: quantity * unitPriceAmount,
        createdAt: now,
        updatedAt: now,
      });
    }

    await recalculateCart(ctx, cart._id);
    return cart._id;
  },
});

export const updateItemQuantity = mutation({
  args: updateCartItemArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const item = await ctx.db.get(args.cartItemId);
    if (!item) return null;

    if (args.quantity <= 0) {
      await ctx.db.delete(args.cartItemId);
      await recalculateCart(ctx, item.cartId);
      return null;
    }

    await ctx.db.patch(args.cartItemId, {
      quantity: args.quantity,
      lineTotalAmount: args.quantity * item.unitPriceAmount,
      updatedAt: Date.now(),
    });
    await recalculateCart(ctx, item.cartId);
    return args.cartItemId;
  },
});

export const removeItem = mutation({
  args: removeCartItemArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const item = await ctx.db.get(args.cartItemId);
    if (!item) return null;

    await ctx.db.delete(args.cartItemId);
    await recalculateCart(ctx, item.cartId);
    return args.cartItemId;
  },
});

export const clear = mutation({
  args: clearCartArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const cart = await findCartBySession(ctx, args.sessionToken);
    if (!cart) return null;

    const items = await ctx.db
      .query("commerce_cart_items")
      .withIndex("by_cart", (q: any) => q.eq("cartId", cart._id))
      .collect();

    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    await recalculateCart(ctx, cart._id);
    return cart._id;
  },
});

export const applyDiscountCode = mutation({
  args: applyCartDiscountCodeArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const cart = await findCartBySession(ctx, args.sessionToken);
    if (!cart) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Cart not found.",
      });
    }

    const discount = await resolveActiveDiscount(ctx, args.code);
    if (!discount) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Discount code is invalid or unavailable.",
      });
    }

    await ctx.db.patch(cart._id, {
      appliedDiscountCode: discount.code,
      appliedDiscountDescription: discount.description,
      updatedAt: Date.now(),
    });
    await recalculateCart(ctx, cart._id);
    return cart._id;
  },
});

export const removeDiscountCode = mutation({
  args: removeCartDiscountCodeArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const cart = await findCartBySession(ctx, args.sessionToken);
    if (!cart) return null;

    await ctx.db.patch(cart._id, {
      appliedDiscountCode: undefined,
      appliedDiscountDescription: undefined,
      updatedAt: Date.now(),
    });
    await recalculateCart(ctx, cart._id);
    return cart._id;
  },
});
