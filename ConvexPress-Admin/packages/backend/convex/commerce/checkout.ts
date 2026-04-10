import { ConvexError } from "convex/values";

import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import {
  getCommerceSettings,
  getEnabledPaymentMethods,
  getEnabledShippingMethods,
  requireCommerceEnabled,
} from "./helpers";
import { calculateTaxFromRules } from "./tax";
import {
  completeCheckoutArgs,
  createCheckoutSessionArgs,
  getCheckoutSessionArgs,
  updateCheckoutSessionArgs,
} from "./validators";

async function getCartBySession(ctx: any, sessionToken: string) {
  return ctx.db
    .query("commerce_carts")
    .withIndex("by_session", (q: any) => q.eq("sessionToken", sessionToken))
    .unique();
}

async function getCheckoutBySession(ctx: any, sessionToken: string) {
  return ctx.db
    .query("commerce_checkout_sessions")
    .withIndex("by_session", (q: any) => q.eq("sessionToken", sessionToken))
    .unique();
}

async function computeTaxForAddress(
  ctx: any,
  address: { countryCode: string; state?: string; postalCode?: string },
  taxableAmount: number,
) {
  const rules = await ctx.db
    .query("commerce_tax_rules")
    .withIndex("by_active", (q: any) => q.eq("isActive", true))
    .collect();

  return calculateTaxFromRules(rules, address, taxableAmount);
}

async function getCheckoutQuotes(ctx: any, checkoutSessionId: any) {
  return ctx.db
    .query("commerce_shipping_rate_quotes")
    .withIndex("by_checkout", (q: any) => q.eq("checkoutSessionId", checkoutSessionId))
    .collect();
}

async function getCartItemsWithProducts(ctx: any, cartId: any) {
  const items = await ctx.db
    .query("commerce_cart_items")
    .withIndex("by_cart", (q: any) => q.eq("cartId", cartId))
    .collect();

  const enrichedItems = await Promise.all(
    items.map(async (item: any) => ({
      ...item,
      product: await ctx.db.get(item.productId),
    })),
  );

  return enrichedItems;
}

async function upsertCustomerProfile(
  ctx: any,
  args: {
    userId?: any;
    email: string;
    phone?: string;
    currencyCode: string;
    totalAmount: number;
  },
) {
  let profile = args.userId
    ? await ctx.db
        .query("commerce_customer_profiles")
        .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
        .unique()
    : await ctx.db
        .query("commerce_customer_profiles")
        .withIndex("by_email", (q: any) => q.eq("email", args.email))
        .unique();

  const now = Date.now();

  if (profile) {
    await ctx.db.patch(profile._id, {
      email: args.email,
      phone: args.phone,
      totalOrders: profile.totalOrders + 1,
      totalSpentAmount: profile.totalSpentAmount + args.totalAmount,
      currencyCode: args.currencyCode,
      updatedAt: now,
    });
    return profile._id;
  }

  return ctx.db.insert("commerce_customer_profiles", {
    userId: args.userId,
    email: args.email,
    phone: args.phone,
    totalOrders: 1,
    totalSpentAmount: args.totalAmount,
    currencyCode: args.currencyCode,
    createdAt: now,
    updatedAt: now,
  });
}

