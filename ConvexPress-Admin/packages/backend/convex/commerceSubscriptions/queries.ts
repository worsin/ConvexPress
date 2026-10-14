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

import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceSubscriptionsEnabled } from "./helpers";
import { dunningPolicyFor } from "./lifecycle";
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

import { commerceSubscriptionsDocs } from "../schema/commerceSubscriptions.docs.generated";
// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Resolve effective subscription config for a product
// ═══════════════════════════════════════════════════════════════════════════

type BillingInterval = NonNullable<Doc<"commerce_subscriptions">["billingInterval"]>;
type DunningAttemptStatus = Doc<"commerce_subscription_dunning_attempts">["status"];


const DUNNING_STATUS_RANK: Record<DunningAttemptStatus, number> = {
  processing: 0,
  scheduled: 1,
  failed: 2,
  aborted: 3,
  succeeded: 4,
};

function isDunningAttemptStatus(value: unknown): value is DunningAttemptStatus {
  return typeof value === "string" && value in DUNNING_STATUS_RANK;
}

const productSummaryValidator = v.object({
  _id: v.id("commerce_products"),
  title: v.string(),
  slug: v.string(),
});

const customerSummaryValidator = v.object({
  _id: v.id("commerce_customer_profiles"),
  email: v.string(),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
});

function productSummary(product: Doc<"commerce_products"> | null) {
  return product
    ? { _id: product._id, title: product.title, slug: product.slug }
    : null;
}

function customerSummary(customer: Doc<"commerce_customer_profiles"> | null) {
  return customer
    ? {
        _id: customer._id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
      }
    : null;
}

async function getProductOverride(ctx: QueryCtx, productId: Id<"commerce_products">) {
  return ctx.db
    .query("commerce_product_subscription_overrides")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .first();
}

