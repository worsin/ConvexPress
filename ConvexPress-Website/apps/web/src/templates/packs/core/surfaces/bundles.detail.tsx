/** Core · bundles.detail — one bundle: overview, live pricing, component picker, add to cart. */
import { Link } from "@tanstack/react-router";
import { Check, Minus, Package, Plus, ShoppingCart } from "lucide-react";

import type { SurfaceProps } from "@/templates/sdk/types";

export interface BundleComponent {
  _id: string;
  productId: string;
  variantId?: string;
  quantity: number;
  minQuantity?: number;
  maxQuantity?: number;
  isRequired: boolean;
  isDefault?: boolean;
  allowVariantChange?: boolean;
  label?: string;
  sortOrder: number;
  priceOverride?: number;
  discountPercent?: number;
  product?: {
    _id: string;
    title: string;
    slug: string;
    featuredMediaId?: string;
    basePrice?: number | { amount: number };
    stockQuantity?: number;
    trackInventory?: boolean;
  };
  variant?: {
    _id: string;
    name?: string;
    title?: string;
    price?: number | { amount: number };
  };
  variants?: Array<{
    _id: string;
    name?: string;
    title?: string;
    price?: number | { amount: number };
  }>;
}

export interface BundleData {
  _id: string;
  productId: string;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  images: string[];
  bundleType: string;
  pricingType: string;
  fixedPrice?: number;
  discountPercent?: number;
  discountAmount?: number;
  regularPrice?: number;
  bundlePrice?: number;
  minItems?: number;
  maxItems?: number;
  status: string;
  components: BundleComponent[];
}

export interface BundleSelection {
  componentId: string;
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface BundlePriceData {
  regularPrice: number;
  bundlePrice: number;
  savings: number;
  savingsPercent: number;
}

export interface BundleDetailSurfaceData {
  bundle: BundleData;
  currencyCode: string;
  /** True for mix-and-match / BOGO bundles where the shopper picks components. */
  isConfigurable: boolean;
  /** Live price from the backend for the current selections; `undefined` while loading. */
  priceData: BundlePriceData | undefined;
  /** Current component selections keyed by component id (owned by the route: it feeds the price query). */
  selections: Map<string, BundleSelection>;
  totalSelectedItems: number;
  meetsMinItems: boolean;
  canAddToCart: boolean;
  onToggleComponent: (component: BundleComponent) => void;
  onUpdateQuantity: (componentId: string, delta: number) => void;
  onSetVariant: (componentId: string, variantId: string | undefined) => void;
  onResetDefaults: () => void;
  onAddToCart: () => Promise<void>;
}

function getProductPrice(comp: BundleComponent): number {
  if (comp.variant?.price) {
    const vp = comp.variant.price;
    return typeof vp === "object" ? vp.amount : vp;
  }
  if (comp.product?.basePrice) {
    const bp = comp.product.basePrice;
    return typeof bp === "object" ? bp.amount : bp;
  }
  return 0;
}

export default function CoreBundleDetail({ data }: SurfaceProps<BundleDetailSurfaceData>) {
  const {
    bundle,
    currencyCode,
    isConfigurable,
    priceData,
    selections,
    totalSelectedItems,
    meetsMinItems,
    canAddToCart,
    onToggleComponent,
    onUpdateQuantity,
    onSetVariant,
    onResetDefaults,
    onAddToCart,
  } = data;

  function formatPrice(cents: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
    }).format(cents / 100);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10 py-10 lg:py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/bundles" className="hover:text-foreground">
          Bundles
        </Link>
        <span>/</span>
        <span className="text-foreground">{bundle.name}</span>
      </div>