function buildTrackingToken() {
  return `trk_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export const getSession = query({
  args: getCheckoutSessionArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const session = await getCheckoutBySession(ctx, args.sessionToken);
    if (!session) return null;
    return session;
  },
});

export const createSession = mutation({
  args: createCheckoutSessionArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    const cart = await getCartBySession(ctx, args.sessionToken);

    if (!cart) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Cart not found.",
      });
    }

    const existing = await getCheckoutBySession(ctx, args.sessionToken);
    if (existing) return existing._id;

    const now = Date.now();
    return ctx.db.insert("commerce_checkout_sessions", {
      cartId: cart._id,
      userId: user?._id,
      sessionToken: args.sessionToken,
      status: "draft",
      currencyCode: cart.currencyCode,
      email: args.email,
      appliedDiscountCode: cart.appliedDiscountCode,
      appliedDiscountDescription: cart.appliedDiscountDescription,
      subtotalAmount: cart.subtotalAmount,
      discountAmount: cart.discountAmount,
      shippingAmount: cart.shippingAmount,
      taxAmount: cart.taxAmount,
      totalAmount: cart.totalAmount,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateSession = mutation({
  args: updateCheckoutSessionArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const session = await getCheckoutBySession(ctx, args.sessionToken);
    const settings = await getCommerceSettings(ctx);

    if (!session) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Checkout session not found.",
      });
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.email !== undefined) patch.email = args.email;
    if (args.shippingAddress !== undefined) patch.shippingAddress = args.shippingAddress;
    if (args.billingAddress !== undefined) patch.billingAddress = args.billingAddress;
    if (args.selectedShippingMethodCode !== undefined) {
      const shippingQuotes = await getCheckoutQuotes(ctx, session._id);
      const selectedQuote = shippingQuotes.find(
        (quote: any) => quote.quoteKey === args.selectedShippingMethodCode,
      );

      if (selectedQuote) {
        patch.selectedShippingMethodCode = selectedQuote.quoteKey;
        patch.selectedShippingMethodLabel =
          `${selectedQuote.carrierName} ${selectedQuote.serviceName}`.trim();
        patch.shippingAmount = selectedQuote.amount;
      } else {
        const shippingMethods = getEnabledShippingMethods(settings);
        const selectedShippingMethod = shippingMethods.find(
          (method) => method.code === args.selectedShippingMethodCode,
        );

        if (!selectedShippingMethod) {
          throw new ConvexError({
            code: "VALIDATION_ERROR",
            message: "Selected shipping method is not available.",
          });
        }

        patch.selectedShippingMethodCode = selectedShippingMethod.code;
        patch.selectedShippingMethodLabel = selectedShippingMethod.label;
      }
    }
    if (args.selectedPaymentMethodCode !== undefined) {
      const paymentMethods = getEnabledPaymentMethods(settings);
      const selectedPaymentMethod = paymentMethods.find(
        (method) => method.code === args.selectedPaymentMethodCode,
      );

      if (!selectedPaymentMethod) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Selected payment method is not available.",
        });
      }

      patch.selectedPaymentMethodCode = selectedPaymentMethod.code;
      patch.selectedPaymentMethodLabel = selectedPaymentMethod.label;
    }
    if (args.notes !== undefined) patch.notes = args.notes;

    const cartItems = await getCartItemsWithProducts(ctx, session.cartId);
    const requiresShipping =
      settings.shippingEnabled &&
      cartItems.some((item: any) => item.product && item.product.isVirtual !== true);
    const hasShippingAddress =
      !requiresShipping || Boolean(args.shippingAddress ?? session.shippingAddress);
    const hasShippingMethod =
      !requiresShipping ||
      Boolean(patch.selectedShippingMethodCode ?? session.selectedShippingMethodCode);
    const hasPayment = Boolean(
      patch.selectedPaymentMethodCode ?? session.selectedPaymentMethodCode,
    );

    patch.status = hasShippingAddress && hasShippingMethod && hasPayment
      ? "ready_for_review"
      : hasShippingAddress && hasShippingMethod
        ? "collecting_payment"
        : "collecting_shipping";

    const nextShippingAmount = Number(
      patch.shippingAmount ?? session.shippingAmount ?? 0,
    );

    // Calculate tax from shipping/billing address
    const taxAddress = (args.shippingAddress ?? session.shippingAddress ??
      args.billingAddress ?? session.billingAddress) as
      | { countryCode: string; state?: string; postalCode?: string }
      | undefined;
    const taxableAmount = Math.max(
      0,
      Number(session.subtotalAmount ?? 0) - Number(session.discountAmount ?? 0),
    );

    let nextTaxAmount = Number(session.taxAmount ?? 0);
    if (taxAddress) {
      const taxResult = await computeTaxForAddress(ctx, taxAddress, taxableAmount);
      nextTaxAmount = taxResult.taxAmount;
    }
    patch.taxAmount = nextTaxAmount;

    patch.totalAmount = taxableAmount + nextShippingAmount + nextTaxAmount;

    await ctx.db.patch(session._id, patch);
    await ctx.db.patch(session.cartId, {
      shippingAmount: nextShippingAmount,
      taxAmount: nextTaxAmount,
      totalAmount: taxableAmount + nextShippingAmount + nextTaxAmount,
      updatedAt: Date.now(),
      lastActiveAt: Date.now(),
    });
    return session._id;
  },
});

export const complete = mutation({
  args: completeCheckoutArgs,
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const session = await getCheckoutBySession(ctx, args.sessionToken);
    const cart = await getCartBySession(ctx, args.sessionToken);
    const settings = await getCommerceSettings(ctx);

    if (!session || !cart) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Checkout session not found.",
      });
    }

    if (!session.email || !session.billingAddress) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Email and billing address are required.",
      });
    }

    const items = await getCartItemsWithProducts(ctx, cart._id);

    if (items.length === 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cart is empty.",
      });
    }

    const requiresShipping =
      settings.shippingEnabled &&
      items.some((item: any) => item.product && item.product.isVirtual !== true);
    const paymentMethods = getEnabledPaymentMethods(settings);
    const selectedPaymentMethod = paymentMethods.find(
      (method) => method.code === session.selectedPaymentMethodCode,
    );

    if (!selectedPaymentMethod) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "A valid payment method is required before completing checkout.",
      });
    }

    let selectedShippingMethod:
      | {
          code: string;
          label: string;
        }
      | undefined;
    let selectedShippingQuote: any | undefined;

    if (requiresShipping) {
      if (!session.shippingAddress) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "A shipping address is required for shippable items.",
        });
      }

      const shippingQuotes = await getCheckoutQuotes(ctx, session._id);
      const selectedQuote = shippingQuotes.find(
        (quote: any) => quote.quoteKey === session.selectedShippingMethodCode,
      );

      if (selectedQuote) {
        selectedShippingQuote = selectedQuote;
        selectedShippingMethod = {
          code: selectedQuote.quoteKey,
          label: `${selectedQuote.carrierName} ${selectedQuote.serviceName}`.trim(),
        };
      } else {
        const shippingMethods = getEnabledShippingMethods(settings);
        selectedShippingMethod = shippingMethods.find(
          (method) => method.code === session.selectedShippingMethodCode,
        );
      }

      if (!selectedShippingMethod) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "A valid shipping method is required for this order.",
        });
      }
    }

    // Recalculate tax at completion time for accuracy
    const completionTaxAddress = (session.shippingAddress ?? session.billingAddress) as
      | { countryCode: string; state?: string; postalCode?: string }
      | undefined;
    const completionTaxableAmount = Math.max(
      0,
      Number(cart.subtotalAmount ?? 0) - Number(cart.discountAmount ?? 0),
    );
    let finalTaxAmount = Number(cart.taxAmount ?? 0);
    if (completionTaxAddress) {
      const taxResult = await computeTaxForAddress(
        ctx,
        completionTaxAddress,
        completionTaxableAmount,
      );
      finalTaxAmount = taxResult.taxAmount;
    }
    const finalTotalAmount =
      completionTaxableAmount +
      Number(cart.shippingAmount ?? 0) +
      finalTaxAmount;

    const now = Date.now();
    const orderNumber = `CP-${new Date(now).getFullYear()}-${String(now).slice(-6)}`;
    const customerId = await upsertCustomerProfile(ctx, {
      userId: session.userId,
      email: session.email,
      phone: session.billingAddress.phone ?? session.shippingAddress?.phone,
      currencyCode: session.currencyCode,
      totalAmount: finalTotalAmount,
    });

    const orderId = await ctx.db.insert("commerce_orders", {
      orderNumber,
      trackingToken: buildTrackingToken(),
      customerId,
      userId: session.userId,
      checkoutSessionId: session._id,
      status: "pending",
      currencyCode: session.currencyCode,
      email: session.email,
      billingAddress: session.billingAddress,
      shippingAddress: session.shippingAddress,
      shippingProvider: selectedShippingQuote?.provider,
      shippingCarrierCode: selectedShippingQuote?.carrierCode,
      shippingCarrierName: selectedShippingQuote?.carrierName,
      shippingServiceCode: selectedShippingQuote?.serviceCode,
      shippingServiceName: selectedShippingQuote?.serviceName,
      shippingQuoteRaw: selectedShippingQuote?.rawQuote,
      selectedShippingMethodCode: selectedShippingMethod?.code,
      selectedShippingMethodLabel: selectedShippingMethod?.label,
      selectedPaymentMethodCode: selectedPaymentMethod.code,
      selectedPaymentMethodLabel: selectedPaymentMethod.label,
      appliedDiscountCode: cart.appliedDiscountCode,
      appliedDiscountDescription: cart.appliedDiscountDescription,
      subtotalAmount: cart.subtotalAmount,
      discountAmount: cart.discountAmount,
      shippingAmount: cart.shippingAmount,
      taxAmount: finalTaxAmount,
      totalAmount: finalTotalAmount,
      paymentStatus: "pending",
      fulfillmentStatus: "unfulfilled",
      notes: session.notes,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of items) {
      await ctx.db.insert("commerce_order_items", {
        orderId,
        productId: item.productId,
        variantId: item.variantId,
        productTitle: item.product?.title ?? "Product",
        sku: item.product?.sku,
        quantity: item.quantity,
        unitPriceAmount: item.unitPriceAmount,
        lineSubtotalAmount: item.lineTotalAmount,
        lineTotalAmount: item.lineTotalAmount,
        createdAt: now,
      });
    }

    await ctx.db.insert("commerce_order_history", {
      orderId,
      eventType: "order_created",
      message: "Order created from checkout session.",
      actorUserId: session.userId,
      metadata: {
        selectedShippingMethodCode: selectedShippingMethod?.code,
        selectedShippingMethodLabel: selectedShippingMethod?.label,
        selectedPaymentMethodCode: selectedPaymentMethod.code,
        selectedPaymentMethodLabel: selectedPaymentMethod.label,
      },
      createdAt: now,
    });

    await ctx.db.patch(session._id, {
      status: "completed",
      appliedDiscountCode: cart.appliedDiscountCode,
      appliedDiscountDescription: cart.appliedDiscountDescription,
      subtotalAmount: cart.subtotalAmount,
      discountAmount: cart.discountAmount,
      shippingAmount: cart.shippingAmount,
      taxAmount: finalTaxAmount,
      totalAmount: finalTotalAmount,
      completedAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(cart._id, {
      status: "converted",
      updatedAt: now,
      lastActiveAt: now,
    });

    if (cart.appliedDiscountCode) {
      const discount = await ctx.db
        .query("commerce_discount_codes")
        .withIndex("by_code", (q: any) => q.eq("code", cart.appliedDiscountCode))
        .unique();
      if (discount) {
        await ctx.db.patch(discount._id, {
          usageCount: discount.usageCount + 1,
          updatedAt: now,
        });
      }
    }

    return orderId;
  },
});
