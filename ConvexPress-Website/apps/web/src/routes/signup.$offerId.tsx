import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { SignupForm } from "@/components/subscriptions/SignupForm";

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
 *   3. Renders `<SignupForm>` which runs the full signup + activation flow.
 *
 * Not wrapped in `_marketing.tsx` because we want a focused auth-style layout
 * without the site header/footer — signup is a high-intent conversion surface.
 * A user arriving logged-in gets a compact confirmation flow; a logged-out
 * user gets the full Clerk signup + subscription activation in one step.
 */

export const Route = createFileRoute("/signup/$offerId")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
      { title: "Sign up - ConvexPress" },
    ],
  }),
  component: SignupOfferPage,
});

function SignupOfferPage() {
  const { offerId } = Route.useParams();

  const offer = useQuery(
    (api as any).commerceSubscriptions.portal.getPublicOffer,
    { offerId: offerId as any },
  ) as
    | {
        _id: string;
        title: string;
        slug?: string;
        description?: string;
        publicSummary?: string;
        recurringAmount: number;
        currencyCode: string;
        setupFeeAmount?: number;
        trialDaysOverride?: number;
        status: string;
        features?: Array<{
          text: string;
          highlighted?: boolean;
          icon?: string;
        }>;
        template?: {
          _id: string;
          billingInterval: "week" | "month" | "year";
          billingIntervalCount: number;
          trialDays?: number;
          gracePeriodDays?: number;
        } | null;
      }
    | null
    | undefined;

  return (
    <PublicPluginGate pluginId="commerceSubscriptions">
      <div className="flex min-h-svh flex-col bg-background">
        {/* Top bar with back link — avoids pulling in the full marketing shell */}
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Back to site
          </Link>
          <Link
            to="/login"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Already have an account? Sign in
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-lg">
            {offer === undefined ? (
              <div className="flex h-64 items-center justify-center rounded-2xl border border-border bg-card">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : offer === null ? (
              <NotFoundPage />
            ) : (
              <SignupForm offer={offer} />
            )}
          </div>
        </main>
      </div>
    </PublicPluginGate>
  );
}
