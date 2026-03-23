# Phase 6: Checkout Integration & Polish

> **Duration:** 2-3 days
> **Prerequisites:** Phase 3 (Core Mutations)
> **Can Parallel With:** Phases 4 & 5

---

## Objective

Integrate subscriptions into the checkout flow, implement UCP/API endpoints for AI agents, add MCP tools, and create email notification templates. This phase completes the end-to-end subscription experience.

---

## Tasks

### 6.1 Cart Subscription Detection

Modify cart logic to identify and separate subscription items from one-time purchases.

#### Update cart.ts queries

Add a helper to detect subscription items in cart:

```typescript
// admin-app/packages/backend/convex/cart.ts

// Add this helper function
async function analyzeCartItems(
  ctx: QueryCtx,
  items: Doc<"cart_items">[]
): Promise<{
  subscriptionItems: Array<Doc<"cart_items"> & { product: Doc<"products"> }>;
  oneTimeItems: Array<Doc<"cart_items"> & { product: Doc<"products"> }>;
  hasSubscriptions: boolean;
  hasOneTime: boolean;
  existingSubscriptionId?: Id<"subscriptions">;
}> {
  const subscriptionItems: Array<Doc<"cart_items"> & { product: Doc<"products"> }> = [];
  const oneTimeItems: Array<Doc<"cart_items"> & { product: Doc<"products"> }> = [];

  for (const item of items) {
    const product = await ctx.db.get(item.productId);
    if (!product) continue;

    if (product.isSubscriptionEnabled && product.subscriptionTemplateId) {
      subscriptionItems.push({ ...item, product });
    } else {
      oneTimeItems.push({ ...item, product });
    }
  }

  // Check if user has existing active subscription
  const identity = await ctx.auth.getUserIdentity();
  let existingSubscriptionId: Id<"subscriptions"> | undefined;

  if (identity?.email) {
    const user = await ctx.db
      .query("user_profiles")
      .withIndex("by_email", (q) => q.eq("email", identity.email as string))
      .first();

    if (user?.activeSubscriptionId) {
      const subscription = await ctx.db.get(user.activeSubscriptionId);
      if (subscription && subscription.status === "active") {
        existingSubscriptionId = subscription._id;
      }
    }
  }

  return {
    subscriptionItems,
    oneTimeItems,
    hasSubscriptions: subscriptionItems.length > 0,
    hasOneTime: oneTimeItems.length > 0,
    existingSubscriptionId,
  };
}

// Add new query to get cart analysis
export const getCartAnalysis = query({
  args: {
    cartId: v.optional(v.id("cart_sessions")),
  },
  handler: async (ctx, args) => {
    // Get cart items (use existing logic)
    let cartId = args.cartId;

    if (!cartId) {
      const identity = await ctx.auth.getUserIdentity();
      if (identity?.email) {
        const user = await ctx.db
          .query("user_profiles")
          .withIndex("by_email", (q) => q.eq("email", identity.email as string))
          .first();

        if (user) {
          const cart = await ctx.db
            .query("cart_sessions")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .filter((q) => q.eq(q.field("status"), "active"))
            .first();

          cartId = cart?._id;
        }
      }
    }

    if (!cartId) return null;

    const items = await ctx.db
      .query("cart_items")
      .withIndex("by_cart", (q) => q.eq("cartId", cartId))
      .collect();

    const analysis = await analyzeCartItems(ctx, items);

    // Calculate totals
    let subscriptionMonthlyTotal = 0;
    let subscriptionSetupTotal = 0;
    let oneTimeTotal = 0;

    for (const item of analysis.subscriptionItems) {
      const template = item.product.subscriptionTemplateId
        ? await ctx.db.get(item.product.subscriptionTemplateId)
        : null;

      const price = item.product.subscriptionOverrides?.customPrice
        ?? item.product.basePrice;
      const setupFee = item.product.subscriptionOverrides?.setupFee
        ?? template?.setupFee
        ?? 0;

      subscriptionMonthlyTotal += price * item.quantity;
      subscriptionSetupTotal += setupFee * item.quantity;
    }

    for (const item of analysis.oneTimeItems) {
      const price = item.product.salePrice ?? item.product.basePrice;
      oneTimeTotal += price * item.quantity;
    }

    return {
      hasSubscriptions: analysis.hasSubscriptions,
      hasOneTime: analysis.hasOneTime,
      existingSubscriptionId: analysis.existingSubscriptionId,
      subscriptionAction: analysis.existingSubscriptionId ? "add_items" : "create",
      subscriptionItems: analysis.subscriptionItems.map(item => ({
        _id: item._id,
        productId: item.productId,
        productName: item.product.name,
        quantity: item.quantity,
        monthlyPrice: item.product.subscriptionOverrides?.customPrice ?? item.product.basePrice,
      })),
      oneTimeItems: analysis.oneTimeItems.map(item => ({
        _id: item._id,
        productId: item.productId,
        productName: item.product.name,
        quantity: item.quantity,
        price: item.product.salePrice ?? item.product.basePrice,
      })),
      totals: {
        subscriptionMonthlyTotal,
        subscriptionSetupTotal,
        oneTimeTotal,
        firstPayment: subscriptionMonthlyTotal + subscriptionSetupTotal + oneTimeTotal,
        recurringMonthly: subscriptionMonthlyTotal,
      },
    };
  },
});
```

---

### 6.2 Modify Checkout Start

Update checkout.start to handle subscription items differently.

