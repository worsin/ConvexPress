# Phase 3: Core Subscription Mutations

> **Legacy note:** This file was written for the older cart-first/VexCart-style plan. Use `00-OVERVIEW.md` and `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-IMPLEMENTATION-CHECKLIST.md` as the canonical implementation instructions. Keep examples from this file only when they do not conflict with the multi-channel offer/form/contract model.

> **Duration:** 3-4 days
> **Prerequisites:** Phase 1 (Schema), Phase 2 (Templates)
> **Blocks:** Phase 4, Phase 5

---

## Objective

Implement the core business logic for subscription management: creating subscriptions, managing items, handling billing, and processing Stripe webhooks.

---

## Tasks

### 3.1 Subscription Queries

Create `admin-app/packages/backend/convex/subscriptions/subscriptions.ts`:

```typescript
import { query, mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentUser, requireAdminForSubscriptions, generateSubscriptionNumber } from "./helpers";

// ============================================
// QUERIES
// ============================================

/**
 * Get customer's active subscription (singular - container model)
 */
export const getMySubscription = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) =>
        q.eq("userId", user._id).eq("status", "active")
      )
      .first();

    if (!subscription) return null;

    // Get subscription items
    const items = await ctx.db
      .query("subscription_items")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", subscription._id)
      )
      .collect();

    // Enrich items with product data
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        const variant = item.variantId ? await ctx.db.get(item.variantId) : null;
        return { ...item, product, variant };
      })
    );

    // Get template
    const template = await ctx.db.get(subscription.templateId);

    return {
      ...subscription,
      items: enrichedItems,
      template,
    };
  },
});

/**
 * Get subscription by ID (admin or owner)
 */
export const get = query({
  args: { id: v.id("subscriptions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const subscription = await ctx.db.get(args.id);

    if (!subscription) return null;

    // Check access - either owner or admin
    const isOwner = user && subscription.userId === user._id;
    const isAdmin = user?.isInternal;

    if (!isOwner && !isAdmin) {
      throw new Error("Not authorized to view this subscription");
    }

    // Get items
    const items = await ctx.db
      .query("subscription_items")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", subscription._id)
      )
      .collect();

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        const variant = item.variantId ? await ctx.db.get(item.variantId) : null;
        return { ...item, product, variant };
      })
    );

    const template = await ctx.db.get(subscription.templateId);
    const customer = await ctx.db.get(subscription.userId);

    return {
      ...subscription,
      items: enrichedItems,
      template,
      customer,
    };
  },
});

/**
 * List all subscriptions (admin)
 */
export const list = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdminForSubscriptions(ctx);

    let subscriptionsQuery = ctx.db.query("subscriptions");

    if (args.status) {
      subscriptionsQuery = subscriptionsQuery.withIndex("by_status", (q) =>
        q.eq("status", args.status as any)
      );
    }

    const subscriptions = await subscriptionsQuery
      .order("desc")
      .take(args.limit ?? 50);

    // Enrich with customer and item count
    return await Promise.all(
      subscriptions.map(async (sub) => {
        const customer = await ctx.db.get(sub.userId);
        const items = await ctx.db
          .query("subscription_items")
          .withIndex("by_subscription", (q) =>
            q.eq("subscriptionId", sub._id).eq("status", "active")
          )
          .collect();

        return {
          ...sub,
          customer: customer
            ? {
                _id: customer._id,
                email: customer.email,
                firstName: customer.firstName,
                lastName: customer.lastName,
              }
            : null,
          itemCount: items.length,
        };
      })
    );
  },
});

/**
 * Get subscription metrics (admin dashboard)
 */
export const getMetrics = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminForSubscriptions(ctx);

    const activeSubscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const trialingSubscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_status", (q) => q.eq("status", "trialing"))
      .collect();

    const pastDueSubscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_status", (q) => q.eq("status", "past_due"))
      .collect();

    // Calculate MRR
    const mrr = activeSubscriptions.reduce(
      (sum, sub) => sum + sub.monthlyTotal,
      0
    );

    // Get active items count
    const allItems = await ctx.db
      .query("subscription_items")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    return {
      mrr,
      arr: mrr * 12,
      activeSubscriptionCount: activeSubscriptions.length,
      trialingCount: trialingSubscriptions.length,
      pastDueCount: pastDueSubscriptions.length,
      activeItemCount: allItems.length,
      avgItemsPerSubscription:
        activeSubscriptions.length > 0
          ? allItems.length / activeSubscriptions.length
          : 0,
    };
  },
});
```

