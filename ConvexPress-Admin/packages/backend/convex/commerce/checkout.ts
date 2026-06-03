import { ConvexError } from "convex/values";

import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { emitEvent } from "../helpers/events";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import { CHECKOUT_EVENTS, SYSTEM } from "../events/constants";
import {
  getCommercePaymentsSettings,
  getCommerceSettings,
  getEnabledPaymentMethods,
  getEnabledShippingMethods,
  requireCommerceEnabled,
} from "./helpers";
import { calculateTaxForLinesFromRules } from "./tax";
import {
  buildOrderItemTitle,
  buildOrderItemMetadata,
} from "./orderBundleHelpers";
import {
  computeAddressKey,
  computeCartKey,
  isQuoteUsableForCheckout,
} from "./checkoutShippingGuards";
import {
  completeCheckoutArgs,
  abandonCheckoutSessionArgs,
  createCheckoutSessionArgs,
  getCheckoutSessionArgs,
  listAbandonedCheckoutSessionsArgs,
  updateCheckoutSessionArgs,
} from "./validators";
import {
  resolveBundleAvailability,
  resolveBundleSelectionSnapshot,
} from "../commerceBundles/runtime";

async function getCartBySession(ctx: any, sessionToken: string) {
  return ctx.db
    .query("commerce_carts")
    .withIndex("by_session", (q: any) => q.eq("sessionToken", sessionToken))
    .unique();
}

async function getCheckoutBySession(ctx: any, sessionToken: string) {
  const sessions = await ctx.db
    .query("commerce_checkout_sessions")
    .withIndex("by_session", (q: any) => q.eq("sessionToken", sessionToken))
    .collect();
  return (
    sessions.find((session: any) =>
      ["draft", "collecting_shipping", "collecting_payment", "ready_for_review", "payment_pending"].includes(session.status),
    ) ??
    sessions.find((session: any) => session.status === "abandoned") ??
    sessions[0] ??
    null
  );
}

function checkoutExpiresAt(now = Date.now()) {
  return now + 2 * 60 * 60 * 1000;
}

async function markCheckoutFailed(ctx: any, session: any, message: string) {
  if (!session || session.status === "completed") return;
  const now = Date.now();
  await ctx.db.patch("commerce_checkout_sessions", session._id, {
    status: "failed",
    failedAt: now,
    failureReason: message,
    updatedAt: now,
  });
  await emitEvent(ctx, CHECKOUT_EVENTS.FAILED, SYSTEM.CHECKOUT, {
    checkoutSessionId: session._id,
    cartId: session.cartId,
    userId: session.userId,
    reason: message,
  });
}

async function computeTaxForAddress(
  ctx: any,
  address: { countryCode: string; state?: string; postalCode?: string },
  items: any[],
  discountAmount: number,
  pricesIncludeTax: boolean,
  shippingAmount = 0,
  shippingTaxClass?: string,
) {
  const rules = await ctx.db
    .query("commerce_tax_rules")
    .withIndex("by_active", (q: any) => q.eq("isActive", true))
    .collect();

  const subtotalAmount = items.reduce(
    (sum: number, item: any) => sum + Math.max(0, Number(item.lineTotalAmount ?? 0)),
    0,
  );
  const discountRatio =
    subtotalAmount > 0 ? Math.min(1, Math.max(0, discountAmount / subtotalAmount)) : 0;

  const itemTaxLines = items.map((item: any) => ({
    amount: Math.max(
      0,
      Math.round(Number(item.lineTotalAmount ?? 0) * (1 - discountRatio)),
    ),
    taxClass: item.variant?.taxClass ?? item.product?.taxClass,
    taxable: true,
  }));

  const itemTaxResult = calculateTaxForLinesFromRules(
    rules,
    address,
    itemTaxLines,
    { pricesIncludeTax },
  );

  let shippingTaxResult = {
    taxAmount: 0,
    taxableAmount: 0,
    breakdown: [] as Array<{
      taxClass: string;
      taxableAmount: number;
      taxAmount: number;
      taxRate: number;
      rules: Array<Record<string, unknown>>;
    }>,
  };
  const normalizedShippingTaxClass = shippingTaxClass?.trim();
  if (normalizedShippingTaxClass && shippingAmount > 0) {
    shippingTaxResult = calculateTaxForLinesFromRules(
      rules,
      address,
      [
        {
          amount: Math.max(0, Math.round(shippingAmount)),
          taxClass: normalizedShippingTaxClass,
          taxable: true,
        },
      ],
      { pricesIncludeTax },
    );
  }

  return {
    taxAmount: itemTaxResult.taxAmount + shippingTaxResult.taxAmount,
    taxableAmount: itemTaxResult.taxableAmount + shippingTaxResult.taxableAmount,
    breakdown: [
      ...itemTaxResult.breakdown.map((group) => ({
        ...group,
        source: "item" as const,
      })),
      ...shippingTaxResult.breakdown.map((group) => ({
        ...group,
        source: "shipping" as const,
      })),
    ],
  };
}

async function getActiveCheckoutShippingMethod(ctx: any, checkoutSessionId: any) {
  return ctx.db
    .query("commerce_checkout_shipping_methods")
    .withIndex("by_checkout_status", (q: any) =>
      q.eq("checkoutSessionId", checkoutSessionId).eq("status", "active"),
    )
    .first();
}