```typescript
// admin-app/packages/backend/convex/checkout.ts

// Modify the start mutation to detect subscriptions
export const start = mutation({
  args: {
    cartId: v.id("cart_sessions"),
    guestEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    let userId: Id<"user_profiles"> | undefined;

    if (identity?.email) {
      const user = await ctx.db
        .query("user_profiles")
        .withIndex("by_email", (q) => q.eq("email", identity.email as string))
        .first();
      userId = user?._id;
    }

    // Get cart
    const cart = await ctx.db.get(args.cartId);
    if (!cart) throw new Error("Cart not found");

    // Validate cart has items
    const items = await ctx.db
      .query("cart_items")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .collect();

    if (items.length === 0) {
      throw new Error("Cart is empty");
    }

    // Analyze cart for subscriptions
    const subscriptionItems: Array<{
      productId: Id<"products">;
      variantId?: Id<"product_variants">;
      price: number;
      setupFee: number;
    }> = [];

    let hasSubscriptionItems = false;
    let existingSubscriptionId: Id<"subscriptions"> | undefined;

    // Check if user has active subscription
    if (userId) {
      const user = await ctx.db.get(userId);
      if (user?.activeSubscriptionId) {
        const sub = await ctx.db.get(user.activeSubscriptionId);
        if (sub && sub.status === "active") {
          existingSubscriptionId = sub._id;
        }
      }
    }

    // Analyze items
    for (const item of items) {
      const product = await ctx.db.get(item.productId);
      if (!product) continue;

      if (product.isSubscriptionEnabled && product.subscriptionTemplateId) {
        hasSubscriptionItems = true;
        const template = await ctx.db.get(product.subscriptionTemplateId);

        subscriptionItems.push({
          productId: item.productId,
          variantId: item.variantId,
          price: product.subscriptionOverrides?.customPrice ?? product.basePrice,
          setupFee: product.subscriptionOverrides?.setupFee ?? template?.setupFee ?? 0,
        });
      }
    }

    // Check for existing active session (existing logic)
    const existingSession = await ctx.db
      .query("checkout_sessions")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), "completed"),
          q.neq(q.field("status"), "expired"),
          q.neq(q.field("status"), "abandoned"),
          q.gt(q.field("expiresAt"), Date.now())
        )
      )
      .first();

    if (existingSession) {
      // Resume existing session - extend expiry and update subscription info
      await ctx.db.patch(existingSession._id, {
        expiresAt: Date.now() + 30 * 60 * 1000,
        updatedAt: Date.now(),
        hasSubscriptionItems,
        subscriptionItems: subscriptionItems.length > 0 ? subscriptionItems : undefined,
        existingSubscriptionId,
        subscriptionAction: existingSubscriptionId ? "add_items" : (hasSubscriptionItems ? "create" : undefined),
      });
      return {
        sessionId: existingSession._id,
        sessionToken: existingSession.sessionToken,
        resumed: true,
      };
    }

    // Calculate subtotal (existing logic)
    let subtotal = 0;
    let subscriptionSetupTotal = 0;

    for (const item of items) {
      const product = await ctx.db.get(item.productId);
      if (product) {
        if (product.isSubscriptionEnabled) {
          // For subscriptions, first payment = monthly price + setup fee
          const template = product.subscriptionTemplateId
            ? await ctx.db.get(product.subscriptionTemplateId)
            : null;
          const monthlyPrice = product.subscriptionOverrides?.customPrice ?? product.basePrice;
          const setupFee = product.subscriptionOverrides?.setupFee ?? template?.setupFee ?? 0;
          subtotal += monthlyPrice * item.quantity;
          subscriptionSetupTotal += setupFee * item.quantity;
        } else {
          const price = product.salePrice ?? product.basePrice;
          subtotal += price * item.quantity;
        }
      }
    }

    // Reserve stock (existing logic - skip for subscription items)
    const reservationIds: Id<"stock_reservations">[] = [];
    const sessionToken = generateSecureToken();

    for (const item of items) {
      const product = await ctx.db.get(item.productId);
      if (!product) continue;

      // Skip stock reservation for subscription products
      if (product.isSubscriptionEnabled) continue;

      if (product.trackInventory && !product.allowBackorder) {
        const availableStock = product.stockCount - (product.reservedCount ?? 0);
        if (availableStock < item.quantity) {
          throw new Error(
            `Insufficient stock for ${product.name}. Available: ${availableStock}`
          );
        }
      }

      // Create reservation (existing logic)
      const reservationId = await ctx.db.insert("stock_reservations", {
        productId: item.productId,
        cartId: cart._id,
        checkoutSessionId: sessionToken,
        quantity: item.quantity,
        expiresAt: Date.now() + 30 * 60 * 1000,
        status: "active",
        createdAt: Date.now(),
      });
      reservationIds.push(reservationId);

      if (product.trackInventory) {
        await ctx.db.patch(product._id, {
          reservedCount: (product.reservedCount ?? 0) + item.quantity,
        });
      }
    }

    // Create session with subscription fields
    const now = Date.now();
    const sessionId = await ctx.db.insert("checkout_sessions", {
      cartId: cart._id,
      userId,
      sessionToken,
      guestEmail: args.guestEmail,
      status: "shipping",
      billingSameAsShipping: true,
      subtotal: subtotal + subscriptionSetupTotal,
      shippingTotal: 0,
      taxTotal: 0,
      discountTotal: 0,
      grandTotal: subtotal + subscriptionSetupTotal,
      stockReserved: reservationIds.length > 0,
      reservationIds,
      // New subscription fields
      hasSubscriptionItems,
      subscriptionItems: subscriptionItems.length > 0 ? subscriptionItems : undefined,
      existingSubscriptionId,
      subscriptionAction: existingSubscriptionId ? "add_items" : (hasSubscriptionItems ? "create" : undefined),
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 30 * 60 * 1000,
    });

    return { sessionId, sessionToken, resumed: false };
  },
});
```

---

### 6.3 Modify Checkout Complete

Update checkout.complete to create or add to subscriptions.

