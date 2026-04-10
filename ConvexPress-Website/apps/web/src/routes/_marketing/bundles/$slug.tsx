import { useState } from "react";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Package, Check, Minus, Plus, ShoppingCart } from "lucide-react";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { useSettings } from "@/contexts/SettingsContext";

export const Route = createFileRoute("/_marketing/bundles/$slug")({
  loader: async ({ context: { queryClient }, params }) => {
    await queryClient.ensureQueryData(
      convexQuery((api as any).commerceBundles.queries.getBySlug, {
        slug: params.slug,
      }),
    );
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} - Bundle - ConvexPress` }],
  }),
  component: BundleDetailPage,
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BundleComponent {
  _id: string;
  productId: string;
  variantId?: string;
  quantity: number;
  minQuantity?: number;
  maxQuantity?: number;
  isRequired: boolean;
  isDefault?: boolean;
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
    price?: number | { amount: number };
  };
}

interface BundleData {
  _id: string;
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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function BundleDetailPage() {
  const settings = useSettings();
  const currencyCode =
    (settings as any)?.commerceConfig?.currencyCode || "USD";
  const { slug } = Route.useParams();
  const router = useRouter();

  const { data: bundle } = useSuspenseQuery(
    convexQuery((api as any).commerceBundles.queries.getBySlug, {
      slug,
    }) as any,
  ) as { data: BundleData | null };

  // For configurable bundles, track selected components + quantities
  const [selections, setSelections] = useState<
    Map<string, { componentId: string; productId: string; quantity: number }>
  >(new Map());

  const addToCart = useMutation((api as any).commerce.cart.addItem);
  const saveSelection = useMutation(
    (api as any).commerceBundles.mutations.saveSelection,
  );

  if (!bundle) {
    return <NotFoundPage />;
  }

  const isConfigurable =
    bundle.bundleType === "mix_and_match" || bundle.bundleType === "bogo";

  // Build effective selections for price calculation
  function getEffectiveSelections() {
    if (!isConfigurable) {
      return bundle!.components.map((comp) => ({
        componentId: comp._id,
        productId: comp.productId,
        variantId: comp.variantId,
        quantity: comp.quantity,
      }));
    }

    return Array.from(selections.values()).map((sel) => ({
      componentId: sel.componentId,
      productId: sel.productId,
      quantity: sel.quantity,
    }));
  }

  const effectiveSelections = getEffectiveSelections();

  // Real-time price from the backend
  const priceData = useQuery(
    (api as any).commerceBundles.queries.calculatePrice,
    {
      bundleId: bundle._id,
      selections: isConfigurable ? effectiveSelections : undefined,
    },
  ) as
    | {
        regularPrice: number;
        bundlePrice: number;
        savings: number;
        savingsPercent: number;
      }
    | undefined;

  function formatPrice(cents: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
    }).format(cents / 100);
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

  function toggleComponent(comp: BundleComponent) {
    setSelections((prev) => {
      const next = new Map(prev);
      if (next.has(comp._id)) {
        next.delete(comp._id);
      } else {
        next.set(comp._id, {
          componentId: comp._id,
          productId: comp.productId,
          quantity: comp.minQuantity ?? comp.quantity,
        });
      }
      return next;
    });
  }

  function updateSelectionQuantity(compId: string, delta: number) {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(compId);
      if (!existing) return prev;

      const comp = bundle!.components.find((c) => c._id === compId);
      const min = comp?.minQuantity ?? 1;
      const max = comp?.maxQuantity ?? 99;
      const newQty = Math.max(min, Math.min(max, existing.quantity + delta));

      next.set(compId, { ...existing, quantity: newQty });
      return next;
    });
  }

  const totalSelectedItems = isConfigurable
    ? Array.from(selections.values()).reduce(
        (sum, sel) => sum + sel.quantity,
        0,
      )
    : bundle.components.reduce((sum, c) => sum + c.quantity, 0);

  const meetsMinItems =
    !bundle.minItems || totalSelectedItems >= bundle.minItems;
  const meetsMaxItems =
    !bundle.maxItems || totalSelectedItems <= bundle.maxItems;
  const allRequiredSelected =
    !isConfigurable ||
    bundle.components
      .filter((c) => c.isRequired)
      .every((c) => selections.has(c._id));

  const canAddToCart = meetsMinItems && meetsMaxItems && allRequiredSelected;

  async function handleAddToCart() {
    try {
      // For configurable bundles, save selections first
      if (isConfigurable) {
        const selectionData = Array.from(selections.values());
        if (selectionData.length === 0) {
          toast.error("Please select at least one component");
          return;
        }
        await saveSelection({
          bundleId: bundle!._id,
          selections: selectionData,
        });
      }

      // Add bundle to cart
      await addToCart({
        productId: bundle!._id,
        quantity: 1,
        metadata: { type: "bundle", bundleId: bundle!._id },
      });

      toast.success("Bundle added to cart");
      router.navigate({ to: "/cart" });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to add bundle to cart",
      );
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/bundles" className="hover:text-foreground">
          Bundles
        </Link>
        <span>/</span>
        <span className="text-foreground">{bundle.name}</span>
      </div>

      {/* Header + Pricing Card */}
      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Left: Bundle overview */}
        <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm">
          <div className="relative aspect-[4/3] bg-gradient-to-br from-violet-100 to-fuchsia-100">
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
              <Package className="h-14 w-14 text-violet-600/60" />
              <h2 className="text-center text-lg font-semibold text-violet-900">
                {bundle.components.length} product
                {bundle.components.length === 1 ? "" : "s"} in this bundle
              </h2>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {bundle.components.map((comp) => (
                  <span
                    key={comp._id}
                    className="rounded-full bg-white/80 px-3 py-1 text-sm font-medium text-violet-900"
                  >
                    {comp.product?.title ?? "Product"}
                    {comp.quantity > 1 ? ` x${comp.quantity}` : ""}
                  </span>
                ))}
              </div>
            </div>

            {priceData && priceData.savingsPercent > 0 && (
              <div className="absolute right-4 top-4 rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-bold text-white shadow-sm">
                Save {priceData.savingsPercent}%
              </div>
            )}
          </div>
        </div>

        {/* Right: Pricing & actions */}
        <div className="flex flex-col gap-6 rounded-[2rem] border border-border bg-card p-8 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-900">
              {bundle.bundleType === "mix_and_match"
                ? "Mix & Match"
                : bundle.bundleType === "bogo"
                  ? "BOGO"
                  : "Bundle"}
            </span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-900">
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
                  <p className="text-sm font-medium text-emerald-700">
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
              {totalSelectedItems} item{totalSelectedItems === 1 ? "" : "s"}{" "}
              selected
              {bundle.minItems && (
                <span className="ml-1">(min {bundle.minItems})</span>
              )}
              {bundle.maxItems && (
                <span className="ml-1">(max {bundle.maxItems})</span>
              )}
              {!meetsMinItems && (
                <span className="ml-2 text-amber-600">
                  Need {bundle.minItems! - totalSelectedItems} more
                </span>
              )}
            </div>
          )}

          {/* Add to cart */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleAddToCart()}
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
                    ? "Buy One Get One"
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
                      toggleComponent(comp);
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
                          onClick={() =>
                            updateSelectionQuantity(comp._id, -1)
                          }
                          className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-[2rem] text-center text-sm font-medium">
                          {selQty}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectionQuantity(comp._id, 1)
                          }
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

                    <div className="flex items-center gap-2">
                      {comp.isRequired && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                          Required
                        </span>
                      )}
                      {comp.discountPercent != null &&
                        comp.discountPercent > 0 && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
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
