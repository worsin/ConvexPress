/**
 * Compact product card used inside the assistant rail, the cart drawer and
 * "goes with this" rows. Same cart state as the grid, so the stepper is live.
 */

import { Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import { useCart } from "@/hooks/useCart";
import { formatMoney, percentOff } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";
import { useProductCardPricing, type CardPricing } from "./product/useProductCardPricing";

export interface ProductCardData {
  pricing?: CardPricing["pricing"];
  productId: string;
  slug: string;
  title: string;
  excerpt: string;
  summary: string | null;
  price: { amount: number; currencyCode: string };
  compareAtPrice: { amount: number; currencyCode: string } | null;
  featuredMediaId: string | null;
  categories: Array<{ id: string; name: string; slug: string }>;
  inStock: boolean;
  stockQuantity: number | null;
  productType: string;
  attributes: Record<string, unknown> | null;
  defaultVariantId: string | null;
}

export function CartStepper({
  product,
  size = "sm",
  className,
  onAdded,
}: {
  product: Pick<ProductCardData, "productId" | "title" | "inStock" | "defaultVariantId">;
  size?: "sm" | "md";
  className?: string;
  onAdded?: () => void;
}) {
  const { lineByProduct, add, setQuantity, busyProductId, isReady } = useCart();
  const line = lineByProduct.get(product.productId);
  const busy = busyProductId === product.productId || !isReady;
  const h = size === "md" ? "h-10" : "h-8";
  const text = size === "md" ? "text-sm" : "text-xs";

  if (!product.inStock) {
    return (
      <span className={cn("inline-flex items-center rounded-md border border-border px-2.5 font-medium text-muted-foreground", h, text, className)}>
        Out of stock
      </span>
    );
  }

  if (line) {
    return (
      <span className={cn("inline-flex items-center rounded-md border border-primary/60 bg-primary/10 text-foreground", h, className)}>
        <button
          type="button"
          aria-label={`Remove one ${product.title} from cart`}
          disabled={busy}
          onClick={() => void setQuantity(product.productId, line.quantity - 1)}
          className="flex h-full w-8 items-center justify-center text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </button>
        <span className={cn("min-w-14 text-center font-semibold", text)}>{line.quantity} in cart</span>
        <button
          type="button"
          aria-label={`Add one more ${product.title} to cart`}
          disabled={busy}
          onClick={() => void setQuantity(product.productId, line.quantity + 1)}
          className="flex h-full w-8 items-center justify-center text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        void add(product.productId, { variantId: product.defaultVariantId, label: product.title }).then((ok) => {
          if (ok) onAdded?.();
        });
      }}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50",
        h,
        text,
        className,
      )}
    >
      <ShoppingBag className="size-3.5" aria-hidden="true" />
      Add to cart
    </button>
  );
}

export function ProductMiniCard({
  product: sourceProduct,
  rationale,
  onNavigate,
  onAdded,
  className,
}: {
  product: ProductCardData;
  rationale?: string | null;
  onNavigate?: () => void;
  onAdded?: () => void;
  className?: string;
}) {
  const product = useProductCardPricing(sourceProduct);
  const off = percentOff(product.price.amount, product.compareAtPrice?.amount);
  return (
    <article
      data-slot="product-mini-card"
      className={cn("grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-card p-2.5", className)}
    >
      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        onClick={onNavigate}
        className="aspect-square overflow-hidden rounded-md bg-muted"
        aria-label={product.title}
      >
        {product.featuredMediaId ? (
          <MediaImage
            mediaId={product.featuredMediaId as any}
            alt={product.title}
            className="h-full w-full object-cover"
            preferredSize="medium"
            sizes="72px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ShoppingBag className="size-5" aria-hidden="true" />
          </div>
        )}
      </Link>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Link
          to="/products/$slug"
          params={{ slug: product.slug }}
          onClick={onNavigate}
          className="line-clamp-2 text-sm font-semibold leading-5 text-foreground hover:text-primary"
        >
          {product.title}
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-foreground">
            {formatMoney(product.price.amount, product.price.currencyCode)}
          </span>
          {product.compareAtPrice && (
            <span className="text-xs text-muted-foreground line-through">
              {formatMoney(product.compareAtPrice.amount, product.compareAtPrice.currencyCode)}
            </span>
          )}
          {off !== null && (
            <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {off}% off
            </span>
          )}
        </div>
        {(rationale ?? product.summary) && (
          <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">{rationale ?? product.summary}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <CartStepper product={product} onAdded={onAdded} />
          {!product.inStock ? null : product.stockQuantity !== null && product.stockQuantity <= 5 ? (
            <span className="text-[11px] font-medium text-primary">Only {product.stockQuantity} left</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
