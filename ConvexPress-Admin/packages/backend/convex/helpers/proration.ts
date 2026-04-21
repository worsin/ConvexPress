/**
 * Proration helpers — Wave 2.
 *
 * Pure-function module. No Convex `ctx`, no DB access, no side effects.
 * Safe to import from mutations, queries, actions, and unit tests alike.
 *
 * Model (WooCommerce Subscriptions):
 *   - `unusedOldAmount`   = credit the customer gets for the unused portion
 *                           of their current paid cycle on the OLD offer.
 *   - `proratedNewAmount` = pro-rated price of the NEW offer for the same
 *                           unused portion of the current cycle.
 *   - `netCharge`         = proratedNewAmount − unusedOldAmount
 *                           • Positive → upgrade: charge now.
 *                           • Zero     → neutral: no money movement.
 *                           • Negative → downgrade: carries a credit forward.
 *
 *   `netCharge` is intentionally **not** clamped at zero — downstream code
 *   needs to see the sign to decide between "charge" and "credit" paths.
 *
 * Rounding: all money results are rounded to 2 decimal places via `round2`
 * (half-up via `Math.round`). This matches the pattern used in
 * `commerceSubscriptions/pricing.ts` for display-ready amounts.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Round a number to 2 decimal places using `Math.round` (half-up). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ProrationInput {
  /** Start of the current billing cycle, in milliseconds since epoch. */
  cycleStart: number;
  /** End of the current billing cycle, in milliseconds since epoch. */
  cycleEnd: number;
  /** Current time (usually `Date.now()`), in milliseconds since epoch. */
  now: number;
  /** Price of the offer the customer is currently paying for. Cents or major units — caller decides, just be consistent. */
  oldOfferPrice: number;
  /** Price of the offer the customer is changing to. Same units as `oldOfferPrice`. */
  newOfferPrice: number;
}

export interface ProrationResult {
  /** Days from `now` to `cycleEnd`. Floored at 0 — never negative. */
  daysRemaining: number;
  /** Total days in the current cycle. Floored at 1 to avoid divide-by-zero. */
  daysInCycle: number;
  /** Credit for unused portion of current paid cycle on the old offer. */
  unusedOldAmount: number;
  /** Pro-rated price of the new offer for the unused portion. */
  proratedNewAmount: number;
  /**
   * `proratedNewAmount − unusedOldAmount`.
   * Positive = upgrade charge, zero = neutral, negative = downgrade credit.
   * NOT clamped.
   */
  netCharge: number;
}

/**
 * Compute proration for a mid-cycle offer change.
 *
 * @see module doc for model details.
 */
export function computeProration(params: ProrationInput): ProrationResult {
  const { cycleStart, cycleEnd, now, oldOfferPrice, newOfferPrice } = params;

  // Guard against degenerate cycles (cycleEnd <= cycleStart). Floor at 1 day
  // so we never divide by zero. A 0-length cycle has no "remaining" time,
  // so `daysRemaining` will be 0 below and everything zeroes out cleanly.
  const daysInCycle = Math.max(1, (cycleEnd - cycleStart) / MS_PER_DAY);

  // Days from now to cycle end. Clamp at 0: a `now` past `cycleEnd` means
  // the cycle is over — no unused time remains.
  const daysRemaining = Math.max(0, (cycleEnd - now) / MS_PER_DAY);

  const unusedOldAmount = round2((oldOfferPrice * daysRemaining) / daysInCycle);
  const proratedNewAmount = round2(
    (newOfferPrice * daysRemaining) / daysInCycle,
  );
  const netCharge = round2(proratedNewAmount - unusedOldAmount);

  return {
    daysRemaining,
    daysInCycle,
    unusedOldAmount,
    proratedNewAmount,
    netCharge,
  };
}

export type DiscountType = "percent" | "fixed";

/**
 * Apply a discount to an amount. The result is rounded to 2 decimal places
 * and **floored at zero** — a single coupon can reduce a subtotal to 0 but
 * never push it negative.
 *
 * @param amount          The amount to discount against.
 * @param discountType    "percent" (0-100) or "fixed" (amount in same units).
 * @param discountAmount  The discount magnitude.
 */
export function applyDiscount(
  amount: number,
  discountType: DiscountType,
  discountAmount: number,
): number {
  if (discountType === "percent") {
    // Clamp percent input at [0, 100] defensively, then apply.
    const pct = Math.max(0, Math.min(100, discountAmount));
    return Math.max(0, round2(amount * (1 - pct / 100)));
  }
  // fixed
  return Math.max(0, round2(amount - discountAmount));
}
