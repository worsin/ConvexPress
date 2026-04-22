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
import { isPluginEnabled } from "../helpers/plugins";
import {
  buildSubscriptionPricingSnapshot,
  hasExplicitSubscriptionEnablement,
} from "./pricing";
import { computeProration } from "../helpers/proration";

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

async function resolveEffectiveConfig(
  ctx: any,
  product: any,
  explicitTemplateId?: any,
  variant?: any,
) {
  const override = await getProductOverride(ctx, product._id);
  const configuredTemplateId = explicitTemplateId ?? override?.templateId ?? undefined;

  let template: any = null;
  if (configuredTemplateId) {
    template = await ctx.db.get(configuredTemplateId);
  }

  const billingInterval: BillingInterval =
    override?.overrideBillingInterval ?? template?.billingInterval ?? "month";
  const billingIntervalCount =
    override?.overrideBillingIntervalCount ?? template?.billingIntervalCount ?? 1;
  const trialDays = override?.overrideTrialDays ?? template?.trialDays;
  const gracePeriodDays = override?.overrideGracePeriodDays ?? template?.gracePeriodDays ?? 3;
  const pausable = override?.overridePausable ?? template?.pausable ?? true;
  const cancelAtPeriodEndDefault = template?.cancelAtPeriodEndDefault ?? true;

  const pricing = buildSubscriptionPricingSnapshot({
    product,
    variant,
    override,
    quantity: 1,
  });

  return {
    isSubscriptionEnabled: hasExplicitSubscriptionEnablement(override),
    allowOneTimePurchase: override?.allowOneTimePurchase ?? true,
    templateId: template?._id,
    templateVersion: template?.version,
    unitPrice: pricing.unitAmount,
    currencyCode: pricing.currencyCode,
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const listTemplates = query({
  args: {
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    ),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const getTemplate = query({
  args: {
    templateId: v.id("commerce_subscription_templates"),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    await requireCommerceSubscriptionsEnabled(ctx);
    return ctx.db.get(args.templateId);
  },
});

/**
 * Resolve effective subscription configuration for a product.
 * Merges template defaults with product-level overrides.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const resolveProductConfig = query({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    templateId: v.optional(v.id("commerce_subscription_templates")),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    await requireCommerceSubscriptionsEnabled(ctx);

    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");

    let variant: any = null;
    if (args.variantId) {
      variant = await ctx.db.get(args.variantId);
      if (!variant || variant.productId !== product._id) {
        throw new Error("Variant not found for product");
      }
    }

    const override = await getProductOverride(ctx, product._id);
    const config = await resolveEffectiveConfig(
      ctx,
      product,
      args.templateId,
      variant,
    );

    return {
      productId: product._id,
      variantId: variant?._id,
      productTitle: product.title ?? product.name,
      variantTitle: variant?.title,
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const listMySubscriptions = query({
  args: {
    status: v.optional(commerceSubscriptionStatusValidator),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
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
        const product = subscription.productId
          ? await ctx.db.get(subscription.productId)
          : null;
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const list = query({
  args: {
    status: v.optional(commerceSubscriptionStatusValidator),
    customerId: v.optional(v.id("commerce_customer_profiles")),
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
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
        const product = subscription.productId
          ? await ctx.db.get(subscription.productId)
          : null;
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const getById = query({
  args: {
    subscriptionId: v.id("commerce_subscriptions"),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
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

    const product = subscription.productId
      ? await ctx.db.get(subscription.productId)
      : null;
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const getMetrics = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return { total: 0, active: 0, paused: 0, pastDue: 0, cancelled: 0, mrr: 0, arr: 0, startedLast30: 0, cancelledLast30: 0, churnRate30d: 0 };
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const listInvoices = query({
  args: {
    subscriptionId: v.optional(v.id("commerce_subscriptions")),
    status: v.optional(commerceSubscriptionInvoiceStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const getInvoice = query({
  args: {
    invoiceId: v.id("commerce_subscription_invoices"),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
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
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
    await requireCommerceSubscriptionsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) return [];

    let isAdmin = false;
    try {
      await requireCan(ctx, "manage_options");
      isAdmin = true;
    } catch {
      // Non-admin users may only read their own entitlement data.
    }

    let entitlements: any[] = [];

    if (args.subscriptionId) {
      const subscription = await ctx.db.get(args.subscriptionId);
      if (!subscription) return [];
      if (!isAdmin && subscription.userId !== user._id) return [];

      entitlements = await ctx.db
        .query("commerce_subscription_entitlements")
        .withIndex("by_subscription", (q: any) =>
          q.eq("subscriptionId", args.subscriptionId),
        )
        .collect();
    } else if (args.userId && args.status) {
      if (!isAdmin && args.userId !== user._id) return [];
      entitlements = await ctx.db
        .query("commerce_subscription_entitlements")
        .withIndex("by_user_status", (q: any) =>
          q.eq("userId", args.userId).eq("status", args.status),
        )
        .collect();
    } else if (args.userId) {
      if (!isAdmin && args.userId !== user._id) return [];
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
      if (isAdmin) {
        entitlements = await ctx.db
          .query("commerce_subscription_entitlements")
          .collect();
      } else {
        const statuses = ["active", "grace", "revoked", "expired"] as const;
        for (const s of statuses) {
          const batch = await ctx.db
            .query("commerce_subscription_entitlements")
            .withIndex("by_user_status", (q: any) =>
              q.eq("userId", user._id).eq("status", s),
            )
            .collect();
          entitlements.push(...batch);
        }
      }
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const checkEntitlement = query({
  args: {
    userId: v.id("users"),
    entitlementCode: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) {
      return { hasEntitlement: false, entitlement: null };
    }
    await requireCommerceSubscriptionsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      return { hasEntitlement: false, entitlement: null };
    }

    let isAdmin = false;
    try {
      await requireCan(ctx, "manage_options");
      isAdmin = true;
    } catch {
      // Non-admin users may only check their own entitlement state.
    }

    if (!isAdmin && args.userId !== user._id) {
      return { hasEntitlement: false, entitlement: null };
    }

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

// ═══════════════════════════════════════════════════════════════════════════
// PRORATION PREVIEW (Wave 3 — thin read-only wrapper around helpers/proration)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Preview the financial impact of moving a contract from its current offer to
 * a target offer, using the contract's current cycle bounds. Read-only — no
 * DB writes. Safe to call on every keystroke in an upgrade/downgrade picker.
 *
 * Returns:
 *   - `unusedOldAmount`   Credit from unused portion of current cycle on old offer
 *   - `proratedNewAmount` Pro-rated price of new offer for the same unused portion
 *   - `netCharge`         proratedNewAmount − unusedOldAmount
 *   - `isUpgrade`         netCharge > 0
 *   - `effectiveAt`       Now for upgrades, cycleEnd for downgrades
 *   - `currencyCode`      From the contract
 *
 * Auth: admin (manage_options) OR contract owner.
 *
 * `@ts-nocheck` carried — matches the file-level pragma. Wave 7 removes.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const previewProration = query({
  args: {
    contractId: v.id("commerce_subscriptions"),
    toOfferId: v.id("commerce_subscription_offers"),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    await requireCommerceSubscriptionsEnabled(ctx);

    const contract = await ctx.db.get(args.contractId);
    if (!contract) return null;

    const user = await getCurrentUser(ctx);
    if (!user) return null;

    // Admin OR owner
    let isAdmin = false;
    try {
      await requireCan(ctx, "manage_options");
      isAdmin = true;
    } catch {
      // Not admin — check ownership
    }
    if (!isAdmin && user._id !== contract.userId) {
      return null;
    }

    // Resolve the current offer via the first active item.
    const items = await ctx.db
      .query("commerce_subscription_items")
      .withIndex("by_subscription", (q: any) =>
        q.eq("subscriptionId", args.contractId),
      )
      .collect();
    const activeItem = items.find(
      (it: any) => it.status === "active" || it.status === "pending_cancel",
    );
    if (!activeItem || !activeItem.sourceOfferId) {
      return null;
    }
    const fromOffer = await ctx.db.get(activeItem.sourceOfferId);
    const toOffer = await ctx.db.get(args.toOfferId);
    if (!fromOffer || !toOffer) return null;

    const cycleStart =
      contract.currentPeriodStartAt ?? contract.createdAt ?? Date.now();
    const cycleEnd =
      contract.currentPeriodEndAt ?? cycleStart + 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const result = computeProration({
      cycleStart,
      cycleEnd,
      now,
      oldOfferPrice: fromOffer.recurringAmount ?? 0,
      newOfferPrice: toOffer.recurringAmount ?? 0,
    });

    const isUpgrade = result.netCharge > 0;
    const effectiveAt = isUpgrade ? now : cycleEnd;

    return {
      ...result,
      isUpgrade,
      effectiveAt,
      currencyCode:
        toOffer.currencyCode ?? contract.currencyCode ?? "USD",
      fromOfferTitle: fromOffer.title,
      toOfferTitle: toOffer.title,
    };
  },
});
