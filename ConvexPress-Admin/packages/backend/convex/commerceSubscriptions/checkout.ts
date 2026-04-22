/**
 * Commerce Subscriptions — Checkout (Wave 5 Task 5.2)
 *
 * Public-facing checkout flow for direct-signup subscriptions. Two-step:
 *
 *   1. `createCheckoutIntent` — validates offer + optional coupon, persists a
 *      `commerce_subscription_checkout_intents` row with status `payment_pending`.
 *      Returns intentId and a payment processor stub descriptor.
 *
 *   2. `activateFromIntent` — called after (stubbed) payment settlement.
 *      Creates the subscription contract + subscription_item + initial
 *      entitlements. Records history. If the intent had a coupon code, seeds
 *      a redemption row. This is the ONLY trusted public activation path —
 *      admin-side `mutations.create` is a separate admin-only provisioning
 *      flow.
 *
 * Payment is intentionally STUBBED. Real Stripe/Paddle/etc. integration
 * lands in Wave 7. The `paymentProcessorData` returned from
 * `createCheckoutIntent` is a placeholder the website uses to decide how to
 * display the payment step; the website currently simulates success and
 * immediately calls `activateFromIntent` with a stub `paymentResult`.
 *
 * `@ts-nocheck` matches the existing subscriptions backend file pattern.
 * Wave 7 removes it across all subscriptions files in one pass.
 */

import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { getCurrentUser } from "../helpers/auth";
import { emitEvent } from "../helpers/events";
import { requirePluginEnabled } from "../helpers/plugins";
import { validateCoupon, initializeRedemption } from "../helpers/coupons";
import { requireCommerceSubscriptionsEnabled } from "./helpers";

// ─── Helpers (duplicated with intentional care; see mutations.ts) ───────────

