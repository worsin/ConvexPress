/**
 * Depot · dashboard.subscription — one subscription: billing facts as a
 * label table, status notice, the inline cancel confirmation, pause /
 * resume / cancel actions, then entitlements, invoices and history as
 * `DataTable`s. Same actions, gates and confirmation flow as Core.
 */
import { Pause, Play, RotateCcw, XCircle } from "lucide-react";
import { useState } from "react";

import { discountText, nextChargeText, planPriceText } from "@/components/subscriptions/portalTypes";
import { formatMoney } from "@/lib/commerce/format";
import { PaymentMethodPanel } from "@/components/subscriptions/PaymentMethodPanel";
import { CONFIRMATIONS, type DashboardSubscriptionAction, type DashboardSubscriptionSurfaceData } from "@/templates/packs/core/surfaces/dashboard.subscription";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, DataTable, EmptyState, Skeleton, Td, Th } from "../parts";
import { Notice } from "../parts/extra-commerce";
import { BackLink, DashboardPageHeader, DashboardSection, StatusBadge, dateOrDash, formatDateTime } from "../parts/extra-dashboard";

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
  const status = sub.status;
  const allowed = sub.actions;
  const currency = sub.currencyCode ?? "USD";

  return (
    <div data-slot="dashboard-subscription" data-pack="depot" className="flex flex-col gap-4">
      <DashboardPageHeader
        eyebrow="Billing"
        title={sub.offer?.title ?? sub.product?.title ?? "Subscription"}
        description={`Created ${dateOrDash(sub.createdAt)}`}
        back={{ label: "Back to subscriptions", to: hrefs.subscriptions }}
        aside={<StatusBadge status={status} />}
      />

      <DataTable
        caption="Billing details"
        firstColumnLabel
        rows={[
          { key: "amount", cells: ["Plan", <span className="font-semibold tabular-nums text-foreground">{planPriceText(sub)}</span>] },
          { key: "next", cells: [sub.status === "trialing" ? "First charge" : "Next charge", <span className="tabular-nums">{nextChargeText(sub)}</span>] },
          ...sub.discounts.map((discount) => ({ key: `discount-${discount.code}`, cells: ["Discount", <span>{discountText(discount, currency)}</span>] })),
          { key: "period", cells: ["Current period", <span className="tabular-nums">{dateOrDash(sub.currentPeriodStartAt)} – {dateOrDash(sub.currentPeriodEndAt)}</span>] },
          ...(sub.trialEndsAt ? [{ key: "trial", cells: ["Trial ends", <span className="tabular-nums">{dateOrDash(sub.trialEndsAt)}</span>] }] : []),
        ]}
      />

      <PaymentMethodPanel contractId={sub._id} paymentMethod={sub.paymentMethod} billingIssue={sub.billingIssue} canUpdate={allowed.updatePaymentMethod} />

      {status === "pending_cancel" ? <Notice title="Cancellation scheduled">This subscription is set to cancel at the end of the current billing period ({dateOrDash(sub.currentPeriodEndAt)}). You can keep it until then.</Notice> : null}

      {confirmAction ? (
        <Notice
          tone="danger"
          title={CONFIRMATIONS[confirmAction] ?? "Are you sure?"}
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

      {allowed.pause || allowed.resume || allowed.keep || allowed.scheduleCancel || allowed.cancelNow ? (
        <div className="flex flex-wrap gap-2">
          {allowed.pause ? (
            <Button variant="secondary" onClick={() => void handleAction("pause")} disabled={busy}>
              <Pause className="size-4" aria-hidden="true" />
              Pause subscription
            </Button>
          ) : null}
          {allowed.resume ? (
            <Button onClick={() => void handleAction("resume")} disabled={busy}>
              <Play className="size-4" aria-hidden="true" />
              Resume subscription
            </Button>
          ) : null}
          {allowed.keep ? (
            <Button onClick={() => void handleAction("keep")} disabled={busy}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Keep subscription
            </Button>
          ) : null}
          {allowed.scheduleCancel && !confirmAction ? (
            <Button variant="secondary" onClick={() => setConfirmAction("schedule_cancel")} disabled={busy} className="border-destructive/40 text-destructive hover:bg-destructive/10">
              <XCircle className="size-4" aria-hidden="true" />
              Cancel subscription
            </Button>
          ) : null}
          {allowed.cancelNow && !confirmAction ? (
            <Button variant="secondary" onClick={() => setConfirmAction("cancel_now")} disabled={busy} className="border-destructive/40 text-destructive hover:bg-destructive/10">
              <XCircle className="size-4" aria-hidden="true" />
              Cancel now
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
              {sub.entitlements.map((entitlement) => (
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
              {sub.invoices.map((invoice) => (
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
              {sub.history.slice(0, 10).map((event) => (
                <tr key={event._id} className="border-t border-border">
                  <Td>
                    <p className="font-medium text-foreground">{event.message}</p>
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
