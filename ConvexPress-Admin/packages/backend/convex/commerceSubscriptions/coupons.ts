// @ts-nocheck
/**
 * Commerce Subscriptions — Coupons CRUD + redemption (Wave 2).
 *
 * Admin-managed discount codes for subscription contracts. Wave 2 scope:
 *   - CRUD (create / update / archive / list / get / getByCode)
 *   - `redeemCouponForContract` — validates a code and seeds a
 *     redemption row for an existing contract. Actual per-invoice
 *     discount application happens in `helpers/coupons.ts`
 *     `applyCouponToInvoice`, called from the invoice generation path in
 *     Wave 2 proration work and Wave 7 renewal billing.
 *
 * Immutability invariants (Wave 2 design):
 *   Once ANY redemption exists for a coupon, the following fields LOCK:
 *     - `code`          — changing the code after redemptions would
 *                         orphan history (the redemption row references
 *                         the coupon by id, but the audit log on the
 *                         invoice uses the code string).
 *     - `discountType`  — changing percent↔fixed mid-stream would
 *                         silently change already-applied redemptions'
 *                         future applications.
 *   All other fields (amount, duration, caps, expiresAt, status, scope)
 *   remain editable — operators routinely tune these.
 *
 * Plugin gate: every public handler starts with
 *   `await requirePluginEnabled(ctx, "commerceSubscriptions")`
 * Admin handlers additionally require the `manage_options` capability.
 * `redeemCouponForContract` requires the caller to own the contract
 * (via `contract.userId === currentUser._id`) OR have `manage_options`.
 *
 * Wave 7 swaps capability names for fine-grained
 *   `commerceSubscriptions.coupons.manage`.
 *
 * `@ts-nocheck` matches the existing subscriptions backend file pattern.
 */

import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../helpers/auth";
import { initializeRedemption, validateCoupon } from "../helpers/coupons";
import { requireCan } from "../helpers/permissions";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { requireCommerceSubscriptionsEnabled } from "./helpers";

// ─── Shared validators ──────────────────────────────────────────────────────

const discountTypeValidator = v.union(v.literal("percent"), v.literal("fixed"));
const durationValidator = v.union(
  v.literal("once"),
  v.literal("forever"),
  v.literal("n_months"),
);
const couponStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("archived"),
);

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Returns true if any redemption row has been recorded for this coupon.
 * Used to enforce the code/discountType immutability invariant.
 */
async function couponHasRedemptions(
  ctx: any,
  couponId: any,
): Promise<boolean> {
  const first = await ctx.db
    .query("commerce_subscription_coupon_redemptions")
    .withIndex("by_coupon", (q: any) => q.eq("couponId", couponId))
    .first();
  return first !== null;
}

// ─── Mutations ──────────────────────────────────────────────────────────────

/**
 * Create a new subscription coupon (admin).
 *
 * Validates:
 *   - `code` is unique (`by_code` index).
 *   - If `duration === "n_months"`, `durationMonths` is a positive number.
 *   - Amount is non-negative. For percent: 0..100.
 */
export const createCoupon = mutation({
  args: {
    code: v.string(),
    discountType: discountTypeValidator,
    amount: v.number(),
    duration: durationValidator,
    durationMonths: v.optional(v.number()),
    maxRedemptions: v.optional(v.number()),
    perCustomerLimit: v.optional(v.number()),
    offerIds: v.optional(v.array(v.id("commerce_subscription_offers"))),
    startsAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    status: v.optional(couponStatusValidator),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    }

    // Validate amount.
    if (args.amount < 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Coupon amount must be non-negative.",
      });
    }
    if (args.discountType === "percent" && args.amount > 100) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Percent coupons must be in the range 0..100.",
      });
    }

    // Validate duration shape.
    if (args.duration === "n_months") {
      if (
        typeof args.durationMonths !== "number" ||
        args.durationMonths <= 0
      ) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message:
            "Coupons with duration='n_months' require a positive durationMonths.",
        });
      }
    }

    // Validate startsAt/expiresAt ordering if both present.
    if (
      typeof args.startsAt === "number" &&
      typeof args.expiresAt === "number" &&
      args.expiresAt <= args.startsAt
    ) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Coupon expiresAt must be after startsAt.",
      });
    }

    // Enforce code uniqueness.
    const existingByCode = await ctx.db
      .query("commerce_subscription_coupons")
      .withIndex("by_code", (q: any) => q.eq("code", args.code))
      .unique();
    if (existingByCode) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `A coupon with code "${args.code}" already exists.`,
      });
    }

    const now = Date.now();
    return ctx.db.insert("commerce_subscription_coupons", {
      code: args.code,
      discountType: args.discountType,
      amount: args.amount,
      duration: args.duration,
      durationMonths: args.durationMonths,
      maxRedemptions: args.maxRedemptions,
      perCustomerLimit: args.perCustomerLimit,
      offerIds: args.offerIds,
      startsAt: args.startsAt,
      expiresAt: args.expiresAt,
      status: args.status ?? "active",
      createdBy: currentUser._id,
      createdAt: now,
    });
  },
});

