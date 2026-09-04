/**
 * Depot · dashboard.subscription — one subscription: billing facts as a
 * label table, status notice, the inline cancel confirmation, pause /
 * resume / cancel actions, then entitlements, invoices and history as
 * `DataTable`s. Same actions, gates and confirmation flow as Core.
 */
import { Pause, Play, XCircle } from "lucide-react";
import { useState } from "react";

import { formatMoney } from "@/lib/commerce/format";
import type { DashboardSubscriptionAction, DashboardSubscriptionSurfaceData } from "@/templates/packs/core/surfaces/dashboard.subscription";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, DataTable, EmptyState, Skeleton, Td, Th } from "../parts";
import { Notice } from "../parts/extra-commerce";
import { BackLink, DashboardPageHeader, DashboardSection, StatusBadge, dateOrDash, formatDateTime, formatStatus } from "../parts/extra-dashboard";

export default function DepotDashboardSubscription({ data }: SurfaceProps<DashboardSubscriptionSurfaceData>) {
  const { subscription, busy, hrefs, actions } = data;
  const [confirmAction, setConfirmAction] = useState<DashboardSubscriptionAction | null>(null);

  async function handleAction(action: DashboardSubscriptionAction) {
    const ok = await actions.run(action);
    if (ok) setConfirmAction(null);
  }

  if (subscription === undefined) {
    return (
      <div className="flex flex-col gap-4" aria-hidden="true">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (subscription === null) {
    return (
      <div data-slot="dashboard-subscription" data-pack="depot" className="flex flex-col gap-4">
        <BackLink to={hrefs.subscriptions}>Back to subscriptions</BackLink>
        <EmptyState title="Subscription not found" description="Subscription not found or you do not have access." />
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
    <div data-slot="dashboard-subscription" data-pack="depot" className="flex flex-col gap-4">
      <DashboardPageHeader
        eyebrow="Billing"
        title={sub.product?.title ?? "Subscription"}
        description={`Created ${dateOrDash(sub.createdAt)}`}
        back={{ label: "Back to subscriptions", to: hrefs.subscriptions }}
        aside={<StatusBadge status={status} />}
      />

      <DataTable
        caption="Billing details"
        firstColumnLabel
        rows={[
          { key: "amount", cells: ["Recurring amount", <span className="font-semibold tabular-nums text-foreground">{typeof sub.recurringAmount === "number" ? formatMoney(sub.recurringAmount, currency) : "—"}</span>] },
          { key: "next", cells: ["Next billing", <span className="tabular-nums">{dateOrDash(sub.nextBillingAt)}</span>] },
          { key: "period", cells: ["Current period", <span className="tabular-nums">{dateOrDash(sub.currentPeriodStartAt)} – {dateOrDash(sub.currentPeriodEndAt)}</span>] },
          ...(sub.trialEndsAt ? [{ key: "trial", cells: ["Trial ends", <span className="tabular-nums">{dateOrDash(sub.trialEndsAt)}</span>] }] : []),
        ]}
      />

      {status === "pending_cancel" ? <Notice title="Cancellation scheduled">This subscription is set to cancel at the end of the current billing period ({dateOrDash(sub.currentPeriodEndAt)}). You can resume to keep it active.</Notice> : null}

      {confirmAction ? (
        <Notice
          tone="danger"
          title={confirmAction === "schedule_cancel" ? "Your subscription will cancel at the end of the current period. Are you sure?" : `Are you sure you want to ${confirmAction} this subscription?`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void handleAction(confirmAction)} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {busy ? "Processing..." : "Confirm"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirmAction(null)}>
                Cancel
              </Button>
            </div>
          }
        />
      ) : null}

      {canPause || canResume || canScheduleCancel ? (
        <div className="flex flex-wrap gap-2">
          {canPause ? (
            <Button variant="secondary" onClick={() => void handleAction("pause")} disabled={busy}>
              <Pause className="size-4" aria-hidden="true" />
              Pause subscription
            </Button>
          ) : null}
          {canResume ? (
            <Button onClick={() => void handleAction("resume")} disabled={busy}>
              <Play className="size-4" aria-hidden="true" />
              Resume subscription
            </Button>
          ) : null}
          {canScheduleCancel && !confirmAction ? (
            <Button variant="secondary" onClick={() => setConfirmAction("schedule_cancel")} disabled={busy} className="border-destructive/40 text-destructive hover:bg-destructive/10">
              <XCircle className="size-4" aria-hidden="true" />
              Cancel subscription
            </Button>
          ) : null}
        </div>
      ) : null}

      {sub.entitlements && sub.entitlements.length > 0 ? (
        <DashboardSection title="Entitlements" count={sub.entitlements.length}>
          <DataTable caption="Entitlements">
            <thead>
              <tr>
                <Th>Entitlement</Th>
                <Th className="text-right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {sub.entitlements.map((entitlement: any) => (
                <tr key={entitlement._id} className="border-t border-border">
                  <Td className="font-mono text-xs text-foreground">{entitlement.entitlementCode}</Td>
                  <Td align="right">
                    <StatusBadge status={entitlement.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </DashboardSection>
      ) : null}

      {sub.invoices && sub.invoices.length > 0 ? (
        <DashboardSection title="Invoices" count={sub.invoices.length}>
          <DataTable caption="Invoices">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Invoice</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {sub.invoices.map((invoice: any) => (
                <tr key={invoice._id} className="border-t border-border">
                  <Td className="whitespace-nowrap tabular-nums text-foreground">{dateOrDash(invoice.createdAt)}</Td>
                  <Td className="tabular-nums text-muted-foreground">{invoice.invoiceNumber ?? invoice._id}</Td>
                  <Td align="right" className="whitespace-nowrap font-semibold text-foreground">
                    {typeof invoice.totalAmount === "number" ? formatMoney(invoice.totalAmount, invoice.currencyCode ?? currency) : "—"}
                  </Td>
                  <Td align="right">
                    <StatusBadge status={invoice.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </DashboardSection>
      ) : null}

      {sub.history && sub.history.length > 0 ? (
        <DashboardSection title="History">
          <DataTable caption="Subscription history">
            <thead>
              <tr>
                <Th>Event</Th>
                <Th className="text-right">When</Th>
              </tr>
            </thead>
            <tbody>
              {sub.history.slice(0, 10).map((event: any) => (
                <tr key={event._id} className="border-t border-border">
                  <Td>
                    <p className="font-medium text-foreground">{formatStatus(event.eventType)}</p>
                    {event.message && event.message !== event.eventType ? <p className="text-xs text-muted-foreground">{event.message}</p> : null}
                  </Td>
                  <Td align="right" className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </DashboardSection>
      ) : null}
    </div>
  );
}
