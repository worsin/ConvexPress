/**
 * PricingCardsBlock — embeddable block for the content editor block system.
 *
 * Fetches both the pricing card config and the offers list autonomously via
 * useQuery (no SSR loader since the block renders inside arbitrary content
 * pages). Delegates rendering to <PricingCardsRenderer> — the same renderer
 * used by the /pricing route, so layout logic is never duplicated.
 *
 * Block registration into the content editor block registry is out of scope
 * here (Wave 6.1). This component is the renderable unit; the editor wires it
 * in during a later wave.
 *
 * Usage (once registered):
 *   <PricingCardsBlock />
 *
 * Note: Dialog uses our Base UI wrapper — never @radix-ui.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { PricingCardsRenderer } from "@/lib/pricingCardRenderer";
import type { PricingOffer, PricingCardConfig } from "@/lib/pricingCardRenderer";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Skeleton placeholder ─────────────────────────────────────────────────────

function PricingCardsSkeleton() {
  return (
    <div
      data-slot="pricing-cards-skeleton"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border bg-card p-6 flex flex-col gap-4"
        >
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-8 w-1/2" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
          <Skeleton className="h-9 w-full rounded-4xl" />
        </div>
      ))}
    </div>
  );
}

// ─── Block component ──────────────────────────────────────────────────────────

/**
 * Embeddable pricing cards block.
 *
 * Performs its own data fetching so it can live inside any content page without
 * a route-level loader. When both queries are still loading, renders a skeleton
 * grid. When the plugin is disabled (offers comes back as []) or no visible
 * offers exist, renders nothing.
 */
export function PricingCardsBlock() {
  // Website uses (api as any) pattern due to type-gen gap between admin/website.
  // Wave 7 will clean this up across all commerce subscriptions consumers.

  const config = useQuery(
    (api as any).commerceSubscriptions.pricingCards.getPricingCardConfig,
  ) as PricingCardConfig | undefined;

  const offers = useQuery(
    (api as any).commerceSubscriptions.offers.listOffersForPricing,
  ) as PricingOffer[] | undefined;

  // Loading state
  if (config === undefined || offers === undefined) {
    return <PricingCardsSkeleton />;
  }

  // Plugin disabled or no visible offers
  if (!offers || offers.length === 0) {
    return null;
  }

  return (
    <div data-slot="pricing-cards-block">
      <PricingCardsRenderer config={config} offers={offers} />
    </div>
  );
}

export default PricingCardsBlock;
