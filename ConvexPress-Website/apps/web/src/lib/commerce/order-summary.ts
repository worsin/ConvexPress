import { formatMoney } from "./format";

export interface OrderAmounts {
  subtotalAmount?: unknown;
  discountAmount?: unknown;
  shippingAmount?: unknown;
  taxAmount?: unknown;
  totalAmount?: unknown;
  currencyCode?: unknown;
  appliedDiscountCode?: unknown;
}
export function recordedOrderMoney(amount: unknown, currency: unknown, deduction = false): string {
  if (amount === undefined || amount === null) return "Not recorded";
  if (typeof amount !== "number" || !Number.isSafeInteger(amount)) return "Unavailable";
  if (typeof currency !== "string" || !currency.trim()) return "Currency not recorded";
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return "Currency unavailable";
  return `${deduction && amount > 0 ? "−" : ""}${formatMoney(amount, code)}`;
}
/** Display the receipt's saved amounts. Never derive totals from current items. */
export function orderAmountRows(order: OrderAmounts) {
  const discountCode = typeof order.appliedDiscountCode === "string" ? order.appliedDiscountCode.trim() : "";
  return [
    { key: "subtotal", label: "Subtotal", value: recordedOrderMoney(order.subtotalAmount, order.currencyCode) },
    { key: "discount", label: `Discount${discountCode ? ` (${discountCode})` : ""}`, value: recordedOrderMoney(order.discountAmount, order.currencyCode, true) },
    { key: "shipping-amount", label: "Shipping", value: recordedOrderMoney(order.shippingAmount, order.currencyCode) },
    { key: "tax", label: "Tax", value: recordedOrderMoney(order.taxAmount, order.currencyCode) },
    { key: "total", label: "Total", value: recordedOrderMoney(order.totalAmount, order.currencyCode) },
  ];
}
/** Preserve authored spelling while suppressing equivalent carrier/service names. */
export function carrierServiceLabel(carrier: unknown, service: unknown): string | null {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of [carrier, service]) {
    if (typeof value !== "string") continue;
    const name = value.trim().replace(/\s+/g, " ");
    if (!name || seen.has(name.toLocaleLowerCase("en-US"))) continue;
    seen.add(name.toLocaleLowerCase("en-US"));
    names.push(name);
  }
  return names.length ? names.join(" • ") : null;
}