---

### 3.2 Subscription Creation

Add to `subscriptions.ts`:

```typescript
/**
 * Create subscription from checkout
 * Called when checkout completes with subscription items
 */
export const createFromCheckout = mutation({
  args: {
    userId: v.id("user_profiles"),
    templateId: v.id("subscription_templates"),
    items: v.array(
      v.object({
        productId: v.id("products"),
        variantId: v.optional(v.id("product_variants")),
        price: v.number(),
        setupFee: v.optional(v.number()),
        stripePriceId: v.string(),
      })
    ),
    stripeSubscriptionId: v.string(),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const subscriptionNumber = await generateSubscriptionNumber(ctx);

    // Calculate totals
    const monthlyTotal = args.items.reduce((sum, item) => sum + item.price, 0);
    const setupFeeTotal = args.items.reduce(
      (sum, item) => sum + (item.setupFee || 0),
      0
    );

    // Create subscription
    const subscriptionId = await ctx.db.insert("subscriptions", {
      subscriptionNumber,
      userId: args.userId,
      templateId: args.templateId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripeCustomerId: args.stripeCustomerId,
      billingInterval: "month",
      billingIntervalCount: 1,
      currency: "usd",
      monthlyTotal,
      setupFeeTotal,
      status: "active",
      startDate: now,
      currentPeriodStart: now,
      currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000, // ~30 days
      cancelAtPeriodEnd: false,
      failedPaymentCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Create subscription items
    for (const item of args.items) {
      await ctx.db.insert("subscription_items", {
        subscriptionId,
        productId: item.productId,
        variantId: item.variantId,
        stripeSubscriptionItemId: "", // Will be updated from webhook
        stripePriceId: item.stripePriceId,
        price: item.price,
        setupFee: item.setupFee,
        quantity: 1,
        status: "active",
        addedAt: now,
        cancelAtPeriodEnd: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Update user profile
    await ctx.db.patch(args.userId, {
      activeSubscriptionId: subscriptionId,
      hasActiveSubscription: true,
    });

    // Log history
    await ctx.db.insert("subscription_history", {
      subscriptionId,
      action: "created",
      performedByType: "system",
      details: {
        itemCount: args.items.length,
        monthlyTotal,
        source: "checkout",
      },
      timestamp: now,
    });

    return subscriptionId;
  },
});
```

---

### 3.3 Item Management Mutations

Create `admin-app/packages/backend/convex/subscriptions/items.ts`:

