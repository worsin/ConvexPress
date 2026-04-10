// @ts-nocheck
/**
 * Commerce Subscriptions — Mutations
 *
 * Ported from VexCart subscriptions.ts mutations, adapted to ConvexPress
 * schema (commerce_subscription_* tables) and auth patterns.
 *
 * Functions:
 *   Template & Override CRUD:
 *   - createTemplate           Create subscription template (admin)
 *   - updateTemplate           Update subscription template (admin)
 *   - setProductOverride       Set/update product subscription override (admin)
 *   - removeProductOverride    Remove product subscription override (admin)
 *
 *   Subscription Lifecycle:
 *   - create                   Create subscription (with idempotency, entitlements, history)
 *   - pause                    Pause subscription
 *   - resume                   Resume paused subscription
 *   - scheduleCancel           Schedule cancellation at period end
 *   - cancelNow                Cancel immediately
 *   - updateSubscription       Admin-only subscription field updates
 *
 *   Entitlement Management:
 *   - grantEntitlement         Manually grant entitlement to subscription
 *   - revokeEntitlement        Revoke an entitlement
 */

import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { requireCommerceSubscriptionsEnabled } from "./helpers";
import {
  commerceSubscriptionStatusValidator,
  commerceSubscriptionEntitlementStatusValidator,
} from "../schema/commerceSubscriptions";
import { subscriptionIntervalValidator } from "./validators";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

type BillingInterval = "week" | "month" | "year";
type SubscriptionStatus =
  | "draft"
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "pending_cancel"
  | "cancelled"
  | "expired";

const STATUS_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  draft: ["trialing", "active", "cancelled"],
  trialing: ["active", "past_due", "paused", "pending_cancel", "cancelled", "expired"],
  active: ["past_due", "paused", "pending_cancel", "cancelled", "expired"],
  past_due: ["active", "paused", "pending_cancel", "cancelled", "expired"],
  paused: ["active", "pending_cancel", "cancelled", "expired"],
  pending_cancel: ["active", "cancelled", "expired"],
  cancelled: [],
  expired: [],
};

const DEFAULT_DUNNING_POLICY = {
  maxAttempts: 3,
  retryIntervalsDays: [1, 3, 7],
  cancelAfterFinalFailure: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

function addDays(timestamp: number, days: number): number {
  return timestamp + days * 24 * 60 * 60 * 1000;
}

function addBillingPeriod(
  timestamp: number,
  interval: BillingInterval,
  intervalCount: number,
): number {
  const date = new Date(timestamp);
  if (interval === "week") {
    date.setDate(date.getDate() + 7 * intervalCount);
    return date.getTime();
  }
  if (interval === "month") {
    date.setMonth(date.getMonth() + intervalCount);
    return date.getTime();
  }
  // year
  date.setFullYear(date.getFullYear() + intervalCount);
  return date.getTime();
}

function createCorrelationId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

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
    template = await ctx.db
      .query("commerce_subscription_templates")
      .withIndex("by_status", (q: any) => q.eq("status", "active"))
      .first();
  }

  const billingInterval: BillingInterval =
    override?.overrideBillingInterval ?? template?.billingInterval ?? "month";
  const billingIntervalCount =
    override?.overrideBillingIntervalCount ?? template?.billingIntervalCount ?? 1;
  const trialDays = override?.overrideTrialDays ?? template?.trialDays;
  const gracePeriodDays =
    override?.overrideGracePeriodDays ?? template?.gracePeriodDays ?? 3;
  const pausable = override?.overridePausable ?? template?.pausable ?? true;
  const cancelAtPeriodEndDefault = template?.cancelAtPeriodEndDefault ?? true;

  const unitPrice = override?.overridePriceAmount ?? product.basePrice ?? 0;
  const currencyCode = override?.overrideCurrencyCode ?? product.currencyCode ?? "USD";

  return {
    isSubscriptionEnabled: override?.isSubscriptionEnabled ?? Boolean(template),
    allowOneTimePurchase: override?.allowOneTimePurchase ?? true,
    templateId: template?._id,
    templateVersion: template?.version,
    unitPrice,
    currencyCode,
    billingInterval,
    billingIntervalCount,
    trialDays,
    gracePeriodDays,
    pausable,
    cancelAtPeriodEndDefault,
    dunningPolicy: DEFAULT_DUNNING_POLICY,
  };
}

