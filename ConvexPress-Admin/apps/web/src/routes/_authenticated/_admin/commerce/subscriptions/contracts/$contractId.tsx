/**
 * Contract detail.
 *
 * Header: customer, plan, status. Left column: billing (payment problem with
 * retry schedule, card on file, periods), payments with refunds (refund in
 * place), entitlements, items, and the full timeline with who acted. Right
 * rail: `ContractActions`, offering exactly what the contract's state allows.
 *
 * Data: `queries.getById` (the contract and its rows) and
 * `adminContracts.getContractBilling` (billing view and allowed actions).
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { AlertTriangle, ArrowLeft, CreditCard, History, ListTree, Receipt, RotateCcw, ShieldCheck } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { asId } from "@/lib/utils";
import { useBreadcrumbTitle } from "@/lib/admin-shell/breadcrumb-titles";
import { ContractActions } from "@/components/subscriptions/ContractActions";
import { ContractStatusBadge } from "@/components/subscriptions/ContractStatusBadge";
import { RefundForm } from "@/components/subscriptions/RefundForm";
import {
  describeFailure,
  eventLabel,
  formatCadence,
  formatDate,
  formatDateTime,
  formatMoney,
  humanize,
  INVOICE_KIND_LABEL,
  invoiceStatusText,
  reasonText,
  statusText,
  type AdminInvoice,
} from "@/components/subscriptions/billingFormat";


export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/contracts/$contractId")({
  component: ContractDetailPage,
});

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Receipt; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card">
      <h2 className="flex items-center gap-2 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="h-4 w-4" /> {title}
      </h2>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function ContractDetailPage() {
  const { contractId } = Route.useParams();
  const subscriptionId = asId<"commerce_subscriptions">(contractId);
  const contract = useQuery(api.commerceSubscriptions.queries.getById, subscriptionId ? { subscriptionId } : "skip");
  const billing = useQuery(api.commerceSubscriptions.adminContracts.getContractBilling, subscriptionId ? { subscriptionId } : "skip");
  useBreadcrumbTitle(contractId, billing ? (billing.customerName ?? billing.customerEmail) : undefined);

  if (!subscriptionId || contract === null || billing === null) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          This subscription contract was not found.
        </div>
      </div>
    );
  }
  if (contract === undefined || billing === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  const issue = billing.billingIssue;
  const ended = contract.status === "cancelled" || contract.status === "expired";
  const anyAction = Object.values(billing.actions).some(Boolean);
  return (
    <div className="space-y-6">
      <BackLink />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{billing.customerName ?? billing.customerEmail ?? "Customer"}</h1>
          <p className="text-sm text-muted-foreground">
            {billing.planTitle ?? "Subscription"} · {formatMoney(contract.recurringAmount, contract.currencyCode)}{" "}
            {formatCadence(contract.billingInterval, contract.billingIntervalCount)}
            {billing.customerEmail && billing.customerName ? ` · ${billing.customerEmail}` : ""}
          </p>
        </div>
        <ContractStatusBadge status={contract.status} className="px-3 py-1" />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {issue ? (
            <div className="flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-destructive">{formatMoney(issue.amountDue, contract.currencyCode)} is past due</p>
                <p>
                  {issue.failedAttempts} failed attempt{issue.failedAttempts === 1 ? "" : "s"} · {describeFailure(issue.lastFailureReason)}
                </p>
                <p className="text-muted-foreground">
                  {issue.nextRetryAt ? `Next automatic retry ${formatDateTime(issue.nextRetryAt)}. ` : "No retries left. "}
                  {issue.accessEndsAt ? `Access continues until ${formatDate(issue.accessEndsAt)}.` : ""}
                </p>
              </div>
            </div>
          ) : null}

          <Section title="Billing" icon={CreditCard}>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Card on file</dt>
                <dd>{billing.card ? `${humanize(billing.card.brand)} •••• ${billing.card.last4} (exp ${String(billing.card.expMonth).padStart(2, "0")}/${billing.card.expYear})` : "Not recorded"}</dd>
              </div>
              {ended ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Ended</dt>
                  <dd>{formatDate(contract.cancelledAt)}</dd>
                </div>
              ) : (
                <>
                  <div>
                    <dt className="text-xs text-muted-foreground">Current period</dt>
                    <dd>
                      {formatDate(contract.currentPeriodStartAt)} – {formatDate(contract.currentPeriodEndAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{contract.status === "pending_cancel" ? "Ends" : "Next charge"}</dt>
                    <dd>
                      {contract.status === "pending_cancel"
                        ? formatDate(contract.currentPeriodEndAt)
                        : contract.status === "active" || contract.status === "trialing"
                          ? formatDate(contract.nextBillingAt)
                          : contract.status === "paused"
                            ? "Paused"
                            : "After the payment is collected"}
                    </dd>
                  </div>
                </>
              )}
              {contract.trialEndsAt ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Trial ends</dt>
                  <dd>{formatDate(contract.trialEndsAt)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">Customer since</dt>
                <dd>{formatDate(contract.createdAt)}</dd>
              </div>
              {contract.scheduledOfferChange ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Scheduled plan change</dt>
                  <dd>On {formatDate(contract.scheduledOfferChange.effectiveAt)}</dd>
                </div>
              ) : null}
            </dl>
          </Section>

          <Section title="Payments" icon={Receipt}>
            {billing.invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {billing.invoices.map((invoice) => (
                  <InvoiceRow key={invoice._id} invoice={invoice} />
                ))}
              </ul>
            )}
          </Section>

          <Section title="Entitlements" icon={ShieldCheck}>
            {contract.entitlements.length === 0 ? (
              <p className="text-sm text-muted-foreground">None.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {contract.entitlements.map((entitlement) => (
                  <li key={entitlement._id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs">{entitlement.entitlementCode}</span>
                    <span className="text-xs text-muted-foreground">
                      {humanize(entitlement.status)}
                      {entitlement.graceEndsAt ? ` until ${formatDate(entitlement.graceEndsAt)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Items" icon={ListTree}>
            <ul className="space-y-2 text-sm">
              {contract.items.map((item) => (
                <li key={item._id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{item.titleSnapshot ?? "Item"} × {item.quantity}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatMoney(item.unitAmount, item.currencyCode)} · {humanize(item.status ?? "active")}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Timeline" icon={History}>
            <ol className="space-y-3">
              {billing.timeline.map((entry) => (
                <li key={entry._id} className="text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{eventLabel(entry.eventType)}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[
                      entry.fromStatus && entry.toStatus && entry.fromStatus !== entry.toStatus
                        ? `${statusText(entry.fromStatus)} → ${statusText(entry.toStatus)}`
                        : undefined,
                      entry.reason ? reasonText(entry.reason) : undefined,
                      entry.actor ? `by ${entry.actor}` : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Actions</h2>
            {anyAction ? (
              <ContractActions contract={contract} billing={billing} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {ended
                  ? `This subscription ended on ${formatDate(contract.cancelledAt)}. Paid invoices can still be refunded below.`
                  : "Nothing can be changed in this state."}
              </p>
            )}
          </div>
          {billing.dunningAttempts.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card p-4 text-sm">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Payment attempts</h2>
              <ul className="space-y-2">
                {billing.dunningAttempts.map((attempt) => (
                  <li key={attempt._id} className="flex justify-between gap-2 text-xs">
                    <span>
                      #{attempt.attemptNumber} {humanize(attempt.status)}
                      {attempt.errorMessage ? ` · ${describeFailure(attempt.errorMessage)}` : ""}
                    </span>
                    <span className="text-muted-foreground">{formatDate(attempt.processedAt ?? attempt.scheduledAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: AdminInvoice }) {
  const [refunding, setRefunding] = useState(false);
  return (
    <li className="space-y-2 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/commerce/subscriptions/invoices/$invoiceId" params={{ invoiceId: invoice._id }} className="font-medium hover:underline">
            {invoice.invoiceNumber ?? "Invoice"}
          </Link>
          <span className="ml-2 text-xs text-muted-foreground">
            {INVOICE_KIND_LABEL[invoice.kind]} ·{" "}
            {invoice.periodStartAt !== undefined && invoice.periodEndAt !== undefined
              ? `${formatDate(invoice.periodStartAt)} – ${formatDate(invoice.periodEndAt)}`
              : formatDate(invoice.createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold">{formatMoney(invoice.totalAmount, invoice.currencyCode)}</span>
          <span className="text-xs text-muted-foreground">{invoiceStatusText(invoice)}</span>
          {invoice.refundableAmount > 0 && !refunding ? (
            <button
              type="button"
              onClick={() => setRefunding(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              <RotateCcw className="h-3 w-3" /> Refund
            </button>
          ) : null}
        </div>
      </div>
      {invoice.refunds.map((entry) => (
        <p key={entry.key} className="text-xs text-muted-foreground">
          Refund {formatMoney(entry.amount, invoice.currencyCode)} · {humanize(entry.status)}
          {entry.reason ? ` · ${entry.reason}` : ""}
          {entry.error ? ` · ${entry.error}` : ""} · {formatDate(entry.requestedAt)}
        </p>
      ))}
      {refunding ? (
        <RefundForm
          invoiceId={invoice._id}
          refundableAmount={invoice.refundableAmount}
          currencyCode={invoice.currencyCode}
          onClose={() => setRefunding(false)}
        />
      ) : null}
    </li>
  );
}

function BackLink() {
  return (
    <Link
      to="/commerce/subscriptions/contracts"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to contracts
    </Link>
  );
}
