import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Heart, ShoppingCart, Package } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { MediaImage } from "@/components/media/MediaImage";
import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";

export const Route = createFileRoute("/_marketing/wishlist/$token")({
  component: SharedWishlistPage,
});

// ---- Formatters ----

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

// ---- Product Card ----

function SharedItemCard({
  item,
  currencyCode,
}: {
  item: {
    _id: string;
    productId: string;
    effectivePrice: number;
    product: {
      _id: string;
      title: string;
      slug?: string;
      featuredMediaId?: string;
      basePrice?: { amount: number; currencyCode?: string };
      salePrice?: { amount: number };
    } | null;
    variant?: {
      _id: string;
      name?: string;
    } | null;
  };
  currencyCode: string;
}) {
  const addToCart = useMutation((api as any).commerce.cart.addItem);
  const { sessionToken, isReady } = useCommerceSessionToken();
  const [busy, setBusy] = useState(false);

  async function handleAddToCart() {
    if (!isReady || !sessionToken) return;
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  }

  const product = item.product;
  if (!product) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      {/* Product image */}
      <div className="aspect-square bg-muted/40">
        {product.featuredMediaId ? (
          <MediaImage
            mediaId={product.featuredMediaId as any}
            alt={product.title}
            className="h-full w-full object-cover"
            preferredSize="medium"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Product info */}
      <div className="p-4">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {product.title}
        </h3>
        {item.variant?.name && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.variant.name}
          </p>
        )}
        <p className="mt-1 text-sm font-medium text-foreground">
          {formatMoney(item.effectivePrice, currencyCode)}
        </p>

        <button
          type="button"
          onClick={() => void handleAddToCart()}
          disabled={busy}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingCart className="h-4 w-4" />
          {busy ? "Adding..." : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}

// ---- Main Page ----

function SharedWishlistPage() {
  const { token } = Route.useParams();
  const settings = useSettings();
  const wishlistsEnabled =
    settings?.plugins?.commerceWishlistsEnabled === true;
  const currencyCode = settings?.commerceConfig?.currencyCode || "USD";

  const wishlist = useQuery(
    (api as any).commerceWishlists.queries.getSharedWishlist,
    wishlistsEnabled ? { shareToken: token } : "skip",
  ) as
    | {
        _id: string;
        name: string;
        ownerName: string;
        items: Array<{
          _id: string;
          productId: string;
          effectivePrice: number;
          product: {
            _id: string;
            title: string;
            slug?: string;
            featuredMediaId?: string;
            basePrice?: { amount: number; currencyCode?: string };
            salePrice?: { amount: number };
          } | null;
          variant?: {
            _id: string;
            name?: string;
          } | null;
        }>;
      }
    | null
    | undefined;

  return (
    <PublicPluginGate pluginId="commerceWishlists">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 py-12">
        {wishlist === undefined ? (
          <div className="space-y-6">
            <div className="h-10 w-64 animate-pulse rounded-xl bg-muted" />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-72 animate-pulse rounded-2xl bg-muted"
                />
              ))}
            </div>
          </div>
        ) : !wishlist ? (
          <div className="rounded-[2rem] border border-dashed border-border p-10 text-center">
            <Heart className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-foreground">
              Wishlist not found
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              This wishlist may have been made private or the link is invalid.
            </p>
            <Link
              to="/shop"
              className="mt-6 inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Browse Shop
            </Link>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Heart className="h-4 w-4 text-destructive" />
                <span>Wishlist by {wishlist.ownerName}</span>
              </div>
              <h1 className="text-4xl font-semibold tracking-tight">
                {wishlist.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {wishlist.items.length} item
                {wishlist.items.length === 1 ? "" : "s"}
              </p>
            </div>

            {/* Items grid */}
            {wishlist.items.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                This wishlist is empty.
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {wishlist.items.map((item) => (
                  <SharedItemCard
                    key={item._id}
                    item={item}
                    currencyCode={currencyCode}
                  />
                ))}
              </div>
            )}

            {/* Continue shopping */}
            <div>
              <Link
                to="/shop"
                className="inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Continue Shopping
              </Link>
            </div>
          </>
        )}
      </div>
    </PublicPluginGate>
  );
}
