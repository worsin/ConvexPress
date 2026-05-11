/**
 * Subscription Offers list.
 *
 * Offers are the sellable packages (Starter / Growth / Scale) that
 * customers subscribe to. Each offer pins a `templateId` and a price in
 * a specific currency; once any active contract references the offer,
 * price/template fields become immutable (archive + recreate instead).
 *
 * Filters: status (draft/active/archived), search (title/slug).
 */

import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Package,
  Pencil,
  Plus,
  Search,
  Star,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/offers/",
)({
  component: SubscriptionOffersIndex,
});

type OfferStatus = "draft" | "active" | "archived";

type Offer = {
  _id: Id<"commerce_subscription_offers">;
  title: string;
  slug: string;
  status: OfferStatus;
  templateId: Id<"commerce_subscription_templates">;
  description?: string;
  currencyCode: string;
  recurringAmount: number;
  setupFeeAmount?: number;
  trialDaysOverride?: number;
  pricingCardVisible?: boolean;
  entitlementCodes?: string[];
  createdAt: number;
};

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function StatusBadge({ status }: { status: OfferStatus }) {
  const styles: Record<OfferStatus, string> = {
    active: "bg-primary/15 text-primary",
    draft: "bg-muted text-muted-foreground",
    archived: "bg-destructive/10 text-destructive",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}

function ArchiveConfirm({
  offer,
  onConfirm,
  onCancel,
  busy,
}: {
  offer: Offer;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="border-t border-destructive/30 bg-destructive/5 px-5 py-4">
      <p className="text-sm text-destructive">
        Archive offer <strong>{offer.title}</strong>? Existing contracts keep
        their pricing. The offer is hidden from the pricing page.
      </p>
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
        >
          Archive
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function SubscriptionOffersIndex() {
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<"" | OfferStatus>("");
  const [search, setSearch] = useState("");
  const offers = useQuery(
    (api as any).commerceSubscriptions.offers.listOffers,
    {
      status: statusFilter || undefined,
      search: search.trim() || undefined,
    },
  ) as Offer[] | null | undefined;

  const archiveOffer = useMutation(
    (api as any).commerceSubscriptions.offers.archiveOffer,
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pluginDisabled = offers === null;

  async function handleArchive(id: Id<"commerce_subscription_offers">) {
    setBusy(true);
    try {
      await archiveOffer({ offerId: id });
      toast.success("Offer archived");
      setArchivingId(null);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to archive offer",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Subscription Offers
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            The sellable packages customers subscribe to. Each offer pins a
            template and a price. Once contracts reference it, the price
            locks — archive and create a new offer for repricing.
          </p>
        </div>
        <Link
          to="/commerce/subscriptions/offers/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New offer
        </Link>
      </div>

      {pluginDisabled && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <Package className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            The commerce subscriptions plugin is disabled.
          </p>
        </div>
      )}

      {!pluginDisabled && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              {(["", "active", "draft", "archived"] as const).map((s) => (
                <button
                  key={s || "all"}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    statusFilter === s
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-foreground hover:bg-muted",
                  )}
                >
                  {s || "All"}
                </button>
              ))}
            </div>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title or slug…"
                className="w-full rounded-xl border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="grid grid-cols-[1fr_100px_130px_110px_100px_130px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <div>Offer</div>
              <div>Status</div>
              <div>Price</div>
              <div>Trial</div>
              <div>Pricing</div>
              <div className="text-right">Actions</div>
            </div>

            {offers === undefined ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-xl bg-muted"
                  />
                ))}
              </div>
            ) : offers.length === 0 ? (
              <div className="p-10 text-center">
                <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {search || statusFilter
                    ? "No offers match your filter."
                    : "No offers yet. Click 'New offer' to create one."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {offers.map((offer) => (
                  <div key={offer._id}>
                    <div className="grid grid-cols-[1fr_100px_130px_110px_100px_130px] items-center gap-4 px-5 py-4">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(
                              expandedId === offer._id ? null : offer._id,
                            )
                          }
                          className="flex items-center gap-2 text-left"
                        >
                          {expandedId === offer._id ? (
                            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {offer.title}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              /{offer.slug}
                            </p>
                          </div>
                        </button>
                      </div>
                      <div>
                        <StatusBadge status={offer.status} />
                      </div>
                      <div className="text-sm font-semibold text-foreground">
                        {formatMoney(offer.recurringAmount, offer.currencyCode)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {offer.trialDaysOverride
                          ? `${offer.trialDaysOverride}d`
                          : "--"}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {offer.pricingCardVisible !== false ? (
                          <>
                            <Star className="h-3 w-3 fill-primary text-primary" />
                            Visible
                          </>
                        ) : (
                          "Hidden"
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            navigate({
                              to: "/commerce/subscriptions/offers/$offerId/edit",
                              params: { offerId: offer._id },
                            })
                          }
                          title="Edit offer"
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {offer.status !== "archived" && (
                          <button
                            type="button"
                            onClick={() => setArchivingId(offer._id)}
                            title="Archive offer"
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {expandedId === offer._id && (
                      <div className="border-t border-border/50 bg-muted/20 px-5 py-4">
                        <div className="grid gap-4 text-sm sm:grid-cols-3">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">
                              Description
                            </p>
                            <p className="mt-1 text-foreground">
                              {offer.description || "--"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">
                              Setup fee
                            </p>
                            <p className="mt-1 text-foreground">
                              {offer.setupFeeAmount
                                ? formatMoney(
                                    offer.setupFeeAmount,
                                    offer.currencyCode,
                                  )
                                : "--"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">
                              Entitlement codes
                            </p>
                            <p className="mt-1 font-mono text-xs text-foreground">
                              {(offer.entitlementCodes ?? []).join(", ") ||
                                "--"}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {archivingId === offer._id && (
                      <ArchiveConfirm
                        offer={offer}
                        busy={busy}
                        onConfirm={() => void handleArchive(offer._id)}
                        onCancel={() => setArchivingId(null)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