async function writeHistory(ctx: any, args: any) {
  await ctx.db.insert("commerce_subscription_history", {
    subscriptionId: args.subscriptionId,
    eventType: args.eventType,
    message: args.message ?? args.eventType,
    actorUserId: args.actorUserId,
    metadata: {
      fromStatus: args.fromStatus,
      toStatus: args.toStatus,
      reason: args.reason,
      data: args.data,
      correlationId: args.correlationId,
    },
    createdAt: Date.now(),
  });
}

async function syncEntitlementsForStatus(
  ctx: any,
  subscription: any,
  now: number,
  gracePeriodDays = 3,
) {
  const entitlements = await ctx.db
    .query("commerce_subscription_entitlements")
    .withIndex("by_subscription", (q: any) =>
      q.eq("subscriptionId", subscription._id),
    )
    .collect();

  for (const entitlement of entitlements) {
    if (
      subscription.status === "active" ||
      subscription.status === "trialing"
    ) {
      await ctx.db.patch(entitlement._id, {
        status: "active",
        endsAt: undefined,
        updatedAt: now,
      });
    } else if (
      subscription.status === "past_due" ||
      subscription.status === "paused"
    ) {
      await ctx.db.patch(entitlement._id, {
        status: "grace",
        graceEndsAt: addDays(now, gracePeriodDays),
        updatedAt: now,
      });
    } else if (
      subscription.status === "cancelled" ||
      subscription.status === "expired"
    ) {
      await ctx.db.patch(entitlement._id, {
        status: "revoked",
        endsAt: now,
        updatedAt: now,
      });
    }
  }
}

async function ensureSubscriptionEntitlement(
  ctx: any,
  subscription: any,
  now: number,
) {
  const existing = await ctx.db
    .query("commerce_subscription_entitlements")
    .withIndex("by_subscription", (q: any) =>
      q.eq("subscriptionId", subscription._id),
    )
    .first();

  if (existing) return existing._id;

  return ctx.db.insert("commerce_subscription_entitlements", {
    subscriptionId: subscription._id,
    userId: subscription.userId,
    entitlementCode: `product:${subscription.productId}`,
    status:
      subscription.status === "active" || subscription.status === "trialing"
        ? "active"
        : "grace",
    startsAt: now,
    endsAt: undefined,
    graceEndsAt: undefined,
    metadata: {
      productId: subscription.productId,
      orderId: subscription.orderId,
    },
    createdAt: now,
    updatedAt: now,
  });
}

async function claimIdempotencyKey(ctx: any, key: string | undefined, scope: string) {
  if (!key) return { mode: "none" as const };

  const now = Date.now();
  const existing = await ctx.db
    .query("commerce_subscription_idempotency_keys")
    .withIndex("by_scope_key", (q: any) => q.eq("scope", scope).eq("key", key))
    .first();

  if (existing && existing.expiresAt && existing.expiresAt > now) {
    if (existing.status === "pending") {
      throw new ConvexError({
        code: "DUPLICATE_REQUEST",
        message: "Duplicate request already processing",
      });
    }
    if (existing.status === "completed" && existing.resultRef) {
      return { mode: "replay" as const, response: JSON.parse(existing.resultRef) };
    }
  }

  const id = await ctx.db.insert("commerce_subscription_idempotency_keys", {
    scope,
    key,
    status: "pending",
    payloadHash: undefined,
    resultRef: undefined,
    expiresAt: addDays(now, 2),
    createdAt: now,
    updatedAt: now,
  });

  return { mode: "claimed" as const, id };
}

async function finalizeIdempotency(ctx: any, claim: any, response: any) {
  if (claim.mode !== "claimed") return;
  await ctx.db.patch(claim.id, {
    status: "completed",
    resultRef: JSON.stringify(response),
    updatedAt: Date.now(),
  });
}

async function failIdempotency(ctx: any, claim: any) {
  if (claim.mode !== "claimed") return;
  await ctx.db.patch(claim.id, {
    status: "failed",
    updatedAt: Date.now(),
  });
}