```typescript
import { query, mutation, action } from "../_generated/server";
import { v } from "convex/values";
import { internal, api } from "../_generated/api";
import { getCurrentUser, requireAdminForSubscriptions } from "./helpers";

/**
 * Add item to existing subscription
 */
export const addItem = mutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    productId: v.id("products"),
    variantId: v.optional(v.id("product_variants")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) throw new Error("Subscription not found");

    // Check ownership or admin
    if (subscription.userId !== user._id && !user.isInternal) {
      throw new Error("Not authorized");
    }

    if (subscription.status !== "active" && subscription.status !== "trialing") {
      throw new Error("Cannot add items to inactive subscription");
    }

    // Get product and template
    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");
    if (!product.isSubscriptionEnabled) {
      throw new Error("Product is not subscription-enabled");
    }

    const template = await ctx.db.get(subscription.templateId);
    if (!template) throw new Error("Template not found");

    // Calculate price (with potential overrides)
    const price = product.subscriptionOverrides?.customPrice ?? product.basePrice ?? 0;
    const setupFee = product.subscriptionOverrides?.setupFee ?? template.setupFee ?? 0;

    const now = Date.now();

    // Create item (Stripe item will be created via action)
    const itemId = await ctx.db.insert("subscription_items", {
      subscriptionId: args.subscriptionId,
      productId: args.productId,
      variantId: args.variantId,
      stripeSubscriptionItemId: "", // Will be updated
      stripePriceId: "", // Will be updated
      price,
      setupFee,
      quantity: 1,
      status: "active",
      addedAt: now,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    });

    // Update subscription totals
    const allItems = await ctx.db
      .query("subscription_items")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId).eq("status", "active")
      )
      .collect();

    const newMonthlyTotal = allItems.reduce((sum, item) => sum + item.price, 0);

    await ctx.db.patch(args.subscriptionId, {
      monthlyTotal: newMonthlyTotal,
      updatedAt: now,
    });

    // Log history
    await ctx.db.insert("subscription_history", {
      subscriptionId: args.subscriptionId,
      subscriptionItemId: itemId,
      action: "item_added",
      performedBy: user._id,
      performedByType: user.isInternal ? "admin" : "customer",
      details: {
        productId: args.productId,
        price,
        setupFee,
      },
      timestamp: now,
    });

    return itemId;
  },
});

/**
 * Cancel item from subscription
 */
export const cancelItem = mutation({
  args: {
    itemId: v.id("subscription_items"),
    cancelImmediately: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");

    const subscription = await ctx.db.get(item.subscriptionId);
    if (!subscription) throw new Error("Subscription not found");

    // Check ownership or admin
    if (subscription.userId !== user._id && !user.isInternal) {
      throw new Error("Not authorized");
    }

    if (item.status !== "active") {
      throw new Error("Item is not active");
    }

    const now = Date.now();
    const cancelImmediately = args.cancelImmediately ?? false;

    if (cancelImmediately) {
      // Immediate cancellation
      await ctx.db.patch(args.itemId, {
        status: "canceled",
        canceledAt: now,
        updatedAt: now,
      });
    } else {
      // Cancel at period end
      await ctx.db.patch(args.itemId, {
        status: "pending_cancellation",
        cancelAtPeriodEnd: true,
        updatedAt: now,
      });
    }

    // Recalculate totals if immediate
    if (cancelImmediately) {
      const activeItems = await ctx.db
        .query("subscription_items")
        .withIndex("by_subscription", (q) =>
          q.eq("subscriptionId", subscription._id).eq("status", "active")
        )
        .collect();

      const newMonthlyTotal = activeItems.reduce(
        (sum, i) => sum + i.price,
        0
      );

      await ctx.db.patch(subscription._id, {
        monthlyTotal: newMonthlyTotal,
        updatedAt: now,
      });
    }

    // Log history
    await ctx.db.insert("subscription_history", {
      subscriptionId: subscription._id,
      subscriptionItemId: args.itemId,
      action: "item_canceled",
      performedBy: user._id,
      performedByType: user.isInternal ? "admin" : "customer",
      details: {
        immediate: cancelImmediately,
      },
      timestamp: now,
    });

    return args.itemId;
  },
});

/**
 * Override item price (admin only)
 */
export const overridePrice = mutation({
  args: {
    itemId: v.id("subscription_items"),
    newPrice: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminForSubscriptions(ctx);

    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");

    const now = Date.now();
    const oldPrice = item.priceOverride ?? item.price;

    await ctx.db.patch(args.itemId, {
      priceOverride: args.newPrice,
      priceOverrideReason: args.reason,
      priceOverrideBy: admin._id,
      updatedAt: now,
    });

    // Recalculate subscription total
    const subscription = await ctx.db.get(item.subscriptionId);
    if (subscription) {
      const items = await ctx.db
        .query("subscription_items")
        .withIndex("by_subscription", (q) =>
          q.eq("subscriptionId", subscription._id).eq("status", "active")
        )
        .collect();

      const newMonthlyTotal = items.reduce(
        (sum, i) =>
          sum + (i._id === args.itemId ? args.newPrice : i.priceOverride ?? i.price),
        0
      );

      await ctx.db.patch(subscription._id, {
        monthlyTotal: newMonthlyTotal,
        updatedAt: now,
      });
    }

    // Log history
    await ctx.db.insert("subscription_history", {
      subscriptionId: item.subscriptionId,
      subscriptionItemId: args.itemId,
      action: "item_price_changed",
      performedBy: admin._id,
      performedByType: "admin",
      details: {
        oldPrice,
        newPrice: args.newPrice,
        reason: args.reason,
      },
      timestamp: now,
    });

    return args.itemId;
  },
});
```

