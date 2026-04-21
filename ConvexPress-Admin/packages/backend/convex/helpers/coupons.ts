/**
 * Coupon helpers — Wave 2.
 *
 * Async helpers using Convex ctx. These are the shared primitives called
 * from `commerceSubscriptions/coupons.ts` (CRUD + redeemCouponForContract)
 * and from `commerceSubscriptions/proration.ts` (future Wave 2 proration
 * invoice apply path).
 *
 * Three exports:
 *   - validateCoupon       — signup- and portal-time validation.
 *   - applyCouponToInvoice — apply a redemption to an open invoice (writes
 *                            a coupon_discount line item + decrements
 *                            remainingApplications).
 *   - initializeRedemption — seed a redemption row when a coupon is claimed
 *                            for a contract (set remainingApplications from
 *                            coupon.duration).
 */

import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

import { applyDiscount } from "./proration";

// ─── Sentinel for "forever" redemptions ─────────────────────────────────────
// We use a large but finite value so DB storage stays simple and the
// decrement path stays monotonic. When a contract is billed for ~80 years
// it will still have plenty of remaining applications. Document this in
// the redemption row's shape so the UI never shows "999 left" as a number.
const FOREVER_REDEMPTION_APPLICATIONS = 9999;

// ─── Validation ─────────────────────────────────────────────────────────────

export type CouponValidationFailureReason =
  | "not_found"
  | "not_active"
  | "starts_in_future"
  | "expired"
  | "not_valid_for_offer"
  | "max_redemptions_reached"
  | "customer_limit_reached";

export type CouponValidationResult =
  | { valid: true; coupon: Doc<"commerce_subscription_coupons"> }
  | { valid: false; reason: CouponValidationFailureReason };

/**
 * Validate a coupon for a given customer + target offer.
 *
 * `contractId` may be `null` — signup-time validation runs before a contract
 * exists. The target offer ID is still required (we validate scope even at
 * checkout). `customerId` is also required so we can enforce `perCustomerLimit`.
 *
 * Returns a discriminated union. The caller is expected to either:
 *   - proceed on `{ valid: true, coupon }`, or
 *   - surface `reason` in the UI (e.g. "Coupon expired").
 */
export async function validateCoupon(
  ctx: QueryCtx | MutationCtx,
  couponCode: string,
  _contractId: Id<"commerce_subscriptions"> | null,
  customerId: Id<"users">,
  targetOfferId: Id<"commerce_subscription_offers">,
): Promise<CouponValidationResult> {
  const now = Date.now();

  const coupon = await ctx.db
    .query("commerce_subscription_coupons")
    .withIndex("by_code", (q) => q.eq("code", couponCode))
    .unique();

  if (!coupon) return { valid: false, reason: "not_found" };

  if (coupon.status !== "active") {
    return { valid: false, reason: "not_active" };
  }

  if (typeof coupon.startsAt === "number" && now < coupon.startsAt) {
    return { valid: false, reason: "starts_in_future" };
  }

  if (typeof coupon.expiresAt === "number" && now > coupon.expiresAt) {
    return { valid: false, reason: "expired" };
  }

  // offerIds is optional — absent/empty means "valid for all offers".
  const offerScope = coupon.offerIds ?? [];
  if (offerScope.length > 0 && !offerScope.includes(targetOfferId)) {
    return { valid: false, reason: "not_valid_for_offer" };
  }

  // Global redemption cap — count all redemptions for this coupon.
  if (typeof coupon.maxRedemptions === "number") {
    const allRedemptions = await ctx.db
      .query("commerce_subscription_coupon_redemptions")
      .withIndex("by_coupon", (q) => q.eq("couponId", coupon._id))
      .collect();
    if (allRedemptions.length >= coupon.maxRedemptions) {
      return { valid: false, reason: "max_redemptions_reached" };
    }
  }

  // Per-customer cap — count this customer's redemptions of this coupon.
  if (typeof coupon.perCustomerLimit === "number") {
    const customerRedemptions = await ctx.db
      .query("commerce_subscription_coupon_redemptions")
      .withIndex("by_customer_and_coupon", (q) =>
        q.eq("customerId", customerId).eq("couponId", coupon._id),
      )
      .collect();
    if (customerRedemptions.length >= coupon.perCustomerLimit) {
      return { valid: false, reason: "customer_limit_reached" };
    }
  }

  return { valid: true, coupon };
}

// ─── Apply to invoice ───────────────────────────────────────────────────────

export interface ApplyCouponToInvoiceResult {
  /** Discount amount in the invoice's currency (positive number). */
  discount: number;
  /** New subtotal after applying the coupon. Clamped at 0. */
  newSubtotal: number;
}

