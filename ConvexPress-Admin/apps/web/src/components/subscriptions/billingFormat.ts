/**
 * Formatting for the subscription admin: money (integer minor units), dates,
 * status labels and tones, and the plain-words reason a card payment failed.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "@backend/convex/_generated/api";

export type ContractRow = FunctionReturnType<typeof api.commerceSubscriptions.adminContracts.listContracts>["page"][number];
export type ContractStatus = ContractRow["status"];
export type ContractBilling = NonNullable<FunctionReturnType<typeof api.commerceSubscriptions.adminContracts.getContractBilling>>;
export type AdminInvoice = ContractBilling["invoices"][number];

export function formatMoney(amount: number | undefined, currencyCode = "USD"): string {
  if (typeof amount !== "number") return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amount / 100);
}

export function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(timestamp: number | undefined): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatCadence(interval: string | undefined, count: number | undefined): string {
  if (!interval) return "";
  const n = count && count > 1 ? count : 1;
  return n === 1 ? `per ${interval}` : `every ${n} ${interval}s`;
}

export function humanize(value: string): string {
  const text = value.replace(/^subscription\./, "").replace(/[._]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const STATUS_TONE: Record<ContractStatus, string> = {
  active: "bg-primary/15 text-primary",
  trialing: "bg-accent/20 text-accent-foreground",
  paused: "bg-muted text-muted-foreground",
  past_due: "bg-destructive/10 text-destructive",
  pending_cancel: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
};

export const STATUS_LABEL: Record<ContractStatus, string> = {
  active: "Active",
  trialing: "Trial",
  paused: "Paused",
  past_due: "Past due",
  pending_cancel: "Cancels at period end",
  cancelled: "Cancelled",
  expired: "Expired",
  draft: "Draft",
};

/** Why a card payment failed, in words an operator can relay to the customer. */
export function describeFailure(reason: string | undefined): string {
  switch (reason) {
    case undefined:
      return "No reason recorded";
    case "card_declined":
    case "generic_decline":
    case "do_not_honor":
      return "Card declined";
    case "insufficient_funds":
      return "Insufficient funds";
    case "expired_card":
      return "Card expired";
    case "authentication_required":
      return "The bank asked the cardholder to authenticate";
    case "no_payment_method_on_file":
      return "No card on file";
    default:
      return humanize(reason);
  }
}

/** "12.50" → 1250; undefined for anything that is not a money amount. */
export function parseMoneyInput(value: string): number | undefined {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const [whole, fraction = ""] = normalized.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : undefined;
}

export type InvoiceRow = FunctionReturnType<typeof api.commerceSubscriptions.adminContracts.listInvoices>["page"][number];
export type InvoiceStatus = InvoiceRow["status"];
export type InvoiceDetail = NonNullable<FunctionReturnType<typeof api.commerceSubscriptions.adminContracts.getInvoiceDetail>>;

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  open: "Open",
  paid: "Paid",
  failed: "Payment failed",
  void: "Void",
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-primary/15 text-primary",
  paid: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  failed: "bg-destructive/10 text-destructive",
  void: "bg-muted text-muted-foreground",
};

export const INVOICE_KIND_LABEL: Record<InvoiceRow["kind"], string> = {
  signup: "First payment",
  renewal: "Renewal",
  plan_change: "Plan change",
};

/** "Paid · $100.00 refunded" — the invoice's state with refunds folded in. */
export function invoiceStatusText(invoice: Pick<InvoiceRow, "status" | "totalAmount" | "refundedAmount" | "pendingRefundAmount" | "currencyCode">): string {
  if (invoice.status === "paid" && invoice.refundedAmount >= invoice.totalAmount && invoice.totalAmount > 0) return "Refunded";
  const parts = [INVOICE_STATUS_LABEL[invoice.status]];
  if (invoice.refundedAmount > 0) parts.push(`${formatMoney(invoice.refundedAmount, invoice.currencyCode)} refunded`);
  if (invoice.pendingRefundAmount > 0) parts.push(`${formatMoney(invoice.pendingRefundAmount, invoice.currencyCode)} refund pending`);
  return parts.join(" · ");
}