---

### 3.4 Subscription Actions (Pause, Resume, Cancel)

Add to `subscriptions.ts`:

```typescript
/**
 * Pause subscription (if allowed)
 */
export const pause = mutation({
  args: { subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) throw new Error("Subscription not found");

    if (subscription.userId !== user._id && !user.isInternal) {
      throw new Error("Not authorized");
    }

    const template = await ctx.db.get(subscription.templateId);
    if (!template?.allowPause) {
      throw new Error("This subscription cannot be paused");
    }

    if (subscription.status !== "active") {
      throw new Error("Only active subscriptions can be paused");
    }

    const now = Date.now();

    await ctx.db.patch(args.subscriptionId, {
      status: "paused",
      pausedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("subscription_history", {
      subscriptionId: args.subscriptionId,
      action: "paused",
      performedBy: user._id,
      performedByType: user.isInternal ? "admin" : "customer",
      timestamp: now,
    });

    return args.subscriptionId;
  },
});

/**
 * Resume paused subscription
 */
export const resume = mutation({
  args: { subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) throw new Error("Subscription not found");

    if (subscription.userId !== user._id && !user.isInternal) {
      throw new Error("Not authorized");
    }

    if (subscription.status !== "paused") {
      throw new Error("Subscription is not paused");
    }

    const now = Date.now();

    await ctx.db.patch(args.subscriptionId, {
      status: "active",
      pausedAt: undefined,
      pauseResumeDate: undefined,
      updatedAt: now,
    });

    await ctx.db.insert("subscription_history", {
      subscriptionId: args.subscriptionId,
      action: "resumed",
      performedBy: user._id,
      performedByType: user.isInternal ? "admin" : "customer",
      timestamp: now,
    });

    return args.subscriptionId;
  },
});

/**
 * Cancel subscription
 */
export const cancel = mutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    cancelImmediately: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) throw new Error("Subscription not found");

    if (subscription.userId !== user._id && !user.isInternal) {
      throw new Error("Not authorized");
    }

    const now = Date.now();
    const cancelImmediately = args.cancelImmediately ?? false;

    if (cancelImmediately) {
      await ctx.db.patch(args.subscriptionId, {
        status: "canceled",
        canceledAt: now,
        updatedAt: now,
      });

      // Update user profile
      await ctx.db.patch(subscription.userId, {
        activeSubscriptionId: undefined,
        hasActiveSubscription: false,
      });
    } else {
      await ctx.db.patch(args.subscriptionId, {
        cancelAtPeriodEnd: true,
        updatedAt: now,
      });
    }

    await ctx.db.insert("subscription_history", {
      subscriptionId: args.subscriptionId,
      action: "canceled",
      performedBy: user._id,
      performedByType: user.isInternal ? "admin" : "customer",
      details: {
        immediate: cancelImmediately,
        reason: args.reason,
      },
      timestamp: now,
    });

    return args.subscriptionId;
  },
});
```

---

### 3.5 Stripe Webhook Handlers

Create `admin-app/packages/backend/convex/subscriptions/webhooks.ts`:

