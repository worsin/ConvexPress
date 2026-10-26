/**
 * Core · pricing — public subscription pricing page (headline + pricing cards).
 *
 * When the pricing settings name a content page, that page is the pricing
 * page: the cards follow its opening hero (or lead the page, with the
 * headline, when it has none), and its other blocks surround them.
 */
import { PricingCardsRenderer } from "@/lib/pricingCardRenderer";
import type { PricingCardConfig, PricingOffer } from "@/lib/pricingCardRenderer";
import { PricingWithContent } from "@/templates/sdk/block-public/PricingWithContent";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface PricingSurfaceData {
  /** Pricing card configuration from the admin (headline, layout, styling). */
  config: PricingCardConfig;
  /** Offers visible on the pricing page. */
  offers: PricingOffer[];
  /** The page whose content surrounds the plans, while it is published. */
  content?: { documentId: string } | null;
}

function Plans({ config, offers }: Pick<PricingSurfaceData, "config" | "offers">) {
  return offers && offers.length > 0 ? (
    <PricingCardsRenderer config={config ?? {}} offers={offers} />
  ) : (
    <p className="text-center text-sm text-muted-foreground">
      No plans are currently available. Check back soon.
    </p>
  );
}

function Headline({ config }: Pick<PricingSurfaceData, "config">) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {config?.headline || "Choose your plan"}
      </h1>
      <p className="max-w-xl text-base text-muted-foreground">
        {config?.subheadline || "Pick the plan that fits your needs."}
      </p>
    </div>
  );
}

export default function CorePricing({ data }: SurfaceProps<PricingSurfaceData>) {
  const { config, offers, content } = data;
  const page = (lead: boolean) => (
    <div data-slot={content ? "pricing-plans" : "pricing-page"} className="flex flex-col gap-10 py-12">
      {lead ? <Headline config={config} /> : null}
      <Plans config={config} offers={offers} />
    </div>
  );
  return content ? (
    <div data-slot="pricing-page">
      <PricingWithContent documentId={content.documentId} plans={page} />
    </div>
  ) : (
    page(true)
  );
}