```typescript
// admin-app/packages/backend/convex/checkout.ts

// Add import at top
import { api, internal } from "./_generated/api";

// Modify the complete mutation
export const complete = mutation({
  args: {
    sessionId: v.id("checkout_sessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    if (session.status !== "review") {
      throw new Error(`Cannot complete checkout in ${session.status} status`);
    }

    // Validate all required info
    if (!session.shippingAddress) {
      throw new Error("Shipping address required");
    }
    if (!session.paymentMethodId) {
      throw new Error("Payment method required");
    }

    // Get customer email
    const identity = await ctx.auth.getUserIdentity();
    const customerEmail = identity?.email ?? session.guestEmail;

    if (!customerEmail) {
      throw new Error("Customer email required");
    }

    // Update status to processing
    await ctx.db.patch(args.sessionId, {
      status: "processing",
      updatedAt: Date.now(),
    });

    // Get cart items
    const cartItems = await ctx.db
      .query("cart_items")
      .withIndex("by_cart", (q) => q.eq("cartId", session.cartId))
      .collect();

    // Separate subscription and one-time items
    const subscriptionCartItems: typeof cartItems = [];
    const oneTimeCartItems: typeof cartItems = [];

    for (const item of cartItems) {
      const product = await ctx.db.get(item.productId);
      if (!product) continue;

      if (product.isSubscriptionEnabled && product.subscriptionTemplateId) {
        subscriptionCartItems.push(item);
      } else {
        oneTimeCartItems.push(item);
      }
    }

    // Handle subscription items
    let subscriptionId: Id<"subscriptions"> | undefined;

    if (subscriptionCartItems.length > 0 && session.userId) {
      if (session.subscriptionAction === "add_items" && session.existingSubscriptionId) {
        // Add items to existing subscription
        subscriptionId = session.existingSubscriptionId;

        for (const item of subscriptionCartItems) {
          const product = await ctx.db.get(item.productId);
          if (!product) continue;

          await ctx.runMutation(internal.subscriptions.subscriptions.addItem, {
            subscriptionId,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
          });
        }
      } else {
        // Create new subscription
        const result = await ctx.runMutation(
          internal.subscriptions.subscriptions.createFromCheckout,
          {
            userId: session.userId,
            checkoutSessionId: args.sessionId,
            stripeCustomerId: session.stripeCustomerId ?? "",
            stripePaymentMethodId: session.paymentMethodId,
          }
        );

        if (result.success) {
          subscriptionId = result.subscriptionId;

          // Update user profile
          await ctx.db.patch(session.userId, {
            activeSubscriptionId: subscriptionId,
            hasActiveSubscription: true,
            updatedAt: Date.now(),
          });
        }
      }
    }

    // Handle one-time items (existing order creation logic)
    let orderId: Id<"order_records"> | undefined;

    if (oneTimeCartItems.length > 0) {
      // Generate order number
      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // Calculate one-time total
      let oneTimeSubtotal = 0;
      for (const item of oneTimeCartItems) {
        const product = await ctx.db.get(item.productId);
        if (product) {
          const price = product.salePrice ?? product.basePrice;
          oneTimeSubtotal += price * item.quantity;
        }
      }

      // Get shipping method name
      const shippingMethod = session.shippingMethodId
        ? await ctx.db.get(session.shippingMethodId)
        : null;

      // Create order for one-time items
      orderId = await ctx.db.insert("order_records", {
        orderNumber,
        userId: session.userId,
        customerEmail,
        customerFirstName: session.shippingAddress.firstName,
        customerLastName: session.shippingAddress.lastName,
        customerPhone: session.shippingAddress.phone,
        status: "confirmed",
        paymentStatus: "paid",
        paymentMethod: "card",
        stripePaymentIntentId: session.paymentIntentId,
        subtotal: oneTimeSubtotal,
        shippingTotal: session.shippingTotal,
        taxTotal: session.taxTotal,
        discountTotal: session.discountTotal,
        total: oneTimeSubtotal + session.shippingTotal + session.taxTotal - session.discountTotal,
        currency: "usd",
        shippingAddress: session.shippingAddress,
        billingAddress: session.billingAddress ?? session.shippingAddress,
        shippingMethod: shippingMethod?.name,
        discountCode: session.discountCode,
        customerNotes: session.customerNotes,
        // Link to subscription if created
        relatedSubscriptionId: subscriptionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Create order items for one-time products
      for (const item of oneTimeCartItems) {
        const product = await ctx.db.get(item.productId);
        if (!product) continue;

        const unitPrice = product.salePrice ?? product.basePrice;

        await ctx.db.insert("order_items", {
          orderId,
          productId: item.productId,
          variantId: item.variantId,
          productName: product.name,
          productSku: product.sku,
          productImageUrl: product.images[0],
          unitPrice,
          quantity: item.quantity,
          subtotal: unitPrice * item.quantity,
          createdAt: Date.now(),
        });
      }

      // Create order history entry
      await ctx.db.insert("order_history", {
        orderId,
        action: "created",
        description: "Order placed successfully",
        createdAt: Date.now(),
      });

      // Commit stock reservations (existing logic)
      if (session.reservationIds) {
        for (const reservationId of session.reservationIds) {
          const reservation = await ctx.db.get(reservationId);
          if (!reservation) continue;

          await ctx.db.patch(reservationId, {
            status: "committed",
          });

          const product = await ctx.db.get(reservation.productId);
          if (product && product.trackInventory) {
            await ctx.db.patch(product._id, {
              stockCount: Math.max(0, product.stockCount - reservation.quantity),
              reservedCount: Math.max(0, (product.reservedCount ?? 0) - reservation.quantity),
            });
          }
        }
      }
    }

    // Update user stats if logged in
    if (session.userId) {
      const user = await ctx.db.get(session.userId);
      if (user && orderId) {
        await ctx.db.patch(session.userId, {
          orderCount: (user.orderCount ?? 0) + 1,
          totalSpent: (user.totalSpent ?? 0) + session.grandTotal,
          lastOrderAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    // Clear cart
    for (const item of cartItems) {
      await ctx.db.delete(item._id);
    }

    // Update checkout session
    await ctx.db.patch(args.sessionId, {
      status: "completed",
      paymentStatus: "succeeded",
      orderId,
      createdSubscriptionId: subscriptionId,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      success: true,
      orderId,
      orderNumber: orderId ? (await ctx.db.get(orderId))?.orderNumber : undefined,
      subscriptionId,
    };
  },
});
```

---

### 6.4 UCP REST Endpoints for Subscriptions

Add subscription endpoints to the UCP API.

Create `admin-app/packages/backend/convex/ucp/subscriptions.ts`:

