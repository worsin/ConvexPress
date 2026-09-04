/** Core · wishlist.shared — a wishlist shared by link, each item addable to the viewer's cart. */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Heart, Package, ShoppingCart } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface SharedWishlistItem {
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
}

export interface SharedWishlist {
  _id: string;
  name: string;
  ownerName: string;
  items: SharedWishlistItem[];
}

export interface SharedWishlistSurfaceData {
  /** `undefined` while loading, `null` when the link is invalid or the list is private. */
  wishlist: SharedWishlist | null | undefined;
  currencyCode: string;
  /**
   * Adds one item to the viewer's cart (the route owns the mutation and toasts).
   * Resolves when the mutation settles, so the card can show its busy state.
   */
  onAddToCart: (item: SharedWishlistItem) => Promise<void>;
}

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function SharedItemCard({
  item,
  currencyCode,
  onAddToCart,
}: {
  item: SharedWishlistItem;
  currencyCode: string;
  onAddToCart: (item: SharedWishlistItem) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function handleAddToCart() {
    setBusy(true);
    try {
      await onAddToCart(item);
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

export default function CoreSharedWishlist({ data }: SurfaceProps<SharedWishlistSurfaceData>) {
  const { wishlist, currencyCode, onAddToCart } = data;

  return (
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
                  onAddToCart={onAddToCart}
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
  );
}