async function transitionSubscription(ctx: any, args: any) {
  const now = Date.now();
  if (args.subscription.status === args.toStatus) return args.subscription;

  if (!canTransition(args.subscription.status, args.toStatus)) {
    throw new ConvexError({
      code: "INVALID_TRANSITION",
      message: `Invalid status transition: ${args.subscription.status} -> ${args.toStatus}`,
    });
  }

  const patch: Record<string, unknown> = {
    status: args.toStatus,
    updatedAt: now,
    ...args.patch,
  };

  if (args.toStatus === "paused") {
    // Mark paused timestamp via history; schema doesn't have pausedAt
  }
  if (args.toStatus === "cancelled" || args.toStatus === "expired") {
    patch.cancelledAt = now;
  }

  await ctx.db.patch(args.subscription._id, patch);
  const updated = await ctx.db.get(args.subscription._id);
  if (!updated) throw new Error("Subscription not found after transition");

  await writeHistory(ctx, {
    subscriptionId: updated._id,
    eventType: "subscription.status_changed",
    actorUserId: args.actorUserId,
    fromStatus: args.subscription.status,
    toStatus: args.toStatus,
    reason: args.reason,
    data: { patch },
    correlationId: args.correlationId,
  });

  // Sync entitlements
  const product = await ctx.db.get(updated.productId);
  if (product) {
    const config = await resolveEffectiveConfig(ctx, product, updated.templateId);
    await syncEntitlementsForStatus(ctx, updated, now, config.gracePeriodDays ?? 3);
  }

  // Emit event
  try {
    await emitEvent(ctx, `commerce.subscription_${args.toStatus}`, "commerce", {
      subscriptionId: updated._id,
      userId: updated.userId,
      fromStatus: args.subscription.status,
      toStatus: args.toStatus,
      reason: args.reason,
    });
  } catch {
    // Event emission is best-effort
  }

  return updated;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE & OVERRIDE MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a subscription template (admin).
 */
export const createTemplate = mutation({
  args: {
    title: v.string(),
    slug: v.string(),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    ),
    billingInterval: subscriptionIntervalValidator,
    billingIntervalCount: v.number(),
    trialDays: v.optional(v.number()),
    gracePeriodDays: v.optional(v.number()),
    pausable: v.boolean(),
    cancelAtPeriodEndDefault: v.boolean(),
    dunningPolicyCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    const actor = await requireCan(ctx, "manage_options");
    const now = Date.now();

    // Check slug uniqueness and determine version
    const existing = await ctx.db
      .query("commerce_subscription_templates")
      .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
      .collect();
    const nextVersion =
      existing.reduce(
        (max: number, t: any) => Math.max(max, t.version ?? 0),
        0,
      ) + 1;

    return ctx.db.insert("commerce_subscription_templates", {
      title: args.title,
      slug: args.slug,
      status: args.status ?? "draft",
      version: nextVersion,
      billingInterval: args.billingInterval,
      billingIntervalCount: args.billingIntervalCount,
      trialDays: args.trialDays,
      gracePeriodDays: args.gracePeriodDays,
      pausable: args.pausable,
      cancelAtPeriodEndDefault: args.cancelAtPeriodEndDefault,
      dunningPolicyCode: args.dunningPolicyCode,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a subscription template (admin).
 */
export const updateTemplate = mutation({
  args: {
    templateId: v.id("commerce_subscription_templates"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    ),
    billingInterval: v.optional(subscriptionIntervalValidator),
    billingIntervalCount: v.optional(v.number()),
    trialDays: v.optional(v.number()),
    gracePeriodDays: v.optional(v.number()),
    pausable: v.optional(v.boolean()),
    cancelAtPeriodEndDefault: v.optional(v.boolean()),
    dunningPolicyCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription template not found.",
      });
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };

    if (args.title !== undefined) patch.title = args.title;
    if (args.slug !== undefined) patch.slug = args.slug;
    if (args.status !== undefined) patch.status = args.status;
    if (args.billingInterval !== undefined) patch.billingInterval = args.billingInterval;
    if (args.billingIntervalCount !== undefined)
      patch.billingIntervalCount = args.billingIntervalCount;
    if (args.trialDays !== undefined) patch.trialDays = args.trialDays;
    if (args.gracePeriodDays !== undefined) patch.gracePeriodDays = args.gracePeriodDays;
    if (args.pausable !== undefined) patch.pausable = args.pausable;
    if (args.cancelAtPeriodEndDefault !== undefined)
      patch.cancelAtPeriodEndDefault = args.cancelAtPeriodEndDefault;
    if (args.dunningPolicyCode !== undefined)
      patch.dunningPolicyCode = args.dunningPolicyCode;

    // Increment version on status or billing changes
    if (
      args.status !== undefined ||
      args.billingInterval !== undefined ||
      args.billingIntervalCount !== undefined
    ) {
      patch.version = (template.version ?? 0) + 1;
    }

    await ctx.db.patch(args.templateId, patch);
    return args.templateId;
  },
});

/**
 * Set/update product subscription override (admin).
 */
export const setProductOverride = mutation({
  args: {
    productId: v.id("commerce_products"),
    templateId: v.optional(v.id("commerce_subscription_templates")),
    isSubscriptionEnabled: v.boolean(),
    allowOneTimePurchase: v.optional(v.boolean()),
    overridePriceAmount: v.optional(v.number()),
    overrideCurrencyCode: v.optional(v.string()),
    overrideBillingInterval: v.optional(subscriptionIntervalValidator),
    overrideBillingIntervalCount: v.optional(v.number()),
    overrideTrialDays: v.optional(v.number()),
    overrideGracePeriodDays: v.optional(v.number()),
    overridePausable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Product not found.",
      });
    }

    if (args.templateId) {
      const template = await ctx.db.get(args.templateId);
      if (!template) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Subscription template not found.",
        });
      }
    }

    const now = Date.now();
    const existing = await getProductOverride(ctx, args.productId);
    const payload = {
      productId: args.productId,
      templateId: args.templateId,
      isSubscriptionEnabled: args.isSubscriptionEnabled,
      allowOneTimePurchase: args.allowOneTimePurchase ?? true,
      overridePriceAmount: args.overridePriceAmount,
      overrideCurrencyCode: args.overrideCurrencyCode,
      overrideBillingInterval: args.overrideBillingInterval,
      overrideBillingIntervalCount: args.overrideBillingIntervalCount,
      overrideTrialDays: args.overrideTrialDays,
      overrideGracePeriodDays: args.overrideGracePeriodDays,
      overridePausable: args.overridePausable,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return ctx.db.insert("commerce_product_subscription_overrides", {
      ...payload,
      createdAt: now,
    });
  },
});

