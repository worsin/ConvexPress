import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Heart } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

interface WishlistButtonProps {
  productId: string;
  variantId?: string;
  /** Size variant for the button */
  size?: "sm" | "md";
  /** Optional class name override */
  className?: string;
}

/**
 * Heart icon toggle button for adding/removing a product from the user's wishlist.
 *
 * - Filled red heart when product is in a wishlist
 * - Outline heart when not
 * - Hidden when the user is not authenticated (isInWishlist returns { inWishlist: false })
 * - Click toggles add/remove via mutations
 */
export function WishlistButton({
  productId,
  variantId,
  size = "md",
  className,
}: WishlistButtonProps) {
  const addItem = useMutation(
    (api as any).commerceWishlists.mutations.addItem,
  );
  const removeItem = useMutation(
    (api as any).commerceWishlists.mutations.removeItem,
  );

  const wishlistStatus = useQuery(
    (api as any).commerceWishlists.queries.isInWishlist,
    {
      productId: productId as any,
      ...(variantId ? { variantId: variantId as any } : {}),
    },
  ) as
    | {
        inWishlist: boolean;
        wishlistId?: string;
        itemId?: string;
      }
    | undefined;

  const [busy, setBusy] = useState(false);

  // Don't render while loading to avoid layout shift
  if (wishlistStatus === undefined) {
    return null;
  }

  const inWishlist = wishlistStatus.inWishlist;

  async function handleToggle() {
    setBusy(true);
    try {
      if (inWishlist && wishlistStatus?.itemId) {
        await removeItem({ itemId: wishlistStatus.itemId as any });
        toast.success("Removed from wishlist");
      } else {
        await addItem({
          productId: productId as any,
          ...(variantId ? { variantId: variantId as any } : {}),
        });
        toast.success("Added to wishlist");
      }
    } catch (error) {
      const message =
        (error as { data?: { message?: string } })?.data?.message ??
        "Please sign in to use wishlists";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const padding = size === "sm" ? "p-1.5" : "p-2";

  return (
    <button
      type="button"
      onClick={() => void handleToggle()}
      disabled={busy}
      aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
      className={
        className ??
        `rounded-full border transition-colors disabled:opacity-50 ${padding} ${
          inWishlist
            ? "border-red-200 bg-red-50 text-red-500 hover:bg-red-100"
            : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
        }`
      }
    >
      <Heart
        className={`${iconSize} ${inWishlist ? "fill-current" : "fill-none"}`}
      />
    </button>
  );
}