```typescript
/**
 * UCP REST API Handlers for Subscriptions
 *
 * HTTP action handlers for subscription management via UCP.
 */

import { httpAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// ============================================
// HELPER FUNCTIONS
// ============================================

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin.includes("localhost") ? origin : "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };
}

function jsonResponse(data: unknown, status = 200, request?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: request ? getCorsHeaders(request) : { "Content-Type": "application/json" },
  });
}

function errorResponse(
  code: string,
  message: string,
  status = 400,
  request?: Request
): Response {
  return jsonResponse({ error: { code, message } }, status, request);
}

// ============================================
// SUBSCRIPTION ENDPOINTS
// ============================================

/**
 * GET /api/ucp/subscriptions
 * Get current user's subscription
 */
export const getMySubscription = httpAction(async (ctx, request) => {
  try {
    const subscription = await ctx.runQuery(api.subscriptions.subscriptions.getMySubscription, {});

    if (!subscription) {
      return jsonResponse({ subscription: null }, 200, request);
    }

    return jsonResponse({ subscription }, 200, request);
  } catch (error: any) {
    console.error("UCP getMySubscription error:", error);
    return errorResponse("FETCH_FAILED", error.message ?? "Failed to fetch subscription", 500, request);
  }
});

/**
 * GET /api/ucp/subscriptions/:id
 * Get specific subscription by ID
 */
export const getSubscription = httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const subscriptionId = pathParts[pathParts.length - 1];

    if (!subscriptionId) {
      return errorResponse("MISSING_ID", "Subscription ID is required", 400, request);
    }

    const subscription = await ctx.runQuery(api.subscriptions.subscriptions.get, {
      subscriptionId: subscriptionId as Id<"subscriptions">,
    });

    if (!subscription) {
      return errorResponse("NOT_FOUND", "Subscription not found", 404, request);
    }

    return jsonResponse({ subscription }, 200, request);
  } catch (error: any) {
    console.error("UCP getSubscription error:", error);
    return errorResponse("FETCH_FAILED", error.message ?? "Failed to fetch subscription", 500, request);
  }
});

/**
 * POST /api/ucp/subscriptions/:id/items
 * Add item to subscription
 */
export const addSubscriptionItem = httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const subscriptionId = pathParts[pathParts.indexOf("subscriptions") + 1];

    if (!subscriptionId) {
      return errorResponse("MISSING_ID", "Subscription ID is required", 400, request);
    }

    const body = await request.json();

    if (!body.productId) {
      return errorResponse("MISSING_PRODUCT_ID", "productId is required", 400, request);
    }

    const result = await ctx.runMutation(api.subscriptions.items.add, {
      subscriptionId: subscriptionId as Id<"subscriptions">,
      productId: body.productId as Id<"products">,
      variantId: body.variantId as Id<"product_variants"> | undefined,
      quantity: body.quantity ?? 1,
    });

    return jsonResponse(result, 201, request);
  } catch (error: any) {
    console.error("UCP addSubscriptionItem error:", error);
    return errorResponse("ADD_FAILED", error.message ?? "Failed to add item", 400, request);
  }
});

/**
 * DELETE /api/ucp/subscriptions/:id/items/:itemId
 * Cancel subscription item
 */
export const cancelSubscriptionItem = httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const itemsIndex = pathParts.indexOf("items");
    const itemId = pathParts[itemsIndex + 1];

    if (!itemId) {
      return errorResponse("MISSING_ITEM_ID", "Item ID is required", 400, request);
    }

    const body = await request.json().catch(() => ({}));

    const result = await ctx.runMutation(api.subscriptions.items.cancel, {
      itemId: itemId as Id<"subscription_items">,
      cancelImmediately: body.cancelImmediately ?? false,
    });

    return jsonResponse(result, 200, request);
  } catch (error: any) {
    console.error("UCP cancelSubscriptionItem error:", error);
    return errorResponse("CANCEL_FAILED", error.message ?? "Failed to cancel item", 400, request);
  }
});

/**
 * POST /api/ucp/subscriptions/:id/pause
 * Pause subscription
 */
export const pauseSubscription = httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const subscriptionId = pathParts[pathParts.indexOf("subscriptions") + 1];

    if (!subscriptionId) {
      return errorResponse("MISSING_ID", "Subscription ID is required", 400, request);
    }

    const body = await request.json().catch(() => ({}));

    const result = await ctx.runMutation(api.subscriptions.subscriptions.pause, {
      subscriptionId: subscriptionId as Id<"subscriptions">,
      resumeDate: body.resumeDate,
    });

    return jsonResponse(result, 200, request);
  } catch (error: any) {
    console.error("UCP pauseSubscription error:", error);
    return errorResponse("PAUSE_FAILED", error.message ?? "Failed to pause subscription", 400, request);
  }
});

/**
 * POST /api/ucp/subscriptions/:id/resume
 * Resume paused subscription
 */
export const resumeSubscription = httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const subscriptionId = pathParts[pathParts.indexOf("subscriptions") + 1];

    if (!subscriptionId) {
      return errorResponse("MISSING_ID", "Subscription ID is required", 400, request);
    }

    const result = await ctx.runMutation(api.subscriptions.subscriptions.resume, {
      subscriptionId: subscriptionId as Id<"subscriptions">,
    });

    return jsonResponse(result, 200, request);
  } catch (error: any) {
    console.error("UCP resumeSubscription error:", error);
    return errorResponse("RESUME_FAILED", error.message ?? "Failed to resume subscription", 400, request);
  }
});

/**
 * POST /api/ucp/subscriptions/:id/cancel
 * Cancel subscription
 */
export const cancelSubscription = httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const subscriptionId = pathParts[pathParts.indexOf("subscriptions") + 1];

    if (!subscriptionId) {
      return errorResponse("MISSING_ID", "Subscription ID is required", 400, request);
    }

    const body = await request.json().catch(() => ({}));

    const result = await ctx.runMutation(api.subscriptions.subscriptions.cancel, {
      subscriptionId: subscriptionId as Id<"subscriptions">,
      cancelImmediately: body.cancelImmediately ?? false,
      reason: body.reason,
    });

    return jsonResponse(result, 200, request);
  } catch (error: any) {
    console.error("UCP cancelSubscription error:", error);
    return errorResponse("CANCEL_FAILED", error.message ?? "Failed to cancel subscription", 400, request);
  }
});

/**
 * GET /api/ucp/subscriptions/:id/invoices
 * Get subscription invoices
 */
export const getSubscriptionInvoices = httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const subscriptionId = pathParts[pathParts.indexOf("subscriptions") + 1];

    if (!subscriptionId) {
      return errorResponse("MISSING_ID", "Subscription ID is required", 400, request);
    }

    const invoices = await ctx.runQuery(api.subscriptions.invoices.listBySubscription, {
      subscriptionId: subscriptionId as Id<"subscriptions">,
    });

    return jsonResponse({ invoices }, 200, request);
  } catch (error: any) {
    console.error("UCP getSubscriptionInvoices error:", error);
    return errorResponse("FETCH_FAILED", error.message ?? "Failed to fetch invoices", 500, request);
  }
});

/**
 * OPTIONS handler for CORS preflight
 */
export const corsHandler = httpAction(async (ctx, request) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
});
```

#### Register routes in http.ts

Add to `admin-app/packages/backend/convex/http.ts`:

```typescript
import {
  getMySubscription,
  getSubscription,
  addSubscriptionItem,
  cancelSubscriptionItem,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  getSubscriptionInvoices,
  corsHandler as subscriptionCorsHandler,
} from "./ucp/subscriptions";

// Subscription routes
http.route({
  path: "/api/ucp/subscriptions",
  method: "GET",
  handler: getMySubscription,
});

http.route({
  path: "/api/ucp/subscriptions",
  method: "OPTIONS",
  handler: subscriptionCorsHandler,
});

http.route({
  pathPrefix: "/api/ucp/subscriptions/",
  method: "GET",
  handler: getSubscription,
});

http.route({
  pathPrefix: "/api/ucp/subscriptions/",
  method: "POST",
  handler: addSubscriptionItem, // Handles /subscriptions/:id/items and action endpoints
});

http.route({
  pathPrefix: "/api/ucp/subscriptions/",
  method: "DELETE",
  handler: cancelSubscriptionItem,
});

http.route({
  pathPrefix: "/api/ucp/subscriptions/",
  method: "OPTIONS",
  handler: subscriptionCorsHandler,
});
```

