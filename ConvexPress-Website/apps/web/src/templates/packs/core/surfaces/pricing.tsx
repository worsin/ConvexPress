/** Core · pricing — public subscription pricing page (headline + pricing cards). */
import { PricingCardsRenderer } from "@/lib/pricingCardRenderer";
import type { PricingCardConfig, PricingOffer } from "@/lib/pricingCardRenderer";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface PricingSurfaceData {
  /** Pricing card configuration from the admin (headline, layout, styling). */
  config: PricingCardConfig;
  /** Offers visible on the pricing page. */
  offers: PricingOffer[];
}

export default function CorePricing({ data }: SurfaceProps<PricingSurfaceData>) {
  const { config, offers } = data;
  const headline = config?.headline || "Choose your plan";
  const subheadline = config?.subheadline || "Pick the plan that fits your needs.";

  return (
    <div
      data-slot="pricing-page"
      className="flex flex-col gap-10 py-12"
    >
      {/* Page header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {headline}
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          {subheadline}
        </p>
      </div>

      {/* Pricing cards grid — renders nothing if plugin disabled / no offers */}
      {offers && offers.length > 0 ? (
        <PricingCardsRenderer config={config ?? {}} offers={offers} />
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          No plans are currently available. Check back soon.
        </p>
      )}
    </div>
  );
}