/**
 * Remove product subscription override (admin).
 */
export const removeProductOverride = mutation({
  args: {
    productId: v.id("commerce_products"),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const existing = await getProductOverride(ctx, args.productId);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "No subscription override found for this product.",
      });
    }

    await ctx.db.delete(existing._id);
    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION LIFECYCLE MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a subscription.
 * Supports idempotency, template resolution, entitlement creation, and history tracking.
 */
export const create = mutation({
  args: {
    customerId: v.optional(v.id("commerce_customer_profiles")),
    userId: v.optional(v.id("users")),
    productId: v.id("commerce_products"),
    orderId: v.optional(v.id("commerce_orders")),
    orderItemId: v.optional(v.id("commerce_order_items")),
    templateId: v.optional(v.id("commerce_subscription_templates")),
    quantity: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);

    const correlationId = createCorrelationId();
    const idempotency = await claimIdempotencyKey(
      ctx,
      args.idempotencyKey,
      "subscription.create",
    );
    if (idempotency.mode === "replay") {
      return idempotency.response;
    }

    try {
      const now = Date.now();
      const quantity = Math.max(1, args.quantity ?? 1);
      const actor = await getCurrentUser(ctx);

      let isAdmin = false;
      try {
        await requireCan(ctx, "manage_options");
        isAdmin = true;
      } catch {
        // Not admin
      }

      // Determine userId: use provided or current user
      let userId = args.userId;
      if (!userId) {
        if (!actor) {
          throw new ConvexError({
            code: "UNAUTHORIZED",
            message: "Authentication required to create a subscription.",
          });
        }
        userId = actor._id;
      } else if (!isAdmin) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Admin required to create subscriptions for other users.",
        });
      }

      const product = await ctx.db.get(args.productId);
      if (!product) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Product not found.",
        });
      }

      const config = await resolveEffectiveConfig(ctx, product, args.templateId);
      if (!config.isSubscriptionEnabled) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Product is not configured for subscriptions.",
        });
      }

      const trialDays = config.trialDays ?? 0;
      const status: SubscriptionStatus = trialDays > 0 ? "trialing" : "active";
      const currentPeriodStartAt = now;
      const currentPeriodEndAt =
        trialDays > 0
          ? addDays(now, trialDays)
          : addBillingPeriod(now, config.billingInterval, config.billingIntervalCount);

      const subscriptionId = await ctx.db.insert("commerce_subscriptions", {
        customerId: args.customerId,
        userId,
        productId: args.productId,
        orderId: args.orderId,
        orderItemId: args.orderItemId,
        templateId: config.templateId,
        status,
        currencyCode: config.currencyCode,
        recurringAmount: config.unitPrice * quantity,
        nextBillingAt: currentPeriodEndAt,
        currentPeriodStartAt,
        currentPeriodEndAt,
        trialEndsAt: trialDays > 0 ? currentPeriodEndAt : undefined,
        cancelledAt: undefined,
        createdAt: now,
        updatedAt: now,
      });

      // Create subscription item
      await ctx.db.insert("commerce_subscription_items", {
        subscriptionId,
        productId: args.productId,
        variantId: undefined,
        quantity,
        unitAmount: config.unitPrice,
        currencyCode: config.currencyCode,
        createdAt: now,
        updatedAt: now,
      });

      // Create entitlement
      const createdSubscription = await ctx.db.get(subscriptionId);
      if (!createdSubscription) throw new Error("Subscription creation failed");
      await ensureSubscriptionEntitlement(ctx, createdSubscription, now);

      // Write history
      await writeHistory(ctx, {
        subscriptionId,
        eventType: "subscription.created",
        actorUserId: actor?._id,
        toStatus: status,
        data: {
          templateId: config.templateId,
          templateVersion: config.templateVersion,
          unitPrice: config.unitPrice,
          quantity,
          trialDays,
          orderId: args.orderId,
        },
        correlationId,
      });

      // Emit event
      try {
        await emitEvent(ctx, "commerce.subscription_created", "commerce", {
          subscriptionId,
          userId,
          productId: args.productId,
          status,
          billingInterval: config.billingInterval,
          billingIntervalCount: config.billingIntervalCount,
          recurringAmount: config.unitPrice * quantity,
        });
      } catch {
        // Event emission is best-effort
      }

      const response = {
        subscriptionId,
        status,
        currentPeriodEndAt,
        nextBillingAt: currentPeriodEndAt,
        templateId: config.templateId,
      };

      await finalizeIdempotency(
        ctx,
        idempotency.mode === "claimed" ? idempotency : { mode: "none" },
        response,
      );

      return response;
    } catch (error) {
      await failIdempotency(
        ctx,
        idempotency.mode === "claimed" ? idempotency : { mode: "none" },
      );
      throw error;
    }
  },
});

