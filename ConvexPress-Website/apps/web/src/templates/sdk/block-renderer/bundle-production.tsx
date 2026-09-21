import { useLiveConnection } from "../../../hooks/useLiveConnection";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation,} from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { useCommerceSessionToken } from "../../../hooks/useCommerceSessionToken";
import { BundleProvider, type BundleHostProps } from "./bundle";
import type { BundleChoice } from "../block-data/portable/bundleOfferContracts";

function ProductionBundleHost(props: BundleHostProps) {
  const { sessionToken, isReady } = useCommerceSessionToken();
  return <LiveBundle key={`${props.offer.id}:${sessionToken ?? "pending"}`} {...props} sessionToken={sessionToken} sessionReady={isReady} />;
}
function LiveBundle({ offer, children, sessionToken, sessionReady }: BundleHostProps & { sessionToken: string | undefined; sessionReady: boolean }) {
  const live = useQuery(api.commerceBundles.queries.getBySlug, { slug: offer.slug });
  const connection = useLiveConnection();
  const [choices, setChoices] = useState<BundleChoice[]>(() => offer.defaults);
  const [busy, setBusy] = useState(false), pending = useRef(false), active = useRef(true);
  const [message, setMessage] = useState(""), [refreshAt, setRefreshAt] = useState<number>();
  const addItem = useMutation(api.commerce.cart.addItem);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const selections = live?.components.flatMap(component => {
    const choice = choices.find(item => item.componentId === component._id);
    if (!choice) return [];
    const variantId = choice.variantId ? component.variants.find(item => item._id === choice.variantId)?._id : undefined;
    if (choice.variantId && !variantId) return [];
    return [{ componentId: component._id, productId: component.productId, variantId, quantity: choice.quantity }];
  }) ?? [];
  const validIdentity = live?._id === offer.id && selections.length === choices.length;
  const price = useQuery(api.commerceBundles.queries.calculatePrice, validIdentity && live ? {
    bundleId: live._id, refreshAt, selections: selections.map(({ componentId, variantId, quantity }) => ({ componentId, variantId, quantity })),
  } : "skip");
  const deadline = price?.recheckAt ?? null;
  useEffect(() => {
    const refresh = () => setRefreshAt(Date.now());
    const timer = deadline === null ? undefined : setTimeout(refresh, Math.min(2147483647, Math.max(1, deadline - Date.now())));
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh); document.addEventListener("visibilitychange", visible);
    return () => { if (timer !== undefined) clearTimeout(timer); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); document.removeEventListener("visibilitychange", visible); };
  }, [deadline]);
  const ready = sessionReady && !!sessionToken && connection.isWebSocketConnected && live?._id === offer.id;
  return children({ choices, quote: ready && validIdentity && price ? price : null, ready, busy,
    message: message || (!sessionReady ? "Getting your set ready…" : !connection.isWebSocketConnected ? "Reconnect to check availability." : live === undefined ? "Loading your set…" : !validIdentity ? "This bundle has changed. Reopen it to choose an available set." : price === undefined ? "Updating your total…" : !price ? "Choose a valid set to continue." : !price.available ? "This combination is currently unavailable." : ""),
    change: next => { if (!pending.current) { setChoices(next); setMessage(""); } },
    reset: () => { if (!pending.current) { setChoices(offer.defaults); setMessage(""); } },
    add: async () => {
      if (!ready || !validIdentity || !live || !sessionToken || !price?.available || pending.current) return;
      pending.current = true; setBusy(true); setMessage("");
      try {
        await addItem({ sessionToken, productId: live.productId, quantity: 1, metadata: { lineType: "bundle", bundleId: live._id, selections } });
        if (active.current) setMessage("Your set has been added to the cart.");
      } catch { if (active.current) { setMessage("We couldn’t add this set. Check your cart and current availability before trying again."); setRefreshAt(Date.now()); } }
      finally { pending.current = false; if (active.current) setBusy(false); }
    },
  });
}
export function ProductionBundleProvider({ children }: { children: ReactNode }) {
  return <BundleProvider host={ProductionBundleHost}>{children}</BundleProvider>;
}
