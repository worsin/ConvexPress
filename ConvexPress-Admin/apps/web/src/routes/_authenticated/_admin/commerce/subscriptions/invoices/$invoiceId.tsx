/**
 * One subscription invoice: who and what it was for, its lines and totals,
 * every attempt to collect it, and its refunds (refund in place).
 *
 * Data: `adminContracts.getInvoiceDetail`.
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { ArrowLeft, RotateCcw } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { asId, cn } from "@/lib/utils";
import { RefundForm } from "@/components/subscriptions/RefundForm";
import {
  describeFailure,
  formatDate,
  formatDateTime,
  formatMoney,
  humanize,
  INVOICE_KIND_LABEL,
  INVOICE_STATUS_TONE,
  invoiceStatusText,
} from "@/components/subscriptions/billingFormat";

export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/invoices/$invoiceId")({
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { invoiceId: rawId } = Route.useParams();
  const invoiceId = asId<"commerce_subscription_invoices">(rawId);
  const invoice = useQuery(api.commerceSubscriptions.adminContracts.getInvoiceDetail, { invoiceId });
  const [refunding, setRefunding] = useState(false);

  if (invoice === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }
  if (invoice === null) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">This invoice was not found.</div>
      </div>
    );
  }

  const money = (amount: number) => formatMoney(amount, invoice.currencyCode);
  return (
    <div className="space-y-6">
      <BackLink />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Invoice {invoice.invoiceNumber ?? "(draft)"}</h1>
          <p className="text-sm text-muted-foreground">
            {INVOICE_KIND_LABEL[invoice.kind]} for{" "}
            <Link to="/commerce/subscriptions/contracts/$contractId" params={{ contractId: invoice.subscriptionId }} className="text-foreground hover:underline">
              {invoice.customerName ?? invoice.customerEmail ?? "the customer"}
            </Link>
            {invoice.planTitle ? ` · ${invoice.planTitle}` : ""}
          </p>
        </div>
        <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium", INVOICE_STATUS_TONE[invoice.status])}>{invoiceStatusText(invoice)}</span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">Item</th>
                  <th className="px-5 py-3 text-right font-semibold">Qty</th>
                  <th className="px-5 py-3 text-right font-semibold">Price</th>
                  <th className="px-5 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoice.lines.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-4 text-muted-foreground">
                      {invoice.planTitle ?? "Subscription"}
                      {invoice.periodStartAt !== undefined && invoice.periodEndAt !== undefined
                        ? `, ${formatDate(invoice.periodStartAt)} – ${formatDate(invoice.periodEndAt)}`
                        : ""}
                    </td>
                  </tr>
                ) : (
                  invoice.lines.map((line) => (
                    <tr key={line._id}>
                      <td className="px-5 py-3">{line.title}</td>
                      <td className="px-5 py-3 text-right">{line.quantity}</td>
                      <td className="px-5 py-3 text-right">{money(line.unitAmount)}</td>
                      <td className="px-5 py-3 text-right">{money(line.totalAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="border-t border-border text-sm">
                <tr>
                  <td colSpan={3} className="px-5 pt-3 text-right text-muted-foreground">Subtotal</td>
                  <td className="px-5 pt-3 text-right">{money(invoice.subtotalAmount)}</td>
                </tr>
                {invoice.taxAmount > 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 text-right text-muted-foreground">Tax</td>
                    <td className="px-5 text-right">{money(invoice.taxAmount)}</td>
                  </tr>
                ) : null}
                <tr className="font-semibold">
                  <td colSpan={3} className="px-5 pb-3 text-right">Total</td>
                  <td className="px-5 pb-3 text-right">{money(invoice.totalAmount)}</td>
                </tr>
                {invoice.refundedAmount > 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 pb-3 text-right text-muted-foreground">Refunded</td>
                    <td className="px-5 pb-3 text-right">−{money(invoice.refundedAmount)}</td>
                  </tr>
                ) : null}
              </tfoot>
            </table>
          </section>

          <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Refunds</h2>
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
            {refunding ? (
              <RefundForm invoiceId={invoice._id} refundableAmount={invoice.refundableAmount} currencyCode={invoice.currencyCode} onClose={() => setRefunding(false)} />
            ) : null}
            {invoice.refunds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {invoice.refundableAmount > 0 ? "No refunds." : invoice.status === "paid" ? "Fully refunded or not paid by card." : "Only paid invoices can be refunded."}
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {invoice.refunds.map((entry) => (
                  <li key={entry.key} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {money(entry.amount)} · {humanize(entry.status)}
                      {entry.reason ? <span className="text-muted-foreground"> · {entry.reason}</span> : null}
                      {entry.error ? <span className="text-destructive"> · {entry.error}</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(entry.completedAt ?? entry.requestedAt)}
                      {entry.providerRefundId ? ` · ${entry.providerRefundId}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <dl className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Issued</dt>
              <dd>{formatDateTime(invoice.createdAt)}</dd>
            </div>
            {invoice.paidAt ? (
              <div>
                <dt className="text-xs text-muted-foreground">Paid</dt>
                <dd>{formatDateTime(invoice.paidAt)}</dd>
              </div>
            ) : invoice.dueAt ? (
              <div>
                <dt className="text-xs text-muted-foreground">Due</dt>
                <dd>{formatDateTime(invoice.dueAt)}</dd>
              </div>
            ) : null}
            {invoice.periodStartAt !== undefined && invoice.periodEndAt !== undefined ? (
              <div>
                <dt className="text-xs text-muted-foreground">Service period</dt>
                <dd>
                  {formatDate(invoice.periodStartAt)} – {formatDate(invoice.periodEndAt)}
                </dd>
              </div>
            ) : null}
            {invoice.paymentTransactionId ? (
              <div>
                <dt className="text-xs text-muted-foreground">{invoice.paymentProvider ? `${humanize(invoice.paymentProvider)} payment` : "Payment"}</dt>
                <dd className="break-all font-mono text-xs">{invoice.paymentTransactionId}</dd>
              </div>
            ) : null}
          </dl>
          {invoice.attempts.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card p-4 text-sm">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Collection attempts</h2>
              <ul className="space-y-2">
                {invoice.attempts.map((attempt) => (
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

function BackLink() {
  return (
    <Link to="/commerce/subscriptions/invoices" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-3.5 w-3.5" /> Back to invoices
    </Link>
  );
}