---

### 6.5 MCP Tools for Subscriptions

Add MCP tools for AI agent subscription management.

Add to `admin-app/packages/backend/convex/mcp/tools.ts`:

```typescript
// ============================================
// SUBSCRIPTION TOOLS
// ============================================

/**
 * MCP Tool: subscription_get_status
 * Get user's subscription status
 */
export const subscriptionGetStatus = action({
  args: {
    subscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MCPToolResult<any>> => {
    try {
      let subscription;

      if (args.subscriptionId) {
        subscription = await ctx.runQuery(api.subscriptions.subscriptions.get, {
          subscriptionId: args.subscriptionId as Id<"subscriptions">,
        });
      } else {
        subscription = await ctx.runQuery(api.subscriptions.subscriptions.getMySubscription, {});
      }

      if (!subscription) {
        return {
          success: true,
          data: {
            hasSubscription: false,
            message: "No active subscription found",
          },
        };
      }

      return {
        success: true,
        data: {
          hasSubscription: true,
          subscriptionId: subscription._id.toString(),
          subscriptionNumber: subscription.subscriptionNumber,
          status: subscription.status,
          monthlyTotal: subscription.monthlyTotal,
          currentPeriodEnd: subscription.currentPeriodEnd,
          itemCount: subscription.items?.length ?? 0,
          items: subscription.items?.map((item: any) => ({
            id: item._id.toString(),
            productName: item.productName,
            price: item.price,
            status: item.status,
          })),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "SUBSCRIPTION_ERROR",
          message: error.message ?? "Failed to get subscription status",
        },
      };
    }
  },
});

/**
 * MCP Tool: subscription_add_item
 * Add a product to user's subscription
 */
export const subscriptionAddItem = action({
  args: {
    subscriptionId: v.optional(v.string()),
    productId: v.string(),
    quantity: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MCPToolResult<any>> => {
    try {
      // Get subscription ID if not provided
      let subscriptionId = args.subscriptionId;

      if (!subscriptionId) {
        const subscription = await ctx.runQuery(
          api.subscriptions.subscriptions.getMySubscription,
          {}
        );
        if (!subscription) {
          return {
            success: false,
            error: {
              code: "NO_SUBSCRIPTION",
              message: "User does not have an active subscription. Create one through checkout first.",
            },
          };
        }
        subscriptionId = subscription._id.toString();
      }

      const result = await ctx.runMutation(api.subscriptions.items.add, {
        subscriptionId: subscriptionId as Id<"subscriptions">,
        productId: args.productId as Id<"products">,
        quantity: args.quantity ?? 1,
      });

      return {
        success: true,
        data: {
          itemId: result.itemId.toString(),
          proratedAmount: result.proratedAmount,
          message: `Added item to subscription. Prorated charge: $${(result.proratedAmount / 100).toFixed(2)}`,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "ADD_ITEM_ERROR",
          message: error.message ?? "Failed to add item to subscription",
        },
      };
    }
  },
});

/**
 * MCP Tool: subscription_cancel_item
 * Cancel/remove an item from subscription
 */
export const subscriptionCancelItem = action({
  args: {
    itemId: v.string(),
    cancelImmediately: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<MCPToolResult<any>> => {
    try {
      const result = await ctx.runMutation(api.subscriptions.items.cancel, {
        itemId: args.itemId as Id<"subscription_items">,
        cancelImmediately: args.cancelImmediately ?? false,
      });

      return {
        success: true,
        data: {
          success: true,
          cancelsAt: result.cancelsAt,
          message: args.cancelImmediately
            ? "Item removed from subscription immediately"
            : `Item will be removed at end of billing period (${new Date(result.cancelsAt).toLocaleDateString()})`,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "CANCEL_ITEM_ERROR",
          message: error.message ?? "Failed to cancel subscription item",
        },
      };
    }
  },
});

/**
 * MCP Tool: subscription_pause
 * Pause user's subscription
 */
export const subscriptionPause = action({
  args: {
    subscriptionId: v.optional(v.string()),
    resumeDate: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MCPToolResult<any>> => {
    try {
      let subscriptionId = args.subscriptionId;

      if (!subscriptionId) {
        const subscription = await ctx.runQuery(
          api.subscriptions.subscriptions.getMySubscription,
          {}
        );
        if (!subscription) {
          return {
            success: false,
            error: {
              code: "NO_SUBSCRIPTION",
              message: "User does not have an active subscription",
            },
          };
        }
        subscriptionId = subscription._id.toString();
      }

      const result = await ctx.runMutation(api.subscriptions.subscriptions.pause, {
        subscriptionId: subscriptionId as Id<"subscriptions">,
        resumeDate: args.resumeDate,
      });

      return {
        success: true,
        data: {
          success: true,
          resumeDate: result.resumeDate,
          message: result.resumeDate
            ? `Subscription paused. Will automatically resume on ${new Date(result.resumeDate).toLocaleDateString()}`
            : "Subscription paused until manually resumed",
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "PAUSE_ERROR",
          message: error.message ?? "Failed to pause subscription",
        },
      };
    }
  },
});

/**
 * MCP Tool: subscription_resume
 * Resume a paused subscription
 */
export const subscriptionResume = action({
  args: {
    subscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MCPToolResult<any>> => {
    try {
      let subscriptionId = args.subscriptionId;

      if (!subscriptionId) {
        const subscription = await ctx.runQuery(
          api.subscriptions.subscriptions.getMySubscription,
          {}
        );
        if (!subscription) {
          return {
            success: false,
            error: {
              code: "NO_SUBSCRIPTION",
              message: "User does not have a subscription",
            },
          };
        }
        subscriptionId = subscription._id.toString();
      }

      await ctx.runMutation(api.subscriptions.subscriptions.resume, {
        subscriptionId: subscriptionId as Id<"subscriptions">,
      });

      return {
        success: true,
        data: {
          success: true,
          message: "Subscription has been resumed",
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "RESUME_ERROR",
          message: error.message ?? "Failed to resume subscription",
        },
      };
    }
  },
});

/**
 * MCP Tool: subscription_cancel
 * Cancel user's subscription
 */
export const subscriptionCancel = action({
  args: {
    subscriptionId: v.optional(v.string()),
    cancelImmediately: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MCPToolResult<any>> => {
    try {
      let subscriptionId = args.subscriptionId;

      if (!subscriptionId) {
        const subscription = await ctx.runQuery(
          api.subscriptions.subscriptions.getMySubscription,
          {}
        );
        if (!subscription) {
          return {
            success: false,
            error: {
              code: "NO_SUBSCRIPTION",
              message: "User does not have a subscription",
            },
          };
        }
        subscriptionId = subscription._id.toString();
      }

      const result = await ctx.runMutation(api.subscriptions.subscriptions.cancel, {
        subscriptionId: subscriptionId as Id<"subscriptions">,
        cancelImmediately: args.cancelImmediately ?? false,
        reason: args.reason,
      });

      return {
        success: true,
        data: {
          success: true,
          cancelsAt: result.cancelsAt,
          message: args.cancelImmediately
            ? "Subscription cancelled immediately"
            : `Subscription will be cancelled at end of billing period (${new Date(result.cancelsAt).toLocaleDateString()})`,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "CANCEL_ERROR",
          message: error.message ?? "Failed to cancel subscription",
        },
      };
    }
  },
});

/**
 * MCP Tool: subscription_list_invoices
 * Get subscription invoice history
 */
export const subscriptionListInvoices = action({
  args: {
    subscriptionId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<MCPToolResult<any>> => {
    try {
      let subscriptionId = args.subscriptionId;

      if (!subscriptionId) {
        const subscription = await ctx.runQuery(
          api.subscriptions.subscriptions.getMySubscription,
          {}
        );
        if (!subscription) {
          return {
            success: true,
            data: {
              invoices: [],
              message: "No subscription found",
            },
          };
        }
        subscriptionId = subscription._id.toString();
      }

      const invoices = await ctx.runQuery(api.subscriptions.invoices.listBySubscription, {
        subscriptionId: subscriptionId as Id<"subscriptions">,
        limit: args.limit ?? 10,
      });

      return {
        success: true,
        data: {
          invoices: invoices.map((inv: any) => ({
            id: inv._id.toString(),
            invoiceNumber: inv.invoiceNumber,
            amount: inv.amount,
            status: inv.status,
            periodStart: inv.periodStart,
            periodEnd: inv.periodEnd,
            paidAt: inv.paidAt,
            pdfUrl: inv.invoicePdfUrl,
          })),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "LIST_INVOICES_ERROR",
          message: error.message ?? "Failed to list invoices",
        },
      };
    }
  },
});
```