type BillingInterval = "week" | "month" | "year";

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
  return `ck_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

// ─── createCheckoutIntent ───────────────────────────────────────────────────

/**
 * Validate an offer + optional coupon and persist a checkout intent.
 *
 * May be called by logged-in OR logged-out users. If logged out, `customerEmail`
 * must be supplied so the signup flow can later look up / create the user
 * record. The intent is NOT automatically activated — the caller must call
 * `activateFromIntent` after the (stubbed) payment step.
 *
 * Throws:
 *   - `NOT_FOUND`         — offer id does not exist
 *   - `OFFER_ARCHIVED`    — offer has status=archived
 *   - `VALIDATION_ERROR`  — missing customerEmail for anonymous checkout, or
 *                           coupon validation failure
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const createCheckoutIntent = mutation({
  args: {
    offerId: v.id("commerce_subscription_offers"),
    customerEmail: v.optional(v.string()),
    couponCode: v.optional(v.string()),
    returnUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);

    const now = Date.now();

    // Load the offer; reject if missing or archived.
    const offer = await ctx.db.get(args.offerId);
    if (!offer) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Offer not found.",
      });
    }
    if (offer.status === "archived") {
      throw new ConvexError({
        code: "OFFER_ARCHIVED",
        message: "This offer is no longer available.",
      });
    }

    // Load the template to resolve trial/grace defaults.
    const template = offer.templateId
      ? await ctx.db.get(offer.templateId)
      : null;
    const trialDays =
      offer.trialDaysOverride ?? template?.trialDays ?? 0;

    // Identify the acting user (may be null for logged-out signup).
    const currentUser = await getCurrentUser(ctx);
    const userId = currentUser?._id;

    // Resolve the customer email: prefer the logged-in user's email; else fall
    // back to arg. At least one is required.
    const customerEmail = currentUser?.email ?? args.customerEmail;
    if (!customerEmail) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          "customerEmail is required when creating a checkout intent for an anonymous user.",
      });
    }

    // Validate the coupon code up-front if provided. We don't persist the
    // coupon id here — we just record the code so activation can re-validate
    // before redemption (coupon state might change between steps).
    let couponCodeNormalized: string | undefined = undefined;
    if (args.couponCode && args.couponCode.trim().length > 0) {
      const code = args.couponCode.trim();
      // validateCoupon expects a userId for per-customer-limit checks. If
      // anonymous, we pass a synthetic one (the coupon still validates offer
      // + expiry + max-redemptions caps). The per-customer limit check will be
      // re-run at `activateFromIntent` time once the real user is resolved.
      if (userId) {
        const validation = await validateCoupon(
          ctx,
          code,
          null,
          userId,
          args.offerId,
        );
        if (!validation.valid) {
          throw new ConvexError({
            code: "COUPON_INVALID",
            message: `Coupon cannot be applied: ${validation.reason}.`,
            reason: validation.reason,
          });
        }
      } else {
        // Anonymous: check the non-customer-limit gates only.
        const coupon = await ctx.db
          .query("commerce_subscription_coupons")
          .withIndex("by_code", (q: any) => q.eq("code", code))
          .unique();
        if (!coupon) {
          throw new ConvexError({
            code: "COUPON_INVALID",
            message: "Coupon code not found.",
            reason: "not_found",
          });
        }
        if (coupon.status !== "active") {
          throw new ConvexError({
            code: "COUPON_INVALID",
            message: "Coupon is not active.",
            reason: "not_active",
          });
        }
        if (typeof coupon.expiresAt === "number" && now > coupon.expiresAt) {
          throw new ConvexError({
            code: "COUPON_INVALID",
            message: "Coupon has expired.",
            reason: "expired",
          });
        }
        const offerScope = coupon.offerIds ?? [];
        if (offerScope.length > 0 && !offerScope.includes(args.offerId)) {
          throw new ConvexError({
            code: "COUPON_INVALID",
            message: "Coupon is not valid for this offer.",
            reason: "not_valid_for_offer",
          });
        }
      }
      couponCodeNormalized = code;
    }

    const recurringAmount = offer.recurringAmount ?? 0;
    const setupFeeAmount = offer.setupFeeAmount ?? 0;
    const currencyCode = offer.currencyCode ?? "USD";

    // Compute initialAmount: setup fee + (recurring if no trial, else 0).
    const initialAmount =
      setupFeeAmount + (trialDays > 0 ? 0 : recurringAmount);

    const intentId = await ctx.db.insert(
      "commerce_subscription_checkout_intents",
      {
        sourceChannel: "direct_form",
        status: "payment_pending",
        userId: userId,
        customerId: undefined,
        email: customerEmail,
        orderId: undefined,
        orderItemIds: undefined,
        formId: undefined,
        formSubmissionId: undefined,
        selectedOfferIds: [args.offerId],
        pricingSnapshot: {
          offerId: args.offerId,
          offerSlug: offer.slug,
          offerTitle: offer.title,
          recurringAmount,
          setupFeeAmount,
          currencyCode,
          trialDays,
          couponCode: couponCodeNormalized,
          returnUrl: args.returnUrl,
        },
        initialAmount,
        recurringAmount,
        setupFeeAmount,
        currencyCode,
        paymentProvider: undefined,
        paymentTransactionId: undefined,
        savedPaymentMethodId: undefined,
        subscriptionId: undefined,
        idempotencyKey: undefined,
        // Expire the intent in 1 hour if not activated.
        expiresAt: addDays(now, 0) + 60 * 60 * 1000,
        metadata: {
          couponCode: couponCodeNormalized,
          returnUrl: args.returnUrl,
        },
        createdAt: now,
        updatedAt: now,
      },
    );

    return {
      intentId,
      amount: initialAmount,
      recurringAmount,
      currency: currencyCode,
      trialDays,
      // Wave 7: replace with real Stripe/Paddle client-secret etc.
      paymentProcessorData: {
        provider: "stub",
        message: "Payment integration pending — Wave 7",
      },
    };
  },
});

// ─── activateFromIntent ─────────────────────────────────────────────────────

/**
 * Activate a checkout intent by creating the subscription contract + initial
 * subscription item + entitlements. Idempotent-safe via status check on the
 * intent row: once `status === "activated"` (or anything other than
 * `payment_pending` / `draft`), re-calls throw INTENT_ALREADY_PROCESSED.
 *
 * This is THE public activation path. Admin-side `mutations.create` is a
 * separate flow for back-office provisioning.
 *
 * The `paymentResult` parameter is a stub in Wave 5; Wave 7 wires it to
 * actual payment processor results. For dev, the website passes
 * `{ provider: "stub", providerTransactionId: "stub-<rand>", status: "succeeded" }`.
 *
 * Failure semantics:
 *   - `paymentResult.status === "failed"` → intent marked cancelled,
 *     returns `{ ok: false }`. No contract created.
 *   - anonymous intent with no matching user → throws USER_NOT_FOUND.
 *     Website must complete signup (Clerk) before calling activate.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const activateFromIntent = mutation({
  args: {
    intentId: v.id("commerce_subscription_checkout_intents"),
    paymentResult: v.object({
      provider: v.string(),
      providerTransactionId: v.string(),
      status: v.union(
        v.literal("succeeded"),
        v.literal("pending_settlement"),
        v.literal("failed"),
      ),
      paymentMethodId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);

    const now = Date.now();
    const correlationId = createCorrelationId();

    const intent = await ctx.db.get(args.intentId);
    if (!intent) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Checkout intent not found.",
      });
    }

    // Guard against double-activation. Only pending/draft intents may be
    // activated. Everything else is either already done or already failed.
    if (intent.status !== "payment_pending" && intent.status !== "draft") {
      throw new ConvexError({
        code: "INTENT_ALREADY_PROCESSED",
        message: `Intent is in status "${intent.status}" — cannot activate.`,
        currentStatus: intent.status,
      });
    }

    // Payment failure short-circuit.
    if (args.paymentResult.status === "failed") {
      await ctx.db.patch(args.intentId, {
        status: "failed",
        paymentProvider: args.paymentResult.provider,
        paymentTransactionId: args.paymentResult.providerTransactionId,
        updatedAt: now,
      });
      return {
        ok: false,
        reason: "payment_failed",
      };
    }

    // Resolve offer from selectedOfferIds (Wave 5 single-offer direct signup).
    const offerId = intent.selectedOfferIds?.[0];
    if (!offerId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Intent has no selected offer.",
      });
    }
    const offer = await ctx.db.get(offerId);
    if (!offer) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Offer referenced by intent no longer exists.",
      });
    }

    // Resolve template (may be null if offer.templateId is null — unusual but
    // tolerated).
    const template = offer.templateId
      ? await ctx.db.get(offer.templateId)
      : null;

    // Resolve the acting userId. Prefer intent.userId (set at intent creation
    // if the caller was logged in). Else look up by customerEmail.
    let userId = intent.userId;
    if (!userId) {
      if (!intent.email) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message:
            "Intent has no userId and no customerEmail — cannot resolve user.",
        });
      }
      const existingUser = await ctx.db
        .query("users")
        .withIndex("by_email", (q: any) =>
          q.eq("email", intent.email!.trim().toLowerCase()),
        )
        .first();
      // If not found, throw — the website is expected to complete Clerk signup
      // (which creates/upserts a users row via the Clerk sync webhook) before
      // calling this mutation.
      if (!existingUser) {
        throw new ConvexError({
          code: "USER_NOT_FOUND",
          message:
            "No user record found for this email. Complete signup before activating the subscription.",
        });
      }
      userId = existingUser._id;
    }

    // Build the contract.
    const billingInterval: BillingInterval =
      (template?.billingInterval as BillingInterval) ?? "month";
    const billingIntervalCount = template?.billingIntervalCount ?? 1;
    const trialDays = offer.trialDaysOverride ?? template?.trialDays ?? 0;
    // gracePeriodDays reserved for dunning config; not used in the activate handler itself.
    void (template?.gracePeriodDays ?? 3);

    const status: "trialing" | "active" =
      trialDays > 0 ? "trialing" : "active";
    const currentPeriodStartAt = now;
    const currentPeriodEndAt =
      trialDays > 0
        ? addDays(now, trialDays)
        : addBillingPeriod(now, billingInterval, billingIntervalCount);

    const recurringAmount = intent.recurringAmount ?? offer.recurringAmount ?? 0;
    const setupFeeAmount = intent.setupFeeAmount ?? offer.setupFeeAmount ?? 0;
    const currencyCode =
      intent.currencyCode ?? offer.currencyCode ?? "USD";

    const pricingSnapshot = {
      offerId,
      offerSlug: offer.slug,
      recurringAmount,
      setupFeeAmount,
      currencyCode,
      billingInterval,
      billingIntervalCount,
      trialDays,
      templateId: template?._id,
      templateVersion: template?.version,
      fromIntentId: args.intentId,
    };

    const subscriptionId = await ctx.db.insert("commerce_subscriptions", {
      customerId: intent.customerId,
      userId,
      sourceChannel: "direct_form",
      sourceCheckoutIntentId: args.intentId,
      sourceOrderId: undefined,
      sourceFormSubmissionId: undefined,
      productId: offer.productId,
      orderId: undefined,
      orderItemId: undefined,
      templateId: template?._id,
      templateVersion: template?.version,
      status,
      currencyCode,
      recurringAmount,
      setupFeeAmount,
      billingInterval,
      billingIntervalCount,
      nextBillingAt: currentPeriodEndAt,
      currentPeriodStartAt,
      currentPeriodEndAt,
      trialEndsAt: trialDays > 0 ? currentPeriodEndAt : undefined,
      cancelAtPeriodEnd: false,
      cancelScheduledAt: undefined,
      cancelledAt: undefined,
      pausedAt: undefined,
      gracePeriodEndsAt: undefined,
      defaultPaymentMethodId: args.paymentResult.paymentMethodId,
      paymentProvider: args.paymentResult.provider,
      paymentTransactionId: args.paymentResult.providerTransactionId,
      lastInvoiceId: undefined,
      manualBilling: false,
      pricingSnapshot,
      sourceMetadata: {
        intentId: args.intentId,
        couponCode: intent.pricingSnapshot?.couponCode,
        returnUrl: intent.pricingSnapshot?.returnUrl,
      },
      offerHistory: [
        {
          offerId,
          effectiveAt: now,
          reason: "initial_signup",
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    // Create the subscription item — binds the contract to the offer so
    // future portal queries (currentOffer, plan-change) and the proration path
    // can resolve the active offer from the item.
    await ctx.db.insert("commerce_subscription_items", {
      subscriptionId,
      sourceOfferId: offerId,
      sourceOfferItemId: undefined,
      productId: offer.productId,
      variantId: offer.variantId,
      bundleId: offer.bundleId,
      titleSnapshot: offer.title,
      quantity: 1,
      unitAmount: recurringAmount,
      unitRecurringAmount: recurringAmount,
      unitSetupFeeAmount: setupFeeAmount,
      currencyCode,
      status: "active",
      startsAt: now,
      currentPeriodEndAt,
      cancelAtPeriodEnd: false,
      cancelledAt: undefined,
      entitlementCodes: offer.entitlementCodes,
      priceSnapshot: pricingSnapshot,
      metadata: {
        fromIntentId: args.intentId,
      },
      createdAt: now,
      updatedAt: now,
    });

    // Create entitlements from offer.entitlementCodes. The membership bridge
    // (see mutations.ts syncEntitlementsForStatus / bridgeDecisions) picks
    // these up and grants membership when applicable. Fire-and-forget at this
    // level: the entitlements are inserted synchronously but the bridge
    // propagation runs on the next status transition or via the offer-level
    // hook (Wave 7 will tighten this to emit a bridge event here explicitly).
    const codes = offer.entitlementCodes ?? [];
    for (const code of codes) {
      await ctx.db.insert("commerce_subscription_entitlements", {
        subscriptionId,
        userId,
        entitlementCode: code,
        status: status === "active" || status === "trialing" ? "active" : "grace",
        startsAt: now,
        endsAt: undefined,
        graceEndsAt: undefined,
        metadata: {
          offerId,
          fromIntentId: args.intentId,
        },
        createdAt: now,
        updatedAt: now,
      });
    }

    // If the intent had a coupon, seed a redemption row now. This only sets
    // up the redemption — actual discount application happens on the next
    // invoice via helpers/coupons.applyCouponToInvoice (Wave 7 wires this to
    // the renewal billing action).
    const couponCode = intent.pricingSnapshot?.couponCode;
    let redemptionId: any = undefined;
    if (typeof couponCode === "string" && couponCode.length > 0) {
      const validation = await validateCoupon(
        ctx,
        couponCode,
        subscriptionId,
        userId,
        offerId,
      );
      if (validation.valid) {
        redemptionId = await initializeRedemption(
          ctx,
          subscriptionId,
          validation.coupon._id,
        );
      }
      // If the coupon became invalid between intent creation and activation
      // (e.g. it was archived), we silently drop it rather than failing the
      // whole activation. The customer still gets their subscription — the
      // coupon is just no longer applied. A history row records this.
      else {
        await writeHistory(ctx, {
          subscriptionId,
          eventType: "subscription.coupon_skipped",
          message: `Coupon "${couponCode}" was invalid at activation time (${validation.reason}).`,
          data: { couponCode, reason: validation.reason },
          correlationId,
        });
      }
    }

    // Record history.
    await writeHistory(ctx, {
      subscriptionId,
      eventType: "subscription.created_from_intent",
      actorUserId: userId,
      toStatus: status,
      data: {
        intentId: args.intentId,
        offerId,
        couponCode,
        redemptionId,
        trialDays,
        recurringAmount,
        setupFeeAmount,
        currencyCode,
        paymentProvider: args.paymentResult.provider,
        paymentTransactionId: args.paymentResult.providerTransactionId,
      },
      correlationId,
    });

    // Patch the intent with the resolved subscription + activated status.
    await ctx.db.patch(args.intentId, {
      status: "activated",
      subscriptionId,
      userId,
      paymentProvider: args.paymentResult.provider,
      paymentTransactionId: args.paymentResult.providerTransactionId,
      savedPaymentMethodId: args.paymentResult.paymentMethodId,
      updatedAt: now,
    });

    // Emit event (best-effort).
    try {
      await emitEvent(ctx, "commerce.subscription_created", "commerce", {
        subscriptionId,
        userId,
        offerId,
        sourceChannel: "direct_form",
        status,
        billingInterval,
        billingIntervalCount,
        recurringAmount,
      });
    } catch {
      // Event emission is best-effort
    }

    return {
      ok: true,
      contractId: subscriptionId,
      status,
      trialDays,
      currentPeriodEndAt,
    };
  },
});