/**
 * Pause a subscription.
 */
export const pause = mutation({
  args: {
    subscriptionId: v.id("commerce_subscriptions"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    }

    let isAdmin = false;
    try {
      await requireCan(ctx, "manage_options");
      isAdmin = true;
    } catch {
      // Not admin
    }

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription not found.",
      });
    }

    if (!isAdmin && subscription.userId !== user._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Access denied.",
      });
    }

    return transitionSubscription(ctx, {
      subscription,
      toStatus: "paused",
      actorUserId: user._id,
      reason: args.reason,
      correlationId: createCorrelationId(),
      patch: {},
    });
  },
});

/**
 * Resume a paused subscription.
 */
export const resume = mutation({
  args: {
    subscriptionId: v.id("commerce_subscriptions"),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    }

    let isAdmin = false;
    try {
      await requireCan(ctx, "manage_options");
      isAdmin = true;
    } catch {
      // Not admin
    }

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription not found.",
      });
    }

    if (!isAdmin && subscription.userId !== user._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Access denied.",
      });
    }

    const now = Date.now();
    const nextBillingAt =
      (subscription.currentPeriodEndAt ?? 0) < now
        ? addBillingPeriod(
            now,
            (subscription.billingInterval ??
              "month") as BillingInterval,
            subscription.billingIntervalCount ?? 1,
          )
        : subscription.currentPeriodEndAt;

    return transitionSubscription(ctx, {
      subscription,
      toStatus: "active",
      actorUserId: user._id,
      correlationId: createCorrelationId(),
      patch: {
        currentPeriodEndAt: nextBillingAt,
        nextBillingAt,
      },
    });
  },
});