/**
 * Update an existing subscription coupon (admin).
 *
 * When ANY redemption exists, `code` and `discountType` are IMMUTABLE
 * and will throw `IMMUTABLE_FIELD` on attempted change. All other fields
 * remain editable.
 */
export const updateCoupon = mutation({
  args: {
    couponId: v.id("commerce_subscription_coupons"),
    // Always-editable:
    amount: v.optional(v.number()),
    duration: v.optional(durationValidator),
    durationMonths: v.optional(v.number()),
    maxRedemptions: v.optional(v.number()),
    perCustomerLimit: v.optional(v.number()),
    offerIds: v.optional(v.array(v.id("commerce_subscription_offers"))),
    startsAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    status: v.optional(couponStatusValidator),
    // Immutable-if-redeemed:
    code: v.optional(v.string()),
    discountType: v.optional(discountTypeValidator),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const existing = await ctx.db.get(args.couponId);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Coupon not found.",
      });
    }

    const immutableAttempted: string[] = [];
    if (args.code !== undefined && args.code !== existing.code) {
      immutableAttempted.push("code");
    }
    if (
      args.discountType !== undefined &&
      args.discountType !== existing.discountType
    ) {
      immutableAttempted.push("discountType");
    }
    if (immutableAttempted.length > 0) {
      const hasRedemptions = await couponHasRedemptions(ctx, args.couponId);
      if (hasRedemptions) {
        throw new ConvexError({
          code: "IMMUTABLE_FIELD",
          message: `Cannot modify [${immutableAttempted.join(", ")}] — this coupon has been redeemed. Archive and create a new coupon instead.`,
          attemptedFields: immutableAttempted,
        });
      }
    }

    // Validate prospective amount/duration shape.
    const newAmount = args.amount ?? existing.amount;
    const newDiscountType = args.discountType ?? existing.discountType;
    const newDuration = args.duration ?? existing.duration;
    const newDurationMonths =
      args.durationMonths !== undefined
        ? args.durationMonths
        : existing.durationMonths;

    if (newAmount < 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Coupon amount must be non-negative.",
      });
    }
    if (newDiscountType === "percent" && newAmount > 100) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Percent coupons must be in the range 0..100.",
      });
    }
    if (newDuration === "n_months") {
      if (typeof newDurationMonths !== "number" || newDurationMonths <= 0) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message:
            "Coupons with duration='n_months' require a positive durationMonths.",
        });
      }
    }

    // Validate startsAt/expiresAt if both ultimately set.
    const newStartsAt =
      args.startsAt !== undefined ? args.startsAt : existing.startsAt;
    const newExpiresAt =
      args.expiresAt !== undefined ? args.expiresAt : existing.expiresAt;
    if (
      typeof newStartsAt === "number" &&
      typeof newExpiresAt === "number" &&
      newExpiresAt <= newStartsAt
    ) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Coupon expiresAt must be after startsAt.",
      });
    }

    // Enforce unique code if being changed.
    if (args.code !== undefined && args.code !== existing.code) {
      const dupe = await ctx.db
        .query("commerce_subscription_coupons")
        .withIndex("by_code", (q: any) => q.eq("code", args.code))
        .unique();
      if (dupe && dupe._id !== existing._id) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `A coupon with code "${args.code}" already exists.`,
        });
      }
    }

    const patch: Record<string, unknown> = {};
    const fields: Array<keyof typeof args> = [
      "code",
      "discountType",
      "amount",
      "duration",
      "durationMonths",
      "maxRedemptions",
      "perCustomerLimit",
      "offerIds",
      "startsAt",
      "expiresAt",
      "status",
    ];
    for (const f of fields) {
      if (args[f] !== undefined) {
        (patch as any)[f] = args[f];
      }
    }

    await ctx.db.patch(args.couponId, patch);
    return args.couponId;
  },
});

/**
 * Soft-delete a coupon. Sets status to `archived`. Redemptions are
 * preserved (history). Already-issued redemptions continue to apply to
 * their contracts until `remainingApplications` hits zero.
 */
