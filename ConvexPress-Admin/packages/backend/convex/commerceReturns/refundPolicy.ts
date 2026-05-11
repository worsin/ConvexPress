/**
 * Refund Policy Configuration
 *
 * Current policy: item-line refund only (subtotal of returned items).
 * Tax, shipping, and discount adjustments are NOT automatically refunded.
 * Admin can manually adjust the refund amount during the approve step.
 *
 * Future considerations:
 * - Proportional tax refund
 * - Shipping refund for seller-fault returns
 * - Restocking fee deduction
 * - Partial receipt adjustments
 */
export const REFUND_POLICY = {
  /** Whether the refund automatically includes proportional tax */
  includesTax: false,
  /** Whether the refund automatically includes shipping costs */
  includesShipping: false,
  /** Restocking fee as a percentage (0 = no fee) */
  restockingFeePercent: 0,
  /** What the refund amount is based on */
  maxRefundBasis: "item_subtotal" as const,
} as const;

/**
 * Default return window in days.
 * Used by eligibility checks when no per-product override exists.
 */
export const DEFAULT_RETURN_WINDOW_DAYS = 30;

/**
 * Maximum time in milliseconds before a refund_pending return
 * is considered "stuck" and eligible for retry or escalation.
 */
export const STUCK_REFUND_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
