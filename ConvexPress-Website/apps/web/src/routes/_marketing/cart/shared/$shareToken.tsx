import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";

import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import CoreSharedCart, { type SharedCartSurfaceData } from "@/templates/packs/core/surfaces/cart.shared";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/cart/shared/$shareToken")({
  component: SharedCartPage,
});

function SharedCartPage() {
  const { shareToken } = Route.useParams();
  const router = useRouter();
  const { sessionToken, isReady } = useCommerceSessionToken();
  const sharedCart = useQuery((api as any).commerce.cart.getShared, {
    shareToken,
  }) as any;
  const copyShared = useMutation((api as any).commerce.cart.copyShared);
  const [isCopying, setIsCopying] = useState(false);

  async function handleCopyCart() {
    if (!isReady || !sessionToken) return;
    setIsCopying(true);
    try {
      await copyShared({ shareToken, sessionToken });
      toast.success("Shared cart copied");
      router.navigate({ to: "/cart" });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to copy shared cart",
      );
    } finally {
      setIsCopying(false);
    }
  }

  const surfaceData: SharedCartSurfaceData = { sharedCart, isReady, isCopying, onCopy: handleCopyCart };

  return <Surface name="cart.shared" data={surfaceData} fallback={CoreSharedCart} />;
}