/**
 * Apply a coupon redemption to an open invoice:
 *   1. Computes discount from coupon.discountType + coupon.amount.
 *   2. Writes a negative-amount `coupon_discount` line item on the invoice.
 *   3. Patches the invoice's subtotal/total (tax not re-computed — we treat
 *      the coupon as a post-tax discount for simplicity; Wave 7 can revisit).
 *   4. Decrements `remainingApplications` on the redemption (but never
 *      deletes the redemption row — history is preserved).
 *
 * Throws if the redemption has no remaining applications (caller is
 * responsible for checking if needed; we are defensive here).
 */
export async function applyCouponToInvoice(
  ctx: MutationCtx,
  invoiceId: Id<"commerce_subscription_invoices">,
  redemptionId: Id<"commerce_subscription_coupon_redemptions">,
  invoiceSubtotal: number,
): Promise<ApplyCouponToInvoiceResult> {
  const redemption = await ctx.db.get(redemptionId);
  if (!redemption) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Coupon redemption not found.",
    });
  }

  if (redemption.remainingApplications <= 0) {
    throw new ConvexError({
      code: "COUPON_EXHAUSTED",
      message: "Coupon redemption has no remaining applications.",
    });
  }

  const coupon = await ctx.db.get(redemption.couponId);
  if (!coupon) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Coupon not found for redemption.",
    });
  }

  const invoice = await ctx.db.get(invoiceId);
  if (!invoice) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Invoice not found.",
    });
  }

  const newSubtotal = applyDiscount(
    invoiceSubtotal,
    coupon.discountType,
    coupon.amount,
  );
  const discount = Math.max(0, invoiceSubtotal - newSubtotal);

  const now = Date.now();

  // Write the discount as a negative line item on the invoice. This keeps
  // the invoice's line-item table as the audit log of how the total was
  // derived.
  await ctx.db.insert("commerce_subscription_invoice_items", {
    invoiceId,
    subscriptionItemId: undefined,
    description: `Coupon discount (${coupon.code})`,
    quantity: 1,
    unitAmount: -discount,
    lineType: "coupon_discount",
    currencyCode: invoice.currencyCode,
    lineTotalAmount: -discount,
    metadata: {
      couponId: coupon._id,
      couponCode: coupon.code,
      redemptionId,
      discountType: coupon.discountType,
      discountAmount: coupon.amount,
    },
    createdAt: now,
  });

  // Patch the invoice. We adjust subtotal + total together. Tax is NOT
  // re-computed — a Wave 7 tax-engine pass can refine this.
  const taxAmount = invoice.taxAmount ?? 0;
  await ctx.db.patch(invoiceId, {
    subtotalAmount: newSubtotal,
    totalAmount: Math.max(0, newSubtotal + taxAmount),
    updatedAt: now,
  });

  // Decrement remaining applications. We keep the row even at 0 so future
  // UI can show "applied 3 times, exhausted" history.
  await ctx.db.patch(redemptionId, {
    remainingApplications: redemption.remainingApplications - 1,
  });

  return { discount, newSubtotal };
}

// ─── Initialize redemption ──────────────────────────────────────────────────

/**
 * Create a coupon redemption row for a contract.
 *
 * Seeds `remainingApplications` from the coupon's `duration`:
 *   - "once":      1
 *   - "n_months":  coupon.durationMonths (throws if missing)
 *   - "forever":   FOREVER_REDEMPTION_APPLICATIONS sentinel (9999 — large
 *                  enough to outlive any realistic subscription)
 */
export async function initializeRedemption(
  ctx: MutationCtx,
  contractId: Id<"commerce_subscriptions">,
  couponId: Id<"commerce_subscription_coupons">,
): Promise<Id<"commerce_subscription_coupon_redemptions">> {
  const coupon = await ctx.db.get(couponId);
  if (!coupon) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Coupon not found.",
    });
  }

  const contract = await ctx.db.get(contractId);
  if (!contract) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Subscription contract not found.",
    });
  }

  let remainingApplications: number;
  if (coupon.duration === "once") {
    remainingApplications = 1;
  } else if (coupon.duration === "forever") {
    remainingApplications = FOREVER_REDEMPTION_APPLICATIONS;
  } else {
    // n_months
    if (
      typeof coupon.durationMonths !== "number" ||
      coupon.durationMonths <= 0
    ) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          "Coupon has duration='n_months' but durationMonths is missing or invalid.",
      });
    }
    remainingApplications = coupon.durationMonths;
  }

  // Per the schema, redemption.customerId is v.id("users"). Contracts link
  // a `userId` (the acting user). customerId on contract points to a
  // `commerce_customer_profiles` row, which is NOT a users row — so we use
  // the contract's userId for the redemption customerId field. If a
  // contract somehow lacks a userId, throw rather than silently linking.
  if (!contract.userId) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message:
        "Subscription contract has no userId — cannot create coupon redemption.",
    });
  }

  const now = Date.now();
  return ctx.db.insert("commerce_subscription_coupon_redemptions", {
    contractId,
    couponId,
    customerId: contract.userId,
    redeemedAt: now,
    remainingApplications,
  });
}