      {/* Header + Pricing Card */}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,600px)] xl:items-start">
        {/* Left: Bundle overview */}
        <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm xl:sticky xl:top-28">
          <div className="relative aspect-[4/3] bg-muted">
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
              <Package className="h-14 w-14 text-muted-foreground/60" />
              <h2 className="text-center text-lg font-semibold text-foreground">
                {bundle.components.length} product
                {bundle.components.length === 1 ? "" : "s"} in this bundle
              </h2>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {bundle.components.map((comp) => (
                  <span
                    key={comp._id}
                    className="rounded-full bg-background/80 px-3 py-1 text-sm font-medium text-foreground"
                  >
                    {comp.product?.title ?? "Product"}
                    {comp.quantity > 1 ? ` x${comp.quantity}` : ""}
                  </span>
                ))}
              </div>
            </div>

            {priceData && priceData.savingsPercent > 0 && (
              <div className="absolute right-4 top-4 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground shadow-sm">
                Save {priceData.savingsPercent}%
              </div>
            )}
          </div>
        </div>

        {/* Right: Pricing & actions */}
        <div className="flex flex-col gap-6 rounded-[2rem] border border-border bg-card p-8 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
              {bundle.bundleType === "mix_and_match"
                ? "Mix & Match"
                : bundle.bundleType === "bogo"
                  ? "Configurable"
                  : "Bundle"}
            </span>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {bundle.status}
            </span>
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">
              {bundle.name}
            </h1>
            {bundle.shortDescription && (
              <p className="text-base leading-7 text-muted-foreground">
                {bundle.shortDescription}
              </p>
            )}
          </div>

          {/* Pricing */}
          <div className="space-y-2">
            {priceData ? (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-semibold text-foreground">
                    {formatPrice(priceData.bundlePrice)}
                  </span>
                  {priceData.savings > 0 && (
                    <span className="text-lg text-muted-foreground line-through">
                      {formatPrice(priceData.regularPrice)}
                    </span>
                  )}
                </div>
                {priceData.savings > 0 && (
                  <p className="text-sm font-medium text-primary">
                    You save {formatPrice(priceData.savings)} (
                    {priceData.savingsPercent}% off)
                  </p>
                )}
              </>
            ) : (
              <div className="h-10 w-40 animate-pulse rounded-lg bg-muted" />
            )}
          </div>

          {/* Item count for configurable */}
          {isConfigurable && (
            <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>
                  {totalSelectedItems} item{totalSelectedItems === 1 ? "" : "s"}{" "}
                  selected
                  {bundle.minItems && (
                    <span className="ml-1">(min {bundle.minItems})</span>
                  )}
                  {bundle.maxItems && (
                    <span className="ml-1">(max {bundle.maxItems})</span>
                  )}
                  {!meetsMinItems && (
                    <span className="ml-2 text-primary">
                      Need {bundle.minItems! - totalSelectedItems} more
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={onResetDefaults}
                  className="text-sm text-muted-foreground underline hover:text-foreground"
                >
                  Reset to defaults
                </button>
              </div>
            </div>
          )}

          {/* Add to cart */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void onAddToCart()}
              disabled={!canAddToCart}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingCart className="h-4 w-4" />
              Add Bundle to Cart
            </button>
            <Link
              to="/cart"
              className="inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-medium text-foreground hover:bg-muted/60"
            >
              View Cart
            </Link>
          </div>

          {/* Bundle details */}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-2xl bg-muted/40 p-4">
              <dt className="text-muted-foreground">Type</dt>
              <dd className="mt-1 font-medium text-foreground">
                {bundle.bundleType === "mix_and_match"
                  ? "Mix & Match"
                  : bundle.bundleType === "bogo"
                    ? "Configurable"
                    : "Fixed Bundle"}
              </dd>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <dt className="text-muted-foreground">Pricing</dt>
              <dd className="mt-1 font-medium text-foreground">
                {bundle.pricingType === "fixed"
                  ? "Fixed price"
                  : bundle.pricingType === "percent_off"
                    ? `${bundle.discountPercent ?? 0}% off`
                    : bundle.pricingType === "amount_off"
                      ? `${formatPrice(bundle.discountAmount ?? 0)} off`
                      : "Sum of components"}
              </dd>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <dt className="text-muted-foreground">Products</dt>
              <dd className="mt-1 font-medium text-foreground">
                {bundle.components.length} included
              </dd>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <dt className="text-muted-foreground">Slug</dt>
              <dd className="mt-1 font-medium text-foreground">
                {bundle.slug}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Component list */}
      <section className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight">
          {isConfigurable ? "Choose Your Products" : "What's Included"}
        </h2>
        {isConfigurable && (
          <p className="mt-2 text-sm text-muted-foreground">
            Select the products you want in your bundle.
            {bundle.minItems && ` Minimum ${bundle.minItems} items.`}
            {bundle.maxItems && ` Maximum ${bundle.maxItems} items.`}
          </p>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {bundle.components.map((comp) => {
            const unitPrice = getProductPrice(comp);
            const isSelected = isConfigurable
              ? selections.has(comp._id)
              : true;
            const selQty = selections.get(comp._id)?.quantity ?? comp.quantity;

            return (
              <div
                key={comp._id}
                className={`flex items-start gap-4 rounded-2xl border p-5 transition-colors ${
                  isSelected
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-background"
                }`}
              >
                {/* Selection checkbox for configurable bundles */}
                {isConfigurable && (
                  <button
                    type="button"
                    onClick={() => {
                      if (comp.isRequired) return;
                      onToggleComponent(comp);
                    }}
                    disabled={comp.isRequired}
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-transparent"
                    } ${comp.isRequired ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary/60"}`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Product info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {comp.product?.title ?? "Product"}
                      </h3>
                      {comp.label && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {comp.label}
                        </p>
                      )}
                      {comp.variant?.name && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Variant: {comp.variant.name}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {unitPrice > 0 && (
                        <p className="text-sm font-medium text-foreground">
                          {formatPrice(unitPrice)}
                        </p>
                      )}
                      {comp.priceOverride != null && unitPrice > 0 && (
                        <p className="text-xs text-muted-foreground line-through">
                          {formatPrice(unitPrice)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    {/* Quantity control for configurable */}
                    {isConfigurable && isSelected ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(comp._id, -1)}
                          className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-[2rem] text-center text-sm font-medium">
                          {selQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(comp._id, 1)}
                          className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Qty: {comp.quantity}
                      </span>
                    )}

                    {/* Variant selector for components that allow variant change */}
                    {comp.allowVariantChange && comp.variants && comp.variants.length > 0 && (
                      <select
                        value={selections.get(comp._id)?.variantId ?? ""}
                        onChange={(e) => onSetVariant(comp._id, e.target.value || undefined)}
                        className="rounded border border-border bg-background px-2 py-1 text-sm"
                      >
                        <option value="">Default variant</option>
                        {comp.variants.map((v) => (
                          <option key={v._id} value={v._id}>{v.title || v.name || "Variant"}</option>
                        ))}
                      </select>
                    )}

                    <div className="flex items-center gap-2">
                      {comp.isRequired && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                          Required
                        </span>
                      )}
                      {comp.discountPercent != null &&
                        comp.discountPercent > 0 && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            -{comp.discountPercent}%
                          </span>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Description */}
      {bundle.description && (
        <section className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
          <h2 className="text-2xl font-semibold tracking-tight">
            About This Bundle
          </h2>
          <p className="mt-4 whitespace-pre-wrap text-base leading-8 text-muted-foreground">
            {bundle.description}
          </p>
        </section>
      )}
    </div>
  );
}
