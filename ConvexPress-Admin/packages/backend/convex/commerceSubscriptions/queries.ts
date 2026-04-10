// @ts-nocheck
/**
 * Commerce Subscriptions — Queries
 *
 * Ported from VexCart subscriptions.ts queries, adapted to ConvexPress
 * schema (commerce_subscription_* tables) and auth patterns.
 *
 * Functions:
 *   - listTemplates         Admin list of subscription templates
 *   - getTemplate           Get single template by ID
 *   - resolveProductConfig  Resolve effective subscription config for a product
 *   - listMySubscriptions   Customer's own subscriptions (website)
 *   - list                  Admin list all subscriptions
 *   - getById               Subscription detail with items, history, entitlements, invoices
 *   - getMetrics            Dashboard stats (MRR, ARR, churn, counts)
 *   - listInvoices          Admin list subscription invoices
 *   - getInvoice            Get single invoice with items
 *   - listEntitlements      List entitlements for a subscription or user
 *   - checkEntitlement      Check if a user has an active entitlement code
 */

import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceSubscriptionsEnabled } from "./helpers";
import {
  commerceSubscriptionStatusValidator,
  commerceSubscriptionInvoiceStatusValidator,
} from "../schema/commerceSubscriptions";

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Resolve effective subscription config for a product
// ═══════════════════════════════════════════════════════════════════════════

type BillingInterval = "week" | "month" | "year";

const DEFAULT_DUNNING_POLICY = {
  maxAttempts: 3,
  retryIntervalsDays: [1, 3, 7],
  cancelAfterFinalFailure: true,
};

async function getProductOverride(ctx: any, productId: any) {
  return ctx.db
    .query("commerce_product_subscription_overrides")
    .withIndex("by_product", (q: any) => q.eq("productId", productId))
    .first();
}

