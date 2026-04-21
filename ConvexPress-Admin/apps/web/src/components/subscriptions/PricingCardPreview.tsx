/**
 * PricingCardPreview — admin-side preview of the public /pricing page.
 *
 * Renders a grid of offer cards in the configured order. The featured
 * card gets an emphasized border. Offers that are hidden
 * (`pricingCardVisible === false`) are still included in the data but
 * skipped here so operators see exactly what customers will see.
 */

import { Check, Star } from "lucide-react";

import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export interface PricingCardOffer {
  _id: Id<"commerce_subscription_offers">;
  title: string;
  description?: string;
  currencyCode?: string;
  recurringAmount?: number;
  trialDaysOverride?: number;
  pricingCardVisible?: boolean;
  features?: Array<{
    text: string;
    highlighted?: boolean;
    icon?: string;
  }>;
}

export interface PricingCardPreviewProps {
  orderedOfferIds: Array<Id<"commerce_subscription_offers">>;
  featuredOfferId: Id<"commerce_subscription_offers"> | null;
  headline: string | null;
  subheadline: string | null;
  templateKey: string;
  offers: PricingCardOffer[];
}

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

export function PricingCardPreview({
  orderedOfferIds,
  featuredOfferId,
  headline,
  subheadline,
  offers,
}: PricingCardPreviewProps) {
  // Build a lookup and then walk the ordered list in order.
  const byId = new Map(offers.map((o) => [o._id, o]));
  const visible = orderedOfferIds
    .map((id) => byId.get(id))
    .filter((o): o is PricingCardOffer => !!o && o.pricingCardVisible !== false);

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="space-y-2 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Preview
        </p>
        {headline ? (
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {headline}
          </h2>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">
            No headline set
          </p>
        )}
        {subheadline && (
          <p className="text-sm text-muted-foreground">{subheadline}</p>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No visible offers to preview.
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-4",
            visible.length === 1 && "grid-cols-1",
            visible.length === 2 && "sm:grid-cols-2",
            visible.length >= 3 && "sm:grid-cols-2 lg:grid-cols-3",
          )}
        >
          {visible.map((offer) => {
            const featured = featuredOfferId === offer._id;
            const trial = offer.trialDaysOverride ?? 0;
            return (
              <div
                key={offer._id}
                className={cn(
                  "flex flex-col gap-4 rounded-2xl border bg-background p-5 shadow-sm transition-colors",
                  featured
                    ? "border-primary border-2 ring-2 ring-primary/20"
                    : "border-border",
                )}
              >
                {featured && (
                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground">
                    <Star className="h-3 w-3 fill-current" />
                    Most popular
                  </span>
                )}
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {offer.title}
                  </h3>
                  {offer.description && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {offer.description}
                    </p>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">
                    {typeof offer.recurringAmount === "number"
                      ? formatMoney(
                          offer.recurringAmount,
                          offer.currencyCode ?? "USD",
                        )
                      : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / period
                  </span>
                </div>
                {trial > 0 && (
                  <span className="inline-flex w-fit items-center rounded-full bg-accent/20 px-2.5 py-0.5 text-[11px] font-medium text-accent-foreground">
                    {trial}-day free trial
                  </span>
                )}
                {offer.features && offer.features.length > 0 && (
                  <ul className="space-y-1.5 text-xs">
                    {offer.features.map((feature, i) => (
                      <li
                        key={i}
                        className={cn(
                          "flex items-start gap-2",
                          feature.highlighted
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {feature.highlighted ? (
                          <Star className="mt-0.5 h-3 w-3 shrink-0 fill-primary text-primary" />
                        ) : (
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                        )}
                        <span>{feature.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  disabled
                  className={cn(
                    "mt-auto w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
                    featured
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-foreground",
                  )}
                >
                  {trial > 0 ? "Start free trial" : "Subscribe"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
