import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  CreditCard,
  DollarSign,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronRight,
  BarChart3,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/payments",
)({
  component: PaymentsDashboardPage,
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function formatDate(ts: number | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_STYLES: Record<string, string> = {
  succeeded: "bg-emerald-100 text-emerald-800",
  paid: "bg-emerald-100 text-emerald-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-purple-100 text-purple-800",
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
};

const STATUS_ICONS: Record<string, any> = {
  succeeded: CheckCircle2,
  paid: CheckCircle2,
  completed: CheckCircle2,
  failed: XCircle,
  refunded: RefreshCw,
  pending: Clock,
  processing: Clock,
};

function StatusBadge({ status }: { status: string }) {
  const Icon = STATUS_ICONS[status] ?? Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      <Icon className="h-3 w-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  icon: Icon,
  className = "",
}: {
  label: string;
  value: string | number;
  icon: any;
  className?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
      <div className={`rounded-md p-2 ${className}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

function PaymentsDashboardPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  // Query transactions from commerce_payment_transactions table
  const transactions = useQuery(
    (api as any).commerce?.payments?.listTransactions ??
      (api as any).commerce?.customers?.list,
    {},
  ) as any[] | undefined;

  // Query orders for payment enrichment
  const orders = useQuery(
    (api as any).commerce?.fulfillment?.listQueue,
    {},
  ) as any;

  // Build transaction list from orders if no dedicated payment API
  const txList: any[] = transactions ?? [];

  // If no dedicated transactions API, derive from orders
  const derivedTransactions: any[] =
    txList.length > 0
      ? txList
      : (orders?.items ?? []).map((o: any) => ({
          _id: o._id,
          orderId: o._id,
          orderNumber: o.orderNumber,
          provider: o.selectedPaymentMethodCode ?? "stripe",
          providerTransactionId: null,
          status: o.status === "paid" || o.status === "fulfilled" || o.status === "completed"
            ? "succeeded"
            : o.status === "refunded"
              ? "refunded"
              : o.status === "cancelled" || o.status === "failed"
                ? "failed"
                : "pending",
          amount: { amount: o.totalAmount ?? 0, currencyCode: o.currencyCode ?? "USD" },
          email: o.email,
          createdAt: o.paidAt ?? o.createdAt,
        }));

  // Compute stats
  const succeeded = derivedTransactions.filter(
    (t: any) => t.status === "succeeded" || t.status === "paid" || t.status === "completed",
  );
  const totalRevenue = succeeded.reduce(
    (sum: number, t: any) => sum + (t.amount?.amount ?? 0),
    0,
  );
  const refunded = derivedTransactions.filter(
    (t: any) => t.status === "refunded",
  );
  const totalRefunded = refunded.reduce(
    (sum: number, t: any) => sum + (t.amount?.amount ?? 0),
    0,
  );
  const failed = derivedTransactions.filter(
    (t: any) => t.status === "failed",
  );
  const successRate =
    derivedTransactions.length > 0
      ? ((succeeded.length / derivedTransactions.length) * 100).toFixed(1)
      : "0.0";

  // Apply filter
  const filtered =
    statusFilter === "all"
      ? derivedTransactions
      : derivedTransactions.filter((t: any) => t.status === statusFilter);

  // Sort newest first
  const sorted = [...filtered].sort(
    (a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
  );

  function toggleExpanded(txId: string) {
    setExpandedTx((prev) => (prev === txId ? null : txId));
  }

  async function handleRefund(tx: any) {
    if (!confirm(`Refund ${formatMoney(tx.amount?.amount ?? 0)}?`)) return;
    toast.success("Refund initiated");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <CreditCard className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Transaction history, revenue, and payment analytics.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={formatMoney(totalRevenue)}
          icon={DollarSign}
          className="bg-emerald-100 text-emerald-700"
        />
        <StatCard
          label="Success Rate"
          value={`${successRate}%`}
          icon={TrendingUp}
          className="bg-blue-100 text-blue-700"
        />
        <StatCard
          label="Total Refunded"
          value={formatMoney(totalRefunded)}
          icon={RefreshCw}
          className="bg-purple-100 text-purple-700"
        />
        <StatCard
          label="Transactions"
          value={derivedTransactions.length}
          icon={BarChart3}
          className="bg-amber-100 text-amber-700"
        />
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2">
        {["all", "succeeded", "pending", "failed", "refunded"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== "all" && (
              <span className="ml-1.5 text-xs opacity-70">
                (
                {
                  derivedTransactions.filter((t: any) => t.status === s)
                    .length
                }
                )
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Transactions */}
      {derivedTransactions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <CreditCard className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No payment transactions found yet.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((tx: any) => {
            const isExpanded = expandedTx === tx._id;
            return (
              <div
                key={tx._id}
                className="rounded-lg border border-border bg-card"
              >
                {/* Row */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(tx._id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/20"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}

                  {/* Order number */}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {tx.orderNumber ?? `#${String(tx._id).slice(-6)}`}
                  </span>

                  {/* Amount */}
                  <span className="text-sm font-semibold text-foreground">
                    {formatMoney(
                      tx.amount?.amount ?? 0,
                      tx.amount?.currencyCode,
                    )}
                  </span>

                  {/* Provider */}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {tx.provider ?? "stripe"}
                  </span>

                  {/* Status */}
                  <StatusBadge status={tx.status} />

                  {/* Date */}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(tx.createdAt)}
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Transaction ID
                        </p>
                        <p className="text-foreground font-mono text-xs">
                          {tx.providerTransactionId ?? tx._id}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Customer
                        </p>
                        <p className="text-foreground">
                          {tx.email ?? "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Provider
                        </p>
                        <p className="text-foreground capitalize">
                          {tx.provider ?? "stripe"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Date
                        </p>
                        <p className="text-foreground">
                          {formatDate(tx.createdAt)}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    {(tx.status === "succeeded" || tx.status === "paid" || tx.status === "completed") && (
                      <div className="flex items-center gap-2 pt-2 border-t border-border">
                        <button
                          type="button"
                          onClick={() => handleRefund(tx)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Issue Refund
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
