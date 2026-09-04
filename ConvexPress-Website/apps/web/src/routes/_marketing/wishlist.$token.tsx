import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import { requirePublicPluginEnabled } from "@/lib/plugins/public-route-loader";
import CoreSharedWishlist, {
  type SharedWishlist,
  type SharedWishlistItem,
  type SharedWishlistSurfaceData,
} from "@/templates/packs/core/surfaces/wishlist.shared";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/wishlist/$token")({
  loader: async ({ context: { queryClient } }) => {
    await requirePublicPluginEnabled(queryClient, "commerceWishlists");
  },
  component: SharedWishlistPage,
});

function SharedWishlistPage() {
  const { token } = Route.useParams();
  const settings = useSettings();
  const wishlistsEnabled =
    settings?.plugins?.commerceWishlistsEnabled === true;
  const currencyCode = settings?.commerceConfig?.currencyCode || "USD";
  const { sessionToken, isReady } = useCommerceSessionToken();
  const addToCart = useMutation((api as any).commerce.cart.addItem);

  const wishlist = useQuery(
    (api as any).commerceWishlists.queries.getSharedWishlist,
    wishlistsEnabled ? { shareToken: token } : "skip",
  ) as SharedWishlist | null | undefined;

  async function handleAddToCart(item: SharedWishlistItem) {
    if (!isReady || !sessionToken) return;
    try {
      await addToCart({
        sessionToken,
        productId: item.productId as any,
        quantity: 1,
      });
      toast.success("Added to cart");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to add item to cart",
      );
    }
  }

  const surfaceData: SharedWishlistSurfaceData = { wishlist, currencyCode, onAddToCart: handleAddToCart };

  return (
    <PublicPluginGate pluginId="commerceWishlists">
      <Surface name="wishlist.shared" data={surfaceData} fallback={CoreSharedWishlist} />
    </PublicPluginGate>
  );
}
