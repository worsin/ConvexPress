/**
 * PricingCard — individual offer card rendered on the /pricing page and in
 * the PricingCardsBlock content-editor block.
 *
 * Props:
 *   offer      — enriched offer from listOffersForPricing (includes planBenefits)
 *   isFeatured — renders with a "Most popular" pill and ring highlight when true
 *
 * Design rules:
 *   - Base UI (@base-ui/react) + Tailwind tokens only — never @radix-ui.
 *   - No hardcoded palette colours (no bg-zinc-*, bg-slate-*, bg-emerald-*, etc.).
 *     All colours via semantic tokens (bg-primary, bg-muted, text-foreground…).
 *   - Pricing uses offer.recurringAmount / offer.currencyCode / billing
 *     interval fields. The interval + count come from the template joined by
 *     listOffersForPricing (Wave 6.1 enrichment). Trial resolution:
 *       trialDays = offer.trialDaysOverride ?? offer.templateTrialDays ?? 0
 *     so the offer-level override wins but the template default still shows.
 */

import { Check } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { PricingOffer } from "@/lib/pricingCardRenderer";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(amount: number, currencyCode = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

/**
 * Builds the "/ month" / "/ 3 weeks" / "/ year" suffix shown next to the price.
 * Returns "/ period" when the template could not be joined — the card still
 * renders a usable price but falls back to a generic label rather than lying
 * about the cadence.
 */
function formatIntervalSuffix(
  billingInterval: PricingOffer["billingInterval"],
  billingIntervalCount: PricingOffer["billingIntervalCount"],
): string {
  if (!billingInterval) return "/ period";
  const count = billingIntervalCount ?? 1;
  if (count === 1) return `/ ${billingInterval}`;
  // Simple pluralization: "week" -> "weeks"
  return `/ ${count} ${billingInterval}s`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PricingCardProps {
  offer: PricingOffer;
  isFeatured?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PricingCard({ offer, isFeatured = false }: PricingCardProps) {
  // Offer-level override wins; otherwise fall back to the template default.
  const trialDays = offer.trialDaysOverride ?? offer.templateTrialDays ?? 0;
  const ctaLabel = trialDays > 0 ? "Start free trial" : "Subscribe";
  const intervalSuffix = formatIntervalSuffix(
    offer.billingInterval,
    offer.billingIntervalCount,
  );

  // Combine offer.features (offer-level strings from {text, …} objects) and
  // offer.planBenefits (membership plan benefits), deduping by label.
  const offerFeatureLabels: Array<{ label: string; fromBenefit: false }> = (
    offer.features ?? []
  ).map((f) => ({ label: f.text, fromBenefit: false as const }));

  const benefitLabels: Array<{ label: string; fromBenefit: true; benefitId: string; description?: string }> =
    (offer.planBenefits ?? []).map((b) => ({
      label: b.label,
      fromBenefit: true as const,
      benefitId: b._id,
      description: b.description,
    }));

  // Dedupe: if a planBenefit label already appears in offerFeatures, skip it.
  const seenLabels = new Set(offerFeatureLabels.map((f) => f.label));
  const uniqueBenefits = benefitLabels.filter((b) => !seenLabels.has(b.label));

  const allFeatures = [
    ...offerFeatureLabels,
    ...uniqueBenefits,
  ] as Array<
    | { label: string; fromBenefit: false }
    | { label: string; fromBenefit: true; benefitId: string; description?: string }
  >;

  return (
    <div
      data-slot="pricing-card"
      data-featured={isFeatured || undefined}
      className={cn(
        "relative rounded-lg border bg-card shadow-sm p-6 flex flex-col gap-4",
        isFeatured && "ring-2 ring-primary",
      )}
    >
      {/* "Most popular" pill — absolute positioned at top of card */}
      {isFeatured && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            Most popular
          </span>
        </div>
      )}

      {/* Title */}
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold text-foreground">{offer.title}</h3>
        {offer.description && (
          <p className="text-sm text-muted-foreground">{offer.description}</p>
        )}
      </div>

      {/* Price */}
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold text-foreground">
          {formatMoney(offer.recurringAmount, offer.currencyCode)}
        </span>
        <span className="text-sm text-muted-foreground">{intervalSuffix}</span>
      </div>

      {/* Trial badge */}
      {trialDays > 0 && (
        <div>
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            {trialDays}-day free trial
          </span>
        </div>
      )}

      {/* Features list */}
      {allFeatures.length > 0 && (
        <ul className="space-y-2 flex-1">
          {allFeatures.map((feature, index) => (
            <li
              key={`feature-${index}`}
              className="flex items-start gap-2"
              title={
                feature.fromBenefit && feature.description
                  ? feature.description
                  : undefined
              }
            >
              <Check
                className="text-primary shrink-0 size-4 mt-0.5"
                aria-hidden="true"
              />
              <span className="text-sm text-foreground">{feature.label}</span>
            </li>
          ))}
        </ul>
      )}

      {/* CTA */}
      <div className="mt-auto pt-2">
        <Link
          to="/signup/$offerId"
          params={{ offerId: offer._id }}
          className={cn(
            buttonVariants({ variant: "default", size: "default" }),
            "w-full justify-center",
          )}
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}

export default PricingCard;