export const archiveCoupon = mutation({
  args: {
    couponId: v.id("commerce_subscription_coupons"),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const existing = await ctx.db.get(args.couponId);
    if (!existing) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Coupon not found.",
      });
    }
    if (existing.status === "archived") {
      return { success: true, alreadyArchived: true };
    }
    await ctx.db.patch(args.couponId, { status: "archived" });
    return { success: true };
  },
});

/**
 * Redeem a coupon for an existing subscription contract.
 *
 * Semantics:
 *   1. Validates the code via `helpers/coupons.validateCoupon` (scoped
 *      to the contract's current offer — determined from the first
 *      active item).
 *   2. Seeds a redemption row via `helpers/coupons.initializeRedemption`
 *      — populates `remainingApplications` from the coupon's `duration`.
 *   3. Returns the redemption id.
 *
 * Authorization: the caller must either OWN the contract
 * (`contract.userId === currentUser._id`) OR have the `manage_options`
 * capability. Admin redemption on behalf of a user is the typical
 * back-office flow.
 *
 * Wave 2 scope does NOT immediately apply the coupon to an invoice —
 * that happens on the next invoice generation through
 * `helpers/coupons.applyCouponToInvoice`. This keeps the redeem
 * operation idempotent-per-contract and decouples discount accrual
 * from billing cycle timing.
 */
export const redeemCouponForContract = mutation({
  args: {
    contractId: v.id("commerce_subscriptions"),
    couponCode: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);

    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    }

    const contract = await ctx.db.get(args.contractId);
    if (!contract) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Subscription contract not found.",
      });
    }

    // Authorization: owner OR manage_options.
    const isOwner = contract.userId === currentUser._id;
    if (!isOwner) {
      // Will throw if caller lacks the capability — no second check needed.
      await requireCan(ctx, "manage_options");
    }

    // Determine the current offer for this contract from its first
    // active item. Redemption validation is per-offer (so scoping like
    // `offerIds: [premium]` is enforced even on add-to-existing flows).
    const items = await ctx.db
      .query("commerce_subscription_items")
      .withIndex("by_subscription", (q: any) =>
        q.eq("subscriptionId", args.contractId),
      )
      .collect();

    // Pick the first active or currently-billing item to determine the
    // primary offer. If none found (contract is empty), throw.
    const activeItem = items.find(
      (it: any) => it.status === "active" || it.status === "pending_cancel",
    );
    if (!activeItem) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          "Contract has no active items — cannot determine target offer for coupon validation.",
      });
    }
    if (!activeItem.sourceOfferId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          "Contract item has no sourceOfferId — cannot validate coupon scope.",
      });
    }

    if (!contract.userId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          "Contract has no userId — cannot record redemption (Wave 0 migration may be incomplete).",
      });
    }

    const validation = await validateCoupon(
      ctx,
      args.couponCode,
      args.contractId,
      contract.userId,
      activeItem.sourceOfferId,
    );
    if (!validation.valid) {
      throw new ConvexError({
        code: "COUPON_INVALID",
        message: `Coupon cannot be redeemed: ${validation.reason}.`,
        reason: validation.reason,
      });
    }

    const redemptionId = await initializeRedemption(
      ctx,
      args.contractId,
      validation.coupon._id,
    );

    return {
      success: true,
      redemptionId,
      couponId: validation.coupon._id,
    };
  },
});

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Admin coupon listing. Filter by status or code substring.
 */
export const listCoupons = query({
  args: {
    status: v.optional(couponStatusValidator),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let coupons: any[];
    if (args.status) {
      coupons = await ctx.db
        .query("commerce_subscription_coupons")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .collect();
    } else {
      coupons = await ctx.db.query("commerce_subscription_coupons").collect();
    }

    if (args.search && args.search.trim().length > 0) {
      const needle = args.search.trim().toLowerCase();
      coupons = coupons.filter((c) =>
        (c.code ?? "").toLowerCase().includes(needle),
      );
    }

    return coupons.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  },
});

/**
 * Fetch a single coupon by ID (admin).
 */
export const getCoupon = query({
  args: {
    couponId: v.id("commerce_subscription_coupons"),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");
    return ctx.db.get(args.couponId);
  },
});

/**
 * Fetch a coupon by its human-readable code (admin). Used by the admin
 * UI "find code" dialog. Returns null if not found.
 *
 * This does NOT validate redeemability — use `validateCoupon` or the
 * `redeemCouponForContract` mutation for that. Public signup-time
 * preview validation will live on the customer portal in Wave 4.
 */
export const getCouponByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "manage_options");
    return ctx.db
      .query("commerce_subscription_coupons")
      .withIndex("by_code", (q: any) => q.eq("code", args.code))
      .unique();
  },
});
