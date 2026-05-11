import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { RefreshCw } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";
import { CustomerPortalCard } from "@/components/subscriptions/CustomerPortalCard";
import { ChangePlanFlow } from "@/components/subscriptions/ChangePlanFlow";
import { InvoiceHistoryTable } from "@/components/subscriptions/InvoiceHistoryTable";

export const Route = createFileRoute("/dashboard/subscriptions")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: DashboardSubscriptionsPage,
});

/**
 * Overview page for the customer subscription portal (Wave 5 Task 5.2).
 *
 * This page renders the enriched `getMyActiveContracts` payload plus a
 * global invoice history. Pause / resume / cancel live inside
 * `<CustomerPortalCard />` and delegate to the new `portal.*` mutations —
 * the legacy admin-facing `mutations.pause/resume/...` paths are no longer
 * consumed from the website (the detail page still uses them; a follow-up
 * commit can migrate it).
 *
 * `listOffersForPricing` is fetched once at page level and passed down to
 * each card's `<ChangePlanFlow />` rather than re-queried per contract.
 */

// ─── Types shared with the child components ────────────────────────────────

type Contract = {
  _id: string;
  status: string;
  currencyCode?: string;
  recurringAmount?: number;
  nextBillingAt?: number;
  nextChargeAt?: number;
  currentPeriodStartAt?: number;
  currentPeriodEndAt?: number;
  createdAt: number;
  trialEndsAt?: number;
  offer?: {
    _id: string;
    title: string;
    slug?: string;
    recurringAmount?: number;
    currencyCode?: string;
    features?: Array<{
      text: string;
      highlighted?: boolean;
      icon?: string;
    }>;
  } | null;
  product?: {
    _id: string;
    title?: string;
    slug?: string;
  } | null;
  currentInvoice?: {
    _id: string;
    status: string;
    totalAmount: number;
    currencyCode: string;
    dueAt?: number;
    paidAt?: number;
    createdAt: number;
  } | null;
  membershipGrants?: Array<{
    _id: string;
    planId: string;
    plan?: { _id: string; name?: string; slug?: string } | null;
    status: string;
    startsAt: number;
    endsAt?: number;
    graceEndsAt?: number;
  }>;
  entitlements?: Array<{
    _id: string;
    entitlementCode: string;
    status: string;
  }>;
};

type Offer = {
  _id: string;
  title: string;
  slug?: string;
  description?: string;
  recurringAmount: number;
  currencyCode: string;
  features?: Array<{ text: string; highlighted?: boolean }>;
  productId?: string;
  status: string;
};

// ─── Main Page ─────────────────────────────────────────────────────────────

function DashboardSubscriptionsPage() {
  const settings = useSettings();
  const subscriptionsEnabled =
    settings?.plugins?.commerceSubscriptionsEnabled === true;

  const contracts = useQuery(
    (api as any).commerceSubscriptions.portal.getMyActiveContracts,
    subscriptionsEnabled ? {} : "skip",
  ) as Contract[] | undefined;

  const offers = useQuery(
    (api as any).commerceSubscriptions.offers.listOffersForPricing,
    subscriptionsEnabled ? {} : "skip",
  ) as Offer[] | undefined;

  const activeCount =
    contracts?.filter(
      (c) => c.status === "active" || c.status === "trialing",
    ).length ?? 0;

  return (
    <PublicPluginGate pluginId="commerceSubscriptions">
      <div className="space-y-6">
        <div>
          <h1 className="text-sm font-medium text-foreground">
            Subscriptions
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manage your active subscriptions, plan changes, coupons, and
            billing history.
          </p>
        </div>

        {contracts === undefined ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-56 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : contracts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <RefreshCw className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              You don't have any subscriptions yet.
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
              {activeCount} active subscription{activeCount === 1 ? "" : "s"}{" "}
              out of {contracts.length} total
            </div>

            {/* One card per contract */}
            <div className="space-y-4">
              {contracts.map((contract) => {
                // Candidate offers for plan change: same product, active,
                // excluding the current offer.
                const candidates = (offers ?? []).filter(
                  (offer) =>
                    offer.status === "active" &&
                    (!contract.product?._id ||
                      !offer.productId ||
                      offer.productId === contract.product._id),
                );

                return (
                  <CustomerPortalCard
                    key={contract._id}
                    contract={contract}
                    planChangeSlot={
                      candidates.length > 0 ? (
                        <ChangePlanFlow
                          contractId={contract._id}
                          currentOfferId={contract.offer?._id ?? null}
                          availableOffers={candidates}
                        />
                      ) : null
                    }
                  />
                );
              })}
            </div>

            {/* Global invoice history */}
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Billing History
              </h2>
              <InvoiceHistoryTable />
            </div>
          </>
        )}
      </div>
    </PublicPluginGate>
  );
}
