/**
 * Pricing Card Config (singleton page).
 *
 * Drives the public `/pricing` page layout:
 *   - `orderedOfferIds` — offers shown, in display order (left → right)
 *   - `featuredOfferId` — "Most popular" emphasis
 *   - `headline`, `subheadline` — marketing copy
 *
 * Backend: commerceSubscriptions.pricingCards.{getPricingCardConfig,
 * updatePricingCardConfig}.
 *
 * Layout: two columns on desktop — left panel edits config, right panel
 * renders the live preview using PricingCardPreview.
 */

import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Save,
  Star,
  Trash2,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  PricingCardPreview,
  type PricingCardOffer,
} from "@/components/subscriptions/PricingCardPreview";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/pricing-cards",
)({
  component: PricingCardsPage,
});

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

type PricingCardOfferRow = PricingCardOffer & {
  _id: Id<"commerce_subscription_offers">;
  slug: string;
  status: "draft" | "active" | "archived";
  pricingCardVisible?: boolean;
};

function PricingCardsPage() {
  const config = useQuery(
    (api as any).commerceSubscriptions.pricingCards.getPricingCardConfig,
    {},
  ) as
    | {
        _id: Id<"commerce_subscription_pricing_card_config"> | null;
        orderedOfferIds: Array<Id<"commerce_subscription_offers">>;
        featuredOfferId?: Id<"commerce_subscription_offers">;
        headline?: string;
        subheadline?: string;
        templateKey: string;
        updatedAt: number;
      }
    | null
    | undefined;

  const offers = useQuery(
    (api as any).commerceSubscriptions.offers.listOffers,
    {},
  ) as Array<PricingCardOfferRow> | null | undefined;

  const updateConfig = useMutation(
    (api as any).commerceSubscriptions.pricingCards.updatePricingCardConfig,
  );

  const [orderedOfferIds, setOrderedOfferIds] = useState<
    Array<Id<"commerce_subscription_offers">>
  >([]);
  const [featuredOfferId, setFeaturedOfferId] = useState<
    Id<"commerce_subscription_offers"> | null
  >(null);
  const [headline, setHeadline] = useState("");
  const [subheadline, setSubheadline] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!config) return;
    setOrderedOfferIds(config.orderedOfferIds ?? []);
    setFeaturedOfferId(config.featuredOfferId ?? null);
    setHeadline(config.headline ?? "");
    setSubheadline(config.subheadline ?? "");
  }, [config]);

  const pluginDisabled = config === null;

  const offerById = useMemo(() => {
    const map = new Map<string, PricingCardOfferRow>();
    (offers ?? []).forEach((o) => map.set(String(o._id), o));
    return map;
  }, [offers]);

  const availableOffers = useMemo(() => {
    const orderedSet = new Set(orderedOfferIds.map(String));
    return (offers ?? []).filter((o) => !orderedSet.has(String(o._id)));
  }, [offers, orderedOfferIds]);

  function moveUp(index: number) {
    if (index <= 0) return;
    setOrderedOfferIds((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    setOrderedOfferIds((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  function removeOffer(id: Id<"commerce_subscription_offers">) {
    setOrderedOfferIds((prev) => prev.filter((x) => x !== id));
    setFeaturedOfferId((prev) => (prev === id ? null : prev));
  }

  function addOffer(id: Id<"commerce_subscription_offers">) {
    setOrderedOfferIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function toggleFeatured(id: Id<"commerce_subscription_offers">) {
    setFeaturedOfferId((prev) => (prev === id ? null : id));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await updateConfig({
        orderedOfferIds,
        featuredOfferId: featuredOfferId ?? undefined,
        headline: headline.trim() || undefined,
        subheadline: subheadline.trim() || undefined,
        templateKey: "default",
      });
      toast.success("Pricing page saved");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to save pricing configuration",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Pricing page</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Configure which subscription offers appear on the public
            pricing page, in what order, and which one is featured as
            "Most popular".
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting || pluginDisabled}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {submitting ? "Saving…" : "Save changes"}
        </button>
      </div>

      {pluginDisabled && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            The commerce subscriptions plugin is disabled.
          </p>
        </div>
      )}

      {!pluginDisabled && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,520px)_1fr]">
          {/* Left column — editor */}
          <div className="space-y-6">
            {/* Copy */}
            <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground">
                Headline
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Headline
                  </label>
                  <input
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="Simple, predictable pricing"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Subheadline
                  </label>
                  <textarea
                    value={subheadline}
                    onChange={(e) => setSubheadline(e.target.value)}
                    rows={2}
                    placeholder="Start free. Upgrade anytime."
                    className={cn(inputClass, "h-auto py-2.5")}
                  />
                </div>
              </div>
            </section>

            {/* Ordered offers */}
            <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  Displayed offers
                </h2>
                <span className="text-xs text-muted-foreground">
                  {orderedOfferIds.length} in list
                </span>
              </div>

              {offers === undefined ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-14 animate-pulse rounded-xl bg-muted"
                    />
                  ))}
                </div>
              ) : orderedOfferIds.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
                  No offers in the list yet. Add one from the "Available
                  offers" panel below.
                </p>
              ) : (
                <ul className="space-y-2">
                  {orderedOfferIds.map((id, index) => {
                    const offer = offerById.get(String(id));
                    const isFeatured = featuredOfferId === id;
                    return (
                      <li
                        key={String(id)}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border bg-background p-3",
                          isFeatured
                            ? "border-primary ring-1 ring-primary/40"
                            : "border-border",
                        )}
                      >
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => moveUp(index)}
                            disabled={index === 0}
                            className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                            title="Move up"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveDown(index)}
                            disabled={index === orderedOfferIds.length - 1}
                            className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                            title="Move down"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {offer?.title ?? "Missing offer"}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                            /{offer?.slug ?? "—"}
                            {offer?.pricingCardVisible === false && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                <EyeOff className="h-2.5 w-2.5" />
                                hidden on offer
                              </span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleFeatured(id)}
                          title={
                            isFeatured
                              ? "Unfeature"
                              : "Mark as 'Most popular'"
                          }
                          className={cn(
                            "rounded-lg p-1.5 transition-colors",
                            isFeatured
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Star
                            className={cn(
                              "h-3.5 w-3.5",
                              isFeatured && "fill-current",
                            )}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeOffer(id)}
                          title="Remove from pricing page"
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Available offers */}
            <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Available offers
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Click to add to the pricing page. Archived offers are
                  shown here but won't render on the public page.
                </p>
              </div>
              {offers === undefined ? (
                <div className="h-16 animate-pulse rounded-xl bg-muted" />
              ) : availableOffers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  All offers are already in the displayed list.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {availableOffers.map((o) => (
                    <button
                      key={o._id}
                      type="button"
                      onClick={() => addOffer(o._id)}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{o.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          /{o.slug} · {o.status}
                        </p>
                      </div>
                      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right column — preview */}
          <div>
            <PricingCardPreview
              orderedOfferIds={orderedOfferIds}
              featuredOfferId={featuredOfferId}
              headline={headline.trim() || null}
              subheadline={subheadline.trim() || null}
              templateKey="default"
              offers={(offers ?? []).map((o) => ({
                _id: o._id,
                title: o.title,
                description: o.description,
                currencyCode: o.currencyCode,
                recurringAmount: o.recurringAmount,
                trialDaysOverride: o.trialDaysOverride,
                pricingCardVisible: o.pricingCardVisible,
                features: o.features,
              }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