async function staleCheckoutShippingMethods(ctx: any, checkoutSessionId: any) {
  const now = Date.now();
  const activeMethods = await ctx.db
    .query("commerce_checkout_shipping_methods")
    .withIndex("by_checkout_status", (q: any) =>
      q.eq("checkoutSessionId", checkoutSessionId).eq("status", "active"),
    )
    .collect();
  for (const method of activeMethods) {
    await ctx.db.patch("commerce_checkout_shipping_methods", method._id, {
      status: "stale",
      invalidatedAt: now,
      updatedAt: now,
    });
  }
}

async function selectCheckoutShippingMethod(
  ctx: any,
  input: {
    session: any;
    cartItems: any[];
    selectedCode: string;
    settings: any;
    shippingAddress?: any;
  },
) {
  const now = Date.now();

  const shippingQuotes = await getCheckoutQuotes(ctx, input.session._id);
  const selectedQuote = shippingQuotes.find(
    (quote: any) => quote.quoteKey === input.selectedCode,
  );

  if (selectedQuote) {
    const currentAddressKey = computeAddressKey(
      input.shippingAddress ?? input.session.shippingAddress,
    );
    const currentCartKey = computeCartKey(input.cartItems);
    if (!isQuoteUsableForCheckout(selectedQuote, currentAddressKey, currentCartKey)) {
      throw new ConvexError({
        code: "STALE_SHIPPING_RATE",
        message: "Shipping rates are stale. Please refresh shipping rates.",
      });
    }

    await staleCheckoutShippingMethods(ctx, input.session._id);
    const label = `${selectedQuote.carrierName} ${selectedQuote.serviceName}`.trim();
    const methodId = await ctx.db.insert("commerce_checkout_shipping_methods", {
      checkoutSessionId: input.session._id,
      cartId: input.session.cartId,
      status: "active",
      source: "live_quote",
      code: selectedQuote.quoteKey,
      label,
      amount: selectedQuote.amount,
      currencyCode: selectedQuote.currency ?? input.session.currencyCode,
      quoteId: selectedQuote._id,
      quoteKey: selectedQuote.quoteKey,
      provider: selectedQuote.provider,
      carrierCode: selectedQuote.carrierCode,
      carrierName: selectedQuote.carrierName,
      serviceCode: selectedQuote.serviceCode,
      serviceName: selectedQuote.serviceName,
      accountId: selectedQuote.accountId,
      packages: selectedQuote.packages,
      origin: selectedQuote.origin,
      rawQuote: selectedQuote.rawQuote,
      addressKey: currentAddressKey,
      cartKey: currentCartKey,
      expiresAt: selectedQuote.expiresAt,
      selectedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return {
      methodId,
      code: selectedQuote.quoteKey,
      label,
      amount: selectedQuote.amount,
      quote: selectedQuote,
    };
  }

  const shippingMethods = getEnabledShippingMethods(input.settings);
  const selectedShippingMethod = shippingMethods.find(
    (method) => method.code === input.selectedCode,
  );

  if (!selectedShippingMethod) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Selected shipping method is not available.",
    });
  }

  await staleCheckoutShippingMethods(ctx, input.session._id);
  const methodId = await ctx.db.insert("commerce_checkout_shipping_methods", {
    checkoutSessionId: input.session._id,
    cartId: input.session.cartId,
    status: "active",
    source: "manual_method",
    code: selectedShippingMethod.code,
    label: selectedShippingMethod.label,
    amount: 0,
    currencyCode: input.session.currencyCode,
    selectedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return {
    methodId,
    code: selectedShippingMethod.code,
    label: selectedShippingMethod.label,
    amount: 0,
    quote: undefined,
  };
}

function resolveTaxAddress(settings: any, session: any, patch: Record<string, unknown>) {
  const basis = settings.taxRateBasis ?? "shipping";
  if (basis === "billing") {
    return (patch.billingAddress ?? session.billingAddress) as
      | { countryCode: string; state?: string; postalCode?: string }
      | undefined;
  }
  if (basis === "store") {
    return {
      countryCode: settings.defaultCountryCode || "US",
      state: settings.defaultState || undefined,
      postalCode: undefined,
    };
  }
  return (patch.shippingAddress ??
    session.shippingAddress ??
    patch.billingAddress ??
    session.billingAddress) as
    | { countryCode: string; state?: string; postalCode?: string }
    | undefined;
}

async function getCheckoutQuotes(ctx: any, checkoutSessionId: any) {
  const now = Date.now();
  const quotes = await ctx.db
    .query("commerce_shipping_rate_quotes")
    .withIndex("by_checkout", (q: any) => q.eq("checkoutSessionId", checkoutSessionId))
    .collect();

  return quotes.filter((quote: any) => Number(quote.expiresAt ?? 0) > now);
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
      variant: item.variantId ? await ctx.db.get(item.variantId) : null,
    })),
  );

  return enrichedItems;
}

function itemAllowsBackorders(item: any) {
  if (!item.variant) return !!item.product?.allowBackorders;
  return item.variant.backorders === "yes" || item.variant.backorders === "notify";
}

function itemInventoryTarget(item: any) {
  if (!item.product?.trackInventory || itemAllowsBackorders(item)) return null;
  const usesVariantStock =
    item.variant && item.variant.manageStock !== "parent";
  return {
    productId: item.product._id,
    variantId: usesVariantStock ? item.variant._id : undefined,
    patchId: usesVariantStock ? item.variant._id : item.product._id,
    stockQuantity: usesVariantStock
      ? (item.variant.stockQuantity ?? 0)
      : (item.product.stockQuantity ?? 0),
  };
}