async function resolveEffectiveConfig(
  ctx: QueryCtx,
  product: Doc<"commerce_products">,
  explicitTemplateId?: Id<"commerce_subscription_templates">,
  variant?: Doc<"commerce_product_variants"> | null,
) {
  const override = await getProductOverride(ctx, product._id);
  const configuredTemplateId = explicitTemplateId ?? override?.templateId ?? undefined;

  let template: Doc<"commerce_subscription_templates"> | null = null;
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
  const dunningPolicy = dunningPolicyFor(template ?? null);

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
    dunningPolicy: {
      // The first charge plus each retry.
      maxAttempts: dunningPolicy.retryIntervalsDays.length + 1,
      retryIntervalsDays: [...dunningPolicy.retryIntervalsDays],
      cancelAfterFinalFailure: dunningPolicy.cancelAfterFinalFailure,
    },
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
  returns: v.union(v.null(), v.array(commerceSubscriptionsDocs.commerce_subscription_templates)),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let templates = await ctx.db
      .query("commerce_subscription_templates")
      .collect();
    templates = templates.sort((a, b) => b.createdAt - a.createdAt);
    if (args.status) {
      templates = templates.filter((t) => t.status === args.status);
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
  returns: v.union(v.null(), commerceSubscriptionsDocs.commerce_subscription_templates),
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
export const resolveProductConfig = query({
  args: {
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    templateId: v.optional(v.id("commerce_subscription_templates")),
  },
  returns: v.union(v.null(), v.object({
    productId: v.id("commerce_products"),
    variantId: v.optional(v.id("commerce_product_variants")),
    productTitle: v.string(),
    variantTitle: v.optional(v.string()),
    templateId: v.optional(v.id("commerce_subscription_templates")),
    templateVersion: v.optional(v.number()),
    config: v.object({
      isSubscriptionEnabled: v.boolean(),
      allowOneTimePurchase: v.boolean(),
      templateId: v.optional(v.id("commerce_subscription_templates")),
      templateVersion: v.optional(v.number()),
      unitPrice: v.number(),
      currencyCode: v.string(),
      billingInterval: v.union(v.literal("year"), v.literal("month"), v.literal("day"), v.literal("week")),
      billingIntervalCount: v.number(),
      trialDays: v.optional(v.number()),
      gracePeriodDays: v.number(),
      pausable: v.boolean(),
      cancelAtPeriodEndDefault: v.boolean(),
      dunningPolicy: v.object({
        maxAttempts: v.number(),
        retryIntervalsDays: v.array(v.number()),
        cancelAfterFinalFailure: v.boolean(),
      }),
    }),
    override: v.union(v.null(), commerceSubscriptionsDocs.commerce_product_subscription_overrides),
  })),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    await requireCommerceSubscriptionsEnabled(ctx);

    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found");

    let variant: Doc<"commerce_product_variants"> | null = null;
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
      productTitle: product.title,
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
export const listMySubscriptions = query({
  args: {
    status: v.optional(commerceSubscriptionStatusValidator),
  },
  returns: v.union(
    v.null(),
    v.array(
      commerceSubscriptionsDocs.commerce_subscriptions.extend({
        product: v.union(v.null(), productSummaryValidator),
        entitlements: v.array(commerceSubscriptionsDocs.commerce_subscription_entitlements),
      }),
    ),
  ),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    await requireCommerceSubscriptionsEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    let subscriptions = await ctx.db
      .query("commerce_subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    if (args.status) {
      subscriptions = subscriptions.filter((sub) => sub.status === args.status);
    }

    return Promise.all(
      subscriptions.map(async (subscription) => {
        const product = subscription.productId
          ? await ctx.db.get(subscription.productId)
          : null;
        const entitlements = await ctx.db
          .query("commerce_subscription_entitlements")
          .withIndex("by_subscription", (q) =>
            q.eq("subscriptionId", subscription._id),
          )
          .collect();

        return {
          ...subscription,
          product: productSummary(product),
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
  returns: v.array(
    commerceSubscriptionsDocs.commerce_subscriptions.extend({
      customer: v.union(v.null(), customerSummaryValidator),
      product: v.union(v.null(), productSummaryValidator),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const limit = args.limit ?? 100;
    let subscriptions: Doc<"commerce_subscriptions">[] = [];

    if (args.customerId) {
      subscriptions = await ctx.db
        .query("commerce_subscriptions")
        .withIndex("by_customer", (q) =>
          q.eq("customerId", args.customerId),
        )
        .collect();
    } else if (args.userId) {
      subscriptions = await ctx.db
        .query("commerce_subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();
    } else if (args.status) {
      const status = args.status;
      subscriptions = await ctx.db
        .query("commerce_subscriptions")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
    } else {
      subscriptions = await ctx.db
        .query("commerce_subscriptions")
        .collect();
    }

    subscriptions = subscriptions
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    return Promise.all(
      subscriptions.map(async (subscription) => {
        const customer = subscription.customerId
          ? await ctx.db.get(subscription.customerId)
          : null;
        const product = subscription.productId
          ? await ctx.db.get(subscription.productId)
          : null;
        return {
          ...subscription,
          customer: customerSummary(customer),
          product: productSummary(product),
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
  returns: v.union(
    v.null(),
    commerceSubscriptionsDocs.commerce_subscriptions.extend({
      product: v.union(v.null(), productSummaryValidator),
      template: v.union(
        v.null(),
        v.object({
          _id: v.id("commerce_subscription_templates"),
          title: v.string(),
          slug: v.string(),
        }),
      ),
      items: v.array(commerceSubscriptionsDocs.commerce_subscription_items),
      history: v.array(commerceSubscriptionsDocs.commerce_subscription_history),
      entitlements: v.array(commerceSubscriptionsDocs.commerce_subscription_entitlements),
      invoices: v.array(commerceSubscriptionsDocs.commerce_subscription_invoices),
    }),
  ),
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
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId),
      )
      .collect();

    const history = await ctx.db
      .query("commerce_subscription_history")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId),
      )
      .collect();

    const entitlements = await ctx.db
      .query("commerce_subscription_entitlements")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId),
      )
      .collect();

    const invoices = await ctx.db
      .query("commerce_subscription_invoices")
      .withIndex("by_subscription", (q) =>
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
      product: productSummary(product),
      template: template
        ? { _id: template._id, title: template.title, slug: template.slug }
        : null,
      items,
      history: history.sort((a, b) => b.createdAt - a.createdAt),
      entitlements,
      invoices: invoices.sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});

/** What a contract bills per month, in minor units (weeks are 52/12 of a month, days 365/12). */
function monthlyAmount(contract: Pick<Doc<"commerce_subscriptions">, "recurringAmount" | "billingInterval" | "billingIntervalCount">): number {
  const count = contract.billingIntervalCount && contract.billingIntervalCount > 0 ? contract.billingIntervalCount : 1;
  const perInterval = contract.recurringAmount / count;
  switch (contract.billingInterval ?? "month") {
    case "day":
      return Math.round((perInterval * 365) / 12);
    case "week":
      return Math.round((perInterval * 52) / 12);
    case "month":
      return Math.round(perInterval);
    case "year":
      return Math.round(perInterval / 12);
  }
}

/**
 * Subscription dashboard metrics (admin).
 *
 * - active: contracts serving the customer (active, trialing, or cancelling at
 *   period end); pendingCancel is the part of that which will not renew.
 * - mrr: what paying contracts (active, past due, cancelling at period end)
 *   bill per month, every cadence normalised to a month; trials and paused
 *   contracts are not billing. arr = mrr × 12. Currencies are summed as-is.
 * - churnRate30d: percent of the contracts live 30 days ago that have since
 *   ended (cancelled or expired).
 */
export const getMetrics = query({
  args: {},
  returns: v.object({
    total: v.number(),
    active: v.number(),
    paused: v.number(),
    pastDue: v.number(),
    pendingCancel: v.number(),
    cancelled: v.number(),
    mrr: v.number(),
    arr: v.number(),
    startedLast30: v.number(),
    cancelledLast30: v.number(),
    churnRate30d: v.number(),
  }),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) {
      return { total: 0, active: 0, paused: 0, pastDue: 0, pendingCancel: 0, cancelled: 0, mrr: 0, arr: 0, startedLast30: 0, cancelledLast30: 0, churnRate30d: 0 };
    }
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const now = Date.now();
    const windowStart = now - 30 * 24 * 60 * 60 * 1000;
    const subscriptions = (await ctx.db.query("commerce_subscriptions").collect()).filter((sub) => sub.status !== "draft");
    const count = (...statuses: Array<Doc<"commerce_subscriptions">["status"]>) =>
      subscriptions.filter((sub) => statuses.includes(sub.status)).length;
    const ended = (sub: Doc<"commerce_subscriptions">) => sub.status === "cancelled" || sub.status === "expired";

    const mrr = subscriptions
      .filter((sub) => sub.status === "active" || sub.status === "past_due" || sub.status === "pending_cancel")
      .reduce((sum, sub) => sum + monthlyAmount(sub), 0);
    const startedLast30 = subscriptions.filter((sub) => sub.createdAt >= windowStart).length;
    const endedLast30 = subscriptions.filter((sub) => ended(sub) && (sub.cancelledAt ?? 0) >= windowStart);
    const liveAtWindowStart = subscriptions.filter(
      (sub) => sub.createdAt < windowStart && (!ended(sub) || (sub.cancelledAt ?? 0) >= windowStart),
    ).length;
    const churnedFromStart = endedLast30.filter((sub) => sub.createdAt < windowStart).length;

    return {
      total: subscriptions.length,
      active: count("active", "trialing", "pending_cancel"),
      paused: count("paused"),
      pastDue: count("past_due"),
      pendingCancel: count("pending_cancel"),
      cancelled: count("cancelled", "expired"),
      mrr,
      arr: mrr * 12,
      startedLast30,
      cancelledLast30: endedLast30.length,
      churnRate30d: liveAtWindowStart > 0 ? (churnedFromStart / liveAtWindowStart) * 100 : 0,
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
  returns: v.array(
    commerceSubscriptionsDocs.commerce_subscription_invoices.extend({
      subscription: v.union(
        v.null(),
        v.object({
          _id: v.id("commerce_subscriptions"),
          status: commerceSubscriptionStatusValidator,
          productId: v.optional(v.id("commerce_products")),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const limit = args.limit ?? 100;
    let invoices: Doc<"commerce_subscription_invoices">[] = [];

    const { subscriptionId, status } = args;
    if (subscriptionId) {
      invoices = await ctx.db
        .query("commerce_subscription_invoices")
        .withIndex("by_subscription", (q) =>
          q.eq("subscriptionId", subscriptionId),
        )
        .collect();
    } else if (status) {
      invoices = await ctx.db
        .query("commerce_subscription_invoices")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
    } else {
      invoices = await ctx.db
        .query("commerce_subscription_invoices")
        .collect();
    }

    invoices = invoices
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    return Promise.all(
      invoices.map(async (invoice) => {
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
  returns: v.union(
    v.null(),
    commerceSubscriptionsDocs.commerce_subscription_invoices.extend({
      items: v.array(commerceSubscriptionsDocs.commerce_subscription_invoice_items),
    }),
  ),
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
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();

    return { ...invoice, items };
  },
});

/**
 * List dunning attempts with invoice and contract context.
 *
 * This is the admin-facing operational queue for subscription retry state.
 * The cron action writes attempt rows; this query exposes those rows directly
 * instead of approximating dunning from failed invoice status.
 */
export const listDunningAttempts = query({
  args: {
    subscriptionId: v.optional(v.id("commerce_subscriptions")),
    invoiceId: v.optional(v.id("commerce_subscription_invoices")),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.array(
      commerceSubscriptionsDocs.commerce_subscription_dunning_attempts.extend({
        subscription: v.union(v.null(), v.object({
          _id: v.id("commerce_subscriptions"),
          status: v.union(v.literal("draft"), v.literal("active"), v.literal("cancelled"), v.literal("expired"), v.literal("paused"), v.literal("trialing"), v.literal("past_due"), v.literal("pending_cancel")),
          userId: v.optional(v.id("users")),
          customerId: v.optional(v.id("commerce_customer_profiles")),
          customer: v.union(v.null(), v.object({
            _id: v.id("commerce_customer_profiles"),
            email: v.string(),
            firstName: v.optional(v.string()),
            lastName: v.optional(v.string()),
          })),
        })),
        invoice: v.union(v.null(), v.object({
          _id: v.id("commerce_subscription_invoices"),
          status: v.union(v.literal("draft"), v.literal("failed"), v.literal("open"), v.literal("paid"), v.literal("void")),
          currencyCode: v.string(),
          totalAmount: v.number(),
          paymentProvider: v.optional(v.string()),
          dueAt: v.optional(v.number()),
          updatedAt: v.number(),
        })),
      }),
    ),
  ),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const limit = args.limit ?? 200;
    const requestedStatus = isDunningAttemptStatus(args.status)
      ? args.status
      : undefined;
    if (args.status && !requestedStatus) return [];
    let attempts: Doc<"commerce_subscription_dunning_attempts">[] = [];

    const subscriptionId = args.subscriptionId;
    if (subscriptionId) {
      attempts = await ctx.db
        .query("commerce_subscription_dunning_attempts")
        .withIndex("by_subscription", (q) =>
          q.eq("subscriptionId", subscriptionId),
        )
        .collect();
    } else if (requestedStatus) {
      attempts = await ctx.db
        .query("commerce_subscription_dunning_attempts")
        .withIndex("by_status", (q) => q.eq("status", requestedStatus))
        .collect();
    } else {
      attempts = await ctx.db
        .query("commerce_subscription_dunning_attempts")
        .collect();
    }

    if (args.invoiceId) {
      attempts = attempts.filter((attempt) => attempt.invoiceId === args.invoiceId);
    }
    if (requestedStatus && args.subscriptionId) {
      attempts = attempts.filter((attempt) => attempt.status === requestedStatus);
    }

    attempts = attempts
      .sort((a, b) => {
        const statusDelta =
          DUNNING_STATUS_RANK[a.status] - DUNNING_STATUS_RANK[b.status];
        if (statusDelta !== 0) return statusDelta;
        return b.scheduledAt - a.scheduledAt;
      })
      .slice(0, limit);

    return Promise.all(
      attempts.map(async (attempt) => {
        const subscription = await ctx.db.get(attempt.subscriptionId);
        const invoice = attempt.invoiceId ? await ctx.db.get(attempt.invoiceId) : null;

        const customer = subscription?.customerId
          ? await ctx.db.get(subscription.customerId)
          : null;

        return {
          ...attempt,
          subscription: subscription
            ? {
                _id: subscription._id,
                status: subscription.status,
                userId: subscription.userId,
                customerId: subscription.customerId,
                customer: customerSummary(customer),
              }
            : null,
          invoice: invoice
            ? {
                _id: invoice._id,
                status: invoice.status,
                currencyCode: invoice.currencyCode,
                totalAmount: invoice.totalAmount,
                paymentProvider: invoice.paymentProvider,
                dueAt: invoice.dueAt,
                updatedAt: invoice.updatedAt,
              }
            : null,
        };
      }),
    );
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
  returns: v.array(commerceSubscriptionsDocs.commerce_subscription_entitlements),
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

    let entitlements: Doc<"commerce_subscription_entitlements">[] = [];

    const { subscriptionId, userId, status } = args;
    if (subscriptionId) {
      const subscription = await ctx.db.get(subscriptionId);
      if (!subscription) return [];
      if (!isAdmin && subscription.userId !== user._id) return [];

      entitlements = await ctx.db
        .query("commerce_subscription_entitlements")
        .withIndex("by_subscription", (q) =>
          q.eq("subscriptionId", subscriptionId),
        )
        .collect();
    } else if (userId && status) {
      if (!isAdmin && userId !== user._id) return [];
      entitlements = await ctx.db
        .query("commerce_subscription_entitlements")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", status),
        )
        .collect();
    } else if (args.userId) {
      if (!isAdmin && args.userId !== user._id) return [];
      // Collect all statuses for user
      const statuses = ["active", "grace", "revoked", "expired"] as const;
      for (const s of statuses) {
        const batch = await ctx.db
          .query("commerce_subscription_entitlements")
          .withIndex("by_user_status", (q) =>
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
            .withIndex("by_user_status", (q) =>
              q.eq("userId", user._id).eq("status", s),
            )
            .collect();
          entitlements.push(...batch);
        }
      }
    }

    if (args.status && !args.userId) {
      entitlements = entitlements.filter((e) => e.status === args.status);
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
  returns: v.object({
    hasEntitlement: v.boolean(),
    entitlement: v.union(v.null(), commerceSubscriptionsDocs.commerce_subscription_entitlements),
    inGracePeriod: v.optional(v.boolean()),
  }),
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
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .collect();

    const match = activeEntitlements.find(
      (e) => e.entitlementCode === args.entitlementCode,
    );

    if (match) {
      return { hasEntitlement: true, entitlement: match };
    }

    // Also check grace period entitlements
    const graceEntitlements = await ctx.db
      .query("commerce_subscription_entitlements")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "grace"),
      )
      .collect();

    const graceMatch = graceEntitlements.find(
      (e) => e.entitlementCode === args.entitlementCode,
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
 */
export const previewProration = query({
  args: {
    contractId: v.id("commerce_subscriptions"),
    toOfferId: v.id("commerce_subscription_offers"),
  },
  returns: v.union(v.null(), v.object({
    isUpgrade: v.boolean(),
    effectiveAt: v.number(),
    currencyCode: v.string(),
    fromOfferTitle: v.string(),
    toOfferTitle: v.string(),
    daysRemaining: v.number(),
    daysInCycle: v.number(),
    unusedOldAmount: v.number(),
    proratedNewAmount: v.number(),
    netCharge: v.number(),
  })),
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
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.contractId),
      )
      .collect();
    const activeItem = items.find(
      (it) => it.status === "active" || it.status === "pending_cancel",
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


// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: live-charging status (Wave 10.1)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Public query exposing whether real Stripe charging is on for the site.
 * The website signup flow uses this to decide whether to render Stripe
 * Elements or disable paid subscription checkout. Zero-dollar checkouts can
 * still activate through the explicit free provider.
 *
 * Returns `{ live, publishableKey }`. Only the publishable key is exposed
 * — never the secret.
 */
export const getLiveChargingStatus = query({
  args: {},
  returns: v.object({ live: v.boolean(), publishableKey: v.union(v.null(), v.string()) }),
  handler: async (ctx): Promise<{ live: boolean; publishableKey: string | null }> => {
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "commerce.payments"))
      .unique();
    const values = (doc?.values ?? {}) as Record<string, unknown>;
    const live = values.subscriptionChargingEnabled === true;
    const publishableKey =
      typeof values.stripePublishableKey === "string" && (values.stripePublishableKey as string).trim()
        ? (values.stripePublishableKey as string)
        : null;
    return { live, publishableKey };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// ORDER FORMS + FORM SUBMISSIONS ADMIN (Wave 10.3)
// ═══════════════════════════════════════════════════════════════════════════

export const listOrderForms = query({
  args: {},
  returns: v.array(commerceSubscriptionsDocs.commerce_subscription_order_forms),
  handler: async (ctx) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    const rows = await ctx.db
      .query("commerce_subscription_order_forms")
      .order("desc")
      .collect();
    return rows;
  },
});

export const getOrderForm = query({
  args: {
    orderFormId: v.id("commerce_subscription_order_forms"),
  },
  returns: v.union(v.null(), commerceSubscriptionsDocs.commerce_subscription_order_forms),
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    return await ctx.db.get(args.orderFormId);
  },
});

export const listFormSubmissions = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("commerce_subscription_form_submissions"),
    email: v.string(),
    status: v.union(v.literal("draft"), v.literal("approved"), v.literal("expired"), v.literal("rejected"), v.literal("payment_pending"), v.literal("submitted"), v.literal("approval_pending"), v.literal("activated")),
    submittedAt: v.number(),
    formTitle: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    const rows = await ctx.db
      .query("commerce_subscription_form_submissions")
      .order("desc")
      .take(200);
    const withForm = await Promise.all(
      rows.map(async (r) => {
        const form = await ctx.db.get(r.formId);
        return {
          _id: r._id,
          email: r.email ?? "(no email)",
          status: r.status,
          submittedAt: r.createdAt,
          formTitle: form?.title,
        };
      }),
    );
    return withForm;
  },
});

export const getFormSubmission = query({
  args: {
    submissionId: v.id("commerce_subscription_form_submissions"),
  },
  returns: v.union(v.null(), commerceSubscriptionsDocs.commerce_subscription_form_submissions),
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    return await ctx.db.get(args.submissionId);
  },
});