```typescript
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import Stripe from "stripe";

const getStripe = () => {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2023-10-16",
  });
};

/**
 * Handle Stripe subscription webhooks
 */
export const handleStripeSubscriptionWebhook = httpAction(
  async (ctx, request) => {
    const stripe = getStripe();
    const signature = request.headers.get("stripe-signature");
    const body = await request.text();

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature!,
        process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response("Webhook Error", { status: 400 });
    }

    switch (event.type) {
      case "customer.subscription.created":
        await ctx.runMutation(internal.subscriptions.webhooks.handleCreated, {
          stripeSubscription: event.data.object as any,
        });
        break;

      case "customer.subscription.updated":
        await ctx.runMutation(internal.subscriptions.webhooks.handleUpdated, {
          stripeSubscription: event.data.object as any,
        });
        break;

      case "customer.subscription.deleted":
        await ctx.runMutation(internal.subscriptions.webhooks.handleDeleted, {
          stripeSubscriptionId: (event.data.object as any).id,
        });
        break;

      case "invoice.paid":
        await ctx.runMutation(internal.subscriptions.webhooks.handleInvoicePaid, {
          invoice: event.data.object as any,
        });
        break;

      case "invoice.payment_failed":
        await ctx.runMutation(
          internal.subscriptions.webhooks.handleInvoicePaymentFailed,
          { invoice: event.data.object as any }
        );
        break;

      case "customer.subscription.trial_will_end":
        await ctx.runMutation(
          internal.subscriptions.webhooks.handleTrialEnding,
          { stripeSubscription: event.data.object as any }
        );
        break;
    }

    return new Response("OK", { status: 200 });
  }
);

// Internal mutations for webhook processing
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const handleUpdated = internalMutation({
  args: { stripeSubscription: v.any() },
  handler: async (ctx, args) => {
    const stripeSub = args.stripeSubscription;

    // Find our subscription
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_id", (q) =>
        q.eq("stripeSubscriptionId", stripeSub.id)
      )
      .unique();

    if (!subscription) {
      console.error("Subscription not found for Stripe ID:", stripeSub.id);
      return;
    }

    const now = Date.now();

    // Update subscription status and dates
    await ctx.db.patch(subscription._id, {
      status: mapStripeStatus(stripeSub.status),
      currentPeriodStart: stripeSub.current_period_start * 1000,
      currentPeriodEnd: stripeSub.current_period_end * 1000,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      updatedAt: now,
    });
  },
});

export const handleDeleted = internalMutation({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_id", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .unique();

    if (!subscription) return;

    const now = Date.now();

    await ctx.db.patch(subscription._id, {
      status: "canceled",
      canceledAt: now,
      updatedAt: now,
    });

    // Update user profile
    await ctx.db.patch(subscription.userId, {
      activeSubscriptionId: undefined,
      hasActiveSubscription: false,
    });

    await ctx.db.insert("subscription_history", {
      subscriptionId: subscription._id,
      action: "canceled",
      performedByType: "system",
      details: { source: "stripe_webhook" },
      timestamp: now,
    });
  },
});

export const handleInvoicePaid = internalMutation({
  args: { invoice: v.any() },
  handler: async (ctx, args) => {
    const inv = args.invoice;
    if (!inv.subscription) return; // Not a subscription invoice

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_id", (q) =>
        q.eq("stripeSubscriptionId", inv.subscription)
      )
      .unique();

    if (!subscription) return;

    const now = Date.now();

    // Create/update invoice record
    const existingInvoice = await ctx.db
      .query("subscription_invoices")
      .withIndex("by_stripe_id", (q) =>
        q.eq("stripeInvoiceId", inv.id)
      )
      .unique();

    if (existingInvoice) {
      await ctx.db.patch(existingInvoice._id, {
        status: "paid",
        amountPaid: inv.amount_paid,
        amountDue: inv.amount_due,
        paidAt: now,
      });
    } else {
      await ctx.db.insert("subscription_invoices", {
        subscriptionId: subscription._id,
        stripeInvoiceId: inv.id,
        invoiceNumber: inv.number || `INV-${Date.now()}`,
        amount: inv.amount_due,
        amountPaid: inv.amount_paid,
        amountDue: 0,
        currency: inv.currency,
        status: "paid",
        periodStart: inv.period_start * 1000,
        periodEnd: inv.period_end * 1000,
        paidAt: now,
        invoicePdfUrl: inv.invoice_pdf,
        hostedInvoiceUrl: inv.hosted_invoice_url,
        workSummaryAttached: false,
        createdAt: now,
      });
    }

    // Update subscription
    await ctx.db.patch(subscription._id, {
      lastPaymentDate: now,
      failedPaymentCount: 0,
      status: "active",
      updatedAt: now,
    });

    await ctx.db.insert("subscription_history", {
      subscriptionId: subscription._id,
      action: "payment_succeeded",
      performedByType: "system",
      details: { invoiceId: inv.id, amount: inv.amount_paid },
      timestamp: now,
    });
  },
});

export const handleInvoicePaymentFailed = internalMutation({
  args: { invoice: v.any() },
  handler: async (ctx, args) => {
    const inv = args.invoice;
    if (!inv.subscription) return;

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_id", (q) =>
        q.eq("stripeSubscriptionId", inv.subscription)
      )
      .unique();

    if (!subscription) return;

    const now = Date.now();

    await ctx.db.patch(subscription._id, {
      status: "past_due",
      failedPaymentCount: subscription.failedPaymentCount + 1,
      updatedAt: now,
    });

    await ctx.db.insert("subscription_history", {
      subscriptionId: subscription._id,
      action: "payment_failed",
      performedByType: "system",
      details: {
        invoiceId: inv.id,
        attemptCount: subscription.failedPaymentCount + 1,
      },
      timestamp: now,
    });

    // TODO: Trigger notification email
  },
});

function mapStripeStatus(stripeStatus: string): string {
  const statusMap: Record<string, string> = {
    trialing: "trialing",
    active: "active",
    past_due: "past_due",
    unpaid: "unpaid",
    canceled: "canceled",
    incomplete: "active", // Treat as active, payment processing
    incomplete_expired: "canceled",
    paused: "paused",
  };
  return statusMap[stripeStatus] || "active";
}
```

