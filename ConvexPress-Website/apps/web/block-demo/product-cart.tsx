import { useMemo, useState, type ReactNode } from "react";
import { CollectionCartProvider, type CollectionCartHost } from "../src/templates/sdk/block-renderer/collection-cart";

/** Explicit synthetic host. It never calls a cart API or creates an order. */
export function ProductCartSpecimen({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState("none");
  const [calls, setCalls] = useState<string[]>([]);
  const host = useMemo<CollectionCartHost>(() => ({
    ready: mode !== "loading", busy: mode === "busy" ? "synthetic-operation" : null,
    add: async productId => {
      setCalls(previous => [...previous, productId]);
      return mode !== "failure";
    },
  }), [mode]);
  return <>
    <label className="specimen-note">Cart host specimen <select aria-label="Cart host specimen" value={mode} onChange={event => setMode(event.target.value)}>
      <option value="none">No host — product links</option><option value="loading">Session loading</option><option value="busy">Cart busy</option><option value="ready">Accept synthetic addition</option><option value="failure">Reject synthetic addition</option>
    </select></label>
    <p className="specimen-note" data-synthetic-cart-calls={calls.length}>Synthetic cart calls: {calls.length}{calls.length ? ` · ${calls.at(-1)}` : ""}. No cart or order is created.</p>
    {mode === "none" ? children : <CollectionCartProvider value={host}>{children}</CollectionCartProvider>}
  </>;
}
