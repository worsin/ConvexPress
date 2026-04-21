/**
 * Subscription Contracts list.
 *
 * Admin-facing view of subscription contracts (instances customers hold).
 * Filter by status. Search by contract id prefix or user email. Click a
 * row to open the detail page with its full history, items, invoices,
 * entitlements, and actions rail.
 *
 * Backend: commerceSubscriptions.queries.list, .getMetrics.
 */

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  CircleX,
  Pause,
  Search,
  TrendingUp,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/contracts/",
)({
  component: ContractsIndex,
});

type ContractStatus =
  | "draft"
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "pending_cancel"
  | "cancelled"
  | "expired";

type Contract = {
  _id: Id<"commerce_subscriptions">;
  status: ContractStatus;
  userId?: Id<"users">;
  currencyCode?: string;
  recurringAmount?: number;
  billingInterval?: "week" | "month" | "year";
  billingIntervalCount?: number;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  nextBillingAt?: number;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: number;
  createdAt: number;
  customer?: { _id: string; email?: string; firstName?: string; lastName?: string } | null;
  product?: { _id: string; title?: string; slug?: string } | null;
};

function formatMoney(amount?: number, currencyCode = "USD") {
  if (typeof amount !== "number") return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function formatDate(ts?: number) {
  if (!ts) return "--";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: ContractStatus }) {
  const styles: Record<ContractStatus, string> = {
    active: "bg-primary/15 text-primary",
    trialing: "bg-accent/20 text-accent-foreground",
    paused: "bg-muted text-muted-foreground",
    past_due: "bg-destructive/10 text-destructive",
    pending_cancel: "bg-destructive/10 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
    expired: "bg-muted text-muted-foreground",
    draft: "bg-muted text-muted-foreground",
  };
  const label = status.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        styles[status],
      )}
    >
      {label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warn" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            tone === "danger" && "bg-destructive/10 text-destructive",
            tone === "warn" && "bg-muted text-muted-foreground",
            (!tone || tone === "default") && "bg-primary/15 text-primary",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function ContractsIndex() {
  const [statusFilter, setStatusFilter] = useState<"" | ContractStatus>("");
  const [search, setSearch] = useState("");

  const contracts = useQuery(
    (api as any).commerceSubscriptions.queries.list,
    {
      status: statusFilter || undefined,
      limit: 200,
    },
  ) as Contract[] | null | undefined;

  const metrics = useQuery(
    (api as any).commerceSubscriptions.queries.getMetrics,
    {},
  ) as
    | {
        total: number;
        active: number;
        paused: number;
        pastDue: number;
        cancelled: number;
        mrr: number;
        arr: number;
        startedLast30: number;
        cancelledLast30: number;
        churnRate30d: number;
      }
    | null
    | undefined;

  const pluginDisabled = contracts === null;

  const filtered = useMemo(() => {
    if (!contracts) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return contracts;
    return contracts.filter((c) => {
      const email = c.customer?.email?.toLowerCase() ?? "";
      const id = String(c._id).toLowerCase();
      const name =
        `${c.customer?.firstName ?? ""} ${c.customer?.lastName ?? ""}`.toLowerCase();
      return (
        email.includes(needle) || id.includes(needle) || name.includes(needle)
      );
    });
  }, [contracts, search]);

  const statuses: Array<"" | ContractStatus> = [
    "",
    "active",
    "trialing",
    "paused",
    "past_due",
    "pending_cancel",
    "cancelled",
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Contracts</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Customer subscription contracts. Click a row to see the full
            timeline, manage items, and act on the contract (pause, cancel,
            coupon, offer change).
          </p>
        </div>
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
          {/* Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Active"
              value={String(metrics?.active ?? "—")}
              icon={Activity}
            />
            <MetricCard
              label="Paused"
              value={String(metrics?.paused ?? "—")}
              icon={Pause}
              tone="warn"
            />
            <MetricCard
              label="Past due"
              value={String(metrics?.pastDue ?? "—")}
              icon={AlertTriangle}
              tone="danger"
            />
            <MetricCard
              label="MRR"
              value={formatMoney(metrics?.mrr, "USD")}
              icon={TrendingUp}
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-1">
              {statuses.map((s) => (
                <button
                  key={s || "all"}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    statusFilter === s
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-foreground hover:bg-muted",
                  )}
                >
                  {s ? s.replace(/_/g, " ") : "All"}
                </button>
              ))}
            </div>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by email, name, or id…"
                className="w-full rounded-xl border border-border bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="grid grid-cols-[1.2fr_120px_130px_130px_140px_32px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <div>Customer</div>
              <div>Status</div>
              <div>Amount</div>
              <div>Next bill</div>
              <div>Created</div>
              <div />
            </div>

            {contracts === undefined ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-xl bg-muted"
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <CircleX className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {search || statusFilter
                    ? "No contracts match your filter."
                    : "No contracts yet."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((c) => (
                  <li key={c._id}>
                    <Link
                      to="/commerce/subscriptions/contracts/$contractId"
                      params={{ contractId: c._id }}
                      className="grid grid-cols-[1.2fr_120px_130px_130px_140px_32px] items-center gap-4 px-5 py-4 text-sm transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {c.customer?.email ?? "—"}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {c.customer?.firstName || c.customer?.lastName
                            ? `${c.customer?.firstName ?? ""} ${c.customer?.lastName ?? ""}`.trim()
                            : c.product?.title
                              ? c.product.title
                              : String(c._id).slice(0, 10) + "…"}
                        </p>
                      </div>
                      <div>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="font-medium text-foreground">
                        {formatMoney(c.recurringAmount, c.currencyCode)}
                      </div>
                      <div className="text-muted-foreground">
                        {formatDate(c.nextBillingAt ?? c.currentPeriodEnd)}
                      </div>
                      <div className="text-muted-foreground">
                        {formatDate(c.createdAt)}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