#### Update MCP registry

Add tool definitions to `admin-app/packages/backend/convex/mcp/registry.ts`:

```typescript
// Add these tool definitions to the registry

{
  name: "subscription_get_status",
  description: "Get the current user's subscription status including active items and billing info",
  inputSchema: {
    type: "object",
    properties: {
      subscriptionId: {
        type: "string",
        description: "Optional subscription ID. If not provided, gets current user's subscription",
      },
    },
  },
},
{
  name: "subscription_add_item",
  description: "Add a product/service to the user's subscription. Creates prorated charge.",
  inputSchema: {
    type: "object",
    properties: {
      subscriptionId: {
        type: "string",
        description: "Optional subscription ID",
      },
      productId: {
        type: "string",
        description: "Product ID to add",
      },
      quantity: {
        type: "number",
        description: "Quantity to add (default: 1)",
      },
    },
    required: ["productId"],
  },
},
{
  name: "subscription_cancel_item",
  description: "Cancel/remove an item from the subscription",
  inputSchema: {
    type: "object",
    properties: {
      itemId: {
        type: "string",
        description: "Subscription item ID to cancel",
      },
      cancelImmediately: {
        type: "boolean",
        description: "If true, removes immediately. Otherwise, cancels at period end.",
      },
    },
    required: ["itemId"],
  },
},
{
  name: "subscription_pause",
  description: "Pause the user's subscription billing",
  inputSchema: {
    type: "object",
    properties: {
      subscriptionId: {
        type: "string",
        description: "Optional subscription ID",
      },
      resumeDate: {
        type: "number",
        description: "Unix timestamp for auto-resume date",
      },
    },
  },
},
{
  name: "subscription_resume",
  description: "Resume a paused subscription",
  inputSchema: {
    type: "object",
    properties: {
      subscriptionId: {
        type: "string",
        description: "Optional subscription ID",
      },
    },
  },
},
{
  name: "subscription_cancel",
  description: "Cancel the user's subscription",
  inputSchema: {
    type: "object",
    properties: {
      subscriptionId: {
        type: "string",
        description: "Optional subscription ID",
      },
      cancelImmediately: {
        type: "boolean",
        description: "If true, cancels immediately. Otherwise, cancels at period end.",
      },
      reason: {
        type: "string",
        description: "Optional cancellation reason",
      },
    },
  },
},
{
  name: "subscription_list_invoices",
  description: "Get the user's subscription invoice history",
  inputSchema: {
    type: "object",
    properties: {
      subscriptionId: {
        type: "string",
        description: "Optional subscription ID",
      },
      limit: {
        type: "number",
        description: "Max invoices to return (default: 10)",
      },
    },
  },
},
```

---

### 6.6 Email Notification Templates

Create email templates for subscription events.

Create `admin-app/packages/backend/convex/subscriptions/emails.ts`:

```typescript
/**
 * Subscription Email Templates
 *
 * Templates for subscription-related transactional emails.
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id, Doc } from "../_generated/dataModel";

// ============================================
// EMAIL TEMPLATES
// ============================================

interface SubscriptionEmailData {
  customerName: string;
  customerEmail: string;
  subscriptionNumber: string;
  monthlyTotal: number;
  items: Array<{
    name: string;
    price: number;
  }>;
  nextBillingDate?: number;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ============================================
// EMAIL SENDERS
// ============================================

/**
 * Send subscription created email
 */
export const sendSubscriptionCreated = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) return;

    const user = await ctx.db.get(subscription.userId);
    if (!user) return;

    const items = await ctx.db
      .query("subscription_items")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId).eq("status", "active")
      )
      .collect();

    const itemsWithProducts = await Promise.all(
      items.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        return {
          name: product?.name ?? "Unknown",
          price: item.priceOverride ?? item.price,
        };
      })
    );

    const subject = `Welcome to Your Team - Subscription ${subscription.subscriptionNumber}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .item-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .total-row { font-weight: bold; font-size: 18px; padding-top: 15px; }
    .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Your Team!</h1>
    </div>
    <div class="content">
      <p>Hi ${user.firstName ?? "there"},</p>
      <p>Your subscription has been created successfully. Here's what's included:</p>

      <h3>Your Team Members</h3>
      ${itemsWithProducts.map(item => `
        <div class="item-row">
          <span>${item.name}</span>
          <span>${formatCurrency(item.price)}/mo</span>
        </div>
      `).join("")}

      <div class="item-row total-row">
        <span>Monthly Total</span>
        <span>${formatCurrency(subscription.monthlyTotal)}</span>
      </div>

      <p style="margin-top: 20px;">
        <strong>Next billing date:</strong> ${formatDate(subscription.currentPeriodEnd)}
      </p>

      <a href="${process.env.SITE_URL}/account/subscriptions" class="button">
        Manage Your Team
      </a>
    </div>
    <div class="footer">
      <p>Questions? Reply to this email or contact support.</p>
      <p>Subscription #${subscription.subscriptionNumber}</p>
    </div>
  </div>
