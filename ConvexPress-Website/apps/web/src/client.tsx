import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { prepareTemplateHydration } from "./templates/sdk/registry";
import { prepareCanonicalBlockHydration } from "./templates/sdk/block-preview/hydration";

// Wait for streamed surface markers too. Native links and disclosures remain
// usable while their selected template modules load; no placeholder replaces SSR.
async function hydrate() {
  if (document.readyState === "loading") {
    await new Promise<void>((resolve) => {
      document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
    });
  }
  await Promise.all([
    prepareTemplateHydration(document),
    prepareCanonicalBlockHydration(document),
  ]);
  startTransition(() => {
    hydrateRoot(document, <StrictMode><StartClient /></StrictMode>);
  });
}

// Do not top-level-await lazy imports: surface chunks import this shared graph,
// so awaiting their evaluation would keep both modules waiting on each other.
void hydrate();
