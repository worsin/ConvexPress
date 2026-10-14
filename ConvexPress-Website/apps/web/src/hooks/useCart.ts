/**
 * One cart, everywhere.
 *
 * Every product card, the rail, the drawer and the cart page read the same
 * reactive cart and use the same add / set-quantity actions, so "1 in cart"
 * steppers stay in sync no matter where the item was added from.
 */

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { useSettings } from "../contexts/SettingsContext";
import { idFromString } from "../lib/ids";
import { useCommerceSessionToken } from "./useCommerceSessionToken";

export interface CartLineSummary {
  itemId: Id<"commerce_cart_items">;
  productId: Id<"commerce_products">;
  variantId: Id<"commerce_product_variants"> | null;
  quantity: number;
  title: string;
  slug: string;
  unitPriceAmount: number;
  lineTotalAmount: number;
  featuredMediaId: Id<"media"> | null;
}

export interface CartSummary {
  itemCount: number;
  subtotalAmount: number;
  totalAmount: number;
  discountAmount: number;
  currencyCode: string;
  items: CartLineSummary[];
}

function toSummary(raw: FunctionReturnType<typeof api.commerce.cart.getMine> | undefined): CartSummary | null {
  if (!raw) return null;
  return {
    itemCount: raw.itemCount,
    subtotalAmount: raw.subtotalAmount,
    totalAmount: raw.totalAmount,
    discountAmount: raw.discountAmount,
    currencyCode: raw.currencyCode || "USD",
    items: raw.items.map((item) => ({
      itemId: item._id,
      productId: item.productId,
      variantId: item.variantId ?? null,
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
    api.commerce.cart.getMine,
    commerceEnabled && isReady && sessionToken ? { sessionToken } : "skip",
  );
  const addItem = useMutation(api.commerce.cart.addItem);
  const updateItemQuantity = useMutation(api.commerce.cart.updateItemQuantity);
  const removeItem = useMutation(api.commerce.cart.removeItem);
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
          productId: idFromString<"commerce_products">(productId),
          variantId: options?.variantId ? idFromString<"commerce_product_variants">(options.variantId) : undefined,
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
    paymentPending: raw?.status === "pending_payment",
    cart,
    lineByProduct,
    add,
    setQuantity,
    busyProductId,
  };
}
