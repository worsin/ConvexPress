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
