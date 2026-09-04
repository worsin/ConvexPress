import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import {
  requirePublicPluginEnabled,
  throwPublicNotFound,
} from "@/lib/plugins/public-route-loader";
import { siteTitled } from "@/lib/seo/head";
import CoreSignupOffer, {
  type SignupOfferPublicOffer,
  type SignupOfferSurfaceData,
} from "@/templates/packs/core/surfaces/signup.offer";
import { Surface } from "@/templates/sdk/Surface";

/**
 * Direct-signup landing page for a single subscription offer (Wave 5 Task 5.2).
 *
 * Marketing/sales pages link visitors directly here with an offer id:
 *
 *     /signup/{offerId}
 *
 * The page:
 *   1. Gates on the `commerceSubscriptions` plugin (404 when disabled).
 *   2. Loads the offer via `portal.getPublicOffer` — a NO-auth, no-capability
 *      query that exposes exactly the fields needed to price + pitch the plan.
 *   3. Hands the offer to the `signup.offer` surface, whose Core implementation
 *      renders `<SignupForm>` (the full signup + activation flow).
 *
 * Not wrapped in `_marketing.tsx` because we want a focused auth-style layout
 * without the site header/footer — signup is a high-intent conversion surface.
 * A user arriving logged-in gets a compact confirmation flow; a logged-out
 * user gets the full Clerk signup + subscription activation in one step.
 */

export const Route = createFileRoute("/signup/$offerId")({
  loader: async ({ context: { queryClient }, params }) => {
    await requirePublicPluginEnabled(queryClient, "commerceSubscriptions");
    const offer = await queryClient.ensureQueryData(
      convexQuery((api as any).commerceSubscriptions.portal.getPublicOffer, {
        offerId: params.offerId as any,
      }),
    );
    if (!offer) {
      throwPublicNotFound({
        reason: "offer_not_found",
        offerId: params.offerId,
      });
    }
  },
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
      { title: siteTitled("Sign up") },
    ],
  }),
  component: SignupOfferPage,
});

function SignupOfferPage() {
  const { offerId } = Route.useParams();

  const offer = useQuery(
    (api as any).commerceSubscriptions.portal.getPublicOffer,
    { offerId: offerId as any },
  ) as SignupOfferPublicOffer | null | undefined;

  const surfaceData: SignupOfferSurfaceData = { offer };

  return (
    <PublicPluginGate pluginId="commerceSubscriptions">
      <Surface name="signup.offer" data={surfaceData} fallback={CoreSignupOffer} />
    </PublicPluginGate>
  );
}
