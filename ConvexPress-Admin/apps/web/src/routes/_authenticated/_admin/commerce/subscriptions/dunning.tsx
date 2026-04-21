/**
 * Dunning queue.
 *
 * Shows failed subscription invoices that are the target of retry
 * attempts (via the internal `processScheduledDunning` action, run on
 * a cron). Since Wave 3 has not exposed a public
 * `listDunningAttempts` query, this page renders an approximation
 * using `listInvoices({status: "failed"})` and surfaces the
 * past_due contracts. The page documents the gap in an inline notice.
 *
 * Backend gap (filed in the Wave 3 report):
 *   - commerceSubscriptions.queries.listDunningAttempts (needed for
 *     per-attempt history, next retry time, attempt number).
 *   - commerceSubscriptions.mutations.retryInvoiceNow (admin-triggered
 *     manual retry; currently blocked on reusable-payment-method
 *     charging — see actions.ts).
 *
 * Until these land, we show the failed invoice queue as a practical
 * proxy for the dunning queue. Each row links to the invoice detail
 * and the owning contract.
 */

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/dunning",
)({
  component: DunningQueuePage,
});

type Invoice = {
  _id: Id<"commerce_subscription_invoices">;
  subscriptionId: Id<"commerce_subscriptions">;
  status: "draft" | "open" | "paid" | "failed" | "void";
  currencyCode: string;
  totalAmount: number;
  paymentProvider?: string;
  dueAt?: number;
  createdAt: number;
  updatedAt: number;
  subscription?: {
    _id: string;
    status?: string;
  } | null;
};

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function formatDateTime(ts?: number) {
  if (!ts) return "--";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DunningQueuePage() {
  const [scope, setScope] = useState<"failed" | "open">("failed");

  const failedInvoices = useQuery(
    (api as any).commerceSubscriptions.queries.listInvoices,
    {
      status: scope,
      limit: 200,
    },
  ) as Invoice[] | null | undefined;

  const pluginDisabled = failedInvoices === null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <ShieldAlert className="h-7 w-7 text-muted-foreground" />
            Dunning queue
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Failed subscription invoices the billing engine will retry
            according to each contract's dunning policy. Customers are
            notified at each attempt; exhausted retries move the contract
            to past_due and then cancelled.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4 text-xs text-foreground">
        <p className="flex items-center gap-1.5 font-medium">
          <AlertTriangle className="h-3.5 w-3.5 text-accent-foreground" />
          Temporary view
        </p>
        <p className="mt-1 text-muted-foreground">
          A per-attempt dunning history query
          (<code className="font-mono">listDunningAttempts</code>) and an
          admin-triggered manual retry (<code className="font-mono">retryInvoiceNow</code>)
          are not yet exposed in the backend. Until they ship, this page
          displays the failed-invoice queue as an approximation — each
          invoice row links to the owning contract where the standard
          pause/cancel actions remain available.
        </p>
      </div>

      {pluginDisabled && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            The commerce subscriptions plugin is disabled.
          </p>
        </div>
      )}

      {!pluginDisabled && (
        <>
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { key: "failed", label: "Failed" },
                { key: "open", label: "Open (not yet paid)" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setScope(key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  scope === key
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="grid grid-cols-[1fr_140px_140px_140px_140px_32px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <div>Invoice</div>
              <div>Amount</div>
              <div>Provider</div>
              <div>Due</div>
              <div>Updated</div>
              <div />
            </div>

            {failedInvoices === undefined ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-xl bg-muted"
                  />
                ))}
              </div>
            ) : failedInvoices.length === 0 ? (
              <div className="p-10 text-center">
                <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {scope === "failed"
                    ? "No failed invoices right now. Dunning queue is empty."
                    : "No open invoices awaiting payment."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {failedInvoices.map((inv) => (
                  <li key={inv._id}>
                    <Link
                      to="/commerce/subscriptions/invoices/$invoiceId"
                      params={{ invoiceId: inv._id }}
                      className="grid grid-cols-[1fr_140px_140px_140px_140px_32px] items-center gap-4 px-5 py-4 text-sm transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-foreground">
                          {String(inv._id)}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                          <span className="font-mono">
                            contract: {String(inv.subscriptionId)}
                          </span>
                          {inv.subscription?.status && (
                            <span
                              className={cn(
                                "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize",
                                inv.subscription.status === "past_due"
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {inv.subscription.status.replace(/_/g, " ")}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="font-medium text-foreground">
                        {formatMoney(inv.totalAmount, inv.currencyCode)}
                      </div>
                      <div className="text-muted-foreground">
                        {inv.paymentProvider ?? "—"}
                      </div>
                      <div className="text-muted-foreground">
                        {formatDateTime(inv.dueAt)}
                      </div>
                      <div className="text-muted-foreground">
                        {formatDateTime(inv.updatedAt)}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end">
            <Link
              to="/commerce/subscriptions/invoices"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              View all invoices
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
