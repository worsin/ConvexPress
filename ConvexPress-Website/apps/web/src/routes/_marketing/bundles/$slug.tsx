import { useState, useEffect, useMemo } from "react";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import { siteTitled } from "@/lib/seo/head";
import CoreBundleDetail, {
  type BundleComponent,
  type BundleData,
  type BundleDetailSurfaceData,
  type BundlePriceData,
  type BundleSelection,
} from "@/templates/packs/core/surfaces/bundles.detail";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/bundles/$slug")({
  head: ({ params }) => ({
    meta: [{ title: siteTitled(`${params.slug} - Bundle`) }],
  }),
  component: BundleDetailPage,
});

function BundleDetailPage() {
  const settings = useSettings();
  const currencyCode =
    (settings as any)?.commerceConfig?.currencyCode || "USD";
  const { slug } = Route.useParams();
  const router = useRouter();
  const { sessionToken, isReady } = useCommerceSessionToken();

  const { data: bundle } = useSuspenseQuery(
    convexQuery((api as any).commerceBundles.queries.getBySlug, {
      slug,
    }) as any,
  ) as { data: BundleData | null };

  // Initialize selections with required + default components
  const initialSelections = useMemo(() => {
    const map = new Map<string, BundleSelection>();
    if (!bundle?.components) return map;
    for (const comp of bundle.components) {
      if (comp.isRequired || comp.isDefault) {
        map.set(comp._id, {
          componentId: comp._id,
          productId: comp.productId,
          variantId: comp.variantId,
          quantity: comp.minQuantity ?? comp.quantity ?? 1,
        });
      }
    }
    return map;
  }, [bundle?.components]);

  // For configurable bundles, track selected components + quantities
  const [selections, setSelections] = useState<Map<string, BundleSelection>>(initialSelections);

  // Re-sync selections when bundle data arrives for the first time
  useEffect(() => {
    if (initialSelections.size > 0 && selections.size === 0) {
      setSelections(initialSelections);
    }
  }, [initialSelections]);

  const addToCart = useMutation((api as any).commerce.cart.addItem);

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
  ) as BundlePriceData | undefined;

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

  function setSelectionVariant(compId: string, variantId: string | undefined) {
    const next = new Map(selections);
    const current = next.get(compId);
    if (current) {
      next.set(compId, { ...current, variantId });
      setSelections(next);
    }
  }

  function resetToDefaults() {
    const defaults = new Map<string, BundleSelection>();
    bundle!.components
      .filter((c) => c.isRequired || c.isDefault)
      .forEach((c) =>
        defaults.set(c._id, {
          componentId: c._id,
          productId: c.productId,
          quantity: c.minQuantity ?? c.quantity,
        }),
      );
    setSelections(defaults);
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
    if (!isReady || !sessionToken) return;
    try {
      // Build selections for the cart validator
      const bundleSelections = isConfigurable
        ? Array.from(selections.values()).map((sel) => ({
            componentId: sel.componentId,
            productId: sel.productId,
            quantity: sel.quantity,
          }))
        : bundle!.components.map((comp) => ({
            componentId: comp._id,
            productId: comp.productId,
            variantId: comp.variantId,
            quantity: comp.quantity,
          }));

      if (isConfigurable && bundleSelections.length === 0) {
        toast.error("Please select at least one component");
        return;
      }

      // Add bundle to cart using the owning product ID and proper metadata
      await addToCart({
        sessionToken,
        productId: bundle!.productId,
        quantity: 1,
        metadata: {
          lineType: "bundle" as const,
          bundleId: bundle!._id,
          selections: bundleSelections,
        },
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

  const surfaceData: BundleDetailSurfaceData = {
    bundle,
    currencyCode,
    isConfigurable,
    priceData,
    selections,
    totalSelectedItems,
    meetsMinItems,
    canAddToCart,
    onToggleComponent: toggleComponent,
    onUpdateQuantity: updateSelectionQuantity,
    onSetVariant: setSelectionVariant,
    onResetDefaults: resetToDefaults,
    onAddToCart: handleAddToCart,
  };

  return <Surface name="bundles.detail" data={surfaceData} fallback={CoreBundleDetail} />;
}
