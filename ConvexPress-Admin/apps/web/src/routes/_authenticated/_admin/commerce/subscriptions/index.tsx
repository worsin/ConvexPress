import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import {
  RefreshCw,
  Pause,
  Play,
  XCircle,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Users,
  AlertCircle,
  DollarSign,
} from "lucide-react";
import { api } from "@backend/convex/_generated/api";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/",
)({
  component: CommerceSubscriptionsPage,
});

// ─── Formatters ────────────────────────────────────────────────────────────

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
  });
}

// ─── Status Badge ──────────────────────────────────────────────────────────

function SubStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    trialing: "bg-blue-100 text-blue-800",
    paused: "bg-amber-100 text-amber-800",
    past_due: "bg-orange-100 text-orange-800",
    pending_cancel: "bg-red-100 text-red-700",
    cancelled: "bg-red-100 text-red-800",
    expired: "bg-muted text-muted-foreground",
    draft: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {sub && (
            <p className="text-xs text-muted-foreground">{sub}</p>
          )}
        </div>
        <div
          className={`rounded-xl p-2.5 ${accent ?? "bg-muted text-muted-foreground"}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// ─── Action Buttons ────────────────────────────────────────────────────────

function SubscriptionActions({
  subscription,
}: {
  subscription: {
    _id: string;
    status: string;
  };
}) {
  const pauseMutation = useMutation(
    (api as any).commerceSubscriptions.mutations.pause,
  );
  const resumeMutation = useMutation(
    (api as any).commerceSubscriptions.mutations.resume,
  );
  const cancelMutation = useMutation(
    (api as any).commerceSubscriptions.mutations.cancelNow,
  );
  const scheduleCancelMutation = useMutation(
    (api as any).commerceSubscriptions.mutations.scheduleCancel,
  );

  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAction(
    action: "pause" | "resume" | "cancel" | "schedule_cancel",
  ) {
    setBusy(true);
    try {
      const id = subscription._id as any;
      if (action === "pause") {
        await pauseMutation({ subscriptionId: id });
        toast.success("Subscription paused");
      } else if (action === "resume") {
        await resumeMutation({ subscriptionId: id });
        toast.success("Subscription resumed");
      } else if (action === "cancel") {
        await cancelMutation({ subscriptionId: id });
        toast.success("Subscription cancelled");
      } else if (action === "schedule_cancel") {
        await scheduleCancelMutation({ subscriptionId: id });
        toast.success("Cancellation scheduled for end of period");
      }
      setConfirming(null);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          `Failed to ${action.replace("_", " ")} subscription`,
      );
    } finally {
      setBusy(false);
    }
  }

  const { status } = subscription;

  // Determine available actions based on status
  const canPause =
    status === "active" || status === "trialing" || status === "past_due";
  const canResume = status === "paused" || status === "pending_cancel";
  const canCancel =
    status !== "cancelled" && status !== "expired" && status !== "draft";
  const canScheduleCancel =
    status === "active" || status === "trialing";

  if (!canPause && !canResume && !canCancel) return null;

  return (
    <div className="flex items-center gap-1">
      {canPause && (
        <button
          type="button"
          onClick={() => void handleAction("pause")}
          disabled={busy}
          title="Pause"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-amber-100 hover:text-amber-700 disabled:opacity-50"
        >
          <Pause className="h-3.5 w-3.5" />
        </button>
      )}
      {canResume && (
        <button
          type="button"
          onClick={() => void handleAction("resume")}
          disabled={busy}
          title="Resume"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-emerald-100 hover:text-emerald-700 disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
        </button>
      )}
      {canScheduleCancel && confirming !== "schedule" && (
        <button
          type="button"
          onClick={() => setConfirming("schedule")}
          disabled={busy}
          title="Schedule cancellation"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-orange-100 hover:text-orange-700 disabled:opacity-50"
        >
          <XCircle className="h-3.5 w-3.5" />
        </button>
      )}
      {canCancel && !canScheduleCancel && confirming !== "cancel" && (
        <button
          type="button"
          onClick={() => setConfirming("cancel")}
          disabled={busy}
          title="Cancel now"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
        >
          <XCircle className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Confirmation */}
      {confirming === "schedule" && (
        <div className="ml-2 flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1 text-xs">
          <span className="text-orange-800">Cancel at period end?</span>
          <button
            type="button"
            onClick={() => void handleAction("schedule_cancel")}
            disabled={busy}
            className="font-medium text-orange-700 underline"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="text-orange-600"
          >
            No
          </button>
        </div>
      )}
      {confirming === "cancel" && (
        <div className="ml-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs">
          <span className="text-red-800">Cancel immediately?</span>
          <button
            type="button"
            onClick={() => void handleAction("cancel")}
            disabled={busy}
            className="font-medium text-red-700 underline"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="text-red-600"
          >
            No
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

function CommerceSubscriptionsPage() {
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
    | undefined;

  const [statusFilter, setStatusFilter] = useState<string>("");
  const subscriptions = useQuery(
    (api as any).commerceSubscriptions.queries.list,
    statusFilter ? { status: statusFilter } : {},
  ) as
    | Array<{
        _id: string;
        status: string;
        currencyCode?: string;
        recurringAmount?: number;
        nextBillingAt?: number;
        currentPeriodStartAt?: number;
        currentPeriodEndAt?: number;
        createdAt: number;
        cancelledAt?: number;
        customer?: {
          _id: string;
          email?: string;
          firstName?: string;
          lastName?: string;
        } | null;
        product?: {
          _id: string;
          title?: string;
          slug?: string;
        } | null;
      }>
    | undefined;

  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Manage subscription lifecycle, view billing schedules, and take
          actions on active, paused, and past-due subscriptions.
        </p>
      </div>

      {/* Metrics grid */}
      {metrics === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-muted"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active"
            value={metrics.active}
            icon={Users}
            accent="bg-emerald-100 text-emerald-700"
            sub={`${metrics.total} total`}
          />
          <StatCard
            label="MRR"
            value={formatMoney(metrics.mrr)}
            icon={DollarSign}
            accent="bg-blue-100 text-blue-700"
            sub={`ARR: ${formatMoney(metrics.arr)}`}
          />
          <StatCard
            label="Past Due"
            value={metrics.pastDue}
            icon={AlertCircle}
            accent="bg-orange-100 text-orange-700"
            sub={`${metrics.paused} paused`}
          />
          <StatCard
            label="Churn (30d)"
            value={`${metrics.churnRate30d.toFixed(1)}%`}
            icon={TrendingUp}
            accent="bg-red-100 text-red-700"
            sub={`${metrics.cancelledLast30} cancelled / ${metrics.startedLast30} started`}
          />
        </div>
      )}

      {/* Filter toolbar */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          Filter:
        </span>
        {["", "active", "trialing", "paused", "past_due", "pending_cancel", "cancelled", "expired"].map(
          (s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-foreground hover:bg-muted"
              }`}
            >
              {s ? s.replace("_", " ") : "All"}
            </button>
          ),
        )}
      </div>

      {/* Subscriptions table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-[1fr_1fr_100px_140px_140px_120px_120px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <div>Customer</div>
          <div>Product</div>
          <div>Status</div>
          <div>Amount</div>
          <div>Next Billing</div>
          <div>Created</div>
          <div>Actions</div>
        </div>

        {subscriptions === undefined ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="p-10 text-center">
            <RefreshCw className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              {statusFilter
                ? `No subscriptions with status "${statusFilter.replace("_", " ")}".`
                : "No subscriptions exist yet."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {subscriptions.map((sub) => (
              <div key={sub._id}>
                <div className="grid grid-cols-[1fr_1fr_100px_140px_140px_120px_120px] gap-4 px-5 py-4">
                  {/* Customer */}
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(
                          expandedId === sub._id ? null : sub._id,
                        )
                      }
                      className="flex items-center gap-2 text-left"
                    >
                      {expandedId === sub._id ? (
                        <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {sub.customer
                            ? [sub.customer.firstName, sub.customer.lastName]
                                .filter(Boolean)
                                .join(" ") || sub.customer.email
                            : "Unknown"}
                        </p>
                        {sub.customer?.email && (
                          <p className="truncate text-xs text-muted-foreground">
                            {sub.customer.email}
                          </p>
                        )}
                      </div>
                    </button>
                  </div>

                  {/* Product */}
                  <div className="flex items-center">
                    <p className="truncate text-sm text-foreground">
                      {sub.product?.title ?? "Unknown product"}
                    </p>
                  </div>

                  {/* Status */}
                  <div className="flex items-center">
                    <SubStatusBadge status={sub.status} />
                  </div>

                  {/* Amount */}
                  <div className="flex items-center text-sm text-foreground">
                    {typeof sub.recurringAmount === "number"
                      ? formatMoney(
                          sub.recurringAmount,
                          sub.currencyCode ?? "USD",
                        )
                      : "--"}
                  </div>

                  {/* Next billing */}
                  <div className="flex items-center text-sm text-muted-foreground">
                    {formatDate(sub.nextBillingAt)}
                  </div>

                  {/* Created */}
                  <div className="flex items-center text-sm text-muted-foreground">
                    {formatDate(sub.createdAt)}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center">
                    <SubscriptionActions subscription={sub} />
                  </div>
                </div>

                {/* Expanded detail */}
                {expandedId === sub._id && (
                  <div className="border-t border-border/50 bg-muted/20 px-5 py-4">
                    <div className="grid gap-4 text-sm sm:grid-cols-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Current Period
                        </p>
                        <p className="mt-1 text-foreground">
                          {formatDate(sub.currentPeriodStartAt)} --{" "}
                          {formatDate(sub.currentPeriodEndAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Next Billing
                        </p>
                        <p className="mt-1 text-foreground">
                          {formatDate(sub.nextBillingAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Recurring Amount
                        </p>
                        <p className="mt-1 text-foreground">
                          {typeof sub.recurringAmount === "number"
                            ? formatMoney(
                                sub.recurringAmount,
                                sub.currencyCode ?? "USD",
                              )
                            : "--"}{" "}
                          / period
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Subscription ID
                        </p>
                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                          {sub._id}
                        </p>
                      </div>
                      {sub.cancelledAt && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            Cancelled At
                          </p>
                          <p className="mt-1 text-red-600">
                            {formatDate(sub.cancelledAt)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
