import type { ReactNode } from "react";

import { opensWithHero } from "@/lib/blog/page-opening";
import { PublicCanonicalBody } from "./PublicCanonicalBody";

/**
 * The pricing page with its content page (pricing settings): the plans follow
 * the page's opening hero, or lead the page when it opens with anything else.
 * `plans(lead)` draws them; `lead` asks for the pricing headline too, since no
 * hero introduces the page. Until the page's body is ready, or if it can't be
 * shown, the plans stand alone above it.
 */
export function PricingWithContent({ documentId, plans }: { documentId: string; plans: (lead: boolean) => ReactNode }) {
  return (
    <PublicCanonicalBody
      documentId={documentId}
      insert={(blocks) => (opensWithHero(blocks) ? { at: 1, node: plans(false) } : { at: 0, node: plans(true) })}
      renderLayout={(body, _hero, placed) => (placed ? body : <>{plans(true)}{body}</>)}
    />
  );
}
