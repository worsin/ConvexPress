/**
 * Product page layouts (Settings › Shop layouts › Product page).
 *
 * Each layout is a pure arrangement of the shared parts; the purchase logic
 * lives in `useProductPage`. Add a layout here, register its id in
 * `useShopLayout` and the backend `PRODUCT_LAYOUT_IDS`, and describe it in
 * the admin preset catalog.
 */

import { ProductReviews } from "@/components/commerce/ProductReviews";
import { MediaImage } from "@/components/media/MediaImage";
import { RelatedProducts } from "@/components/shop/RelatedProducts";
import type { ProductLayoutId } from "@/hooks/useShopLayout";
import {
  AddToCartButton,
  AskAboutProduct,
  ProductBreadcrumb,
  ProductBuyBox,
  ProductDescription,
  ProductGallery,
  ProductPrice,
  ProductSpecs,
  ProductSummary,
  QuantityStepper,
  type PartProps,
} from "./ProductParts";

function Tail({ product }: Pick<PartProps, "product">) {
  return (
    <>
      <RelatedProducts productIds={[product._id]} surface="product_page" title="Goes with this" />
      <ProductReviews productId={product._id} />
    </>
  );
}

function TopBar({ product }: Pick<PartProps, "product">) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <ProductBreadcrumb product={product} />
      <AskAboutProduct product={product} />
    </div>
  );
}

/** Classic: gallery beside a framed detail card, description below. */
function ClassicLayout({ product, state }: PartProps) {
  return (
    <div className="flex flex-col gap-10 py-6 lg:py-8">
      <TopBar product={product} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(380px,520px)] lg:items-start">
        <ProductGallery product={product} state={state} className="lg:sticky lg:top-24" />
        <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <ProductSummary product={product} state={state} />
          <ProductBuyBox product={product} state={state} showPrice={false} framed={false} />
          <ProductSpecs product={product} state={state} />
        </div>
      </div>
      <ProductDescription product={product} className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8" />
      <Tail product={product} />
    </div>
  );
}

/** Marketplace: gallery, details, and a sticky buy box — three columns like a large retailer. */
function MarketplaceLayout({ product, state }: PartProps) {
  return (
    <div className="flex flex-col gap-8 py-4 lg:py-6">
      <TopBar product={product} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(260px,3fr)] lg:items-start">
        <ProductGallery product={product} state={state} thumbs="left" aspect="aspect-square" className="lg:sticky lg:top-24" />
        <div className="flex flex-col gap-6">
          <ProductSummary product={product} state={state} size="md" />
          <ProductDescription product={product} heading={false} />
          <ProductSpecs product={product} state={state} variant="table" />
        </div>
        <ProductBuyBox product={product} state={state} className="lg:sticky lg:top-24" />
      </div>
      <Tail product={product} />
    </div>
  );
}

/** Split: a sticky full-height image half beside a scrolling detail half. */
function SplitLayout({ product, state }: PartProps) {
  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <ProductGallery
          product={product}
          state={state}
          aspect="aspect-[4/5] lg:aspect-auto lg:h-[calc(100svh-7rem)]"
          className="lg:sticky lg:top-24"
        />
        <div className="flex flex-col gap-8 py-2 lg:py-8">
          <TopBar product={product} />
          <ProductSummary product={product} state={state} size="xl" />
          <ProductBuyBox product={product} state={state} showPrice={false} framed={false} />
          <ProductDescription product={product} />
          <ProductSpecs product={product} state={state} variant="table" />
        </div>
      </div>
      <Tail product={product} />
    </div>
  );
}

/** Showcase: an edge-to-edge hero image with the title on it, details underneath. */
function ShowcaseLayout({ product, state }: PartProps) {
  const hero = state.displayMediaId;
  return (
    <div className="flex flex-col gap-10 pb-8">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-muted">
        <div className="aspect-[16/9] md:aspect-[21/9]">
          {hero ? (
            <MediaImage key={hero} mediaId={hero as any} alt={product.title} className="h-full w-full object-cover" preferredSize="large" sizes="100vw" loading="eager" />
          ) : null}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/20 to-transparent" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 p-6 md:p-10">
          <div className="max-w-2xl space-y-2">
            {product.categories?.[0] && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-background/80">{product.categories[0].name}</p>
            )}
            <h1 className="text-3xl font-semibold tracking-tight text-background md:text-5xl">{product.title}</h1>
            {product.excerpt && <p className="text-sm text-background/85 md:text-base">{product.excerpt}</p>}
          </div>
          <ProductPrice state={state} className="[&>*]:text-background" />
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ProductBreadcrumb product={product} />
        <AskAboutProduct product={product} />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,440px)] lg:items-start">
        <div className="flex flex-col gap-8">
          <ProductGallery product={product} state={state} thumbs="bottom" aspect="aspect-[4/3]" />
          <ProductDescription product={product} />
          <ProductSpecs product={product} state={state} variant="table" />
        </div>
        <ProductBuyBox product={product} state={state} className="lg:sticky lg:top-24" />
      </div>
      <Tail product={product} />
    </div>
  );
}

/** Minimal: one quiet centred column. Image, name, price, buy, description. */
function MinimalLayout({ product, state }: PartProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 py-6 lg:py-10">
      <ProductBreadcrumb product={product} className="justify-center" />
      <ProductGallery product={product} state={state} aspect="aspect-square" rounded="rounded-3xl" />
      <div className="space-y-6 text-center">
        <ProductSummary product={product} state={state} className="[&_h1]:text-balance [&>div:first-child]:justify-center [&>div:last-child]:justify-center" />
        <div className="mx-auto max-w-md space-y-4 text-left">
          <ProductBuyBox product={product} state={state} showPrice={false} framed={false} />
        </div>
        <AskAboutProduct product={product} />
      </div>
      <ProductDescription product={product} heading={false} className="text-center" />
      <ProductSpecs product={product} state={state} variant="table" />
      <div className="text-center">
        <div className="inline-flex items-center gap-2">
          <QuantityStepper state={state} />
          <AddToCartButton product={product} state={state} />
        </div>
      </div>
      <Tail product={product} />
    </div>
  );
}

export const PRODUCT_LAYOUTS: Record<ProductLayoutId, (props: PartProps) => JSX.Element> = {
  classic: ClassicLayout,
  marketplace: MarketplaceLayout,
  split: SplitLayout,
  showcase: ShowcaseLayout,
  minimal: MinimalLayout,
};
