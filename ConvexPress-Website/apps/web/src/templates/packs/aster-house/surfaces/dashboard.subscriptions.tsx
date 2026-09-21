/**
 * Aster · dashboard.subscriptions — the customer subscription portal
 * overview: one CustomerPortalCard per contract (pause / resume / cancel
 * inside the card), the ChangePlanFlow per contract, and the global invoice
 * history — the shared components, framed as quiet panels and rule-separated
 * rows.
 */
import { ChangePlanFlow } from "@/components/subscriptions/ChangePlanFlow";
import { CustomerPortalCard } from "@/components/subscriptions/CustomerPortalCard";
import { InvoiceHistoryTable } from "@/components/subscriptions/InvoiceHistoryTable";
import { cn } from "@/lib/utils";
import type { DashboardSubscriptionsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.subscriptions";
import type { SurfaceProps } from "@/templates/sdk/types";

import { EmptyState, LinkButton, SkeletonBlock, SmallCaps } from "../parts";
import { JOURNAL_PORTAL_FRAME, PageHeading, Section } from "../parts/extra-dashboard";

export default function AsterDashboardSubscriptions({ data }: SurfaceProps<DashboardSubscriptionsSurfaceData>) {
  const { contracts, offers } = data;
  const activeCount = contracts?.filter((contract) => contract.status === "active" || contract.status === "trialing").length ?? 0;

  return (
    <div data-slot="dashboard-subscriptions" className="flex flex-col gap-10">
      <PageHeading eyebrow="Billing" title="Subscriptions" lede="Manage your active subscriptions, plan changes, coupons, and billing history." />

      {contracts === undefined ? (
        <div className="flex flex-col gap-4" aria-hidden="true">
          <SkeletonBlock className="h-56" />
          <SkeletonBlock className="h-56" />
        </div>
      ) : contracts.length === 0 ? (
        <EmptyState
          eyebrow="Subscriptions"
          title="You don't have any subscriptions yet."
          action={
            <LinkButton to="/pricing" variant="ghost">
              See plans
            </LinkButton>
          }
        />
      ) : (
        <div className={cn("flex flex-col gap-10", JOURNAL_PORTAL_FRAME)}>
          <SmallCaps as="p" className="tabular-nums">
            {activeCount} active subscription{activeCount === 1 ? "" : "s"} of {contracts.length} total
          </SmallCaps>

          <div className="flex flex-col gap-6">
            {contracts.map((contract) => {
              // Candidate offers for plan change: same product, active, excluding the current offer.
              const candidates = (offers ?? []).filter((offer) => offer.status === "active" && (!contract.product?._id || !offer.productId || offer.productId === contract.product._id));
              return <CustomerPortalCard key={contract._id} contract={contract} planChangeSlot={candidates.length > 0 ? <ChangePlanFlow contractId={contract._id} currentOfferId={contract.offer?._id ?? null} availableOffers={candidates} /> : null} />;
            })}
          </div>

          <Section title="Billing history">
            <InvoiceHistoryTable />
          </Section>
        </div>
      )}
    </div>
  );
}
