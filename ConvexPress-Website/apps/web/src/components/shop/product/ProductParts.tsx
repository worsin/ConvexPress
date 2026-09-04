/**
 * The building blocks every product layout is composed from. Each part
 * renders from `ProductPageState`, so a layout only decides placement.
 */

import { Link } from "@tanstack/react-router";
import DOMPurify from "isomorphic-dompurify";
import { Check, Minus, Plus, Sparkles, Truck } from "lucide-react";
import { useState } from "react";

import { WishlistButton } from "@/components/commerce/WishlistButton";
import { MediaImage } from "@/components/media/MediaImage";
import { UpgradeCTA } from "@/components/membership/UpgradeCTA";
import { useShopShell } from "@/components/shop/ShopShell";
import { useAssistantConfig } from "@/hooks/useAssistantConfig";
import { formatMoney } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";
import type { ProductDetail, ProductPageState } from "./useProductPage";

export interface PartProps {
  product: ProductDetail;
  state: ProductPageState;
  className?: string;
}

/* ───────────────────────── breadcrumb + ask ───────────────────────── */

export function ProductBreadcrumb({ product, className }: Pick<PartProps, "product" | "className">) {
  const category = product.categories?.[0];
  return (
    <nav aria-label="Breadcrumb" className={cn("flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground", className)}>
      <Link to="/products" className="hover:text-foreground">
        Shop
      </Link>
      {category && (
        <>
          <span aria-hidden="true">/</span>
          <Link to="/products" search={{ category: category.slug } as any} className="hover:text-foreground">
            {category.name}
          </Link>
        </>
      )}
      <span aria-hidden="true">/</span>
      <span className="text-foreground">{product.title}</span>
    </nav>
  );
}

export function AskAboutProduct({ product, className }: Pick<PartProps, "product" | "className">) {
  const shell = useShopShell();
  if (!shell || !shell.config.enabled) return null;
  return (
    <button
      type="button"
      onClick={() => shell.ask(`Is the ${product.title} right for me, and what do I need with it?`)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:text-primary",
        className,
      )}
    >
      <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
      Ask {shell.config.displayName} about this
    </button>
  );
}

/* ───────────────────────── gallery ───────────────────────── */