async function getReservedInventoryCount(
  ctx: any,
  args: {
    productId: any;
    variantId?: any;
    locationId?: any;
  },
) {
  const activeReservations = args.locationId
    ? await ctx.db
        .query("commerce_stock_reservations")
        .withIndex("by_product_location_status", (q: any) =>
          q
            .eq("productId", args.productId)
            .eq("locationId", args.locationId)
            .eq("status", "active"),
        )
        .collect()
    : await ctx.db
        .query("commerce_stock_reservations")
        .withIndex("by_product_status", (q: any) =>
          q.eq("productId", args.productId).eq("status", "active"),
        )
        .collect();

  return activeReservations
    .filter(
      (reservation: any) =>
        (reservation.variantId?.toString() ?? null) ===
        (args.variantId?.toString() ?? null),
    )
    .reduce((sum: number, reservation: any) => sum + reservation.quantity, 0);
}

async function selectInventoryAllocation(ctx: any, target: any, quantity: number) {
  const variantScopedLevels = target.variantId
    ? await ctx.db
        .query("commerce_inventory_levels")
        .withIndex("by_product_variant", (q: any) =>
          q.eq("productId", target.productId).eq("variantId", target.variantId),
        )
        .collect()
    : [];
  const productScopedLevels =
    variantScopedLevels.length > 0
      ? []
      : await ctx.db
          .query("commerce_inventory_levels")
          .withIndex("by_product_variant", (q: any) =>
            q.eq("productId", target.productId).eq("variantId", undefined),
          )
          .collect();
  const levels = [...variantScopedLevels, ...productScopedLevels]
    .filter((level: any) => level.isActive)
    .sort((a: any, b: any) => {
      const aSafety = Number(a.safetyStockQuantity ?? 0);
      const bSafety = Number(b.safetyStockQuantity ?? 0);
      const aAvailable = Number(a.stockQuantity ?? 0) - aSafety;
      const bAvailable = Number(b.stockQuantity ?? 0) - bSafety;
      return bAvailable - aAvailable;
    });

  for (const level of levels) {
    const reservedCount = await getReservedInventoryCount(ctx, {
      productId: target.productId,
      variantId: target.variantId,
      locationId: level.locationId,
    });
    const available =
      Number(level.stockQuantity ?? 0) -
      Number(level.safetyStockQuantity ?? 0) -
      reservedCount;
    if (available >= quantity || level.allowBackorders) {
      return {
        locationId: level.locationId,
        levelId: level._id,
        stockQuantity: Number(level.stockQuantity ?? 0),
        available,
      };
    }
  }

  const reservedCount = await getReservedInventoryCount(ctx, {
    productId: target.productId,
    variantId: target.variantId,
  });
  return {
    locationId: undefined,
    levelId: undefined,
    stockQuantity: Number(target.stockQuantity ?? 0),
    available: Number(target.stockQuantity ?? 0) - reservedCount,
  };
}

