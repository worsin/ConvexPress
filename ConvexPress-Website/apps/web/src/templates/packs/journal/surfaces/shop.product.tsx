/**
 * Journal · shop.product — the product page. Default `split`: a sticky 4:5
 * image on the left, and on the right the title in display type, the price,
 * options as pills, the add-to-cart pill, then the description in the reading
 * measure and specs as a rule-separated list. Also `classic` (gallery beside
 * details, description below) and `minimal` (one quiet centred column).
 *
 * Purchase logic is the shared `ProductPageState`; only the arrangement and
 * dress differ from Core.
 */
import { Check, Minus, Plus, Truck } from "lucide-react";
import { useState } from "react";

import { ProductReviews } from "@/components/commerce/ProductReviews";
import { WishlistButton } from "@/components/commerce/WishlistButton";
import { MediaImage } from "@/components/media/MediaImage";
import { UpgradeCTA } from "@/components/membership/UpgradeCTA";
import { AskAboutProduct, ProductDescription, StockLine, VariantPicker } from "@/components/shop/product/ProductParts";
import type { ProductDetail, ProductPageState } from "@/components/shop/product/useProductPage";
import { RelatedProducts } from "@/components/shop/RelatedProducts";
import { useAssistantConfig } from "@/hooks/useAssistantConfig";
import { useShopLayout } from "@/hooks/useShopLayout";
import { formatMoney } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";
import type { ProductSurfaceData } from "@/templates/packs/core/surfaces/shop.product";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Breadcrumbs, Container, Price, Prose, Rule, SmallCaps } from "../parts";

type Variant = "split" | "classic" | "minimal";
const VARIANTS = new Set<Variant>(["split", "classic", "minimal"]);

interface PartProps {
  product: ProductDetail;
  state: ProductPageState;
  className?: string;
}

export default function JournalShopProduct({ data, variant }: SurfaceProps<ProductSurfaceData>) {
  const layout = useShopLayout();
  const chosen = variant && VARIANTS.has(variant as Variant) ? (variant as Variant) : VARIANTS.has(layout.productLayout as Variant) ? (layout.productLayout as Variant) : "split";
  const props = { product: data.product, state: data.state };
  return (
    <Container data-product-layout={chosen} className="py-4 md:py-8">
      {chosen === "classic" ? <ClassicLayout {...props} /> : chosen === "minimal" ? <MinimalLayout {...props} /> : <SplitLayout {...props} />}
    </Container>
  );
}

/* ───────────────────────── layouts ───────────────────────── */

function SplitLayout({ product, state }: PartProps) {
  return (
    <div className="flex flex-col gap-14 md:gap-20">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
        <Gallery product={product} state={state} className="lg:sticky lg:top-24 lg:self-start" />
        <div className="flex flex-col gap-10 lg:py-4">
          <TopLine product={product} />
          <Summary product={product} state={state} />
          <BuyBox product={product} state={state} />
          <Description product={product} />
          <Specs product={product} state={state} />
        </div>
      </div>
      <Tail product={product} />
    </div>
  );
}

function ClassicLayout({ product, state }: PartProps) {
  return (
    <div className="flex flex-col gap-14 md:gap-20">
      <TopLine product={product} />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
        <Gallery product={product} state={state} aspect="aspect-[4/3]" />
        <div className="flex flex-col gap-10">
          <Summary product={product} state={state} />
          <BuyBox product={product} state={state} />
        </div>
      </div>
      <Rule />
      <Prose className="flex flex-col gap-14">
        <Description product={product} />
        <Specs product={product} state={state} />
      </Prose>
      <Tail product={product} />
    </div>
  );
}

function MinimalLayout({ product, state }: PartProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-14 md:gap-20">
      <div className="flex flex-col items-center gap-10 text-center">
        <TopLine product={product} centered />
        <Gallery product={product} state={state} aspect="aspect-square" thumbs="none" className="w-full" />
        <Summary product={product} state={state} centered />
        <BuyBox product={product} state={state} className="w-full max-w-md text-left" />
      </div>
      <Rule />
      <div className="flex flex-col gap-14">
        <Description product={product} />
        <Specs product={product} state={state} />
      </div>
      <Tail product={product} />
    </div>
  );
}

/* ───────────────────────── parts ───────────────────────── */

function TopLine({ product, centered = false }: { product: ProductDetail; centered?: boolean }) {
  const category = product.categories?.[0];
  return (
    <div className={cn("flex flex-wrap items-center gap-4", centered ? "justify-center" : "justify-between")}>
      <Breadcrumbs
        items={[
          { label: "Shop", to: "/products" },
          ...(category ? [{ label: category.name, to: "/products", search: { category: category.slug } }] : []),
          { label: product.title },
        ]}
      />
      <AskAboutProduct product={product} />
    </div>
  );
}

