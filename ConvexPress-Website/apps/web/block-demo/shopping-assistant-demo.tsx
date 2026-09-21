import { useState, type ReactNode } from "react";
import { ShoppingAssistantProvider } from "../src/templates/sdk/block-renderer/shopping-assistant";

/** Explicit synthetic public configuration for the internal composition lab. */
export function ShoppingAssistantDemo({ children }: { children: ReactNode }) {
  const [state, setState] = useState("enabled");
  return <>
    <label className="assistant-demo-control">Assistant fixture
      <select value={state} onChange={(event) => setState(event.target.value)}>
        <option value="enabled">Enabled with default questions</option>
        <option value="empty">Enabled without default questions</option>
        <option value="disabled">Disabled</option>
        <option value="catalog-disabled">Disabled on the catalog</option>
        <option value="mobile-hidden">Available on desktop only</option>
      </select>
    </label>
    <ShoppingAssistantProvider value={{ enabled: state !== "disabled", catalogEnabled: state !== "catalog-disabled",
      mobileAvailable: state !== "mobile-hidden", displayName: "Shop assistant", tagline: "Find something that fits your day.",
      starterPrompts: state === "empty" ? [] : ["Help me choose a useful gift.", "What should I bring for a weekend away?"] }}>
      {children}
    </ShoppingAssistantProvider>
  </>;
}
