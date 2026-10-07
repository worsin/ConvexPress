/**
 * Depot · shop.product — three layouts, one purchase state.
 *
 * `marketplace` (default): square gallery with side thumbnails 5/12, details
 * with a spec table 4/12, a sticky buy box 3/12. `classic`: gallery beside a
 * details card. `showcase`: a wide hero image, then details and buy box.
 * Variant, stock, access and cart gates match Core's product parts.
 */
import { Truck } from "lucide-react";

import { ProductReviews } from "@/components/commerce/ProductReviews";
import { WishlistButton } from "@/components/commerce/WishlistButton";
import { MediaImage } from "@/components/media/MediaImage";
import { UpgradeCTA } from "@/components/membership/UpgradeCTA";
import { RelatedProducts } from "@/components/shop/RelatedProducts";
import { AddToCartButton, AskAboutProduct, ProductDescription, ProductGallery, QuantityStepper, VariantPicker } from "@/components/shop/product/ProductParts";
import type { ProductDetail, ProductPageState } from "@/components/shop/product/useProductPage";
import { useAssistantConfig } from "@/hooks/useAssistantConfig";
import { formatMoney } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";
import type { ProductSurfaceData } from "@/templates/packs/core/surfaces/shop.product";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Breadcrumbs, Card, DataTable, Label, Price, SectionHeading, StickyPanel, type BadgeTone } from "../parts";

const VARIANTS = ["marketplace", "classic", "showcase"] as const;
type Variant = (typeof VARIANTS)[number];

export default function DepotShopProduct({ data, variant }: SurfaceProps<ProductSurfaceData>) {
  const id: Variant = variant && (VARIANTS as readonly string[]).includes(variant) ? (variant as Variant) : "marketplace";
  const { product, state } = data;
  const Layout = id === "classic" ? ClassicLayout : id === "showcase" ? ShowcaseLayout : MarketplaceLayout;
  return (
    <div data-product-layout={id} data-pack="depot" className="flex w-full flex-col gap-6 py-4 pb-12 lg:py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Breadcrumbs
          items={[
            { label: "Shop", to: "/products" },
            ...(product.categories?.[0] ? [{ label: product.categories[0].name, to: "/products", search: { category: product.categories[0].slug } }] : []),
            { label: product.title },
          ]}
        />
        <AskAboutProduct product={product} className="rounded-md" />
      </div>
      <Layout product={product} state={state} />
      <RelatedProducts productIds={[product._id]} surface="product_page" title="Goes with this" />
      <ProductReviews productId={product._id} />
    </div>
  );
}

type LayoutProps = { product: ProductDetail; state: ProductPageState };

function MarketplaceLayout({ product, state }: LayoutProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
      <ProductGallery product={product} state={state} thumbs="left" aspect="aspect-square" rounded="rounded-md" className="lg:col-span-5 lg:sticky lg:top-24" />
      <div className="flex flex-col gap-4 lg:col-span-4">
        <Summary product={product} state={state} />
        <ProductDescription product={product} heading={false} className="[&_p]:text-sm [&_p]:leading-6 [&_.prose]:text-sm [&_.prose]:leading-6" />
        <SpecTable product={product} state={state} />
      </div>
      <BuyBox product={product} state={state} className="lg:col-span-3" />
    </div>
  );
}

function ClassicLayout({ product, state }: LayoutProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
        <ProductGallery product={product} state={state} thumbs="bottom" aspect="aspect-square" rounded="rounded-md" className="lg:col-span-7 lg:sticky lg:top-24" />
        <Card className="flex flex-col gap-4 p-4 lg:col-span-5">
          <Summary product={product} state={state} />
          <BuyBoxBody product={product} state={state} />
          <SpecTable product={product} state={state} />
        </Card>
      </div>
      <ProductDescription product={product} className="rounded-md border border-border bg-card p-4 [&_h2]:text-lg [&_p]:text-sm [&_p]:leading-6 [&_.prose]:text-sm [&_.prose]:leading-6" />
    </div>
  );
}

