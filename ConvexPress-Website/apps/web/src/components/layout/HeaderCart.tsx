/**
 * The header's cart button and drawer. HeaderActions loads this module only
 * when the storefront is on, so a site without one never downloads the cart.
 */
import { useQuery } from "convex/react";
import { ShoppingCart } from "lucide-react";
import { useState } from "react";

import { api } from "@convexpress-website/backend/generated/api";
import { LazyCoreCartDrawer } from "@/components/commerce/LazyCartDrawer";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import { Surface } from "@/templates/sdk/Surface";

export default function HeaderCart() {
  const [cartOpen, setCartOpen] = useState(false);
  const { sessionToken, isReady } = useCommerceSessionToken();
  const cart: { itemCount?: number } | null | undefined = useQuery(
    api.commerce.cart.getMine,
    isReady && sessionToken ? { sessionToken } : "skip",
  );
  return (
    <>
      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className="relative flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        aria-label={`Cart${cart?.itemCount ? `, ${cart.itemCount} ${cart.itemCount === 1 ? "item" : "items"}` : ""}`}
      >
        <ShoppingCart className="size-4" aria-hidden="true" />
        {cart?.itemCount ? (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
            {cart.itemCount > 99 ? "99+" : cart.itemCount}
          </span>
        ) : null}
      </button>
      <Surface name="chrome.cartDrawer" data={{ open: cartOpen, onOpenChange: setCartOpen }} fallback={LazyCoreCartDrawer} />
    </>
  );
}
