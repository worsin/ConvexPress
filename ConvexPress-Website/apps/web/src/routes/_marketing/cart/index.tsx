import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";

import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { ShopShell } from "@/components/shop/ShopShell";
import { convexQuery } from "@convex-dev/react-query";
import { buildSeoHead } from "@/lib/seo/head";
import CoreCart, { type CartSurfaceCart, type CartSurfaceData } from "@/templates/packs/core/surfaces/cart";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/cart/")({
  loader: async ({ context: { queryClient } }) => {
    const publicSettings = (await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    )) as { siteTitle?: string | null } | null;
    return {
      seoHead: buildSeoHead({
        title: `Cart – ${publicSettings?.siteTitle || "Shop"}`,
        robots: "noindex, follow",
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  component: CartPage,
});

function CartPage() {
  const settings = useSettings();
  const commerceEnabled = settings?.plugins?.commerceEnabled === true;
  const currencyCode = settings?.commerceConfig?.currencyCode || "USD";
  const { sessionToken, isReady } = useCommerceSessionToken();
  const cart = useQuery(
    api.commerce.cart.getMine,
    commerceEnabled && isReady && sessionToken ? { sessionToken } : "skip",
  ) as CartSurfaceCart | null | undefined;
  const updateItemQuantity = useMutation(api.commerce.cart.updateItemQuantity);
  const removeItem = useMutation(api.commerce.cart.removeItem);
  const clearCart = useMutation(api.commerce.cart.clear);
  const applyDiscountCode = useMutation(api.commerce.cart.applyDiscountCode);
  const removeDiscountCode = useMutation(api.commerce.cart.removeDiscountCode);
  const enableSharing = useMutation(api.commerce.cart.enableSharing);
  const disableSharing = useMutation(api.commerce.cart.disableSharing);
  const [discountCode, setDiscountCode] = useState("");
  const [sharing, setSharing] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function handleQuantity(itemId: Id<"commerce_cart_items">, quantity: number) {
    if (!sessionToken) return;
    setBusyAction(`quantity:${itemId}`);
    try {
      await updateItemQuantity({ sessionToken, cartItemId: itemId, quantity });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to update quantity",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemove(itemId: Id<"commerce_cart_items">) {
    if (!sessionToken) return;
    setBusyAction(`remove:${itemId}`);
    try {
      await removeItem({ sessionToken, cartItemId: itemId });
      toast.success("Item removed");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to remove item",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleClear() {
    if (!sessionToken) return;
    setBusyAction("clear");
    try {
      await clearCart({ sessionToken });
      toast.success("Cart cleared");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to clear cart",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApplyDiscount() {
    if (!sessionToken || !discountCode.trim()) return;
    setBusyAction("discount");
    try {
      await applyDiscountCode({
        sessionToken,
        code: discountCode.trim(),
      });
      setDiscountCode("");
      toast.success("Discount applied");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to apply discount",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRemoveDiscount() {
    if (!sessionToken) return;
    setBusyAction("discount");
    try {
      await removeDiscountCode({ sessionToken });
      toast.success("Discount removed");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to remove discount",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleEnableSharing() {
    if (!sessionToken) return;
    setSharing(true);
    try {
      const result = await enableSharing({ sessionToken });
      const shareUrl = `${window.location.origin}/cart/shared/${result.shareToken}`;
      await navigator.clipboard?.writeText(shareUrl);
      toast.success("Share link copied");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to create share link",
      );
    } finally {
      setSharing(false);
    }
  }

  async function handleDisableSharing() {
    if (!sessionToken) return;
    setSharing(true);
    try {
      await disableSharing({ sessionToken });
      toast.success("Cart sharing disabled");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to disable sharing",
      );
    } finally {
      setSharing(false);
    }
  }

  const surfaceData: CartSurfaceData = {
    isReady,
    cart,
    currencyCode,
    busyAction,
    sharing,
    discountCode,
    onDiscountCodeChange: setDiscountCode,
    actions: {
      updateQuantity: handleQuantity,
      remove: handleRemove,
      clear: handleClear,
      applyDiscount: handleApplyDiscount,
      removeDiscount: handleRemoveDiscount,
      enableSharing: handleEnableSharing,
      disableSharing: handleDisableSharing,
    },
  };

  return (
    <PublicPluginGate pluginId="commerce">
      <ShopShell kind="cart" cart={false}>
        <Surface name="cart" data={surfaceData} fallback={CoreCart} />
      </ShopShell>
    </PublicPluginGate>
  );
}
