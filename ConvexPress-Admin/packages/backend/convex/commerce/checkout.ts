import { ConvexError } from "convex/values";

import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import {
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
  createCheckoutSessionArgs,
  getCheckoutSessionArgs,
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
  return ctx.db
    .query("commerce_checkout_sessions")
    .withIndex("by_session", (q: any) => q.eq("sessionToken", sessionToken))
    .unique();
}

async function computeTaxForAddress(
  ctx: any,
  address: { countryCode: string; state?: string; postalCode?: string },
  items: any[],
  discountAmount: number,
  pricesIncludeTax: boolean,
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

  return calculateTaxForLinesFromRules(
    rules,
    address,
    items.map((item: any) => ({
      amount: Math.max(
        0,
        Math.round(Number(item.lineTotalAmount ?? 0) * (1 - discountRatio)),
      ),
      taxClass: item.variant?.taxClass ?? item.product?.taxClass,
      taxable: true,
    })),
    { pricesIncludeTax },
  );
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

  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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

    const activeReservations = await ctx.db
      .query("commerce_stock_reservations")
      .withIndex("by_product_status", (q: any) =>
        q.eq("productId", target.productId).eq("status", "active"),
      )
      .collect();
    const reservedCount = activeReservations
      .filter(
        (reservation: any) =>
          (reservation.variantId?.toString() ?? null) ===
          (target.variantId?.toString() ?? null),
      )
      .reduce((sum: number, reservation: any) => sum + reservation.quantity, 0);
    const available = target.stockQuantity - reservedCount;

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

    await ctx.db.patch(target._id, {
      stockQuantity: Math.max(0, (target.stockQuantity ?? 0) - reservation.quantity),
      updatedAt: now,
    });
    await ctx.db.patch(reservation._id, {
      status: "converted",
      updatedAt: now,
    });
    await ctx.db.insert("commerce_inventory_adjustments", {
      productId: reservation.productId,
      variantId: reservation.variantId,
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateSession = mutation({
  args: updateCheckoutSessionArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
        // Reset shipping cost — the old amount no longer applies
        if (args.selectedShippingMethodCode === undefined) {
          patch.shippingAmount = 0;
        }
      }
    }

    // Fetch cart items early — needed for rate validation and status calculation
    const cartItems = await getCartItemsWithProducts(ctx, session.cartId);

    // ── Shipping method selection with quote freshness validation ────────────
    if (args.selectedShippingMethodCode !== undefined) {
      const shippingQuotes = await getCheckoutQuotes(ctx, session._id);
      const selectedQuote = shippingQuotes.find(
        (quote: any) => quote.quoteKey === args.selectedShippingMethodCode,
      );

      if (selectedQuote) {
        // Validate the quote was generated for the CURRENT address and cart
        const currentAddressKey = computeAddressKey(
          args.shippingAddress ?? session.shippingAddress,
        );
        const currentCartKey = computeCartKey(cartItems);
        if (!isQuoteUsableForCheckout(selectedQuote, currentAddressKey, currentCartKey)) {
          throw new ConvexError({
            code: "STALE_SHIPPING_RATE",
            message: "Shipping rates are stale. Please refresh shipping rates.",
          });
        }

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

    if (!session || !cart) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Checkout session not found.",
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
        // Validate the quote was generated for the CURRENT address and cart
        const currentAddressKey = computeAddressKey(session.shippingAddress);
        const currentCartKey = computeCartKey(items);
        if (!isQuoteUsableForCheckout(selectedQuote, currentAddressKey, currentCartKey)) {
          throw new ConvexError({
            code: "STALE_SHIPPING_RATE",
            message: "Shipping rates are stale. Please go back and refresh shipping rates.",
          });
        }

        selectedShippingQuote = selectedQuote;
        selectedShippingMethod = {
          code: selectedQuote.quoteKey,
          label: `${selectedQuote.carrierName} ${selectedQuote.serviceName}`.trim(),
        };
      } else {
        const shippingMethods = getEnabledShippingMethods(settings);
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        selectedShippingMethod = shippingMethods.find(
          // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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

    const completionTaxableAmount = Math.max(
      0,
      Number(cart.subtotalAmount ?? 0) - Number(cart.discountAmount ?? 0),
    );
    let finalTaxAmount = Number(cart.taxAmount ?? 0);
    const completionTaxAddress = resolveTaxAddress(settings, session, {});
    if (completionTaxAddress) {
      const taxResult = await computeTaxForAddress(
        ctx,
        completionTaxAddress,
        items,
        Number(cart.discountAmount ?? 0),
        Boolean(settings.pricesIncludeTax),
      );
      finalTaxAmount = taxResult.taxAmount;
    }
    const finalTotalAmount =
      completionTaxableAmount +
      Number(cart.shippingAmount ?? 0) +
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
      if (item.variantId && !item.variant) {
        throw new ConvexError({
          code: "VARIANT_NOT_FOUND",
          message: `A selected variant is no longer available. Please update your cart and try again.`,
        });
      }

      await ctx.db.insert("commerce_order_items", {
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
    await ctx.db.patch(session._id, {
      status: isExternalCardPayment ? "payment_pending" : "completed",
      appliedDiscountCode: cart.appliedDiscountCode,
      appliedDiscountDescription: cart.appliedDiscountDescription,
      subtotalAmount: cart.subtotalAmount,
      discountAmount: cart.discountAmount,
      shippingAmount: cart.shippingAmount,
      taxAmount: finalTaxAmount,
      totalAmount: finalTotalAmount,
      completedAt: isExternalCardPayment ? undefined : now,
      updatedAt: now,
    });

    await ctx.db.patch(cart._id, {
      status: isExternalCardPayment ? "pending_payment" : "converted",
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
    }

    return orderId;
  },
});
