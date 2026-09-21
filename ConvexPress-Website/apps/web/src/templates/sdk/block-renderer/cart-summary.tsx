import { createContext, useContext, type ReactNode } from "react";

/** Request-local storefront state. Never serialize this into a saved document. */
export type CartSummaryHost =
  | { state: "unavailable" | "loading" | "empty" }
  | { state: "ready" | "payment-pending"; itemCount: number; subtotalAmount: number; currencyCode: string };
const CartSummaryContext = createContext<CartSummaryHost>({ state: "unavailable" });
export function CartSummaryProvider({ value, children }: { value: CartSummaryHost; children: ReactNode }) {
  return <CartSummaryContext value={value}>{children}</CartSummaryContext>;
}
export function useCartSummary() { return useContext(CartSummaryContext); }

export function cartSummaryState(input: {
  enabled: boolean; isReady: boolean; loading: boolean; paymentPending: boolean;
  cart: { itemCount: number; subtotalAmount: number; currencyCode: string } | null;
}): CartSummaryHost {
  if (!input.enabled) return { state: "unavailable" };
  // Mask stale amounts during identity and database transitions before any projection.
  if (!input.isReady || input.loading) return { state: "loading" };
  const cart = input.cart;
  if (!cart) return { state: "empty" };
  if (!Number.isSafeInteger(cart.itemCount) || cart.itemCount < 0 ||
      !Number.isSafeInteger(cart.subtotalAmount) || cart.subtotalAmount < 0 ||
      !/^[A-Z]{3}$/.test(cart.currencyCode)) return { state: "unavailable" };
  if (cart.itemCount === 0 && !input.paymentPending) return { state: "empty" };
  return { state: input.paymentPending ? "payment-pending" : "ready", itemCount: cart.itemCount,
    subtotalAmount: cart.subtotalAmount, currencyCode: cart.currencyCode };
}
