/**
 * Subscription contracts.
 *
 * Every contract with its customer, plan, card on file and any payment
 * problem, newest first. Filter by status; search finds a contract across all
 * pages by the customer's email (a prefix is enough), its number or its id.
 *
 * Data: `adminContracts.listContracts` (paginated), `adminContracts.searchContracts`
 * and `queries.getMetrics`.
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache";
import { Activity, AlertTriangle, CalendarClock, ChevronRight, CircleX, Search, TrendingUp } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { ContractStatusBadge } from "@/components/subscriptions/ContractStatusBadge";
import {
  describeFailure,
  formatCadence,
  formatDate,
  formatMoney,
  humanize,
  STATUS_LABEL,
  type ContractRow,
  type ContractStatus,
} from "@/components/subscriptions/billingFormat";

export const Route = createFileRoute("/_authenticated/_admin/commerce/subscriptions/contracts/")({
  component: ContractsIndex,
});

const FILTERS: ReadonlyArray<ContractStatus | undefined> = [undefined, "active", "trialing", "past_due", "pending_cancel", "paused", "cancelled", "expired"];
const PAGE_SIZE = 25;
const COLUMNS = "grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_130px_minmax(0,1.2fr)_120px_20px]";

function MetricCard({ label, value, hint, icon: Icon, tone = "default" }: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Activity;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/15 text-primary")}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function ContractsIndex() {
  const [status, setStatus] = useState<ContractStatus | undefined>(undefined);
  const [search, setSearch] = useState("");
  const term = useDebounce(search.trim(), 250);
  const searching = term.length >= 2;

  const metrics = useQuery(api.commerceSubscriptions.queries.getMetrics, {});
  const list = usePaginatedQuery(
    api.commerceSubscriptions.adminContracts.listContracts,
    searching ? "skip" : { status },
    { initialNumItems: PAGE_SIZE },
  );
  const found = useQuery(api.commerceSubscriptions.adminContracts.searchContracts, searching ? { query: term } : "skip");

  const rows: ContractRow[] | undefined = searching
    ? found?.filter((row) => status === undefined || row.status === status)
    : list.status === "LoadingFirstPage"
      ? undefined
      : list.results;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Contracts</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every customer subscription. Open one to see its payments and history, refund a payment, retry a failed charge, change the plan or cancel.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active" value={metrics ? String(metrics.active) : "—"} hint={metrics ? `${metrics.startedLast30} started in 30 days` : undefined} icon={Activity} />
        <MetricCard label="Past due" value={metrics ? String(metrics.pastDue) : "—"} hint="Card payment failed; retrying" icon={AlertTriangle} tone={metrics && metrics.pastDue > 0 ? "danger" : "default"} />
        <MetricCard label="Monthly recurring" value={metrics ? formatMoney(metrics.mrr) : "—"} hint={metrics ? `${formatMoney(metrics.arr)} a year` : undefined} icon={TrendingUp} />
        <MetricCard label="Churn, 30 days" value={metrics ? `${metrics.churnRate30d.toFixed(1)}%` : "—"} hint={metrics ? `${metrics.cancelledLast30} cancelled` : undefined} icon={CalendarClock} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Status">
          {FILTERS.map((value) => (
            <button
              key={value ?? "all"}
              type="button"
              role="tab"
              aria-selected={status === value}
              onClick={() => setStatus(value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                status === value ? "bg-primary text-primary-foreground" : "border border-border text-foreground hover:bg-muted",
              )}
            >
              {value ? STATUS_LABEL[value] : "All"}
            </button>
          ))}
        </div>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Customer email, contract number or id"
            aria-label="Search contracts"
            className="w-full rounded-xl border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <div className="min-w-[860px]">
          <div className={cn("grid gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground", COLUMNS)}>
            <div>Customer</div>
            <div>Plan</div>
            <div>Status</div>
            <div>Billing</div>
            <div>Card</div>
            <div />
          </div>

          {rows === undefined ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-14 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center">
              <CircleX className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                {searching ? `No contract matches “${term}”.` : status ? `No ${STATUS_LABEL[status].toLowerCase()} contracts.` : "No contracts yet."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li key={row._id}>
                  <Link
                    to="/commerce/subscriptions/contracts/$contractId"
                    params={{ contractId: row._id }}
                    className={cn("grid items-center gap-4 px-5 py-4 text-sm transition-colors hover:bg-muted/30", COLUMNS)}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{row.customerName ?? row.customerEmail ?? "Unknown customer"}</p>
                      {row.customerName && row.customerEmail ? <p className="truncate text-xs text-muted-foreground">{row.customerEmail}</p> : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-foreground">{row.planTitle ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(row.recurringAmount, row.currencyCode)} {formatCadence(row.billingInterval, row.billingIntervalCount)}
                      </p>
                    </div>
                    <div>
                      <ContractStatusBadge status={row.status} />
                    </div>
                    <BillingCell row={row} />
                    <div className="text-xs text-muted-foreground">
                      {row.card ? `${humanize(row.card.brand)} •••• ${row.card.last4}` : "No card"}
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {!searching && list.status !== "Exhausted" && list.status !== "LoadingFirstPage" ? (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={list.status === "LoadingMore"}
            onClick={() => list.loadMore(PAGE_SIZE)}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {list.status === "LoadingMore" ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
      {searching && found && found.length === 25 ? (
        <p className="text-center text-xs text-muted-foreground">Showing the 25 newest matches. Type more of the email to narrow it.</p>
      ) : null}
    </div>
  );
}

function BillingCell({ row }: { row: ContractRow }) {
  if (row.billingIssue) {
    return (
      <div className="min-w-0 text-xs">
        <p className="font-medium text-destructive">
          {formatMoney(row.billingIssue.amountDue, row.currencyCode)} due · {describeFailure(row.billingIssue.lastFailureReason)}
        </p>
        <p className="text-muted-foreground">
          {row.billingIssue.nextRetryAt ? `Retry ${formatDate(row.billingIssue.nextRetryAt)}` : "No retries left"}
          {row.billingIssue.accessEndsAt ? ` · access until ${formatDate(row.billingIssue.accessEndsAt)}` : ""}
        </p>
      </div>
    );
  }
  if (row.nextChargeAt) return <p className="text-xs text-muted-foreground">Next charge {formatDate(row.nextChargeAt)}</p>;
  if (row.status === "pending_cancel") return <p className="text-xs text-muted-foreground">Ends {formatDate(row.currentPeriodEndAt)}</p>;
  return <p className="text-xs text-muted-foreground">Since {formatDate(row.createdAt)}</p>;
}