/**
 * Schedule cancellation at period end.
 */
export const scheduleCancel = mutation({
  args: {
    subscriptionId: v.id("commerce_subscriptions"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    }

    let isAdmin = false;
    try {
      await requireCan(ctx, "manage_options");
      isAdmin = true;
    } catch {
      // Not admin
    }

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription not found.",
      });
    }

    if (!isAdmin && subscription.userId !== user._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Access denied.",
      });
    }

    return transitionSubscription(ctx, {
      subscription,
      toStatus: "pending_cancel",
      actorUserId: user._id,
      reason: args.reason,
      correlationId: createCorrelationId(),
      patch: {},
    });
  },
});

/**
 * Cancel a subscription immediately.
 */
export const cancelNow = mutation({
  args: {
    subscriptionId: v.id("commerce_subscriptions"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    }

    let isAdmin = false;
    try {
      await requireCan(ctx, "manage_options");
      isAdmin = true;
    } catch {
      // Not admin
    }

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription not found.",
      });
    }

    if (!isAdmin && subscription.userId !== user._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Access denied.",
      });
    }

    return transitionSubscription(ctx, {
      subscription,
      toStatus: "cancelled",
      actorUserId: user._id,
      reason: args.reason,
      correlationId: createCorrelationId(),
      patch: {},
    });
  },
});

/**
 * Admin-only subscription field updates (e.g. change recurring amount, billing interval).
 */
export const updateSubscription = mutation({
  args: {
    subscriptionId: v.id("commerce_subscriptions"),
    recurringAmount: v.optional(v.number()),
    currencyCode: v.optional(v.string()),
    nextBillingAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    const actor = await requireCan(ctx, "manage_options");

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription not found.",
      });
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };

    if (args.recurringAmount !== undefined) patch.recurringAmount = args.recurringAmount;
    if (args.currencyCode !== undefined) patch.currencyCode = args.currencyCode;
    if (args.nextBillingAt !== undefined) patch.nextBillingAt = args.nextBillingAt;

    await ctx.db.patch(args.subscriptionId, patch);

    await writeHistory(ctx, {
      subscriptionId: args.subscriptionId,
      eventType: "subscription.updated",
      actorUserId: actor._id,
      message: "Subscription fields updated by admin.",
      data: patch,
      correlationId: createCorrelationId(),
    });

    return args.subscriptionId;
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// ENTITLEMENT MANAGEMENT MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Manually grant an entitlement to a subscription (admin).
 */
export const grantEntitlement = mutation({
  args: {
    subscriptionId: v.id("commerce_subscriptions"),
    entitlementCode: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription not found.",
      });
    }

    const now = Date.now();
    const status =
      subscription.status === "active" || subscription.status === "trialing"
        ? "active"
        : "grace";

    return ctx.db.insert("commerce_subscription_entitlements", {
      subscriptionId: args.subscriptionId,
      userId: subscription.userId,
      entitlementCode: args.entitlementCode,
      status,
      startsAt: now,
      endsAt: undefined,
      graceEndsAt: undefined,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Revoke an entitlement (admin).
 */
export const revokeEntitlement = mutation({
  args: {
    entitlementId: v.id("commerce_subscription_entitlements"),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const entitlement = await ctx.db.get(args.entitlementId);
    if (!entitlement) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Entitlement not found.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.entitlementId, {
      status: "revoked",
      endsAt: now,
      updatedAt: now,
    });

    return { success: true };
  },
});