export function ProductGallery({
  product,
  state,
  className,
  aspect = "aspect-[4/3]",
  thumbs = "bottom",
  rounded = "rounded-2xl",
}: PartProps & { aspect?: string; thumbs?: "bottom" | "left" | "none"; rounded?: string }) {
  const { gallery, displayMediaId, setActiveMediaId } = state;
  const main = (
    <div className={cn("relative overflow-hidden border border-border bg-muted/40", aspect, rounded)}>
      {displayMediaId ? (
        <MediaImage
          key={displayMediaId}
          mediaId={displayMediaId as any}
          alt={product.title}
          className="h-full w-full object-cover"
          preferredSize="large"
          sizes="(max-width: 1024px) 100vw, 60vw"
          loading="eager"
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5 text-sm text-primary">{product.title}</div>
      )}
    </div>
  );
  const strip =
    thumbs !== "none" && gallery.length > 1 ? (
      <ul className={cn("flex gap-2", thumbs === "left" ? "flex-col" : "flex-row overflow-x-auto")} aria-label="Product photos">
        {gallery.map((id) => (
          <li key={id} className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveMediaId(id)}
              aria-pressed={id === displayMediaId}
              className={cn(
                "block size-16 overflow-hidden rounded-lg border transition-colors",
                id === displayMediaId ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50",
              )}
            >
              <MediaImage mediaId={id as any} alt="" className="size-full object-cover" preferredSize="thumbnail" sizes="64px" />
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  if (thumbs === "left") {
    return (
      <div className={cn("flex gap-3", className)}>
        {strip}
        <div className="min-w-0 flex-1">{main}</div>
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {main}
      {strip}
    </div>
  );
}

/* ───────────────────────── summary ───────────────────────── */

export function ProductSummary({ product, state, className, size = "lg" }: PartProps & { size?: "lg" | "xl" | "md" }) {
  return (
    <div className={cn("space-y-3", className)}>
      {product.categories?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {product.categories.map((category) => (
            <Link
              key={category._id}
              to="/products"
              search={{ category: category.slug } as any}
              className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15"
            >
              {category.name}
            </Link>
          ))}
        </div>
      ) : null}
      <h1
        className={cn(
          "font-semibold tracking-tight text-foreground",
          size === "xl" ? "text-4xl md:text-5xl" : size === "md" ? "text-2xl" : "text-3xl md:text-4xl",
        )}
      >
        {product.title}
      </h1>
      {product.excerpt ? <p className="text-base leading-7 text-muted-foreground">{product.excerpt}</p> : null}
      <ProductPrice state={state} />
    </div>
  );
}

export function ProductPrice({ state, className, size = "lg" }: Pick<PartProps, "state" | "className"> & { size?: "lg" | "md" }) {
  return (
    <div className={cn("flex flex-wrap items-baseline gap-2", className)}>
      <span className={cn("font-semibold tabular-nums text-foreground", size === "lg" ? "text-3xl" : "text-2xl")}>{state.priceLabel}</span>
      {state.showCompare && state.regularPrice ? (
        <span className="text-base tabular-nums text-muted-foreground line-through">{formatMoney(state.regularPrice, state.currency)}</span>
      ) : null}
    </div>
  );
}

/* ───────────────────────── buy box ───────────────────────── */

export function StockLine({ state, className }: Pick<PartProps, "state" | "className">) {
  if (state.requiresSelection) return null;
  const label =
    state.stockStatus === "instock"
      ? state.stockQuantity != null && state.stockQuantity <= 5
        ? `Only ${state.stockQuantity} left`
        : "In stock"
      : state.stockStatus === "outofstock"
        ? "Out of stock"
        : state.backorders === "notify"
          ? "Available on backorder"
          : "On backorder";
  return (
    <p className={cn("flex items-center gap-1.5 text-sm font-medium", state.outOfStock ? "text-destructive" : "text-primary", className)}>
      {!state.outOfStock && <Check className="size-4" aria-hidden="true" />}
      {label}
    </p>
  );
}

export function VariantPicker({ state, className }: Pick<PartProps, "state" | "className">) {
  if (!state.isVariable) return null;
  return (
    <div className={cn("space-y-4", className)}>
      {state.optionTypes.map((optionType) => (
        <div key={optionType.id} className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            {optionType.name}
            {state.selectedOptions[optionType.id] && (
              <span className="ml-1.5 font-normal text-muted-foreground">
                {optionType.values?.find((value) => value.id === state.selectedOptions[optionType.id])?.label}
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {(optionType.values ?? []).map((value) => {
              const selected = state.selectedOptions[optionType.id] === value.id;
              const enabled = state.optionEnabled(optionType.id, value.id);
              return (
                <button
                  key={value.id}
                  type="button"
                  disabled={!enabled}
                  onClick={() => state.selectOption(optionType.id, value.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                  )}
                >
                  {value.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {state.requiresSelection && <p className="text-xs text-muted-foreground">Choose one value from each option.</p>}
    </div>
  );
}

export function QuantityStepper({ state, className }: Pick<PartProps, "state" | "className">) {
  return (
    <div className={cn("inline-flex h-11 items-center rounded-md border border-border bg-background", className)} role="group" aria-label="Quantity">
      <button
        type="button"
        onClick={() => state.setQuantity(Math.max(1, state.quantity - 1))}
        aria-label="Decrease quantity"
        className="flex h-full w-10 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span className="min-w-8 text-center text-sm font-semibold tabular-nums">{state.quantity}</span>
      <button
        type="button"
        onClick={() => state.setQuantity(Math.min(99, state.quantity + 1))}
        aria-label="Increase quantity"
        className="flex h-full w-10 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function AddToCartButton({ state, className, size = "lg" }: PartProps & { size?: "lg" | "md" }) {
  const [justAdded, setJustAdded] = useState(false);
  const label = state.requiresSelection ? "Select options" : state.outOfStock ? "Out of stock" : justAdded ? "Added" : "Add to cart";
  return (
    <button
      type="button"
      onClick={() => {
        void state.addToCart().then((ok) => {
          if (!ok) return;
          setJustAdded(true);
          window.setTimeout(() => setJustAdded(false), 1600);
        });
      }}
      disabled={state.busy || state.outOfStock || state.requiresSelection}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50",
        size === "lg" ? "h-11 min-w-[9rem] px-6 text-sm" : "h-10 px-4 text-sm",
        className,
      )}
    >
      {justAdded && <Check className="size-4" aria-hidden="true" />}
      {label}
      {state.inCart && !justAdded && !state.requiresSelection && !state.outOfStock ? (
        <span className="rounded-full bg-primary-foreground/20 px-1.5 text-[11px]">{state.inCart.quantity} in cart</span>
      ) : null}
    </button>
  );
}

/** Price, options, stock, quantity, add to cart, wishlist — the whole purchase decision. */
export function ProductBuyBox({ product, state, className, showPrice = true, framed = true }: PartProps & { showPrice?: boolean; framed?: boolean }) {
  const assistant = useAssistantConfig();
  const threshold = assistant.freeShippingThresholdMinor;
  return (
    <div className={cn("space-y-4", framed && "rounded-2xl border border-border bg-card p-5 shadow-sm", className)}>
      {showPrice && <ProductPrice state={state} />}
      <VariantPicker state={state} />
      {state.currentVariant?.description ? <p className="text-sm text-muted-foreground">{state.currentVariant.description}</p> : null}
      <StockLine state={state} />
      {!state.access.allowed ? (
        <UpgradeCTA
          matchingPlanIds={state.access.matchingPlanIds as any}
          title="Members-only product"
          description="This product is available to members only. Upgrade your plan to purchase."
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <QuantityStepper state={state} />
          <AddToCartButton product={product} state={state} className="flex-1" />
          {!state.isVariable || state.selectedVariant ? (
            <WishlistButton
              productId={product._id}
              variantId={state.isVariable ? state.selectedVariant?._id : undefined}
              className="inline-flex h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
            />
          ) : null}
        </div>
      )}
      <ul className="space-y-1 text-xs text-muted-foreground">
        {threshold > 0 && (
          <li className="flex items-center gap-1.5">
            <Truck className="size-3.5" aria-hidden="true" /> Free shipping over {formatMoney(threshold, state.currency).replace(/\.00$/, "")}
          </li>
        )}
        <li>
          {product.isDownloadable ? "Digital delivery after checkout" : product.isVirtual ? "Virtual service, nothing ships" : "Ships from our warehouse"}
        </li>
        {state.sku && <li>SKU {state.sku}</li>}
      </ul>
    </div>
  );
}

/* ───────────────────────── details ───────────────────────── */

const DESCRIPTION_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "h3", "h4", "blockquote", "table", "thead", "tbody", "tr", "th", "td"];

export function ProductDescription({ product, className, heading = true }: Pick<PartProps, "product" | "className"> & { heading?: boolean }) {
  const raw = product.description?.trim();
  if (!raw) return null;
  // Descriptions imported from WooCommerce arrive as HTML; hand-typed ones are plain text.
  const isHtml = /<\/?[a-z][^>]*>/i.test(raw);
  return (
    <section className={cn("space-y-3", className)}>
      {heading && <h2 className="text-xl font-semibold tracking-tight text-foreground">About this product</h2>}
      {isHtml ? (
        <div
          className="prose prose-neutral max-w-none text-base leading-8 text-muted-foreground [&_a]:text-primary [&_li]:my-1 [&_p]:my-3 [&_strong]:text-foreground"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(raw, { ALLOWED_TAGS: DESCRIPTION_TAGS, ALLOWED_ATTR: ["href", "rel", "target"] }) }}
        />
      ) : (
        <p className="whitespace-pre-wrap text-base leading-8 text-muted-foreground">{raw}</p>
      )}
    </section>
  );
}

function specRows(product: ProductDetail, state: ProductPageState): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (state.sku) rows.push(["SKU", state.sku]);
  rows.push([
    "Availability",
    state.stockStatus === "instock"
      ? state.stockQuantity != null
        ? `${state.stockQuantity} in stock`
        : "In stock"
      : state.stockStatus === "outofstock"
        ? "Out of stock"
        : "On backorder",
  ]);
  rows.push(["Delivery", product.isDownloadable ? "Digital" : product.isVirtual ? "Virtual service" : "Physical"]);
  if (state.currentVariant?.title && state.isVariable) rows.push(["Variant", state.currentVariant.optionSummary || state.currentVariant.title]);
  const attributes = product.attributes && typeof product.attributes === "object" ? product.attributes : {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null || typeof value === "object") continue;
    rows.push([key.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()), String(value)]);
  }
  return rows;
}

export function ProductSpecs({ product, state, className, variant = "cards" }: PartProps & { variant?: "cards" | "table" }) {
  const rows = specRows(product, state);
  if (variant === "table") {
    return (
      <section className={cn("space-y-3", className)}>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Specifications</h2>
        <dl className="divide-y divide-border rounded-xl border border-border">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 px-4 py-2.5 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }
  return (
    <dl className={cn("grid gap-3 text-sm sm:grid-cols-2", className)}>
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-muted/40 p-4">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="mt-1 font-medium text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
