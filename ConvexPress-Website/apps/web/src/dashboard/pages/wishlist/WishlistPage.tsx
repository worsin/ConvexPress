/**
 * Wishlist loader: wishlists gate, the getMyWishlists query, one lazy
 * getWishlist subscription per expanded list (mounted as invisible
 * subscription components), the commerce session token, and every mutation
 * with its validation, confirmation and toasts. Handed to the
 * `dashboard.wishlist` surface.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import CoreDashboardWishlist, {
  type DashboardWishlistDetail,
  type DashboardWishlistSummary,
  type DashboardWishlistSurfaceData,
} from "@/templates/packs/core/surfaces/dashboard.wishlist";
import { Surface } from "@/templates/sdk/Surface";

/** Subscribes to one wishlist's items while it is expanded and reports the result upward. */
function WishlistDetailSubscription({
  wishlistId,
  onChange,
}: {
  wishlistId: string;
  onChange: (wishlistId: string, detail: DashboardWishlistDetail | null | undefined) => void;
}) {
  const detail = useQuery(
    (api as any).commerceWishlists.queries.getWishlist,
    { wishlistId: wishlistId as any },
  ) as DashboardWishlistDetail | null | undefined;

  useEffect(() => {
    onChange(wishlistId, detail);
  }, [detail, onChange, wishlistId]);

  useEffect(() => {
    return () => onChange(wishlistId, undefined);
  }, [onChange, wishlistId]);

  return null;
}

export function DashboardWishlistPage() {
  const settings = useSettings();
  const wishlistsEnabled =
    settings?.plugins?.commerceWishlistsEnabled === true;
  const currencyCode = settings?.commerceConfig?.currencyCode || "USD";

  const wishlists = useQuery(
    (api as any).commerceWishlists.queries.getMyWishlists,
    wishlistsEnabled ? {} : "skip",
  ) as DashboardWishlistSummary[] | undefined;

  const createWishlist = useMutation((api as any).commerceWishlists.mutations.createWishlist);
  const removeItem = useMutation((api as any).commerceWishlists.mutations.removeItem);
  const moveToCart = useMutation((api as any).commerceWishlists.mutations.moveToCart);
  const toggleShare = useMutation((api as any).commerceWishlists.mutations.toggleShare);
  const deleteWishlist = useMutation((api as any).commerceWishlists.mutations.deleteWishlist);
  const { sessionToken, isReady } = useCommerceSessionToken();

  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, DashboardWishlistDetail | null | undefined>>({});

  const onDetailChange = useCallback((wishlistId: string, detail: DashboardWishlistDetail | null | undefined) => {
    setDetails((prev) => {
      if (prev[wishlistId] === detail) return prev;
      return { ...prev, [wishlistId]: detail };
    });
  }, []);

  const actions: DashboardWishlistSurfaceData["actions"] = useMemo(
    () => ({
      toggleExpanded: (wishlistId) => {
        setExpandedIds((prev) =>
          prev.includes(wishlistId) ? prev.filter((id) => id !== wishlistId) : [...prev, wishlistId],
        );
      },
      create: async (name, isPublic) => {
        if (!name.trim()) {
          toast.error("Please enter a name for your wishlist");
          return false;
        }
        try {
          await createWishlist({ name: name.trim(), isPublic });
          toast.success("Wishlist created");
          return true;
        } catch (error) {
          toast.error(
            (error as { data?: { message?: string } })?.data?.message ??
              "Failed to create wishlist",
          );
          return false;
        }
      },
      removeItem: async (itemId) => {
        try {
          await removeItem({ itemId: itemId as any });
          toast.success("Item removed from wishlist");
        } catch (error) {
          toast.error(
            (error as { data?: { message?: string } })?.data?.message ??
              "Failed to remove item",
          );
        }
      },
      moveToCart: async (itemId) => {
        if (!isReady || !sessionToken) return;
        try {
          await moveToCart({
            itemId: itemId as any,
            sessionToken,
            quantity: 1,
          });
          toast.success("Moved to cart");
        } catch (error) {
          toast.error(
            (error as { data?: { message?: string } })?.data?.message ??
              "Failed to move item to cart",
          );
        }
      },
      toggleShare: async (wishlistId) => {
        try {
          const result = await toggleShare({ wishlistId: wishlistId as any });
          if ((result as any)?.isPublic) {
            toast.success("Wishlist is now public");
          } else {
            toast.success("Wishlist is now private");
          }
        } catch (error) {
          toast.error(
            (error as { data?: { message?: string } })?.data?.message ??
              "Failed to toggle sharing",
          );
        }
      },
      deleteWishlist: async (wishlistId) => {
        if (!confirm("Delete this wishlist and all its items?")) return;
        try {
          await deleteWishlist({ wishlistId: wishlistId as any });
          toast.success("Wishlist deleted");
        } catch (error) {
          toast.error(
            (error as { data?: { message?: string } })?.data?.message ??
              "Failed to delete wishlist",
          );
        }
      },
      copyShareLink: (shareToken) => {
        const url = `${window.location.origin}/wishlist/${shareToken}`;
        navigator.clipboard.writeText(url).then(
          () => toast.success("Share link copied to clipboard"),
          () => toast.error("Failed to copy link"),
        );
      },
    }),
    [createWishlist, deleteWishlist, isReady, moveToCart, removeItem, sessionToken, toggleShare],
  );

  const data: DashboardWishlistSurfaceData = {
    wishlists,
    currencyCode,
    expandedIds,
    detailFor: (wishlistId) => details[wishlistId],
    actions,
  };

  return (
    <PublicPluginGate pluginId="commerceWishlists">
      {expandedIds.map((wishlistId) => (
        <WishlistDetailSubscription key={wishlistId} wishlistId={wishlistId} onChange={onDetailChange} />
      ))}
      <Surface name="dashboard.wishlist" data={data} fallback={CoreDashboardWishlist} />
    </PublicPluginGate>
  );
}
