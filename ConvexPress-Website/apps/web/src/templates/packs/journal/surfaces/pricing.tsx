/**
 * Journal · pricing — quiet columns separated by rules, not coloured cards.
 * Each plan: an eyebrow (the recommended plan says "Recommended"; the others
 * carry their name), the price in display type with the billing period in
 * small caps, the trial line, features as a rule-separated list, and one
 * pill. Same rules as Core's cards: admin ordering, the featured offer id,
 * offer-level trial overriding the template's, features merged with plan
 * benefits without duplicates, and the signup link per offer.
 */
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

import type { PricingOffer } from "@/lib/pricingCardRenderer";
import { cn } from "@/lib/utils";
import type { PricingSurfaceData } from "@/templates/packs/core/surfaces/pricing";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, Eyebrow, SectionHeading, SmallCaps, buttonClasses } from "../parts";

function money(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount / 100);
}

function intervalSuffix(billingInterval: PricingOffer["billingInterval"], billingIntervalCount: PricingOffer["billingIntervalCount"]) {
  if (!billingInterval) return "per period";
  const count = billingIntervalCount ?? 1;
  return count === 1 ? `per ${billingInterval}` : `per ${count} ${billingInterval}s`;
}

function sortOffers(offers: PricingOffer[], orderedOfferIds: string[]) {
  if (!orderedOfferIds || orderedOfferIds.length === 0) return offers;
  const index = new Map(orderedOfferIds.map((id, i) => [id, i]));
  const inOrder: PricingOffer[] = [];
  const rest: PricingOffer[] = [];
  for (const offer of offers) {
    if (index.has(offer._id)) inOrder[index.get(offer._id)!] = offer;
    else rest.push(offer);
  }
  return [...inOrder.filter(Boolean), ...rest];
}

function featuresOf(offer: PricingOffer) {
  const own = (offer.features ?? []).map((feature) => ({ key: `f:${feature.text}`, label: feature.text, description: undefined as string | undefined }));
  const seen = new Set(own.map((feature) => feature.label));
  const benefits = (offer.planBenefits ?? []).filter((benefit) => !seen.has(benefit.label)).map((benefit) => ({ key: `b:${benefit._id}`, label: benefit.label, description: benefit.description }));
  return [...own, ...benefits];
}

export default function JournalPricing({ data }: SurfaceProps<PricingSurfaceData>) {
  const { config, offers } = data;
  const headline = config?.headline || "Choose your plan";
  const subheadline = config?.subheadline || "Pick the plan that fits your needs.";
  const sorted = sortOffers(offers ?? [], config?.orderedOfferIds ?? []);
  const columns = sorted.length >= 4 ? "md:grid-cols-2 lg:grid-cols-4" : sorted.length === 2 ? "md:grid-cols-2" : sorted.length === 1 ? "md:grid-cols-1 md:max-w-md md:mx-auto" : "md:grid-cols-3";

  return (
    <Container as="section" data-slot="pricing-page" className="flex flex-col gap-14 py-6 md:gap-20 md:py-10">
      <SectionHeading level={1} align="center" eyebrow="Plans" title={headline} lede={subheadline} />

      {sorted.length === 0 ? (
        <EmptyState eyebrow="Nothing yet" title="No plans are currently available. Check back soon." />
      ) : (
        <div className={cn("grid grid-cols-1 border-y border-border md:divide-x md:divide-border", columns)}>
          {sorted.map((offer) => (
            <PlanColumn key={offer._id} offer={offer} featured={config?.featuredOfferId ? offer._id === config.featuredOfferId : false} />
          ))}
        </div>
      )}
    </Container>
  );
}

function PlanColumn({ offer, featured }: { offer: PricingOffer; featured: boolean }) {
  const trialDays = offer.trialDaysOverride ?? offer.templateTrialDays ?? 0;
  const features = featuresOf(offer);
  return (
    <article data-slot="pricing-plan" data-featured={featured || undefined} className="flex flex-col gap-8 border-b border-border py-10 last:border-b-0 md:border-b-0 md:px-8 md:first:pl-0 md:last:pr-0">
      <div className="flex flex-col gap-3">
        {featured ? <Eyebrow>Recommended</Eyebrow> : <SmallCaps as="p">Plan</SmallCaps>}
        <h2 className="font-display text-3xl leading-[1.08] tracking-tight text-foreground">{offer.title}</h2>
        {offer.description ? <p className="text-sm leading-6 text-muted-foreground">{offer.description}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-4xl tabular-nums text-foreground md:text-5xl">{money(offer.recurringAmount, offer.currencyCode)}</span>
          <SmallCaps>{intervalSuffix(offer.billingInterval, offer.billingIntervalCount)}</SmallCaps>
        </p>
        {trialDays > 0 ? <p className="text-sm text-muted-foreground">{trialDays}-day free trial</p> : null}
      </div>

      {features.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border border-y border-border" aria-label={`${offer.title} features`}>
          {features.map((feature) => (
            <li key={feature.key} title={feature.description} className="flex items-start gap-3 py-3 text-sm leading-6 text-foreground">
              <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{feature.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto">
        <Link to="/signup/$offerId" params={{ offerId: offer._id }} className={buttonClasses(featured ? "primary" : "ghost", "w-full")}>
          {trialDays > 0 ? "Start free trial" : "Subscribe"}
        </Link>
      </div>
    </article>
  );
}
