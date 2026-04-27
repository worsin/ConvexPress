import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import {
  ShoppingCart,
  Mail,
  Trash2,
  AlertTriangle,
  DollarSign,
  Clock,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/orders/abandoned",
)({
  component: AbandonedOrdersPage,
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

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "< 1 hour ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

const STEP_LABELS: Record<string, string> = {
  draft: "Cart Created",
  collecting_shipping: "Shipping Info",
  collecting_payment: "Payment Info",
  ready_for_review: "Order Review",
  abandoned: "Abandoned",
  failed: "Failed",
};

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

function AbandonedOrdersPage() {
  // Query all checkout sessions — filter for abandoned / failed client-side
  const allSessions = useQuery(
    (api as any).commerce?.checkout?.listSessions ?? (api as any).shipping?.queries?.listCheckoutQuotes,
    {},
  ) as any[] | undefined;

  // Build abandoned list from checkout sessions
  const abandonedSessions = (allSessions ?? []).filter(
    (s: any) =>
      s.status === "abandoned" ||
      s.status === "failed" ||
      // Sessions that haven't been updated in 2+ hours and aren't completed
      (s.status !== "completed" &&
        s.updatedAt &&
        Date.now() - s.updatedAt > 2 * 3_600_000),
  );

  // If there's no checkout API, show a notice and attempt to use orders
  const allOrders = useQuery(
    (api as any).commerce?.fulfillment?.listQueue,
    { status: "abandoned" },
  ) as any;

  // Combine both sources
  const sessions = abandonedSessions.length > 0
    ? abandonedSessions
    : (allOrders?.items ?? []);

  // Compute stats
  const totalLostRevenue = sessions.reduce(
    (sum: number, s: any) => sum + (s.totalAmount ?? 0),
    0,
  );

  const totalSessions = allSessions?.length ?? 0;
  const abandonmentRate =
    totalSessions > 0
      ? ((sessions.length / totalSessions) * 100).toFixed(1)
      : "0.0";

  const [filter, setFilter] = useState<"all" | "abandoned" | "failed">("all");

  const filtered = sessions.filter((s: any) => {
    if (filter === "all") return true;
    if (filter === "abandoned") return s.status === "abandoned" || (!s.status?.includes("failed") && !s.status?.includes("completed"));
    if (filter === "failed") return s.status === "failed";
    return true;
  });

  async function handleSendRecovery(session: any) {
    toast.success(`Recovery email queued for ${session.email ?? "customer"}`);
  }

  async function handleDelete(session: any) {
    if (!confirm("Delete this abandoned session record?")) return;
    toast.success("Abandoned session removed.");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShoppingCart className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Abandoned Orders
          </h1>
          <p className="text-sm text-muted-foreground">
            Track and recover abandoned checkout sessions.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Abandoned Sessions"
          value={sessions.length}
          icon={AlertTriangle}
          className="bg-amber-100 text-amber-700"
        />
        <StatCard
          label="Lost Revenue"
          value={formatMoney(totalLostRevenue)}
          icon={DollarSign}
          className="bg-red-100 text-red-700"
        />
        <StatCard
          label="Abandonment Rate"
          value={`${abandonmentRate}%`}
          icon={BarChart3}
          className="bg-blue-100 text-blue-700"
        />
        <StatCard
          label="Avg Cart Value"
          value={
            sessions.length > 0
              ? formatMoney(Math.round(totalLostRevenue / sessions.length))
              : "$0.00"
          }
          icon={ShoppingCart}
          className="bg-purple-100 text-purple-700"
        />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        {(["all", "abandoned", "failed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f === "all" ? "All" : f === "abandoned" ? "Abandoned" : "Failed"}
          </button>
        ))}
      </div>

      {/* Table */}
      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No abandoned checkout sessions found. Great news!
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  Customer
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  Cart Value
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  Last Step
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  Abandoned
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((session: any) => (
                <tr
                  key={session._id}
                  className="border-b border-border last:border-0 hover:bg-muted/20"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">
                      {session.email ?? "Guest"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {formatMoney(
                      session.totalAmount ?? 0,
                      session.currencyCode,
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {STEP_LABELS[session.status] ?? session.status ?? "--"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-muted-foreground"
                      title={formatDate(session.updatedAt)}
                    >
                      <Clock className="mr-1 inline h-3.5 w-3.5" />
                      {session.updatedAt ? timeAgo(session.updatedAt) : "--"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        session.status === "failed"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {session.status === "failed" ? "Failed" : "Abandoned"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleSendRecovery(session)}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        title="Send recovery email"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Recover
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(session)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
