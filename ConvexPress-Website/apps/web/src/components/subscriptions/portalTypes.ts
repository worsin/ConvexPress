/**
 * The customer portal's data, typed from the backend's return validators
 * (`commerceSubscriptions.portal`). Every account-page component and template
 * surface reads these instead of declaring its own loose copy.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "@convexpress-website/backend/generated/api";

export type CustomerContract = FunctionReturnType<typeof api.commerceSubscriptions.portal.getMyActiveContracts>[number];
export type CustomerContractDetail = NonNullable<FunctionReturnType<typeof api.commerceSubscriptions.portal.getMyContract>>;
export type CustomerInvoice = FunctionReturnType<typeof api.commerceSubscriptions.portal.listMyInvoices>[number];
export type CustomerTimelineEntry = CustomerContractDetail["history"][number];
export type PaymentMethodSummary = NonNullable<CustomerContract["paymentMethod"]>;
export type BillingIssue = NonNullable<CustomerContract["billingIssue"]>;
export type ContractActions = CustomerContract["actions"];

/** The lifecycle actions a customer can run from the account page. */
export type CustomerLifecycleAction = "pause" | "resume" | "schedule_cancel" | "cancel_now" | "keep";

export function formatMoney(amount: number, currencyCode = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amount / 100);
}

export function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return "--";
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "per month", "every 3 months". */
export function formatCadence(interval: string | undefined, count: number | undefined): string {
  const unit = interval ?? "period";
  const n = count && count > 1 ? count : 1;
  return n === 1 ? `per ${unit}` : `every ${n} ${unit}s`;
}

export type ContractDiscount = CustomerContract["discounts"][number];

/** "SAVE10: 10% off your next 3 charges" / "… every charge" / "$25.00 off your next charge". */
export function discountText(discount: ContractDiscount, currencyCode: string): string {
  const off = discount.discountType === "percent" ? `${discount.amount}% off` : `${formatMoney(discount.amount, currencyCode)} off`;
  const span =
    discount.remainingCharges === null
      ? "every charge"
      : discount.remainingCharges === 1
        ? "your next charge"
        : `your next ${discount.remainingCharges} charges`;
  return `${discount.code}: ${off} ${span}`;
}

/** "$299.00 per month" — the plan's price. */
export function planPriceText(contract: Pick<CustomerContract, "recurringAmount" | "currencyCode" | "billingInterval" | "billingIntervalCount">): string {
  return `${formatMoney(contract.recurringAmount, contract.currencyCode)} ${formatCadence(contract.billingInterval, contract.billingIntervalCount)}`;
}

/** "$269.10 on Nov 14, 2026" — what the next charge takes (with discounts) and when; "--" when none is due. */
export function nextChargeText(contract: Pick<CustomerContract, "nextChargeAt" | "nextChargeAmount" | "currencyCode">): string {
  return contract.nextChargeAt ? `${formatMoney(contract.nextChargeAmount, contract.currencyCode)} on ${formatDate(contract.nextChargeAt)}` : "--";
}

export const INVOICE_STATUS_LABEL: Record<CustomerInvoice["status"], string> = {
  draft: "Draft",
  open: "Due",
  paid: "Paid",
  failed: "Payment failed",
  void: "Voided",
};

/** "Active", "Grace period until Oct 21, 2026", … for a linked membership. */
export function grantStatusText(grant: CustomerContract["membershipGrants"][number]): string {
  if (grant.status === "grace" && grant.graceEndsAt) return `Grace period until ${formatDate(grant.graceEndsAt)}`;
  return grant.status.charAt(0).toUpperCase() + grant.status.slice(1).replace(/_/g, " ");
}

export function formatCardBrand(brand: string): string {
  const names: Record<string, string> = {
    amex: "American Express",
    diners: "Diners Club",
    discover: "Discover",
    jcb: "JCB",
    mastercard: "Mastercard",
    unionpay: "UnionPay",
    visa: "Visa",
  };
  return names[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

/** Why the last charge failed, in words a customer can act on. */
export function describeFailure(reason: string | undefined): string {
  switch (reason) {
    case "card_declined":
    case "generic_decline":
    case "do_not_honor":
      return "Your card was declined.";
    case "insufficient_funds":
      return "Your card has insufficient funds.";
    case "expired_card":
      return "Your card has expired.";
    case "incorrect_cvc":
    case "incorrect_number":
      return "Your card details were not accepted.";
    case "authentication_required":
      return "Your bank needs you to confirm this card.";
    case "no_payment_method_on_file":
      return "There is no card on file.";
    default:
      return "The payment did not go through.";
  }
}
