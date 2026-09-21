import { useState, type ReactNode } from "react";
import { CartSummaryProvider, type CartSummaryHost } from "../src/templates/sdk/block-renderer/cart-summary";
export function CartSummaryDemo({ children }: { children: ReactNode }) {
  const [state, setState] = useState("ready");
  const value: CartSummaryHost = state === "ready" || state === "payment-pending"
    ? { state, itemCount: 3, subtotalAmount: 8600, currencyCode: "USD" }
    : state === "large" ? { state: "ready", itemCount: 12500, subtotalAmount: 123456789, currencyCode: "USD" }
    : { state: state as "empty" | "loading" | "unavailable" };
  return <>
    <label className="assistant-demo-control">Synthetic basket fixture
      <select value={state} onChange={event => setState(event.target.value)}>
        <option value="ready">Three items</option><option value="empty">Empty basket</option>
        <option value="loading">Loading / account switch</option><option value="payment-pending">Payment pending</option>
        <option value="unavailable">Unavailable</option><option value="large">Large quantities and amount</option>
      </select>
    </label>
    <CartSummaryProvider value={value}>{children}</CartSummaryProvider>
  </>;
}
