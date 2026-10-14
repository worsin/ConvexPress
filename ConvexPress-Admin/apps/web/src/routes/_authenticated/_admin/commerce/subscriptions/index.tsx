/**
 * Subscriptions overview.
 *
 * The numbers (active, monthly recurring revenue, past due, churn), then what
 * needs attention now (past-due contracts, with retry), what renews in the
 * next seven days and how much it should bring in, and the latest invoices.
 *
 * Data: `queries.getMetrics`, `adminContracts.listDunningQueue`,
 * `adminContracts.listUpcomingRenewals` and `adminContracts.listInvoices`.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, DollarSign, TrendingDown, Users } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  describeFailure,
  formatCadence,
  formatDate,
  formatMoney,
  INVOICE_KIND_LABEL,
  INVOICE_STATUS_TONE,
  invoiceStatusText,
} from "@/components/subscriptions/billingFormat";

export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/")({
  component: SubscriptionsOverview,
});

function StatCard({ label, value, sub, icon: Icon, tone = "default" }: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Users;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
          {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
        </div>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/15 text-primary")}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, to, linkLabel, children }: { title: string; to: "/commerce/subscriptions/dunning" | "/commerce/subscriptions/contracts" | "/commerce/subscriptions/invoices"; linkLabel: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          {linkLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {children}
    </section>
  );
}

function SubscriptionsOverview() {
  const metrics = useQuery(api.commerceSubscriptions.queries.getMetrics, {});
  const pastDue = useQuery(api.commerceSubscriptions.adminContracts.listDunningQueue, {});
  const upcoming = useQuery(api.commerceSubscriptions.adminContracts.listUpcomingRenewals, { days: 7 });
  const invoices = usePaginatedQuery(api.commerceSubscriptions.adminContracts.listInvoices, {}, { initialNumItems: 8 });
  const owed = (pastDue ?? []).reduce((sum, row) => sum + (row.billingIssue?.amountDue ?? 0), 0);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Recurring revenue at a glance: what needs attention, what renews this week, and the latest charges.</p>
      </div>

      {metrics === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active"
            value={String(metrics.active)}
            sub={[`${metrics.startedLast30} new in 30 days`, metrics.pendingCancel > 0 ? `${metrics.pendingCancel} cancelling` : undefined].filter(Boolean).join(" · ")}
            icon={Users}
          />
          <StatCard label="Monthly recurring" value={formatMoney(metrics.mrr)} sub={`${formatMoney(metrics.arr)} a year`} icon={DollarSign} />
          <StatCard
            label="Past due"
            value={String(metrics.pastDue)}
            sub={metrics.pastDue > 0 ? `${formatMoney(owed)} outstanding` : "Every card is current"}
            icon={AlertTriangle}
            tone={metrics.pastDue > 0 ? "danger" : "default"}
          />
          <StatCard label="Churn, 30 days" value={`${metrics.churnRate30d.toFixed(1)}%`} sub={`${metrics.cancelledLast30} ended`} icon={TrendingDown} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Needs attention" to="/commerce/subscriptions/dunning" linkLabel="Failed payments">
          {pastDue === undefined ? (
            <div className="m-5 h-16 animate-pulse rounded-xl bg-muted" />
          ) : pastDue.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> No payment problems.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {pastDue.slice(0, 6).map((row) => (
                <li key={row._id}>
                  <Link to="/commerce/subscriptions/contracts/$contractId" params={{ contractId: row._id }} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted/30">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.customerName ?? row.customerEmail ?? "Unknown customer"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {describeFailure(row.billingIssue?.lastFailureReason)}
                        {row.billingIssue?.nextRetryAt ? ` · retry ${formatDate(row.billingIssue.nextRetryAt)}` : " · no retries left"}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold text-destructive">{formatMoney(row.billingIssue?.amountDue, row.currencyCode)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Renewing in the next 7 days" to="/commerce/subscriptions/contracts" linkLabel="All contracts">
          {upcoming === undefined ? (
            <div className="m-5 h-16 animate-pulse rounded-xl bg-muted" />
          ) : upcoming.rows.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4" /> Nothing renews this week.
            </p>
          ) : (
            <>
              <p className="border-b border-border px-5 py-2 text-xs text-muted-foreground">
                {upcoming.rows.length}
                {upcoming.truncated ? "+" : ""} renewal{upcoming.rows.length === 1 ? "" : "s"} · about {formatMoney(upcoming.expectedAmount)} expected
              </p>
              <ul className="divide-y divide-border">
                {upcoming.rows.slice(0, 6).map((row) => (
                  <li key={row._id}>
                    <Link to="/commerce/subscriptions/contracts/$contractId" params={{ contractId: row._id }} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted/30">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{row.customerName ?? row.customerEmail ?? "Unknown customer"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.planTitle ?? "Subscription"} · {formatDate(row.nextChargeAt)}
                          {row.card ? "" : " · no card on file"}
                        </p>
                      </div>
                      <span className="shrink-0 text-right">
                        <span className="font-semibold">{formatMoney(row.recurringAmount, row.currencyCode)}</span>
                        <span className="block text-xs text-muted-foreground">{formatCadence(row.billingInterval, row.billingIntervalCount)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>

      <Panel title="Latest invoices" to="/commerce/subscriptions/invoices" linkLabel="All invoices">
        {invoices.status === "LoadingFirstPage" ? (
          <div className="m-5 h-16 animate-pulse rounded-xl bg-muted" />
        ) : invoices.results.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {invoices.results.map((row) => (
              <li key={row._id}>
                <Link to="/commerce/subscriptions/invoices/$invoiceId" params={{ invoiceId: row._id }} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-5 py-3 text-sm hover:bg-muted/30">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.customerName ?? row.customerEmail ?? "Unknown customer"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.invoiceNumber ?? "Draft"} · {INVOICE_KIND_LABEL[row.kind]} · {formatDate(row.paidAt ?? row.createdAt)}
                    </p>
                  </div>
                  <span className={cn("hidden rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline-flex", INVOICE_STATUS_TONE[row.status])}>{invoiceStatusText(row)}</span>
                  <span className="font-semibold">{formatMoney(row.totalAmount, row.currencyCode)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
