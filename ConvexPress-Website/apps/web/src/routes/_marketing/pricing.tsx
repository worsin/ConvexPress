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
 * Rendering lives in the `pricing` surface of the active template pack.
 */

import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { requirePublicPluginEnabled } from "@/lib/plugins/public-route-loader";
import type { PricingOffer, PricingCardConfig } from "@/lib/pricingCardRenderer";
import { siteTitled } from "@/lib/seo/head";
import CorePricing, { type PricingSurfaceData } from "@/templates/packs/core/surfaces/pricing";
import { Surface } from "@/templates/sdk/Surface";

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
        { title: siteTitled("Pricing") },
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

  const surfaceData: PricingSurfaceData = { config, offers };

  return <Surface name="pricing" data={surfaceData} fallback={CorePricing} />;
}