async function resolveEffectiveConfig(ctx: any, product: any, explicitTemplateId?: any) {
  const override = await getProductOverride(ctx, product._id);
  const configuredTemplateId = explicitTemplateId ?? override?.templateId ?? undefined;

  let template: any = null;
  if (configuredTemplateId) {
    template = await ctx.db.get(configuredTemplateId);
  }
  if (!template) {
    // Try to find an active template as default
    const templates = await ctx.db
      .query("commerce_subscription_templates")
      .withIndex("by_status", (q: any) => q.eq("status", "active"))
      .first();
    template = templates;
  }

  const billingInterval: BillingInterval =
    override?.overrideBillingInterval ?? template?.billingInterval ?? "month";
  const billingIntervalCount =
    override?.overrideBillingIntervalCount ?? template?.billingIntervalCount ?? 1;
  const trialDays = override?.overrideTrialDays ?? template?.trialDays;
  const gracePeriodDays = override?.overrideGracePeriodDays ?? template?.gracePeriodDays ?? 3;
  const pausable = override?.overridePausable ?? template?.pausable ?? true;
  const cancelAtPeriodEndDefault = template?.cancelAtPeriodEndDefault ?? true;

  const unitPrice = override?.overridePriceAmount ?? product.basePrice ?? 0;

  return {
    isSubscriptionEnabled: override?.isSubscriptionEnabled ?? Boolean(template),
    allowOneTimePurchase: override?.allowOneTimePurchase ?? true,
    templateId: template?._id,
    templateVersion: template?.version,
    unitPrice,
    currencyCode: override?.overrideCurrencyCode ?? product.currencyCode ?? "USD",
    billingInterval,
    billingIntervalCount,
    trialDays,
    gracePeriodDays,
    pausable,
    cancelAtPeriodEndDefault,
    dunningPolicy: DEFAULT_DUNNING_POLICY,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List subscription templates (admin).
 */
export const listTemplates = query({
  args: {
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    ),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let templates = await ctx.db
      .query("commerce_subscription_templates")
      .collect();
    templates = templates.sort((a: any, b: any) => b.createdAt - a.createdAt);
    if (args.status) {
      templates = templates.filter((t: any) => t.status === args.status);
    }
    return templates;
  },
});

/**
 * Get a single subscription template by ID.
 */
export const getTemplate = query({
  args: {
    templateId: v.id("commerce_subscription_templates"),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    return ctx.db.get(args.templateId);
  },
});

/**
 * Resolve effective subscription configuration for a product.
 * Merges template defaults with product-level overrides.
 */
export const resolveProductConfig = query({
  args: {
    productId: v.id("commerce_products"),
    templateId: v.optional(v.id("commerce_subscription_templates")),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);

    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");

    const override = await getProductOverride(ctx, product._id);
    const config = await resolveEffectiveConfig(ctx, product, args.templateId);

    return {
      productId: product._id,
      productTitle: product.title ?? product.name,
      templateId: config.templateId,
      templateVersion: config.templateVersion,
      config,
      override,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List current user's subscriptions (customer-facing, website).
 */
export const listMySubscriptions = query({
  args: {
    status: v.optional(commerceSubscriptionStatusValidator),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    let subscriptions = await ctx.db
      .query("commerce_subscriptions")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    if (args.status) {
      subscriptions = subscriptions.filter((sub: any) => sub.status === args.status);
    }

    return Promise.all(
      subscriptions.map(async (subscription: any) => {
        const product = await ctx.db.get(subscription.productId);
        const entitlements = await ctx.db
          .query("commerce_subscription_entitlements")
          .withIndex("by_subscription", (q: any) =>
            q.eq("subscriptionId", subscription._id),
          )
          .collect();

        return {
          ...subscription,
          product: product
            ? {
                _id: product._id,
                title: product.title ?? product.name,
                slug: product.slug,
              }
            : null,
          entitlements,
        };
      }),
    );
  },
});

/**
 * List all subscriptions (admin).
 */
export const list = query({
  args: {
    status: v.optional(commerceSubscriptionStatusValidator),
    customerId: v.optional(v.id("commerce_customer_profiles")),
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const limit = args.limit ?? 100;
    let subscriptions: any[] = [];

    if (args.customerId) {
      subscriptions = await ctx.db
        .query("commerce_subscriptions")
        .withIndex("by_customer", (q: any) =>
          q.eq("customerId", args.customerId),
        )
        .collect();
    } else if (args.userId) {
      subscriptions = await ctx.db
        .query("commerce_subscriptions")
        .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
        .collect();
    } else if (args.status) {
      subscriptions = await ctx.db
        .query("commerce_subscriptions")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .collect();
    } else {
      subscriptions = await ctx.db
        .query("commerce_subscriptions")
        .collect();
    }

    subscriptions = subscriptions
      .sort((a: any, b: any) => b.createdAt - a.createdAt)
      .slice(0, limit);

    return Promise.all(
      subscriptions.map(async (subscription: any) => {
        const customer = subscription.customerId
          ? await ctx.db.get(subscription.customerId)
          : null;
        const product = await ctx.db.get(subscription.productId);
        return {
          ...subscription,
          customer: customer
            ? {
                _id: customer._id,
                email: customer.email,
                firstName: customer.firstName,
                lastName: customer.lastName,
              }
            : null,
          product: product
            ? {
                _id: product._id,
                title: product.title ?? product.name,
                slug: product.slug,
              }
            : null,
        };
      }),
    );
  },
});

/**
 * Get subscription detail with items, history, entitlements, and invoices.
 * Accessible by admin or the owning customer.
 */
export const getById = query({
  args: {
    subscriptionId: v.id("commerce_subscriptions"),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) return null;

    const user = await getCurrentUser(ctx);
    if (!user) return null;

    // Check access: admin or subscription owner
    let isAdmin = false;
    try {
      await requireCan(ctx, "manage_options");
      isAdmin = true;
    } catch {
      // Not admin — check ownership
    }

    if (!isAdmin && user._id !== subscription.userId) {
      return null;
    }

    const items = await ctx.db
      .query("commerce_subscription_items")
      .withIndex("by_subscription", (q: any) =>
        q.eq("subscriptionId", args.subscriptionId),
      )
      .collect();

    const history = await ctx.db
      .query("commerce_subscription_history")
      .withIndex("by_subscription", (q: any) =>
        q.eq("subscriptionId", args.subscriptionId),
      )
      .collect();

    const entitlements = await ctx.db
      .query("commerce_subscription_entitlements")
      .withIndex("by_subscription", (q: any) =>
        q.eq("subscriptionId", args.subscriptionId),
      )
      .collect();

    const invoices = await ctx.db
      .query("commerce_subscription_invoices")
      .withIndex("by_subscription", (q: any) =>
        q.eq("subscriptionId", args.subscriptionId),
      )
      .collect();

    const product = await ctx.db.get(subscription.productId);
    const template = subscription.templateId
      ? await ctx.db.get(subscription.templateId)
      : null;

    return {
      ...subscription,
      product: product
        ? { _id: product._id, title: product.title ?? product.name, slug: product.slug }
        : null,
      template: template
        ? { _id: template._id, title: template.title, slug: template.slug }
        : null,
      items,
      history: history.sort((a: any, b: any) => b.createdAt - a.createdAt),
      entitlements,
      invoices: invoices.sort((a: any, b: any) => b.createdAt - a.createdAt),
    };
  },
});

/**
 * Subscription dashboard metrics (admin).
 */
export const getMetrics = query({
  args: {},
  handler: async (ctx) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const now = Date.now();
    const subscriptions = await ctx.db
      .query("commerce_subscriptions")
      .collect();

    const activeLike = subscriptions.filter(
      (sub: any) => sub.status === "active" || sub.status === "trialing",
    );
    const paused = subscriptions.filter((sub: any) => sub.status === "paused");
    const pastDue = subscriptions.filter((sub: any) => sub.status === "past_due");
    const cancelled = subscriptions.filter(
      (sub: any) => sub.status === "cancelled",
    );

    // Monthly Recurring Revenue — sum recurring amount for monthly-billed active subs
    const mrr = activeLike.reduce((sum: number, sub: any) => {
      const amount = sub.recurringAmount ?? 0;
      // Normalize to monthly
      if (sub.currencyCode) {
        // We just sum the raw amounts; proper currency normalization
        // would require exchange rates which we don't have here.
      }
      return sum + amount;
    }, 0);
    const arr = mrr * 12;

    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const startedLast30 = subscriptions.filter(
      (sub: any) => sub.createdAt >= thirtyDaysAgo,
    ).length;
    const cancelledLast30 = cancelled.filter(
      (sub: any) => (sub.cancelledAt ?? 0) >= thirtyDaysAgo,
    ).length;

    return {
      total: subscriptions.length,
      active: activeLike.length,
      paused: paused.length,
      pastDue: pastDue.length,
      cancelled: cancelled.length,
      mrr,
      arr,
      startedLast30,
      cancelledLast30,
      churnRate30d:
        startedLast30 > 0 ? (cancelledLast30 / startedLast30) * 100 : 0,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// INVOICE QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List subscription invoices (admin, or filtered by subscription).
 */
export const listInvoices = query({
  args: {
    subscriptionId: v.optional(v.id("commerce_subscriptions")),
    status: v.optional(commerceSubscriptionInvoiceStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const limit = args.limit ?? 100;
    let invoices: any[] = [];

    if (args.subscriptionId) {
      invoices = await ctx.db
        .query("commerce_subscription_invoices")
        .withIndex("by_subscription", (q: any) =>
          q.eq("subscriptionId", args.subscriptionId),
        )
        .collect();
    } else if (args.status) {
      invoices = await ctx.db
        .query("commerce_subscription_invoices")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .collect();
    } else {
      invoices = await ctx.db
        .query("commerce_subscription_invoices")
        .collect();
    }

    invoices = invoices
      .sort((a: any, b: any) => b.createdAt - a.createdAt)
      .slice(0, limit);

    return Promise.all(
      invoices.map(async (invoice: any) => {
        const subscription = await ctx.db.get(invoice.subscriptionId);
        return {
          ...invoice,
          subscription: subscription
            ? {
                _id: subscription._id,
                status: subscription.status,
                productId: subscription.productId,
              }
            : null,
        };
      }),
    );
  },
});

/**
 * Get a single invoice with its line items.
 */
export const getInvoice = query({
  args: {
    invoiceId: v.id("commerce_subscription_invoices"),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;

    // Access check: admin or subscription owner
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    let isAdmin = false;
    try {
      await requireCan(ctx, "manage_options");
      isAdmin = true;
    } catch {
      // Not admin
    }

    if (!isAdmin) {
      const subscription = await ctx.db.get(invoice.subscriptionId);
      if (!subscription || subscription.userId !== user._id) return null;
    }

    const items = await ctx.db
      .query("commerce_subscription_invoice_items")
      .withIndex("by_invoice", (q: any) => q.eq("invoiceId", args.invoiceId))
      .collect();

    return { ...invoice, items };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// ENTITLEMENT QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List entitlements for a subscription or user.
 */
export const listEntitlements = query({
  args: {
    subscriptionId: v.optional(v.id("commerce_subscriptions")),
    userId: v.optional(v.id("users")),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("grace"),
        v.literal("revoked"),
        v.literal("expired"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);

    let entitlements: any[] = [];

    if (args.subscriptionId) {
      entitlements = await ctx.db
        .query("commerce_subscription_entitlements")
        .withIndex("by_subscription", (q: any) =>
          q.eq("subscriptionId", args.subscriptionId),
        )
        .collect();
    } else if (args.userId && args.status) {
      entitlements = await ctx.db
        .query("commerce_subscription_entitlements")
        .withIndex("by_user_status", (q: any) =>
          q.eq("userId", args.userId).eq("status", args.status),
        )
        .collect();
    } else if (args.userId) {
      // Collect all statuses for user
      const statuses = ["active", "grace", "revoked", "expired"] as const;
      for (const s of statuses) {
        const batch = await ctx.db
          .query("commerce_subscription_entitlements")
          .withIndex("by_user_status", (q: any) =>
            q.eq("userId", args.userId).eq("status", s),
          )
          .collect();
        entitlements.push(...batch);
      }
    } else {
      entitlements = await ctx.db
        .query("commerce_subscription_entitlements")
        .collect();
    }

    if (args.status && !args.userId) {
      entitlements = entitlements.filter((e: any) => e.status === args.status);
    }

    return entitlements;
  },
});

/**
 * Check if a user has an active entitlement for a specific code.
 * Used by downstream systems (membership, content gating) to check access.
 */
export const checkEntitlement = query({
  args: {
    userId: v.id("users"),
    entitlementCode: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);

    const activeEntitlements = await ctx.db
      .query("commerce_subscription_entitlements")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .collect();

    const match = activeEntitlements.find(
      (e: any) => e.entitlementCode === args.entitlementCode,
    );

    if (match) {
      return { hasEntitlement: true, entitlement: match };
    }

    // Also check grace period entitlements
    const graceEntitlements = await ctx.db
      .query("commerce_subscription_entitlements")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", args.userId).eq("status", "grace"),
      )
      .collect();

    const graceMatch = graceEntitlements.find(
      (e: any) => e.entitlementCode === args.entitlementCode,
    );

    if (graceMatch) {
      const now = Date.now();
      const stillInGrace = !graceMatch.graceEndsAt || graceMatch.graceEndsAt > now;
      return {
        hasEntitlement: stillInGrace,
        inGracePeriod: true,
        entitlement: graceMatch,
      };
    }

    return { hasEntitlement: false, entitlement: null };
  },
});
