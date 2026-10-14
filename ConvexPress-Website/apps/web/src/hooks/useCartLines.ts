/**
 * The cart as a list of lines with per-line actions — what the header's cart
 * drawer needs. `useCart` keeps the per-product view (steppers on product
 * cards); this hook exposes each line (variant, bundle metadata, SKU) and lets
 * a template pack change one line's quantity or remove it, with the same
 * toasts the Core drawer shows. Template packs read the cart through this
 * hook so surfaces never touch the backend directly.
 */

import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { parseCartLinesMetadata, type CartLineMetadata, type CartLineProduct, type CartLineVariant } from "@/components/commerce/cartLine";
import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import { isPublicPluginEnabled } from "@/lib/plugins/public";

export interface CartLine {
  _id: Id<"commerce_cart_items">;
  quantity: number;
  unitPriceAmount: number;
  lineTotalAmount: number;
  metadata?: CartLineMetadata;
  product?: (CartLineProduct & { _id: string; slug: string; featuredMediaId?: Id<"media"> }) | null;
  variant?: (CartLineVariant & { _id: string; featuredMediaId?: Id<"media"> }) | null;
}

export interface CartLines {
  itemCount: number;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  appliedDiscountCode?: string;
  items: CartLine[];
}

export function useCartLines() {
  const settings = useSettings();
  const enabled = isPublicPluginEnabled("commerceStorefront", settings);
  const currencyCode = settings?.commerceConfig?.currencyCode || "USD";
  const { sessionToken, isReady } = useCommerceSessionToken();
  const raw = useQuery(
    api.commerce.cart.getMine,
    enabled && isReady && sessionToken ? { sessionToken } : "skip",
  );
  const cart = useMemo<CartLines | null | undefined>(
    () => raw && parseCartLinesMetadata(raw),
    [raw],
  );
  const updateItemQuantity = useMutation(api.commerce.cart.updateItemQuantity);
  const removeItem = useMutation(api.commerce.cart.removeItem);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const updateQuantity = useCallback(
    async (itemId: Id<"commerce_cart_items">, quantity: number) => {
      if (!sessionToken) return;
      setBusyAction(`quantity:${itemId}`);
      try {
        await updateItemQuantity({ sessionToken, cartItemId: itemId, quantity });
      } catch (error) {
        toast.error((error as { data?: { message?: string } })?.data?.message ?? "Failed to update quantity");
      } finally {
        setBusyAction(null);
      }
    },
    [sessionToken, updateItemQuantity],
  );

  const remove = useCallback(
    async (itemId: Id<"commerce_cart_items">) => {
      if (!sessionToken) return;
      setBusyAction(`remove:${itemId}`);
      try {
        await removeItem({ sessionToken, cartItemId: itemId });
        toast.success("Item removed");
      } catch (error) {
        toast.error((error as { data?: { message?: string } })?.data?.message ?? "Failed to remove item");
      } finally {
        setBusyAction(null);
      }
    },
    [removeItem, sessionToken],
  );

  return { enabled, currencyCode, isReady, cart, busyAction, updateQuantity, remove };
}
