/**
 * Depot · pricing — the public subscription pricing page: the admin's
 * headline, a card grid of offers (ordered and featured per the admin's
 * pricing-card config, same as `PricingCardsRenderer`), then a comparison
 * table with one column per offer and one row per feature or plan benefit.
 * Each card links to the same signup route as Core.
 */
import { Link } from "@tanstack/react-router";
import { Check, Minus } from "lucide-react";

import type { PricingOffer } from "@/lib/pricingCardRenderer";
import { cn } from "@/lib/utils";
import type { PricingSurfaceData } from "@/templates/packs/core/surfaces/pricing";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Card, Container, EmptyState, Label, SectionHeading, Td, Th, buttonClasses } from "../parts";

function money(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

function interval(offer: PricingOffer) {
  if (!offer.billingInterval) return "/ period";
  const count = offer.billingIntervalCount ?? 1;
  return count === 1 ? `/ ${offer.billingInterval}` : `/ ${count} ${offer.billingInterval}s`;
}

function trialDaysOf(offer: PricingOffer) {
  return offer.trialDaysOverride ?? offer.templateTrialDays ?? 0;
}

/** Offer features then plan benefits, deduped by label (same rule as Core's card). */
function featureLabels(offer: PricingOffer): Array<{ label: string; description?: string }> {
  const seen = new Set<string>();
  const out: Array<{ label: string; description?: string }> = [];
  for (const feature of offer.features ?? []) {
    if (seen.has(feature.text)) continue;
    seen.add(feature.text);
    out.push({ label: feature.text });
  }
  for (const benefit of offer.planBenefits ?? []) {
    if (seen.has(benefit.label)) continue;
    seen.add(benefit.label);
    out.push({ label: benefit.label, description: benefit.description });
  }
  return out;
}

function sortOffers(offers: PricingOffer[], orderedIds: string[]): PricingOffer[] {
  if (!orderedIds || orderedIds.length === 0) return offers;
  const index = new Map(orderedIds.map((id, position) => [id, position]));
  const ordered: PricingOffer[] = [];
  const rest: PricingOffer[] = [];
  for (const offer of offers) {
    const position = index.get(offer._id);
    if (position !== undefined) ordered[position] = offer;
    else rest.push(offer);
  }
  return [...ordered.filter(Boolean), ...rest];
}

export default function DepotPricing({ data }: SurfaceProps<PricingSurfaceData>) {
  const { config, offers } = data;
  const headline = config?.headline || "Choose your plan";
  const subheadline = config?.subheadline || "Pick the plan that fits your needs.";
  const sorted = sortOffers(offers ?? [], config?.orderedOfferIds ?? []);
  const featuredId = config?.featuredOfferId ?? null;
  const gridCols = sorted.length >= 4 ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";
  const rows = Array.from(new Set(sorted.flatMap((offer) => featureLabels(offer).map((feature) => feature.label))));

  return (
    <Container padded={false} data-slot="pricing-page" className="flex flex-col gap-6 py-6 md:py-8">
      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <Label>Pricing</Label>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{headline}</h1>
        <p className="max-w-3xl text-[13px] leading-5 text-muted-foreground">{subheadline}</p>
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="No plans are currently available." description="Check back soon." />
      ) : (
        <>
          <div data-slot="pricing-cards" className={cn("grid gap-3", gridCols)}>
            {sorted.map((offer) => (
              <OfferCard key={offer._id} offer={offer} featured={featuredId ? offer._id === featuredId : false} />
            ))}
          </div>

          <section className="flex flex-col gap-3" aria-label="Compare plans">
            <SectionHeading title="Compare plans" count={sorted.length} />
            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <table className="w-full min-w-[640px] border-collapse text-[13px] text-foreground">
                <caption className="sr-only">Plan comparison</caption>
                <thead>
                  <tr>
                    <Th className="w-1/3">Feature</Th>
                    {sorted.map((offer) => (
                      <Th key={offer._id} className="text-center">
                        {offer.title}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border">
                    <Th scope="row" className="font-normal text-muted-foreground">
                      Price
                    </Th>
                    {sorted.map((offer) => (
                      <Td key={offer._id} className="text-center">
                        <span className="font-semibold tabular-nums text-foreground">{money(offer.recurringAmount, offer.currencyCode)}</span> <span className="text-xs text-muted-foreground">{interval(offer)}</span>
                      </Td>
                    ))}
                  </tr>
                  <tr className="border-t border-border">
                    <Th scope="row" className="font-normal text-muted-foreground">
                      Free trial
                    </Th>
                    {sorted.map((offer) => {
                      const days = trialDaysOf(offer);
                      return (
                        <Td key={offer._id} className="text-center tabular-nums">
                          {days > 0 ? `${days} days` : <span className="text-muted-foreground">—</span>}
                        </Td>
                      );
                    })}
                  </tr>
                  {rows.map((label) => (
                    <tr key={label} className="border-t border-border">
                      <Th scope="row" className="font-normal text-muted-foreground">
                        {label}
                      </Th>
                      {sorted.map((offer) => {
                        const feature = featureLabels(offer).find((entry) => entry.label === label);
                        return (
                          <Td key={offer._id} className="text-center" title={feature?.description}>
                            {feature ? <Check className="mx-auto size-4 text-primary" aria-label="Included" /> : <Minus className="mx-auto size-4 text-muted-foreground/60" aria-label="Not included" />}
                          </Td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t border-border">
                    <Th scope="row" className="font-normal text-muted-foreground">
                      <span className="sr-only">Choose</span>
                    </Th>
                    {sorted.map((offer) => (
                      <Td key={offer._id} className="text-center">
                        <Link to="/signup/$offerId" params={{ offerId: offer._id }} className={buttonClasses(featuredId === offer._id ? "primary" : "secondary", "sm")}>
                          {trialDaysOf(offer) > 0 ? "Start free trial" : "Subscribe"}
                        </Link>
                      </Td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Container>
  );
}

function OfferCard({ offer, featured }: { offer: PricingOffer; featured: boolean }) {
  const trialDays = trialDaysOf(offer);
  const features = featureLabels(offer);
  return (
    <Card data-slot="pricing-card" data-featured={featured || undefined} className={cn("flex flex-col gap-3 p-4", featured && "border-primary ring-1 ring-primary")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-lg font-semibold text-foreground">{offer.title}</h2>
          {offer.description ? <p className="text-[13px] leading-5 text-muted-foreground">{offer.description}</p> : null}
        </div>
        {featured && <Badge tone="sale">Most popular</Badge>}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-3xl font-semibold tabular-nums text-foreground">{money(offer.recurringAmount, offer.currencyCode)}</span>
        <span className="text-[13px] text-muted-foreground">{interval(offer)}</span>
      </div>
      {trialDays > 0 && (
        <div>
          <Badge tone="stock">{trialDays}-day free trial</Badge>
        </div>
      )}
      {features.length > 0 && (
        <ul className="flex flex-1 flex-col gap-1">
          {features.map((feature) => (
            <li key={feature.label} className="flex items-start gap-2 text-[13px] leading-5 text-foreground" title={feature.description}>
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{feature.label}</span>
            </li>
          ))}
        </ul>
      )}
      <Link to="/signup/$offerId" params={{ offerId: offer._id }} className={buttonClasses(featured ? "primary" : "secondary", "md", "mt-auto w-full")}>
        {trialDays > 0 ? "Start free trial" : "Subscribe"}
      </Link>
    </Card>
  );
}
