/**
 * Full-size product card for the catalog and search grids. Shares the cart
 * stepper with the rail so an item added from either place shows "in cart"
 * in both.
 */

import { Link } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import { formatMoney, percentOff } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";
import { useProductCardPricing } from "./product/useProductCardPricing";
import { CartStepper, type ProductCardData } from "./ProductMiniCard";

export function ProductGridCard({ product: sourceProduct, className }: { product: ProductCardData; className?: string }) {
  const product = useProductCardPricing(sourceProduct);
  const off = percentOff(product.price.amount, product.compareAtPrice?.amount);
  return (
    <article
      data-slot="product-grid-card"
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md",
        className,
      )}
    >
      <Link to="/products/$slug" params={{ slug: product.slug }} className="relative block aspect-square bg-muted/40">
        {product.featuredMediaId ? (
          <MediaImage
            mediaId={product.featuredMediaId as any}
            alt={product.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            preferredSize="large"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ShoppingBag className="size-8" aria-hidden="true" />
          </div>
        )}
        {off !== null && (
          <span className="absolute left-3 top-3 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground">
            {off}% off
          </span>
        )}
        {!product.inStock && (
          <span className="absolute right-3 top-3 rounded-md bg-background/90 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sold out
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {product.categories.length > 0 && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {product.categories[0]!.name}
          </span>
        )}
        <Link
          to="/products/$slug"
          params={{ slug: product.slug }}
          className="line-clamp-2 text-base font-semibold leading-6 text-foreground hover:text-primary"
        >
          {product.title}
        </Link>
        {product.summary && <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">{product.summary}</p>}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-3 gap-y-2 pt-2">
          <div className="flex flex-col">
            {product.compareAtPrice && (
              <span className="text-xs text-muted-foreground line-through">
                {formatMoney(product.compareAtPrice.amount, product.compareAtPrice.currencyCode)}
              </span>
            )}
            <span className="text-lg font-semibold text-foreground">
              {formatMoney(product.price.amount, product.price.currencyCode)}
            </span>
          </div>
          <CartStepper product={product} size="md" />
        </div>
      </div>
    </article>
  );
}
