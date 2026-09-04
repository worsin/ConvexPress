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
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { CartLineMetadata, CartLineProduct } from "@/components/commerce/cartLine";
import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";

export interface CartLine {
  _id: string;
  quantity: number;
  unitPriceAmount: number;
  lineTotalAmount: number;
  metadata?: CartLineMetadata;
  product?: (CartLineProduct & { _id: string; slug: string; featuredMediaId?: string }) | null;
  variant?: { _id: string; featuredMediaId?: string } | null;
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
  const enabled = settings?.plugins?.commerceEnabled === true;
  const currencyCode = settings?.commerceConfig?.currencyCode || "USD";
  const { sessionToken, isReady } = useCommerceSessionToken();
  const cart = useQuery(
    (api as any).commerce.cart.getMine,
    enabled && isReady && sessionToken ? { sessionToken } : "skip",
  ) as CartLines | null | undefined;
  const updateItemQuantity = useMutation((api as any).commerce.cart.updateItemQuantity);
  const removeItem = useMutation((api as any).commerce.cart.removeItem);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const updateQuantity = useCallback(
    async (itemId: string, quantity: number) => {
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
    async (itemId: string) => {
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
