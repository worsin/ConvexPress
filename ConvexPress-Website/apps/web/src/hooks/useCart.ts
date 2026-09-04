/**
 * One cart, everywhere.
 *
 * Every product card, the rail, the drawer and the cart page read the same
 * reactive cart and use the same add / set-quantity actions, so "1 in cart"
 * steppers stay in sync no matter where the item was added from.
 */

import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";

export interface CartLineSummary {
  itemId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  title: string;
  slug: string;
  unitPriceAmount: number;
  lineTotalAmount: number;
  featuredMediaId: string | null;
}

export interface CartSummary {
  itemCount: number;
  subtotalAmount: number;
  totalAmount: number;
  discountAmount: number;
  currencyCode: string;
  items: CartLineSummary[];
}

function toSummary(raw: any): CartSummary | null {
  if (!raw) return null;
  return {
    itemCount: raw.itemCount ?? 0,
    subtotalAmount: raw.subtotalAmount ?? 0,
    totalAmount: raw.totalAmount ?? 0,
    discountAmount: raw.discountAmount ?? 0,
    currencyCode: raw.currencyCode ?? "USD",
    items: (raw.items ?? []).map((item: any) => ({
      itemId: String(item._id),
      productId: String(item.productId),
      variantId: item.variantId ? String(item.variantId) : null,
      quantity: item.quantity,
      title: item.product?.title ?? "Item",
      slug: item.product?.slug ?? "",
      unitPriceAmount: item.unitPriceAmount,
      lineTotalAmount: item.lineTotalAmount,
      featuredMediaId: item.variant?.featuredMediaId ?? item.product?.featuredMediaId ?? null,
    })),
  };
}

export function useCart() {
  const settings = useSettings();
  const commerceEnabled = settings?.plugins?.commerceEnabled === true;
  const { sessionToken, isReady } = useCommerceSessionToken();
  const raw = useQuery(
    (api as any).commerce.cart.getMine,
    commerceEnabled && isReady && sessionToken ? { sessionToken } : "skip",
  );
  const addItem = useMutation((api as any).commerce.cart.addItem);
  const updateItemQuantity = useMutation((api as any).commerce.cart.updateItemQuantity);
  const removeItem = useMutation((api as any).commerce.cart.removeItem);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);

  const cart = useMemo(() => toSummary(raw), [raw]);
  const loading = commerceEnabled && (raw === undefined || !isReady);

  const lineByProduct = useMemo(() => {
    const map = new Map<string, CartLineSummary>();
    for (const line of cart?.items ?? []) {
      const existing = map.get(line.productId);
      if (!existing || existing.quantity < line.quantity) map.set(line.productId, line);
    }
    return map;
  }, [cart]);

  const add = useCallback(
    async (productId: string, options?: { variantId?: string | null; quantity?: number; label?: string }) => {
      if (!sessionToken) return false;
      setBusyProductId(productId);
      try {
        await addItem({
          sessionToken,
          productId,
          variantId: options?.variantId ?? undefined,
          quantity: Math.max(1, options?.quantity ?? 1),
        });
        toast.success(options?.label ? `Added ${options.label}` : "Added to cart");
        return true;
      } catch (error) {
        toast.error((error as { data?: { message?: string } })?.data?.message ?? "Could not add to cart");
        return false;
      } finally {
        setBusyProductId(null);
      }
    },
    [addItem, sessionToken],
  );

  const setQuantity = useCallback(
    async (productId: string, quantity: number) => {
      if (!sessionToken) return;
      const line = lineByProduct.get(productId);
      if (!line) return;
      setBusyProductId(productId);
      try {
        if (quantity <= 0) {
          await removeItem({ sessionToken, cartItemId: line.itemId });
        } else {
          await updateItemQuantity({ sessionToken, cartItemId: line.itemId, quantity });
        }
      } catch (error) {
        toast.error((error as { data?: { message?: string } })?.data?.message ?? "Could not update the cart");
      } finally {
        setBusyProductId(null);
      }
    },
    [lineByProduct, removeItem, sessionToken, updateItemQuantity],
  );

  return {
    enabled: commerceEnabled,
    sessionToken,
    isReady,
    loading,
    cart,
    lineByProduct,
    add,
    setQuantity,
    busyProductId,
  };
}
