/**
 * Core · dashboard.subscriptions — the customer subscription portal overview:
 * one CustomerPortalCard per contract (pause / resume / cancel inside the
 * card), the ChangePlanFlow per contract, and the global invoice history.
 */
import { RefreshCw } from "lucide-react";

import { ChangePlanFlow } from "@/components/subscriptions/ChangePlanFlow";
import { CustomerPortalCard } from "@/components/subscriptions/CustomerPortalCard";
import { InvoiceHistoryTable } from "@/components/subscriptions/InvoiceHistoryTable";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface DashboardSubscriptionContract {
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
}

export interface DashboardSubscriptionOffer {
  _id: string;
  title: string;
  slug?: string;
  description?: string;
  recurringAmount: number;
  currencyCode: string;
  features?: Array<{ text: string; highlighted?: boolean }>;
  productId?: string;
  status: string;
}

export interface DashboardSubscriptionsSurfaceData {
  /** Enriched active contracts; undefined while loading. */
  contracts: DashboardSubscriptionContract[] | undefined;
  /** Offers available for plan changes; undefined while loading. */
  offers: DashboardSubscriptionOffer[] | undefined;
}

export default function CoreDashboardSubscriptions({ data }: SurfaceProps<DashboardSubscriptionsSurfaceData>) {
  const { contracts, offers } = data;

  const activeCount =
    contracts?.filter(
      (c) => c.status === "active" || c.status === "trialing",
    ).length ?? 0;

  return (
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
  );
}