</body>
</html>
    `;

    // Queue email
    await ctx.runMutation(internal.email.queue, {
      to: user.email,
      subject,
      html,
      type: "subscription_created",
      relatedId: args.subscriptionId,
    });
  },
});

/**
 * Send subscription item added email
 */
export const sendItemAdded = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    itemId: v.id("subscription_items"),
    proratedAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) return;

    const user = await ctx.db.get(subscription.userId);
    if (!user) return;

    const item = await ctx.db.get(args.itemId);
    if (!item) return;

    const product = await ctx.db.get(item.productId);

    const subject = `Team Member Added - ${product?.name ?? "New Item"}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .highlight { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Team Member Added!</h1>
    </div>
    <div class="content">
      <p>Hi ${user.firstName ?? "there"},</p>
      <p>A new team member has been added to your subscription:</p>

      <div class="highlight">
        <h3 style="margin-top: 0;">${product?.name ?? "New Item"}</h3>
        <p><strong>Monthly price:</strong> ${formatCurrency(item.price)}</p>
        ${args.proratedAmount > 0 ? `<p><strong>Prorated charge today:</strong> ${formatCurrency(args.proratedAmount)}</p>` : ""}
      </div>

      <p><strong>New monthly total:</strong> ${formatCurrency(subscription.monthlyTotal)}</p>

      <a href="${process.env.SITE_URL}/account/subscriptions" class="button">
        View Your Team
      </a>
    </div>
    <div class="footer">
      <p>Subscription #${subscription.subscriptionNumber}</p>
    </div>
  </div>
</body>
</html>
    `;

    await ctx.runMutation(internal.email.queue, {
      to: user.email,
      subject,
      html,
      type: "subscription_item_added",
      relatedId: args.itemId,
    });
  },
});

/**
 * Send subscription item cancelled email
 */
export const sendItemCancelled = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    itemId: v.id("subscription_items"),
    cancelsAt: v.number(),
    immediate: v.boolean(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) return;

    const user = await ctx.db.get(subscription.userId);
    if (!user) return;

    const item = await ctx.db.get(args.itemId);
    if (!item) return;

    const product = await ctx.db.get(item.productId);

    const subject = `Team Member Cancelled - ${product?.name ?? "Item"}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #EF4444; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .highlight { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Team Member Cancelled</h1>
    </div>
    <div class="content">
      <p>Hi ${user.firstName ?? "there"},</p>
      <p>The following team member has been cancelled from your subscription:</p>

      <div class="highlight">
        <h3 style="margin-top: 0;">${product?.name ?? "Item"}</h3>
        ${args.immediate
          ? `<p>This item has been removed immediately.</p>`
          : `<p>This item will be removed on <strong>${formatDate(args.cancelsAt)}</strong>.</p>
             <p>You'll continue to have access until then.</p>`
        }
      </div>

      <p>Your updated subscription will reflect this change on your next invoice.</p>

      <a href="${process.env.SITE_URL}/account/subscriptions" class="button">
        Manage Your Team
      </a>
    </div>
    <div class="footer">
      <p>Want to add them back? You can do so from your team dashboard.</p>
      <p>Subscription #${subscription.subscriptionNumber}</p>
    </div>
  </div>
</body>
</html>
    `;

    await ctx.runMutation(internal.email.queue, {
      to: user.email,
      subject,
      html,
      type: "subscription_item_cancelled",
      relatedId: args.itemId,
    });
  },
});

/**
 * Send payment failed email
 */
export const sendPaymentFailed = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    amount: v.number(),
    failureReason: v.optional(v.string()),
    retryDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) return;

    const user = await ctx.db.get(subscription.userId);
    if (!user) return;

    const subject = `Action Required: Payment Failed for Your Team`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #F59E0B; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .alert { background: #FEF3C7; border: 1px solid #F59E0B; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Payment Failed</h1>
    </div>
    <div class="content">
      <p>Hi ${user.firstName ?? "there"},</p>

      <div class="alert">
        <p><strong>We couldn't process your payment of ${formatCurrency(args.amount)}.</strong></p>
        ${args.failureReason ? `<p>Reason: ${args.failureReason}</p>` : ""}
      </div>

      <p>To keep your team active, please update your payment method.</p>

      ${args.retryDate ? `<p>We'll automatically retry the payment on <strong>${formatDate(args.retryDate)}</strong>.</p>` : ""}

      <a href="${process.env.SITE_URL}/account/subscriptions/${args.subscriptionId}/payment" class="button">
        Update Payment Method
      </a>
    </div>
    <div class="footer">
      <p>If you have questions, please contact support.</p>
      <p>Subscription #${subscription.subscriptionNumber}</p>
    </div>
  </div>
</body>
</html>
    `;

    await ctx.runMutation(internal.email.queue, {
      to: user.email,
      subject,
      html,
      type: "subscription_payment_failed",
      relatedId: args.subscriptionId,
    });
  },
});

/**
 * Send subscription cancelled email
 */
export const sendSubscriptionCancelled = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    cancelsAt: v.number(),
    immediate: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) return;

    const user = await ctx.db.get(subscription.userId);
    if (!user) return;

    const subject = args.immediate
      ? `Your Team Subscription Has Been Cancelled`
      : `Your Team Subscription Will End on ${formatDate(args.cancelsAt)}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #6B7280; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .highlight { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>We're Sorry to See You Go</h1>
    </div>
    <div class="content">
      <p>Hi ${user.firstName ?? "there"},</p>

      ${args.immediate
        ? `<p>Your subscription has been cancelled effective immediately.</p>`
        : `<p>Your subscription has been scheduled for cancellation.</p>
           <div class="highlight">
             <p><strong>Access until:</strong> ${formatDate(args.cancelsAt)}</p>
             <p>You'll continue to have full access to your team until this date.</p>
           </div>`
      }

      ${!args.immediate ? `
        <p>Changed your mind? You can reactivate your subscription anytime before ${formatDate(args.cancelsAt)}.</p>
        <a href="${process.env.SITE_URL}/account/subscriptions" class="button">
          Reactivate Subscription
        </a>
      ` : ""}

      <p style="margin-top: 30px;">We'd love to know why you're leaving. Your feedback helps us improve.</p>
    </div>
    <div class="footer">
      <p>Thank you for being a customer.</p>
      <p>Subscription #${subscription.subscriptionNumber}</p>
    </div>
  </div>
</body>
</html>
    `;

    await ctx.runMutation(internal.email.queue, {
      to: user.email,
      subject,
      html,
      type: "subscription_cancelled",
      relatedId: args.subscriptionId,
    });
  },
});

/**
 * Send upcoming invoice reminder
 */
export const sendUpcomingInvoice = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    invoiceDate: v.number(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) return;

    const user = await ctx.db.get(subscription.userId);
    if (!user) return;

    const items = await ctx.db
      .query("subscription_items")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId).eq("status", "active")
      )
      .collect();

    const itemsWithProducts = await Promise.all(
      items.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        return {
          name: product?.name ?? "Unknown",
          price: item.priceOverride ?? item.price,
        };
      })
    );

    const subject = `Upcoming Invoice - ${formatCurrency(args.amount)} on ${formatDate(args.invoiceDate)}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .item-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .total-row { font-weight: bold; font-size: 18px; padding-top: 15px; }
    .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Upcoming Invoice</h1>
    </div>
    <div class="content">
      <p>Hi ${user.firstName ?? "there"},</p>
      <p>Your next invoice is scheduled for <strong>${formatDate(args.invoiceDate)}</strong>.</p>

      <h3>Invoice Summary</h3>
      ${itemsWithProducts.map(item => `
        <div class="item-row">
          <span>${item.name}</span>
          <span>${formatCurrency(item.price)}</span>
        </div>
      `).join("")}

      <div class="item-row total-row">
        <span>Total</span>
        <span>${formatCurrency(args.amount)}</span>
      </div>

      <p style="margin-top: 20px;">
        Need to make changes? Update your team before the billing date.
      </p>

      <a href="${process.env.SITE_URL}/account/subscriptions" class="button">
        Manage Your Team
      </a>
    </div>
    <div class="footer">
      <p>Subscription #${subscription.subscriptionNumber}</p>
    </div>
  </div>
</body>
</html>
    `;

    await ctx.runMutation(internal.email.queue, {
      to: user.email,
      subject,
      html,
      type: "subscription_upcoming_invoice",
      relatedId: args.subscriptionId,
    });
  },
});
```

---

## Verification Checklist

After completing Phase 6:

### Checkout Integration
- [ ] Cart correctly identifies subscription vs one-time items
- [ ] `getCartAnalysis` returns proper breakdown
- [ ] Checkout start populates subscription fields on session
- [ ] Checkout complete creates subscription for subscription items
- [ ] Checkout complete adds to existing subscription when appropriate
- [ ] One-time items still create orders correctly
- [ ] Mixed carts (subscription + one-time) work correctly

### UCP REST API
- [ ] `GET /api/ucp/subscriptions` returns current user's subscription
- [ ] `GET /api/ucp/subscriptions/:id` returns specific subscription
- [ ] `POST /api/ucp/subscriptions/:id/items` adds item
- [ ] `DELETE /api/ucp/subscriptions/:id/items/:itemId` cancels item
- [ ] `POST /api/ucp/subscriptions/:id/pause` pauses subscription
- [ ] `POST /api/ucp/subscriptions/:id/resume` resumes subscription
- [ ] `POST /api/ucp/subscriptions/:id/cancel` cancels subscription
- [ ] `GET /api/ucp/subscriptions/:id/invoices` returns invoices
- [ ] CORS headers work correctly
- [ ] Error responses follow UCP format

### MCP Tools
- [ ] `subscription_get_status` returns correct data
- [ ] `subscription_add_item` adds items with proration
- [ ] `subscription_cancel_item` handles immediate and period-end
- [ ] `subscription_pause` pauses with optional resume date
- [ ] `subscription_resume` resumes paused subscriptions
- [ ] `subscription_cancel` handles immediate and period-end
- [ ] `subscription_list_invoices` returns invoice history
- [ ] Tools registered in MCP registry

### Email Notifications
- [ ] Subscription created email sends
- [ ] Item added email sends with proration info
- [ ] Item cancelled email sends
- [ ] Payment failed email sends
- [ ] Subscription cancelled email sends
- [ ] Upcoming invoice reminder sends
- [ ] All emails render correctly

---

## Integration Notes

### Existing Code Modified

| File | Modification |
|------|--------------|
| `cart.ts` | Added `getCartAnalysis` query |
| `checkout.ts` | Modified `start` and `complete` mutations |
| `http.ts` | Added subscription UCP routes |
| `mcp/tools.ts` | Added subscription tools |
| `mcp/registry.ts` | Added tool definitions |

### New Files Created

| File | Purpose |
|------|---------|
| `ucp/subscriptions.ts` | UCP REST handlers |
| `subscriptions/emails.ts` | Email templates |

### Things to Watch

1. **Mixed Carts** - Test carts with both subscription and one-time items thoroughly
2. **Existing Subscriptions** - Ensure "add to existing" flow works
3. **Email Queue** - Verify email system is configured before enabling
4. **Stripe Webhooks** - Ensure webhook handlers from Phase 3 are working

---

## Not Covered (Future Work)

1. **Credit System Integration** - Fields exist but not active
2. **Usage Metering** - Not part of initial implementation
3. **Advanced Dunning** - Basic retry only; advanced dunning sequences are future
4. **Work Summary Attachments** - Placeholder fields ready for future

---

## Estimated Effort

| Task | Time |
|------|------|
| Cart subscription detection | 1-2 hours |
| Checkout modifications | 2-3 hours |
| UCP REST endpoints | 2-3 hours |
| MCP tools | 2-3 hours |
| Email templates | 2-3 hours |
| Testing & verification | 2-3 hours |
| **Total** | **11-17 hours (2-3 days)** |

---

**Previous Phase:** [Phase 5: Admin Dashboard](./05-PHASE-ADMIN-DASHBOARD.md)

**Implementation Complete!** Return to [Overview](./00-OVERVIEW.md) for full checklist.
