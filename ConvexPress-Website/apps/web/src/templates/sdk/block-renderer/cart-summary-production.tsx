import type { ReactNode } from "react";
import { useCart } from "../../../hooks/useCart";
import { CartSummaryProvider, cartSummaryState } from "./cart-summary";

/** Reuses storefront session settlement and owner-checked cart queries. No SSR cart DTO. */
export function ProductionCartSummaryProvider({ children }: { children: ReactNode }) {
  const cart = useCart();
  return <CartSummaryProvider value={cartSummaryState(cart)}>{children}</CartSummaryProvider>;
}