function Gallery({ product, state, className, aspect = "aspect-[4/5]", thumbs = "bottom" }: PartProps & { aspect?: string; thumbs?: "bottom" | "none" }) {
  const { gallery, displayMediaId, setActiveMediaId } = state;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className={cn("relative overflow-hidden rounded-2xl bg-muted", aspect)}>
        {displayMediaId ? (
          <MediaImage key={displayMediaId} mediaId={displayMediaId as any} alt={product.title} className="h-full w-full object-cover" preferredSize="large" sizes="(max-width: 1024px) 100vw, 58vw" loading="eager" />
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center font-display text-2xl text-muted-foreground">{product.title}</div>
        )}
      </div>
      {thumbs !== "none" && gallery.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto" aria-label="Product photos">
          {gallery.map((id) => (
            <li key={id} className="shrink-0">
              <button
                type="button"
                onClick={() => setActiveMediaId(id)}
                aria-pressed={id === displayMediaId}
                className={cn("block size-16 overflow-hidden rounded-xl border transition-colors", id === displayMediaId ? "border-foreground" : "border-transparent hover:border-border")}
              >
                <MediaImage mediaId={id as any} alt="" className="size-full object-cover" preferredSize="thumbnail" sizes="64px" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Summary({ product, state, centered = false }: PartProps & { centered?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-4", centered && "items-center text-center")}>
      {product.categories?.length ? (
        <p className={cn("flex flex-wrap gap-x-4 gap-y-1", centered && "justify-center")}>
          {product.categories.map((category) => (
            <a key={category._id} href={`/products?category=${encodeURIComponent(category.slug)}`} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary hover:underline">
              {category.name}
            </a>
          ))}
        </p>
      ) : null}
      <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-5xl">{product.title}</h1>
      {product.excerpt ? <p className="max-w-[48ch] text-base leading-8 text-muted-foreground md:text-[17px]">{product.excerpt}</p> : null}
      <Price label={state.priceLabel} amount={state.price} currency={state.currency} compareAt={state.showCompare ? state.regularPrice : null} size="lg" />
    </div>
  );
}

function BuyBox({ product, state, className }: PartProps) {
  const assistant = useAssistantConfig();
  const threshold = assistant.freeShippingThresholdMinor;
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <VariantPicker state={state} />
      {state.currentVariant?.description ? <p className="text-sm leading-6 text-muted-foreground">{state.currentVariant.description}</p> : null}
      <StockLine state={state} />
      {!state.access.allowed ? (
        <UpgradeCTA matchingPlanIds={state.access.matchingPlanIds as any} title="Members-only product" description="This product is available to members only. Upgrade your plan to purchase." />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Stepper state={state} />
          <AddToCartPill state={state} className="flex-1" />
          {!state.isVariable || state.selectedVariant ? (
            <WishlistButton
              productId={product._id}
              variantId={state.isVariable ? state.selectedVariant?._id : undefined}
              className="inline-flex h-11 items-center justify-center rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-50"
            />
          ) : null}
        </div>
      )}
      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        {threshold > 0 ? (
          <li className="flex items-center gap-1.5">
            <Truck className="size-3.5" aria-hidden="true" /> Free shipping over {formatMoney(threshold, state.currency).replace(/\.00$/, "")}
          </li>
        ) : null}
        <li>{product.isDownloadable ? "Digital delivery after checkout" : product.isVirtual ? "Virtual service, nothing ships" : "Ships from our warehouse"}</li>
        {state.sku ? <li>SKU {state.sku}</li> : null}
      </ul>
    </div>
  );
}

function Stepper({ state }: { state: ProductPageState }) {
  return (
    <div className="inline-flex h-11 items-center rounded-full border border-border" role="group" aria-label="Quantity">
      <button type="button" onClick={() => state.setQuantity(Math.max(1, state.quantity - 1))} aria-label="Decrease quantity" className="flex h-full w-10 items-center justify-center rounded-l-full text-muted-foreground transition-colors hover:text-foreground">
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span className="min-w-8 text-center text-sm font-semibold tabular-nums text-foreground">{state.quantity}</span>
      <button type="button" onClick={() => state.setQuantity(Math.min(99, state.quantity + 1))} aria-label="Increase quantity" className="flex h-full w-10 items-center justify-center rounded-r-full text-muted-foreground transition-colors hover:text-foreground">
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function AddToCartPill({ state, className }: { state: ProductPageState; className?: string }) {
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
        "inline-flex h-11 min-w-[9rem] items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {justAdded ? <Check className="size-4" aria-hidden="true" /> : null}
      {label}
      {state.inCart && !justAdded && !state.requiresSelection && !state.outOfStock ? (
        <span className="rounded-full bg-primary-foreground/20 px-2 text-[11px] tabular-nums">{state.inCart.quantity} in cart</span>
      ) : null}
    </button>
  );
}

function Description({ product }: { product: ProductDetail }) {
  if (!product.description?.trim()) return null;
  return (
    <section className="flex flex-col gap-4">
      <SmallCaps as="h2">About this product</SmallCaps>
      <ProductDescription product={product} heading={false} className="[&_.prose]:text-[17px] [&_p]:text-[17px] [&_p]:leading-8" />
    </section>
  );
}

function specRows(product: ProductDetail, state: ProductPageState): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (state.sku) rows.push(["SKU", state.sku]);
  rows.push([
    "Availability",
    state.stockStatus === "instock" ? (state.stockQuantity != null ? `${state.stockQuantity} in stock` : "In stock") : state.stockStatus === "outofstock" ? "Out of stock" : "On backorder",
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

function Specs({ product, state }: PartProps) {
  const rows = specRows(product, state);
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <SmallCaps as="h2">Specifications</SmallCaps>
      <dl className="divide-y divide-border border-y border-border">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 py-3 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Tail({ product }: { product: ProductDetail }) {
  return (
    <div className="flex flex-col gap-14">
      <Rule />
      <RelatedProducts productIds={[product._id]} surface="product_page" title="Goes with this" />
      <ProductReviews productId={product._id} />
    </div>
  );
}
