/**
 * /pricing — Public pricing page (Wave 6 Task 6.1).
 *
 * SSR route under the _marketing pathless layout so it inherits the site
 * header and footer from _marketing.tsx.
 *
 * Loader pre-fetches the pricing card config, the visible offers and, when
 * the pricing settings name one, the page whose content surrounds the plans
 * (read anonymously, exactly as /page renders it). Data is consumed via
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
import { buildIndexablePageHead, siteTitled } from "@/lib/seo/head";
import CorePricing, { type PricingSurfaceData } from "@/templates/packs/core/surfaces/pricing";
import { loadAnonymousCanonical } from "@/templates/sdk/block-public/anonymous-loader";
import { canonicalPaginationSearch } from "@/templates/sdk/block-public/pagination-search";
import { PublicCanonicalScope } from "@/templates/sdk/block-public/PublicCanonicalBody";
import { Surface } from "@/templates/sdk/Surface";

// ─── Route definition ─────────────────────────────────────────────────────────

export const Route = createFileRoute("/_marketing/pricing")({
  validateSearch: canonicalPaginationSearch,
  loaderDeps: ({ search }) => ({ request: search.blockPages }),
  loader: async ({ context: { queryClient }, deps }) => {
    await requirePublicPluginEnabled(queryClient, "commerceSubscriptions");

    // Pre-fetch all three queries in parallel for SSR
    const [, , contentPage] = await Promise.all([
      queryClient.ensureQueryData(
        convexQuery(api.commerceSubscriptions.pricingCards.getPricingCardConfig, {}),
      ),
      queryClient.ensureQueryData(
        convexQuery(api.commerceSubscriptions.offers.listOffersForPricing, {}),
      ),
      queryClient.ensureQueryData(
        convexQuery(api.commerceSubscriptions.pricingCards.getPricingContentPage, {}),
      ),
    ]);
    // The content page is read like any public page: if its access policy
    // refuses an anonymous reader, the plans render on their own.
    const canonical = contentPage ? await loadAnonymousCanonical(contentPage, deps.request) : null;
    return {
      canonical,
      content: contentPage && canonical ? { documentId: contentPage._id, title: contentPage.title, excerpt: contentPage.excerpt } : null,
    };
  },
  head: ({ loaderData }) =>
    buildIndexablePageHead({
      title: siteTitled(loaderData?.content?.title ?? "Pricing"),
      description: loaderData?.content?.excerpt ?? "Pick the plan that fits your needs.",
      path: "/pricing",
    }),
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
  const { canonical, content } = Route.useLoaderData();
  const { blockPages: request } = Route.useSearch();

  // SSR-compatible: data was pre-fetched in the loader via ensureQueryData.
  // useSuspenseQuery suspends until data is available — no undefined state.
  const { data: config } = useSuspenseQuery(
    convexQuery(api.commerceSubscriptions.pricingCards.getPricingCardConfig, {}),
  );

  const { data: offers } = useSuspenseQuery(
    convexQuery(api.commerceSubscriptions.offers.listOffersForPricing, {}),
  );

  const surfaceData: PricingSurfaceData = { config, offers, content: content ? { documentId: content.documentId } : null };
  const surface = <Surface name="pricing" data={surfaceData} fallback={CorePricing} />;

  return content && canonical ? (
    <PublicCanonicalScope request={request} documentId={content.documentId} initial={canonical}>
      {surface}
    </PublicCanonicalScope>
  ) : (
    surface
  );
}