function ShowcaseLayout({ product, state }: LayoutProps) {
  const hero = state.displayMediaId;
  return (
    <div className="flex flex-col gap-4">
      <section className="relative overflow-hidden rounded-md border border-border bg-muted">
        <div className="aspect-[16/9] md:aspect-[21/9]">
          {hero ? <MediaImage key={hero} mediaId={hero as any} alt={product.title} className="h-full w-full object-cover" preferredSize="large" sizes="100vw" loading="eager" /> : null}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 bg-background/90 p-4 backdrop-blur-sm">
          <div className="flex min-w-0 flex-col gap-1">
            {product.categories?.[0] && <Label className="text-primary">{product.categories[0].name}</Label>}
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{product.title}</h1>
          </div>
          <Price label={state.priceLabel} compareAt={state.showCompare ? state.regularPrice : null} amount={state.price ?? null} currency={state.currency} size="lg" />
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
        <div className="flex flex-col gap-4 lg:col-span-8">
          <ProductGallery product={product} state={state} thumbs="bottom" aspect="aspect-[4/3]" rounded="rounded-md" />
          {product.excerpt ? <p className="text-sm leading-6 text-muted-foreground">{product.excerpt}</p> : null}
          <ProductDescription product={product} className="[&_h2]:text-lg [&_p]:text-sm [&_p]:leading-6 [&_.prose]:text-sm [&_.prose]:leading-6" />
          <SpecTable product={product} state={state} />
        </div>
        <BuyBox product={product} state={state} className="lg:col-span-4" />
      </div>
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function Summary({ product, state }: LayoutProps) {
  return (
    <div className="flex flex-col gap-2">
      {product.categories?.length ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {product.categories.map((category) => (
            <Label key={category._id} className="text-primary">
              {category.name}
            </Label>
          ))}
        </div>
      ) : null}
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{product.title}</h1>
      {product.excerpt ? <p className="text-sm leading-6 text-muted-foreground">{product.excerpt}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <StockBadge state={state} />
        {state.sku ? <span className="text-[13px] tabular-nums text-muted-foreground">SKU {state.sku}</span> : null}
      </div>
    </div>
  );
}

function stockLabel(state: ProductPageState): { label: string; tone: BadgeTone } | null {
  if (state.requiresSelection) return null;
  if (state.stockStatus === "instock") {
    return state.stockQuantity != null && state.stockQuantity <= 5 ? { label: `Only ${state.stockQuantity} left`, tone: "sale" } : { label: "In stock", tone: "stock" };
  }
  if (state.stockStatus === "outofstock") return { label: "Out of stock", tone: "danger" };
  return { label: state.backorders === "notify" ? "Available on backorder" : "On backorder", tone: "stock" };
}

function StockBadge({ state }: Pick<LayoutProps, "state">) {
  const stock = stockLabel(state);
  if (!stock) return null;
  return <Badge tone={stock.tone}>{stock.label}</Badge>;
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

function SpecTable({ product, state }: LayoutProps) {
  const rows = specRows(product, state);
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading title="Specifications" />
      <DataTable caption="Product specifications" firstColumnLabel rows={rows.map(([label, value]) => ({ key: label, cells: [label, <span className="font-medium text-foreground">{value}</span>] }))} />
    </section>
  );
}

/** Big price, stock badge, options, quantity, add to cart, wishlist, shipping line. */
function BuyBoxBody({ product, state, showPrice = true }: LayoutProps & { showPrice?: boolean }) {
  const assistant = useAssistantConfig();
  const threshold = assistant.freeShippingThresholdMinor;
  return (
    <>
      {showPrice && (
        <div className="flex flex-col gap-1">
          <Price label={state.priceLabel} amount={state.price ?? null} compareAt={state.showCompare ? state.regularPrice : null} currency={state.currency} size="lg" />
          <StockBadge state={state} />
        </div>
      )}
      <VariantPicker state={state} className="[&_button]:rounded-md" />
      {state.currentVariant?.description ? <p className="text-[13px] text-muted-foreground">{state.currentVariant.description}</p> : null}
      {!state.access.allowed ? (
        <UpgradeCTA matchingPlanIds={state.access.matchingPlanIds as any} title="Members-only product" description="This product is available to members only. Upgrade your plan to purchase." />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Label className="w-14">Qty</Label>
            <QuantityStepper state={state} className="h-10" />
          </div>
          <AddToCartButton product={product} state={state} size="md" className="w-full" />
          {!state.isVariable || state.selectedVariant ? (
            <WishlistButton
              productId={product._id}
              variantId={state.isVariable ? state.selectedVariant?._id : undefined}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            />
          ) : null}
        </div>
      )}
      <ul className="flex flex-col gap-1 border-t border-border pt-3 text-[13px] text-muted-foreground">
        {threshold > 0 && (
          <li className="flex items-center gap-1.5">
            <Truck className="size-3.5" aria-hidden="true" /> Free shipping over {formatMoney(threshold, state.currency).replace(/\.00$/, "")}
          </li>
        )}
        <li>{product.isDownloadable ? "Digital delivery after checkout" : product.isVirtual ? "Virtual service, nothing ships" : "Delivery options at checkout"}</li>
        {state.sku && <li className="tabular-nums">SKU {state.sku}</li>}
      </ul>
    </>
  );
}

function BuyBox({ product, state, className }: LayoutProps & { className?: string }) {
  return (
    <StickyPanel label="Buy" className={cn(className)}>
      <BuyBoxBody product={product} state={state} />
    </StickyPanel>
  );
}
