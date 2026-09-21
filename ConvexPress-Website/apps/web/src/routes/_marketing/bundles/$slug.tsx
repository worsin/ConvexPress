import { useState, useEffect, useRef } from "react";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import { siteTitled } from "@/lib/seo/head";
import CoreBundleDetail, { type BundleComponent, type BundleData, type BundleDetailSurfaceData, type BundleSelection } from "@/templates/packs/core/surfaces/bundles.detail";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/bundles/$slug")({
  head: ({ params }) => ({ meta: [{ title: siteTitled(`${params.slug} - Bundle`) }] }),
  component: BundleDetailPage,
});

function defaults(bundle: BundleData): Map<string, BundleSelection> {
  const configurable = bundle.bundleType !== "fixed";
  return new Map(bundle.components.filter(component => !configurable || component.isRequired || component.isDefault).map(component => [component._id, {
    componentId: component._id, productId: component.productId, variantId: component.variantId,
    quantity: configurable ? component.minQuantity ?? component.quantity : component.quantity,
  }]));
}

function BundleDetailPage() {
  const { slug } = Route.useParams();
  const { data: bundle } = useSuspenseQuery(convexQuery(api.commerceBundles.queries.getBySlug, { slug }));
  return bundle ? <BundleDetailController key={bundle._id} bundle={bundle} /> : <NotFoundPage />;
}

/** Mounting by bundle identity resets a new offer without conditional hooks or
 * reselecting optional components a shopper deliberately removed. */
function BundleDetailController({ bundle }: { bundle: BundleData }) {
  const router = useRouter();
  const { sessionToken, isReady } = useCommerceSessionToken();
  const [selections, setSelections] = useState(() => defaults(bundle));
  const [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [refreshAt, setRefreshAt] = useState<number | undefined>();
  const addToCart = useMutation(api.commerce.cart.addItem);
  const isConfigurable = bundle.bundleType !== "fixed";
  const effectiveSelections = Array.from(selections.values());
  // Pricing accepts choice identity/quantity only. Product IDs remain in the
  // validated cart metadata, while selected variants survive both paths.
  const priceData = useQuery(api.commerceBundles.queries.calculatePrice, {
    bundleId: bundle._id, refreshAt,
    selections: effectiveSelections.map(({ componentId, variantId, quantity }) => ({ componentId, variantId, quantity })),
  });
  const deadline = priceData === undefined ? bundle.recheckAt : priceData?.recheckAt ?? null;
  useEffect(() => {
    const refresh = () => setRefreshAt(Date.now());
    const timer = deadline === null ? undefined : setTimeout(refresh, Math.min(2147483647, Math.max(1, deadline - Date.now())));
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { if (timer !== undefined) clearTimeout(timer); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); document.removeEventListener("visibilitychange", visible); };
  }, [deadline]);

  function toggleComponent(component: BundleComponent) {
    if (!isConfigurable || component.isRequired) return;
    setSelections(previous => {
      const next = new Map(previous);
      if (next.has(component._id)) next.delete(component._id);
      else next.set(component._id, { componentId: component._id, productId: component.productId, variantId: component.variantId, quantity: component.minQuantity ?? component.quantity });
      return next;
    });
  }
  function updateQuantity(id: string, delta: number) {
    const component = bundle.components.find(value => value._id === id);
    if (!component || !isConfigurable) return;
    setSelections(previous => {
      const selection = previous.get(id); if (!selection) return previous;
      const quantity = Math.max(component.minQuantity ?? 1, Math.min(component.maxQuantity ?? 99, selection.quantity + delta));
      const next = new Map(previous); next.set(id, { ...selection, quantity }); return next;
    });
  }
  function setVariant(id: string, rawVariant: string | undefined) {
    const component = bundle.components.find(value => value._id === id);
    if (!component?.allowVariantChange) return;
    const variantId = rawVariant ? component.variants.find(value => value._id === rawVariant)?._id : component.variantId;
    if (rawVariant && !variantId) return;
    setSelections(previous => {
      const current = previous.get(id); if (!current) return previous;
      const next = new Map(previous); next.set(id, { ...current, variantId }); return next;
    });
  }
  const totalSelectedItems = effectiveSelections.reduce((total, selection) => total + selection.quantity, 0);
  const meetsMinItems = totalSelectedItems >= (bundle.minItems ?? 0);
  const canAddToCart = isReady && !!sessionToken && !busy && priceData?.available === true;
  async function handleAddToCart() {
    if (!canAddToCart || !sessionToken || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      await addToCart({ sessionToken, productId: bundle.productId, quantity: 1,
        metadata: { lineType: "bundle", bundleId: bundle._id, selections: effectiveSelections } });
      toast.success("Bundle added to cart");
      await router.navigate({ to: "/cart" });
    } catch { toast.error("This bundle could not be added. Check your choices and try again."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const surfaceData: BundleDetailSurfaceData = { bundle, currencyCode: bundle.currencyCode, isConfigurable,
    priceData: priceData ?? undefined, selections, totalSelectedItems, meetsMinItems, canAddToCart,
    onToggleComponent: toggleComponent, onUpdateQuantity: updateQuantity, onSetVariant: setVariant,
    onResetDefaults: () => setSelections(defaults(bundle)), onAddToCart: handleAddToCart };
  const status = !isReady ? "Getting your bundle ready…" : busy ? "Adding your bundle…" : priceData === undefined ? "Updating bundle price…" : priceData === null ? "Choose a valid bundle configuration to continue." : !priceData.available ? "This configuration is currently unavailable." : "";
  return <><p role="status" className="mx-auto max-w-7xl px-4 text-sm text-muted-foreground">{status}</p><fieldset disabled={!isReady || busy} className="m-0 min-w-0 border-0 p-0"><Surface name="bundles.detail" data={surfaceData} fallback={CoreBundleDetail} /></fieldset></>;
}