async function reserveCheckoutInventory(ctx: any, session: any, items: any[]) {
  const existingReservations = await ctx.db
    .query("commerce_stock_reservations")
    .withIndex("by_checkout", (q: any) => q.eq("checkoutSessionId", session._id))
    .filter((q: any) => q.eq(q.field("status"), "active"))
    .collect();
  if (existingReservations.length > 0) return;

  const now = Date.now();
  for (const item of items) {
    const target = itemInventoryTarget(item);
    if (!target) continue;

    const allocation = await selectInventoryAllocation(ctx, target, item.quantity);
    const available = allocation.available;

    if (available < item.quantity) {
      throw new ConvexError({
        code: "INSUFFICIENT_STOCK",
        message: `Only ${available} available in stock for ${item.product.title}.`,
      });
    }

    await ctx.db.insert("commerce_stock_reservations", {
      checkoutSessionId: session._id,
      productId: target.productId,
      variantId: target.variantId,
      locationId: allocation.locationId,
      quantity: item.quantity,
      status: "active",
      expiresAt: now + 15 * 60 * 1000,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function commitCheckoutInventory(ctx: any, session: any, orderId: any) {
  const reservations = await ctx.db
    .query("commerce_stock_reservations")
    .withIndex("by_checkout", (q: any) => q.eq("checkoutSessionId", session._id))
    .filter((q: any) => q.eq(q.field("status"), "active"))
    .collect();

  const now = Date.now();
  for (const reservation of reservations) {
    const product = await ctx.db.get(reservation.productId);
    const variant = reservation.variantId
      ? await ctx.db.get(reservation.variantId)
      : null;
    const target = variant ?? product;
    if (!target) continue;

    if (reservation.locationId) {
      const levels = await ctx.db
        .query("commerce_inventory_levels")
        .withIndex("by_product_location", (q: any) =>
          q.eq("productId", reservation.productId).eq("locationId", reservation.locationId),
        )
        .collect();
      const level = levels.find(
        (entry: any) =>
          (entry.variantId?.toString() ?? null) ===
          (reservation.variantId?.toString() ?? null),
      );
      if (level) {
        await ctx.db.patch("commerce_inventory_levels", level._id, {
          stockQuantity: Math.max(0, (level.stockQuantity ?? 0) - reservation.quantity),
          updatedAt: now,
        });
      }
    } else {
      await ctx.db.patch(target._id, {
        stockQuantity: Math.max(0, (target.stockQuantity ?? 0) - reservation.quantity),
        updatedAt: now,
      });
    }
    await ctx.db.patch(reservation._id, {
      status: "converted",
      updatedAt: now,
    });
    await ctx.db.insert("commerce_inventory_adjustments", {
      productId: reservation.productId,
      variantId: reservation.variantId,
      locationId: reservation.locationId,
      orderId,
      adjustmentType: "sale",
      quantityDelta: -reservation.quantity,
      reason: "Stock committed for order",
      createdAt: now,
    });
  }
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getSession = query({
  args: getCheckoutSessionArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const session = await getCheckoutBySession(ctx, args.sessionToken);
    if (!session) return null;
    if (
      session.expiresAt &&
      session.expiresAt < Date.now() &&
      !["completed", "failed", "abandoned"].includes(session.status)
    ) {
      return {
        ...session,
        status: "abandoned",
      };
    }
    return session;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createSession = mutation({
  args: createCheckoutSessionArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    const settings = await getCommerceSettings(ctx);
    const cart = await getCartBySession(ctx, args.sessionToken);

    if (!cart) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Cart not found.",
      });
    }

    if (cart.status !== "active") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "This cart can no longer be checked out.",
      });
    }

    if (!user && settings.allowGuestCheckout === false) {
      throw new ConvexError({
        code: "AUTH_REQUIRED",
        message: "Sign in before checking out.",
      });
    }

    const existing = await getCheckoutBySession(ctx, args.sessionToken);
    if (existing && !["completed", "failed", "abandoned"].includes(existing.status)) {
      await ctx.db.patch("commerce_checkout_sessions", existing._id, {
        email: args.email ?? existing.email,
        expiresAt: checkoutExpiresAt(),
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    const now = Date.now();
    const checkoutSessionId = await ctx.db.insert("commerce_checkout_sessions", {
      cartId: cart._id,
      userId: user?._id,
      sessionToken: args.sessionToken,
      status: "draft",
      currencyCode: cart.currencyCode,
      regionId: cart.regionId,
      salesChannelId: cart.salesChannelId,
      customerGroupId: cart.customerGroupId,
      email: args.email,
      appliedDiscountCode: cart.appliedDiscountCode,
      appliedDiscountDescription: cart.appliedDiscountDescription,
      dynamicPricingDiscountAmount: cart.dynamicPricingDiscountAmount,
      dynamicPricingRuleIds: cart.dynamicPricingRuleIds,
      dynamicPricingDescription: cart.dynamicPricingDescription,
      freeShippingByDynamicPricing: cart.freeShippingByDynamicPricing,
      subtotalAmount: cart.subtotalAmount,
      discountAmount: cart.discountAmount,
      shippingAmount: cart.shippingAmount,
      taxAmount: cart.taxAmount,
      totalAmount: cart.totalAmount,
      expiresAt: checkoutExpiresAt(now),
      createdAt: now,
      updatedAt: now,
    });
    await emitEvent(ctx, CHECKOUT_EVENTS.STARTED, SYSTEM.CHECKOUT, {
      checkoutSessionId,
      cartId: cart._id,
      userId: user?._id,
      email: args.email,
    });
    return checkoutSessionId;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateSession = mutation({
  args: updateCheckoutSessionArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const session = await getCheckoutBySession(ctx, args.sessionToken);
    const settings = await getCommerceSettings(ctx);
    const paymentSettings = await getCommercePaymentsSettings(ctx);

    if (!session) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Checkout session not found.",
      });
    }

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
      expiresAt: checkoutExpiresAt(),
    };

    if (args.email !== undefined) patch.email = args.email;
    if (args.shippingAddress !== undefined) patch.shippingAddress = args.shippingAddress;
    if (args.billingAddress !== undefined) patch.billingAddress = args.billingAddress;

    // ── Address-change invalidation ─────────────────────────────────────────
    // When the shipping address changes, existing quotes were priced for the
    // old address and must be discarded so the user cannot check out with a
    // stale rate.
    let quotesInvalidated = false;
    if (args.shippingAddress !== undefined) {
      const oldKey = computeAddressKey(session.shippingAddress);
      const newKey = computeAddressKey(args.shippingAddress);
      if (oldKey !== newKey) {
        quotesInvalidated = true;
        const staleQuotes = await ctx.db
          .query("commerce_shipping_rate_quotes")
          .withIndex("by_checkout", (q: any) => q.eq("checkoutSessionId", session._id))
          .collect();
        for (const quote of staleQuotes) {
          await ctx.db.delete(quote._id);
        }
        await staleCheckoutShippingMethods(ctx, session._id);
        // Reset shipping cost — the old amount no longer applies
        if (args.selectedShippingMethodCode === undefined) {
          patch.shippingAmount = 0;
          patch.selectedShippingMethodCode = undefined;
          patch.selectedShippingMethodLabel = undefined;
        }
      }
    }

    // Fetch cart items early — needed for rate validation and status calculation
    const cartItems = await getCartItemsWithProducts(ctx, session.cartId);

    // ── Shipping method selection with quote freshness validation ────────────
    if (args.selectedShippingMethodCode !== undefined) {
      const selectedShippingMethod = await selectCheckoutShippingMethod(ctx, {
        session,
        cartItems,
        selectedCode: args.selectedShippingMethodCode,
        settings,
        shippingAddress: args.shippingAddress,
      });
      patch.selectedShippingMethodCode = selectedShippingMethod.code;
      patch.selectedShippingMethodLabel = selectedShippingMethod.label;
      patch.shippingAmount = session.freeShippingByDynamicPricing
        ? 0
        : selectedShippingMethod.amount;
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

    const requiresShipping =
      settings.shippingEnabled &&
      cartItems.some((item: any) => item.product && item.product.isVirtual !== true);
    const hasShippingAddress =
      !requiresShipping || Boolean(args.shippingAddress ?? session.shippingAddress);
    // If quotes were invalidated (address changed) and no new rate was selected,
    // the old shipping method is stale — treat it as unset.
    const hasShippingMethod =
      !requiresShipping ||
      Boolean(
        quotesInvalidated && args.selectedShippingMethodCode === undefined
          ? null
          : (patch.selectedShippingMethodCode ?? session.selectedShippingMethodCode),
      );
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

    const taxableAmount = Math.max(
      0,
      Number(session.subtotalAmount ?? 0) - Number(session.discountAmount ?? 0),
    );

    let nextTaxAmount = Number(session.taxAmount ?? 0);
    const taxAddress = resolveTaxAddress(settings, session, patch);
    if (taxAddress) {
      const taxResult = await computeTaxForAddress(
        ctx,
        taxAddress,
        cartItems,
        Number(session.discountAmount ?? 0),
        Boolean(settings.pricesIncludeTax),
        nextShippingAmount,
        paymentSettings.shippingTaxClass,
      );
      nextTaxAmount = taxResult.taxAmount;
    }
    patch.taxAmount = nextTaxAmount;

    patch.totalAmount =
      taxableAmount + nextShippingAmount + (settings.pricesIncludeTax ? 0 : nextTaxAmount);

    await ctx.db.patch("commerce_checkout_sessions", session._id, patch);
    await ctx.db.patch("commerce_carts", session.cartId, {
      shippingAmount: nextShippingAmount,
      taxAmount: nextTaxAmount,
      totalAmount:
        taxableAmount + nextShippingAmount + (settings.pricesIncludeTax ? 0 : nextTaxAmount),
      updatedAt: Date.now(),
      lastActiveAt: Date.now(),
    });
    if (args.shippingAddress !== undefined || args.selectedShippingMethodCode !== undefined) {
      await emitEvent(ctx, CHECKOUT_EVENTS.SHIPPING_SET, SYSTEM.CHECKOUT, {
        checkoutSessionId: session._id,
        cartId: session.cartId,
        selectedShippingMethodCode:
          patch.selectedShippingMethodCode ?? session.selectedShippingMethodCode,
      });
    }
    if (args.selectedPaymentMethodCode !== undefined) {
      await emitEvent(ctx, CHECKOUT_EVENTS.PAYMENT_SET, SYSTEM.CHECKOUT, {
        checkoutSessionId: session._id,
        cartId: session.cartId,
        selectedPaymentMethodCode: patch.selectedPaymentMethodCode,
      });
    }
    return session._id;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const complete = mutation({
  args: completeCheckoutArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    const session = await getCheckoutBySession(ctx, args.sessionToken);
    const cart = await getCartBySession(ctx, args.sessionToken);
    const settings = await getCommerceSettings(ctx);
    const paymentSettings = await getCommercePaymentsSettings(ctx);

    if (!session || !cart) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Checkout session not found.",
      });
    }

    if (session.orderId) {
      await ctx.runMutation((internal as any).purchases.internals.syncCommerceOrder, {
        orderId: session.orderId,
      });
      return session.orderId;
    }
    if (cart.orderId) {
      await ctx.runMutation((internal as any).purchases.internals.syncCommerceOrder, {
        orderId: cart.orderId,
      });
      return cart.orderId;
    }

    const existingOrder = await ctx.db
      .query("commerce_orders")
      .withIndex("by_checkout", (q: any) => q.eq("checkoutSessionId", session._id))
      .first();
    if (existingOrder) {
      await ctx.db.patch("commerce_checkout_sessions", session._id, {
        orderId: existingOrder._id,
        updatedAt: Date.now(),
      });
      await ctx.db.patch("commerce_carts", cart._id, {
        orderId: existingOrder._id,
        updatedAt: Date.now(),
      });
      await ctx.runMutation((internal as any).purchases.internals.syncCommerceOrder, {
        orderId: existingOrder._id,
      });
      return existingOrder._id;
    }

    if (session.expiresAt && session.expiresAt < Date.now()) {
      await markCheckoutFailed(ctx, session, "Checkout session expired.");
      throw new ConvexError({
        code: "CHECKOUT_EXPIRED",
        message: "Checkout session expired. Please restart checkout.",
      });
    }

    if (cart.status !== "active") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "This cart can no longer be checked out.",
      });
    }

    if (!user && !session.userId && settings.allowGuestCheckout === false) {
      throw new ConvexError({
        code: "AUTH_REQUIRED",
        message: "Sign in before checking out.",
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

    // Revalidate bundle items before order creation
    const createdOrderItems: Array<{ orderItemId: any; cartItemId?: any; lineTotalAmount: number }> = [];
    for (const item of items) {
      if (item.metadata?.lineType === "bundle") {
        const bundle = await ctx.db
          .query("commerce_bundles")
          .withIndex("by_product", (q: any) => q.eq("productId", item.productId))
          .first();

        if (!bundle || bundle.status !== "active") {
          throw new ConvexError({
            code: "BUNDLE_UNAVAILABLE",
            message: `Bundle "${item.metadata.bundleName || "selected bundle"}" is no longer available.`,
          });
        }

        // Revalidate availability with current selections
        const snapshot = await resolveBundleSelectionSnapshot(ctx, {
          bundle,
          selections: item.metadata.selections,
        });
        const availability = await resolveBundleAvailability(ctx, {
          bundle,
          snapshot,
          quantity: item.quantity,
        });
        if (!availability.available) {
          throw new ConvexError({
            code: "BUNDLE_UNAVAILABLE",
            message: availability.reason || "Bundle is no longer available with current configuration.",
          });
        }
      }
    }

    const requiresShipping =
      settings.shippingEnabled &&
      items.some((item: any) => item.product && item.product.isVirtual !== true);
    const paymentMethods = getEnabledPaymentMethods(settings);
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const selectedPaymentMethod = paymentMethods.find(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
          _id?: any;
          code: string;
          label: string;
          amount: number;
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

      const activeShippingMethod = await getActiveCheckoutShippingMethod(ctx, session._id);

      if (activeShippingMethod?.source === "live_quote") {
        const currentAddressKey = computeAddressKey(session.shippingAddress);
        const currentCartKey = computeCartKey(items);
        if (!isQuoteUsableForCheckout(activeShippingMethod, currentAddressKey, currentCartKey)) {
          throw new ConvexError({
            code: "STALE_SHIPPING_RATE",
            message: "Shipping rates are stale. Please go back and refresh shipping rates.",
          });
        }

        selectedShippingQuote = {
          _id: activeShippingMethod.quoteId,
          quoteKey: activeShippingMethod.quoteKey ?? activeShippingMethod.code,
          amount: activeShippingMethod.amount,
          currency: activeShippingMethod.currencyCode,
          provider: activeShippingMethod.provider,
          carrierCode: activeShippingMethod.carrierCode,
          carrierName: activeShippingMethod.carrierName,
          serviceCode: activeShippingMethod.serviceCode,
          serviceName: activeShippingMethod.serviceName,
          accountId: activeShippingMethod.accountId,
          packages: activeShippingMethod.packages,
          origin: activeShippingMethod.origin,
          rawQuote: activeShippingMethod.rawQuote,
          expiresAt: activeShippingMethod.expiresAt,
        };
        selectedShippingMethod = {
          _id: activeShippingMethod._id,
          code: activeShippingMethod.code,
          label: activeShippingMethod.label,
          amount: activeShippingMethod.amount,
        };
      } else if (activeShippingMethod?.source === "manual_method") {
        selectedShippingMethod = {
          _id: activeShippingMethod._id,
          code: activeShippingMethod.code,
          label: activeShippingMethod.label,
          amount: activeShippingMethod.amount,
        };
      } else {
        const shippingMethods = getEnabledShippingMethods(settings);
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        const fallbackMethod = shippingMethods.find(
          // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
          (method) => method.code === session.selectedShippingMethodCode,
        );
        if (fallbackMethod) {
          selectedShippingMethod = {
            code: fallbackMethod.code,
            label: fallbackMethod.label,
            amount: Number(cart.shippingAmount ?? 0),
          };
        }
      }

      if (!selectedShippingMethod) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "A valid shipping method is required for this order.",
        });
      }
    }

    const completionTaxableAmount = Math.max(
      0,
      Number(cart.subtotalAmount ?? 0) - Number(cart.discountAmount ?? 0),
    );
    let finalTaxAmount = Number(cart.taxAmount ?? 0);
    // Wave 12.1: capture the per-class tax breakdown for per-line writes
    // into `commerce_order_tax_lines` after the order is created.
    let finalTaxBreakdown: Array<{
      source: "item" | "shipping";
      taxClass: string;
      taxableAmount: number;
      taxAmount: number;
      taxRate: number;
      rules: Array<Record<string, unknown>>;
    }> = [];
    const completionTaxAddress = resolveTaxAddress(settings, session, {});
    if (completionTaxAddress) {
      const taxResult = await computeTaxForAddress(
        ctx,
        completionTaxAddress,
        items,
        Number(cart.discountAmount ?? 0),
        Boolean(settings.pricesIncludeTax),
        Number(session.freeShippingByDynamicPricing ? 0 : cart.shippingAmount ?? 0),
        paymentSettings.shippingTaxClass,
      );
      finalTaxAmount = taxResult.taxAmount;
      finalTaxBreakdown = taxResult.breakdown;
    }
    const finalTotalAmount =
      completionTaxableAmount +
      Number(session.freeShippingByDynamicPricing ? 0 : cart.shippingAmount ?? 0) +
      (settings.pricesIncludeTax ? 0 : finalTaxAmount);
    await reserveCheckoutInventory(ctx, session, items);

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
      regionId: cart.regionId,
      salesChannelId: cart.salesChannelId,
      customerGroupId: cart.customerGroupId,
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
      // PRD A5 §4.3 — snapshot the latest validation outcome so the order
      // preserves the address classification at purchase time.
      shippingAddressValidatedAt: (() => {
        const cached = (session as any).shippingAddressValidation;
        return typeof cached?.validatedAt === "number" ? cached.validatedAt : undefined;
      })(),
      shippingAddressValidationProvider: (session as any).shippingAddressValidation?.provider,
      shippingAddressValidationStatus: (session as any).shippingAddressValidation?.status,
      shippingAddressValidationFingerprint: (session as any).shippingAddressValidation?.fingerprint,
      shippingAddressIsResidential: (session as any).shippingAddressValidation?.isResidential,
      shippingAddressNormalized: (session as any).shippingAddressValidation?.normalizedAddress,
      // PRD D1 §6.10 — snapshot fingerprints so label purchase can
      // detect stale rates when address/cart change post-order.
      shippingQuoteAddressKey: selectedShippingQuote
        ? computeAddressKey(session.shippingAddress)
        : undefined,
      shippingQuoteCartKey: selectedShippingQuote
        ? computeCartKey(items)
        : undefined,
      shippingQuoteExpiresAt: selectedShippingQuote?.expiresAt,
      shippingQuoteProvider: selectedShippingQuote?.provider,
      shippingQuoteAccountId: selectedShippingQuote?.accountId,
      shippingQuoteProof: selectedShippingQuote
        ? {
            quoteKey: selectedShippingQuote.quoteKey,
            amount: selectedShippingQuote.amount,
            currency: selectedShippingQuote.currency,
            provider: selectedShippingQuote.provider,
            carrierCode: selectedShippingQuote.carrierCode,
            serviceCode: selectedShippingQuote.serviceCode,
            accountId: (selectedShippingQuote as any).accountId,
            packages: (selectedShippingQuote as any).packages,
            fingerprintAddressKey: computeAddressKey(session.shippingAddress),
            fingerprintCartKey: computeCartKey(items),
            expiresAt: selectedShippingQuote.expiresAt,
            origin: (selectedShippingQuote as any).origin,
            rateSource: selectedShippingQuote.provider === "manual"
              ? "manual"
              : "live",
            snapshotAt: Date.now(),
          }
        : undefined,
      selectedShippingMethodCode: selectedShippingMethod?.code,
      selectedShippingMethodLabel: selectedShippingMethod?.label,
      selectedPaymentMethodCode: selectedPaymentMethod.code,
      selectedPaymentMethodLabel: selectedPaymentMethod.label,
      appliedDiscountCode: cart.appliedDiscountCode,
      appliedDiscountDescription: cart.appliedDiscountDescription,
      dynamicPricingDiscountAmount: cart.dynamicPricingDiscountAmount,
      dynamicPricingRuleIds: cart.dynamicPricingRuleIds,
      dynamicPricingDescription: cart.dynamicPricingDescription,
      freeShippingByDynamicPricing: cart.freeShippingByDynamicPricing,
      subtotalAmount: cart.subtotalAmount,
      discountAmount: cart.discountAmount,
      shippingAmount: cart.freeShippingByDynamicPricing ? 0 : cart.shippingAmount,
      taxAmount: finalTaxAmount,
      totalAmount: finalTotalAmount,
      paymentStatus: "pending",
      fulfillmentStatus: "unfulfilled",
      notes: session.notes,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of items) {
      if (item.variantId && !item.variant) {
        throw new ConvexError({
          code: "VARIANT_NOT_FOUND",
          message: `A selected variant is no longer available. Please update your cart and try again.`,
        });
      }

      const orderItemId = await ctx.db.insert("commerce_order_items", {
        orderId,
        productId: item.productId,
        variantId: item.variantId,
        productTitle: buildOrderItemTitle(item),
        sku: item.variant?.sku ?? item.product?.sku,
        quantity: item.quantity,
        unitPriceAmount: item.unitPriceAmount,
        lineSubtotalAmount: item.lineTotalAmount,
        lineTotalAmount: item.lineTotalAmount,
        metadata: buildOrderItemMetadata(item),
        createdAt: now,
      });
      createdOrderItems.push({
        orderItemId,
        cartItemId: item._id,
        lineTotalAmount: Number(item.lineTotalAmount ?? 0),
      });
    }

    // Wave 12.1: persist per-class tax breakdown for compliance audits.
    if (completionTaxAddress && finalTaxBreakdown.length > 0) {
      const jurisdictionLabel = [
        completionTaxAddress.state,
        completionTaxAddress.countryCode,
      ]
        .filter(Boolean)
        .join(" / ") || completionTaxAddress.countryCode;
      for (const group of finalTaxBreakdown) {
        if (group.taxAmount <= 0) continue;
        const firstRule: any = group.rules?.[0];
        await ctx.db.insert("commerce_order_tax_lines", {
          orderId,
          checkoutShippingMethodId:
            group.source === "shipping" ? selectedShippingMethod?._id : undefined,
          source: group.source,
          ruleId: firstRule?._id,
          taxClass: group.taxClass,
          jurisdictionLabel,
          taxableAmount: group.taxableAmount,
          ratePercent: Math.round(group.taxRate * 10000) / 100,
          taxAmount: group.taxAmount,
          provider: "rules",
          createdAt: now,
        });
      }
    }

    if (Number(cart.discountAmount ?? 0) > 0 || cart.appliedDiscountCode) {
      const discount = cart.appliedDiscountCode
        ? await ctx.db
            .query("commerce_discount_codes")
            .withIndex("by_code", (q: any) => q.eq("code", cart.appliedDiscountCode))
            .unique()
        : null;
      await ctx.db.insert("commerce_applied_adjustments", {
        context: "order",
        cartId: cart._id,
        checkoutSessionId: session._id,
        orderId,
        discountId: discount?._id,
        code: cart.appliedDiscountCode,
        source: cart.appliedDiscountCode ? "discount" : "system",
        targetType: "subtotal",
        allocation: "cart",
        amount: Number(cart.discountAmount ?? 0),
        currencyCode: session.currencyCode,
        metadata: {
          description: cart.appliedDiscountDescription,
          subtotalAmount: cart.subtotalAmount,
        },
        createdAt: now,
      });

      const subtotalForAllocation = Math.max(1, Number(cart.subtotalAmount ?? 0));
      for (const item of createdOrderItems) {
        const allocatedAmount = Math.round(
          Number(cart.discountAmount ?? 0) *
            (Number(item.lineTotalAmount ?? 0) / subtotalForAllocation),
        );
        if (allocatedAmount <= 0) continue;
        await ctx.db.insert("commerce_applied_adjustments", {
          context: "order_item",
          cartId: cart._id,
          checkoutSessionId: session._id,
          orderId,
          cartItemId: item.cartItemId,
          orderItemId: item.orderItemId,
          discountId: discount?._id,
          code: cart.appliedDiscountCode,
          source: cart.appliedDiscountCode ? "discount" : "system",
          targetType: "item",
          allocation: "item",
          amount: allocatedAmount,
          currencyCode: session.currencyCode,
          metadata: {
            description: cart.appliedDiscountDescription,
            allocationBasis: item.lineTotalAmount,
            subtotalAmount: cart.subtotalAmount,
          },
          createdAt: now,
        });
      }
    }

    if (Number(cart.dynamicPricingDiscountAmount ?? 0) > 0 || cart.dynamicPricingRuleIds?.length) {
      await ctx.db.insert("commerce_applied_adjustments", {
        context: "order",
        cartId: cart._id,
        checkoutSessionId: session._id,
        orderId,
        source: "promotion",
        targetType: "subtotal",
        allocation: "cart",
        amount: Number(cart.dynamicPricingDiscountAmount ?? 0),
        currencyCode: session.currencyCode,
        metadata: {
          description: cart.dynamicPricingDescription,
          ruleIds: cart.dynamicPricingRuleIds?.map((id: any) => String(id)) ?? [],
          freeShipping: Boolean(cart.freeShippingByDynamicPricing),
        },
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

    const isExternalCardPayment = selectedPaymentMethod.code === "card";
    if (selectedShippingMethod?._id) {
      await ctx.db.patch("commerce_checkout_shipping_methods", selectedShippingMethod._id, {
        status: "converted",
        convertedAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(session._id, {
      status: isExternalCardPayment ? "payment_pending" : "completed",
      orderId,
      appliedDiscountCode: cart.appliedDiscountCode,
      appliedDiscountDescription: cart.appliedDiscountDescription,
      subtotalAmount: cart.subtotalAmount,
      discountAmount: cart.discountAmount,
      shippingAmount: session.freeShippingByDynamicPricing ? 0 : cart.shippingAmount,
      taxAmount: finalTaxAmount,
      totalAmount: finalTotalAmount,
      completedAt: isExternalCardPayment ? undefined : now,
      updatedAt: now,
    });

    await ctx.db.patch(cart._id, {
      status: isExternalCardPayment ? "pending_payment" : "converted",
      orderId,
      convertedAt: isExternalCardPayment ? undefined : now,
      updatedAt: now,
      lastActiveAt: now,
    });

    if (!isExternalCardPayment && cart.appliedDiscountCode) {
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

    if (!isExternalCardPayment) {
      await commitCheckoutInventory(ctx, session, orderId);
      await emitEvent(ctx, CHECKOUT_EVENTS.COMPLETED, SYSTEM.CHECKOUT, {
        checkoutSessionId: session._id,
        cartId: cart._id,
        orderId,
        userId: session.userId,
        totalAmount: finalTotalAmount,
      });
    }

    await ctx.runMutation((internal as any).purchases.internals.syncCommerceOrder, {
      orderId,
      eventType: "order_created",
    });

    return orderId;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const abandonSession = mutation({
  args: abandonCheckoutSessionArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const session = await getCheckoutBySession(ctx, args.sessionToken);
    if (!session || ["completed", "failed", "abandoned"].includes(session.status)) {
      return session?._id ?? null;
    }

    const now = Date.now();
    await ctx.db.patch("commerce_checkout_sessions", session._id, {
      status: "abandoned",
      abandonedAt: now,
      failureReason: args.reason,
      updatedAt: now,
    });
    await emitEvent(ctx, CHECKOUT_EVENTS.ABANDONED, SYSTEM.CHECKOUT, {
      checkoutSessionId: session._id,
      cartId: session.cartId,
      userId: session.userId,
      reason: args.reason,
    });
    return session._id;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const listSessions = query({
  args: listAbandonedCheckoutSessionsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const limit = Math.min(args.limit ?? 100, 500);
    const olderThanMs = args.olderThanMs ?? 2 * 60 * 60 * 1000;
    const cutoff = Date.now() - olderThanMs;
    const sessions = await ctx.db
      .query("commerce_checkout_sessions")
      .order("desc")
      .take(limit);

    return sessions.filter(
      (session: any) =>
        session.status === "abandoned" ||
        session.status === "failed" ||
        (!["completed", "payment_pending"].includes(session.status) &&
          Number(session.updatedAt ?? 0) < cutoff),
    );
  },
});
