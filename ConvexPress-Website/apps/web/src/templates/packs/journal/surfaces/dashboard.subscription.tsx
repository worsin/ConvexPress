/**
 * Journal · dashboard.subscription — one subscription: billing details as a
 * stat row (the amount in display type), status notices, pause / resume /
 * schedule-cancel pills with an inline confirmation, then entitlements,
 * invoices and history as rule-separated rows.
 */
import { useState } from "react";

import { formatMoney } from "@/lib/commerce/format";
import type { DashboardSubscriptionAction, DashboardSubscriptionSurfaceData } from "@/templates/packs/core/surfaces/dashboard.subscription";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, EmptyState, SmallCaps } from "../parts";
import { Notice } from "../parts/extra-commerce";
import { BackLink, PageHeading, PageSkeleton, Row, RowList, Section, Stat, StatGrid, StatusPill, dashDate, dashDateTime } from "../parts/extra-dashboard";

export default function JournalDashboardSubscription({ data }: SurfaceProps<DashboardSubscriptionSurfaceData>) {
  const { subscription, busy, hrefs, actions } = data;
  const [confirmAction, setConfirmAction] = useState<DashboardSubscriptionAction | null>(null);

  async function handleAction(action: DashboardSubscriptionAction) {
    const ok = await actions.run(action);
    if (ok) setConfirmAction(null);
  }

  if (subscription === undefined) return <PageSkeleton rows={4} />;

  if (subscription === null) {
    return (
      <div data-slot="dashboard-subscription" className="flex flex-col gap-10">
        <BackLink to={hrefs.subscriptions}>Back to subscriptions</BackLink>
        <EmptyState eyebrow="Not found" title="Subscription not found or you do not have access." />
      </div>
    );
  }

  const sub = subscription;
  const status: string = sub.status;
  const canPause = status === "active" || status === "trialing";
  const canResume = status === "paused" || status === "pending_cancel";
  const canScheduleCancel = status === "active" || status === "trialing";
  const currency = sub.currencyCode ?? "USD";

  return (
    <div data-slot="dashboard-subscription" className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <BackLink to={hrefs.subscriptions}>Back to subscriptions</BackLink>
        <PageHeading eyebrow="Subscription" title={sub.product?.title ?? "Subscription"} lede={`Created ${dashDate(sub.createdAt)}`} action={<StatusPill status={status} />} />
      </div>

      {/* Billing details */}
      <Section title="Billing details">
        <StatGrid className="lg:grid-cols-4">
          <Stat label="Recurring amount" value={typeof sub.recurringAmount === "number" ? formatMoney(sub.recurringAmount, currency) : "—"} display />
          <Stat label="Next billing" value={dashDate(sub.nextBillingAt)} />
          <Stat label="Current period" value={`${dashDate(sub.currentPeriodStartAt)} – ${dashDate(sub.currentPeriodEndAt)}`} />
          {sub.trialEndsAt ? <Stat label="Trial ends" value={dashDate(sub.trialEndsAt)} /> : null}
        </StatGrid>
      </Section>

      {/* Status notices */}
      {status === "pending_cancel" ? <Notice title="Scheduled to cancel">This subscription is set to cancel at the end of the current billing period ({dashDate(sub.currentPeriodEndAt)}). You can resume to keep it active.</Notice> : null}

      {/* Confirmation */}
      {confirmAction ? (
        <Notice
          tone="destructive"
          title={confirmAction === "schedule_cancel" ? "Your subscription will cancel at the end of the current period. Are you sure?" : `Are you sure you want to ${confirmAction} this subscription?`}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" className="h-10 bg-destructive px-5 text-destructive-foreground hover:bg-destructive/90" disabled={busy} onClick={() => void handleAction(confirmAction)}>
                {busy ? "Processing..." : "Confirm"}
              </Button>
              <Button variant="ghost" className="h-10 px-5 text-foreground" onClick={() => setConfirmAction(null)}>
                Cancel
              </Button>
            </div>
          }
        />
      ) : null}

      {/* Actions */}
      {canPause || canResume || canScheduleCancel ? (
        <div className="flex flex-wrap items-center gap-3">
          {canPause ? (
            <Button variant="ghost" disabled={busy} onClick={() => void handleAction("pause")}>
              Pause subscription
            </Button>
          ) : null}
          {canResume ? (
            <Button variant="primary" disabled={busy} onClick={() => void handleAction("resume")}>
              Resume subscription
            </Button>
          ) : null}
          {canScheduleCancel && !confirmAction ? (
            <Button variant="ghost" className="border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive/10" disabled={busy} onClick={() => setConfirmAction("schedule_cancel")}>
              Cancel subscription
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Entitlements */}
      {sub.entitlements && sub.entitlements.length > 0 ? (
        <Section title="Entitlements">
          <RowList>
            {sub.entitlements.map((entitlement: any) => (
              <Row key={entitlement._id} className="flex-row items-center justify-between gap-4 py-3">
                <span className="font-mono text-sm text-foreground">{entitlement.entitlementCode}</span>
                <StatusPill status={entitlement.status} />
              </Row>
            ))}
          </RowList>
        </Section>
      ) : null}

      {/* Invoices */}
      {sub.invoices && sub.invoices.length > 0 ? (
        <Section title="Invoices">
          <RowList>
            {sub.invoices.map((invoice: any) => (
              <Row key={invoice._id} className="flex-row flex-wrap items-center justify-between gap-4 py-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-base text-foreground">{dashDate(invoice.createdAt)}</p>
                  <SmallCaps className="normal-case tracking-normal">{invoice.invoiceNumber ?? invoice._id}</SmallCaps>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-display text-lg tabular-nums text-foreground">{typeof invoice.totalAmount === "number" ? formatMoney(invoice.totalAmount, invoice.currencyCode ?? currency) : "—"}</span>
                  <StatusPill status={invoice.status} />
                </div>
              </Row>
            ))}
          </RowList>
        </Section>
      ) : null}

      {/* History */}
      {sub.history && sub.history.length > 0 ? (
        <Section title="History">
          <RowList>
            {sub.history.slice(0, 10).map((event: any) => (
              <Row key={event._id} className="gap-1 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="text-base capitalize text-foreground">{event.eventType?.replace(/\./g, " ").replace(/_/g, " ")}</p>
                  <SmallCaps className="tabular-nums">{dashDateTime(event.createdAt)}</SmallCaps>
                </div>
                {event.message && event.message !== event.eventType ? <p className="text-sm leading-6 text-muted-foreground">{event.message}</p> : null}
              </Row>
            ))}
          </RowList>
        </Section>
      ) : null}
    </div>
  );
}
