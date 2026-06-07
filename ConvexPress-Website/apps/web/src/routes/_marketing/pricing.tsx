/**
 * /pricing — Public pricing page (Wave 6 Task 6.1).
 *
 * SSR route under the _marketing pathless layout so it inherits the site
 * header and footer from _marketing.tsx.
 *
 * Loader pre-fetches both the pricing card config and the visible offers so
 * the page renders without a loading flash on the server. Data is consumed via
 * useSuspenseQuery so the component never sees undefined.
 *
 * The page is gated on the `commerceSubscriptions` plugin — if disabled,
 * PublicPluginGate renders NotFoundPage.
 *
 * Note: Dialog uses our Base UI wrapper — never @radix-ui.
 */

import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { PricingCardsRenderer } from "@/lib/pricingCardRenderer";
import { requirePublicPluginEnabled } from "@/lib/plugins/public-route-loader";
import type { PricingOffer, PricingCardConfig } from "@/lib/pricingCardRenderer";

// ─── Route definition ─────────────────────────────────────────────────────────

export const Route = createFileRoute("/_marketing/pricing")({
  loader: async ({ context: { queryClient } }) => {
    await requirePublicPluginEnabled(queryClient, "commerceSubscriptions");

    // Pre-fetch both queries in parallel for SSR
    await Promise.all([
	      queryClient.ensureQueryData(
	        convexQuery((api as any).commerceSubscriptions.pricingCards.getPricingCardConfig, {}),
	      ),
	      queryClient.ensureQueryData(
	        convexQuery((api as any).commerceSubscriptions.offers.listOffersForPricing, {}),
	      ),
	    ]);
	  },
	  head: () => {
	    return {
      meta: [
        { title: "Pricing - ConvexPress" },
        {
          name: "description",
          content: "Pick the plan that fits your needs.",
        },
      ],
    };
  },
  component: PricingPage,
});

// ─── Page component ───────────────────────────────────────────────────────────

function PricingPage() {
  return (
    <PublicPluginGate pluginId="commerceSubscriptions">
      <PricingPageInner />
    </PublicPluginGate>
  );
}

function PricingPageInner() {
  // SSR-compatible: data was pre-fetched in the loader via ensureQueryData.
  // useSuspenseQuery suspends until data is available — no undefined state.
  const { data: config } = useSuspenseQuery(
    // @ts-expect-error — type-gen gap between admin/website; Wave 7 removes
    convexQuery((api as any).commerceSubscriptions.pricingCards.getPricingCardConfig, {}),
  ) as { data: PricingCardConfig };

  const { data: offers } = useSuspenseQuery(
    // @ts-expect-error — type-gen gap between admin/website; Wave 7 removes
    convexQuery((api as any).commerceSubscriptions.offers.listOffersForPricing, {}),
  ) as { data: PricingOffer[] };

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
