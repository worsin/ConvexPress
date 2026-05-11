/**
 * PricingCardsRenderer — shared grid layout for the /pricing route and the
 * PricingCardsBlock content-editor block.
 *
 * Both the public SSR route and the inline block delegate to this component
 * so the grid logic is never duplicated.
 *
 * templateKey routing:
 *   Wave 2 ships only the "default-grid" template. The branch below is a
 *   stub for future multi-template support.
 *   // TODO: multi-template support — Wave 8+
 */

import { PricingCard } from "@/components/subscriptions/PricingCard";

// ─── Types (locally mirrored from listOffersForPricing return shape) ─────────

export type OfferFeature = {
  text: string;
  highlighted?: boolean;
  icon?: string;
};

export type PlanBenefit = {
  _id: string;
  label: string;
  description?: string;
  sourcePlanId: string;
};

export type PricingOffer = {
  _id: string;
  title: string;
  description?: string;
  currencyCode: string;
  recurringAmount: number;
  trialDaysOverride?: number;
  features?: OfferFeature[];
  pricingCardVisible?: boolean;
  planBenefits: PlanBenefit[];
  // Template-joined fields (Wave 6.1 backend enrichment):
  billingInterval: "week" | "month" | "year" | null;
  billingIntervalCount: number | null;
  templateTrialDays: number | null;
  createdAt?: number;
  [key: string]: unknown;
};

export type PricingCardConfig = {
  orderedOfferIds?: string[];
  featuredOfferId?: string | null;
  headline?: string;
  subheadline?: string;
  templateKey?: string;
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface PricingCardsRendererProps {
  config: PricingCardConfig;
  offers: PricingOffer[];
}

// ─── Ordering logic ───────────────────────────────────────────────────────────

/**
 * Orders offers per config.orderedOfferIds.
 *
 * - Offers whose ids are in orderedOfferIds appear first in that sequence.
 * - Offers not in orderedOfferIds (or when orderedOfferIds is empty) follow in
 *   their original (server-side createdAt DESC) order.
 * - Offer ids in orderedOfferIds that have no matching offer are silently
 *   dropped (archived / deleted since the config was saved).
 */
function sortOffers(
  offers: PricingOffer[],
  orderedOfferIds: string[],
): PricingOffer[] {
  if (!orderedOfferIds || orderedOfferIds.length === 0) {
    return offers;
  }

  const indexMap = new Map(orderedOfferIds.map((id, i) => [id, i]));
  const inOrder: PricingOffer[] = [];
  const rest: PricingOffer[] = [];

  for (const offer of offers) {
    if (indexMap.has(offer._id)) {
      inOrder[indexMap.get(offer._id)!] = offer;
    } else {
      rest.push(offer);
    }
  }

  // Compact sparse array (removes holes from missing ordered ids)
  return [...inOrder.filter(Boolean), ...rest];
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

export function PricingCardsRenderer({
  config,
  offers,
}: PricingCardsRendererProps) {
  // TODO: multi-template support — Wave 8+
  // Currently config.templateKey is ignored and we always render "default-grid".
  // When Wave 8 adds templates, branch here on config.templateKey.

  const sortedOffers = sortOffers(offers, config.orderedOfferIds ?? []);

  // Responsive columns: 4+ column layout when there are 4+ offers.
  const gridCols =
    sortedOffers.length >= 4
      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6";

  return (
    <div data-slot="pricing-cards-renderer" className={gridCols}>
      {sortedOffers.map((offer) => (
        <PricingCard
          key={offer._id}
          offer={offer}
          isFeatured={
            config.featuredOfferId
              ? offer._id === config.featuredOfferId
              : false
          }
        />
      ))}
    </div>
  );
}