---

### 3.6 Register Webhook Route

Add to `admin-app/packages/backend/convex/http.ts`:

```typescript
import { handleStripeSubscriptionWebhook } from "./subscriptions/webhooks";

// Add to existing http routes
http.route({
  path: "/webhooks/stripe/subscriptions",
  method: "POST",
  handler: handleStripeSubscriptionWebhook,
});
```

---

## Verification Checklist

After completing Phase 3:

- [ ] Can query user's subscription with items
- [ ] Can list all subscriptions (admin)
- [ ] Metrics query returns MRR, counts
- [ ] Can add item to subscription
- [ ] Can cancel item (immediate and at period end)
- [ ] Can override item price (admin)
- [ ] Can pause/resume subscription
- [ ] Can cancel subscription
- [ ] Stripe webhooks update subscription status
- [ ] Invoice records created from webhook
- [ ] History entries logged for all actions

---

## Integration Notes

### Existing Patterns Used

- Query/mutation patterns from existing `orders.ts`, `payments.ts`
- Auth helpers follow existing patterns in `users.ts`
- Webhook handling follows existing `http.ts` structure

### Stripe Webhook Configuration

Need to configure Stripe Dashboard:
1. Add webhook endpoint: `https://your-domain.com/webhooks/stripe/subscriptions`
2. Subscribe to events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `invoice.paid`
   - `invoice.payment_failed`

### Environment Variables

Add to `.env`:
```
STRIPE_SUBSCRIPTION_WEBHOOK_SECRET=whsec_...
```

---

**Next Phase:** [Phase 4: Customer Portal](./04-PHASE-CUSTOMER-PORTAL.md)
