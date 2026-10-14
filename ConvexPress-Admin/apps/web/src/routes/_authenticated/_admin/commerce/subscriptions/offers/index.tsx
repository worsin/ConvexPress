/**
 * Subscription offers: the packages customers buy, with price and cadence,
 * where each is sold, and how many customers are on it.
 *
 * Data: `adminCatalog.listOfferRows`.
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { ChevronRight, Package, Plus } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { formatCadence, formatMoney } from "@/components/subscriptions/billingFormat";

export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/offers/")({
  component: OffersIndex,
});

type OfferStatus = "draft" | "active" | "archived";
const FILTERS: ReadonlyArray<OfferStatus | undefined> = [undefined, "active", "draft", "archived"];
const FILTER_LABEL: Record<OfferStatus, string> = { active: "On sale", draft: "Drafts", archived: "Archived" };
const STATUS_TONE: Record<OfferStatus, string> = {
  active: "bg-primary/15 text-primary",
  draft: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<OfferStatus, string> = { active: "On sale", draft: "Draft", archived: "Archived" };
const COLUMNS = "grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_110px_100px_20px]";

function OffersIndex() {
  const [status, setStatus] = useState<OfferStatus | undefined>(undefined);
  const offers = useQuery(api.commerceSubscriptions.adminCatalog.listOfferRows, { status });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Offers</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">The packages customers subscribe to. Each bills on a template's cadence and grants its access while paid.</p>
        </div>
        <Link
          to="/commerce/subscriptions/offers/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New offer
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Status">
        {FILTERS.map((value) => (
          <button
            key={value ?? "all"}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => setStatus(value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              status === value ? "bg-primary text-primary-foreground" : "border border-border text-foreground hover:bg-muted",
            )}
          >
            {value ? FILTER_LABEL[value] : "All"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <div className="min-w-[820px]">
          <div className={cn("grid gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground", COLUMNS)}>
            <div>Offer</div>
            <div>Price</div>
            <div>Sold through</div>
            <div>Customers</div>
            <div>Status</div>
            <div />
          </div>
          {offers === undefined ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : offers.length === 0 ? (
            <div className="p-10 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">{status ? "No offers here." : "No offers yet. Create the first package customers can buy."}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {offers.map((offer) => {
                const channels = [
                  offer.availableInDirectForms ? "Forms" : undefined,
                  offer.pricingCardVisible !== false ? "Pricing page" : undefined,
                  offer.availableInCart ? "Cart" : undefined,
                ].filter((entry): entry is string => entry !== undefined);
                return (
                  <li key={offer._id}>
                    <Link
                      to="/commerce/subscriptions/offers/$offerId/edit"
                      params={{ offerId: offer._id }}
                      className={cn("grid items-center gap-4 px-5 py-3.5 text-sm transition-colors hover:bg-muted/30", COLUMNS)}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{offer.title}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {offer.entitlementCodes.length > 0 ? offer.entitlementCodes.join(", ") : offer.slug}
                        </p>
                      </div>
                      <div className="text-xs">
                        <p className="font-medium text-foreground">{formatMoney(offer.recurringAmount, offer.currencyCode)}</p>
                        <p className="text-muted-foreground">
                          {offer.template ? formatCadence(offer.template.billingInterval, offer.template.billingIntervalCount) : "no template"}
                          {(offer.trialDaysOverride ?? offer.template?.trialDays) ? ` · ${offer.trialDaysOverride ?? offer.template?.trialDays}-day trial` : ""}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {channels.length > 0 ? channels.join(" · ") : "Staff only"}
                        {offer.limitOnePerCustomer ? " · one per customer" : ""}
                      </div>
                      <div className="text-xs">
                        <span className="font-medium text-foreground">{offer.usage.liveContracts}</span>
                        <span className="text-muted-foreground"> live</span>
                      </div>
                      <div>
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_TONE[offer.status])}>{STATUS_LABEL[offer.status]}</span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
