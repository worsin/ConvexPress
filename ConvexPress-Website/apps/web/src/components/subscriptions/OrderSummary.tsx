/**
 * What the customer is buying and paying, before the card form: the plan, the
 * setup fee, the coupon, what is due today, and what happens after (the next
 * charge and its date). Every figure comes from the server's checkout intent
 * (`checkoutSummary`). Used by the form checkout and the direct signup page.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "@convexpress-website/backend/generated/api";

export type CheckoutSummary = NonNullable<
  NonNullable<FunctionReturnType<typeof api.commerceSubscriptions.checkout.getMyCheckout>>["summary"]
>;

export function formatMinor(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

function formatLongDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function cadence(summary: CheckoutSummary | null): string {
  if (!summary) return "each billing period";
  const n = summary.billingIntervalCount > 1 ? summary.billingIntervalCount : 1;
  return n === 1 ? `per ${summary.billingInterval}` : `every ${n} ${summary.billingInterval}s`;
}

export function OrderSummary({
  mode,
  amount,
  recurringAmount,
  currency,
  summary,
}: {
  mode: "payment" | "setup";
  amount: number;
  recurringAmount: number;
  currency: string;
  summary: CheckoutSummary | null;
}) {
  const money = (value: number) => formatMinor(value, currency);
  const trial = summary && summary.trialDays > 0;
  return (
    <div data-slot="checkout-order-summary" className="flex flex-col gap-3 border-b border-border pb-4 text-sm">
      {summary ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-foreground">{summary.planTitle}</p>
            <p className="text-xs text-muted-foreground">
              {money(summary.recurringAmount)} {cadence(summary)}
              {trial ? ` · ${summary.trialDays}-day free trial` : ""}
            </p>
          </div>
          <span className="shrink-0 tabular-nums text-foreground">{trial ? money(0) : money(summary.recurringAmount)}</span>
        </div>
      ) : null}
      {summary && summary.setupFeeAmount > 0 ? (
        <div className="flex items-center justify-between gap-3 text-muted-foreground">
          <span>One-time setup fee</span>
          <span className="tabular-nums text-foreground">{money(summary.setupFeeAmount)}</span>
        </div>
      ) : null}
      {summary && summary.firstChargeDiscount > 0 ? (
        <div className="flex items-center justify-between gap-3 text-muted-foreground">
          <span>Coupon {summary.couponCode}</span>
          <span className="tabular-nums text-foreground">−{money(summary.firstChargeDiscount)}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="font-medium text-foreground">Due today</span>
        <span className="text-lg font-semibold tabular-nums text-foreground">{money(amount)}</span>
      </div>
      {recurringAmount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {summary
            ? `Then ${money(recurringAmount)} ${cadence(summary)}, starting ${formatLongDate(summary.nextChargeAt)}. Cancel any time from your account.`
            : `Then ${money(recurringAmount)} each billing period. Cancel any time from your account.`}
          {summary?.couponCode && summary.firstChargeDiscount === 0 ? ` Coupon ${summary.couponCode} applies to your upcoming charges.` : ""}
        </p>
      ) : null}
      {mode === "setup" ? (
        <p className="text-xs text-muted-foreground">You won't be charged today. Your card is saved for the charges above.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">Your card details are encrypted and never stored on this site.</p>
    </div>
  );
}
