/**
 * Depot · dashboard.subscriptions — the customer subscription portal: a
 * `DataTable` overview of every contract (plan, status badge, tabular
 * amount, next billing, period), then one `CustomerPortalCard` per contract
 * (pause / resume / cancel / coupon) with the `ChangePlanFlow` slot, then
 * the global `InvoiceHistoryTable` — all in the Depot frame. Same candidate
 * offer rule as Core.
 */
import { ChangePlanFlow } from "@/components/subscriptions/ChangePlanFlow";
import { CustomerPortalCard } from "@/components/subscriptions/CustomerPortalCard";
import { InvoiceHistoryTable } from "@/components/subscriptions/InvoiceHistoryTable";
import { formatMoney } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";
import type { DashboardSubscriptionsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.subscriptions";
import type { SurfaceProps } from "@/templates/sdk/types";

import { DataTable, EmptyState, LinkButton, Skeleton, Td, Th } from "../parts";
import { DashboardPageHeader, DashboardSection, StatusBadge, dashboardFrame, dateOrDash } from "../parts/extra-dashboard";

export default function DepotDashboardSubscriptions({ data }: SurfaceProps<DashboardSubscriptionsSurfaceData>) {
  const { contracts, offers } = data;
  const activeCount = contracts?.filter((contract) => contract.status === "active" || contract.status === "trialing").length ?? 0;

  return (
    <div data-slot="dashboard-subscriptions" data-pack="depot" className={cn("flex flex-col gap-4", dashboardFrame)}>
      <DashboardPageHeader
        eyebrow="Billing"
        title="Subscriptions"
        description="Manage your active subscriptions, plan changes, coupons, and billing history."
        meta={contracts ? `${activeCount} active of ${contracts.length} total` : undefined}
      />

      {contracts === undefined ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : contracts.length === 0 ? (
        <EmptyState title="You don't have any subscriptions yet." description="Subscriptions you start show up here with their billing history." action={<LinkButton to="/pricing" variant="secondary">See plans</LinkButton>} />
      ) : (
        <>
          <DataTable caption="Subscription overview">
            <thead>
              <tr>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Next billing</Th>
                <Th className="text-right">Current period</Th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => {
                const amount = contract.recurringAmount ?? contract.offer?.recurringAmount;
                const currency = contract.currencyCode ?? contract.offer?.currencyCode ?? "USD";
                return (
                  <tr key={contract._id} className="border-t border-border">
                    <Td className="min-w-48">
                      <p className="font-semibold text-foreground">{contract.offer?.title ?? contract.product?.title ?? "Subscription"}</p>
                      {contract.offer && contract.product?.title ? <p className="text-xs text-muted-foreground">{contract.product.title}</p> : null}
                    </Td>
                    <Td>
                      <StatusBadge status={contract.status} />
                    </Td>
                    <Td align="right" className="whitespace-nowrap font-semibold text-foreground">
                      {typeof amount === "number" ? formatMoney(amount, currency) : "—"}
                    </Td>
                    <Td align="right" className="whitespace-nowrap text-muted-foreground">
                      {dateOrDash(contract.nextBillingAt ?? contract.nextChargeAt)}
                    </Td>
                    <Td align="right" className="whitespace-nowrap text-muted-foreground">
                      {dateOrDash(contract.currentPeriodStartAt)} – {dateOrDash(contract.currentPeriodEndAt)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>

          <DashboardSection title="Manage" count={contracts.length}>
            <div className="flex flex-col gap-3">
              {contracts.map((contract) => {
                // Candidate offers for plan change: same product, active, excluding the current offer (as in Core).
                const candidates = (offers ?? []).filter((offer) => offer.status === "active" && (!contract.product?._id || !offer.productId || offer.productId === contract.product._id));
                return (
                  <CustomerPortalCard
                    key={contract._id}
                    contract={contract}
                    planChangeSlot={candidates.length > 0 ? <ChangePlanFlow contractId={contract._id} currentOfferId={contract.offer?._id ?? null} availableOffers={candidates} /> : null}
                  />
                );
              })}
            </div>
          </DashboardSection>

          <DashboardSection title="Billing history">
            <InvoiceHistoryTable />
          </DashboardSection>
        </>
      )}
    </div>
  );
}
