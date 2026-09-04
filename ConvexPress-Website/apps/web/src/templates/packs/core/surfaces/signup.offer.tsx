/** Core · signup.offer — focused signup landing for one subscription offer (no site chrome). */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { SignupForm } from "@/components/subscriptions/SignupForm";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface SignupOfferPublicOffer {
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

export interface SignupOfferSurfaceData {
  /** The public offer; `undefined` while loading, `null` when it does not exist. */
  offer: SignupOfferPublicOffer | null | undefined;
}

export default function CoreSignupOffer({ data }: SurfaceProps<SignupOfferSurfaceData>) {
  const { offer } = data;

  return (
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
  );
}
