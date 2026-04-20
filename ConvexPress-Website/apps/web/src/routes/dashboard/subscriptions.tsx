import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  RefreshCw,
  Pause,
  Play,
  XCircle,
  Calendar,
  CreditCard,
  ChevronRight,
} from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";

export const Route = createFileRoute("/dashboard/subscriptions")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: DashboardSubscriptionsPage,
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
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Subscription Card ─────────────────────────────────────────────────────

function SubscriptionCard({
  subscription,
}: {
  subscription: {
    _id: string;
    status: string;
    currencyCode?: string;
    recurringAmount?: number;
    nextBillingAt?: number;
    currentPeriodStartAt?: number;
    currentPeriodEndAt?: number;
    createdAt: number;
    trialEndsAt?: number;
    product?: {
      _id: string;
      title?: string;
      slug?: string;
    } | null;
    entitlements?: Array<{
      _id: string;
      entitlementCode: string;
      status: string;
    }>;
  };
}) {
  const pauseMutation = useMutation(
    (api as any).commerceSubscriptions.mutations.pause,
  );
  const resumeMutation = useMutation(
    (api as any).commerceSubscriptions.mutations.resume,
  );
  const scheduleCancelMutation = useMutation(
    (api as any).commerceSubscriptions.mutations.scheduleCancel,
  );
  const cancelMutation = useMutation(
    (api as any).commerceSubscriptions.mutations.cancelNow,
  );

  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sub = subscription;
  const { status } = sub;
  const canPause = status === "active" || status === "trialing";
  const canResume = status === "paused" || status === "pending_cancel";
  const canScheduleCancel = status === "active" || status === "trialing";
  const canCancelNow =
    status !== "cancelled" && status !== "expired" && status !== "draft";

  async function handleAction(action: string) {
    setBusy(true);
    try {
      const id = sub._id as any;
      if (action === "pause") {
        await pauseMutation({ subscriptionId: id });
        toast.success("Subscription paused");
      } else if (action === "resume") {
        await resumeMutation({ subscriptionId: id });
        toast.success("Subscription resumed");
      } else if (action === "schedule_cancel") {
        await scheduleCancelMutation({ subscriptionId: id });
        toast.success("Your subscription will cancel at the end of the current period");
      } else if (action === "cancel") {
        await cancelMutation({ subscriptionId: id });
        toast.success("Subscription cancelled");
      }
      setConfirmAction(null);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Something went wrong",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {sub.product?.title ?? "Subscription"}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Created {formatDate(sub.createdAt)}
          </p>
        </div>
        <SubStatusBadge status={sub.status} />
      </div>

      {/* Details */}
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Amount</p>
            <p className="text-sm font-medium text-foreground">
              {typeof sub.recurringAmount === "number"
                ? `${formatMoney(sub.recurringAmount, sub.currencyCode ?? "USD")} / period`
                : "--"}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Next Billing</p>
            <p className="text-sm font-medium text-foreground">
              {formatDate(sub.nextBillingAt)}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Current Period</p>
            <p className="text-sm font-medium text-foreground">
              {formatDate(sub.currentPeriodStartAt)} --{" "}
              {formatDate(sub.currentPeriodEndAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Trial notice */}
      {sub.trialEndsAt && sub.status === "trialing" && (
        <div className="mx-5 mb-4 rounded-xl bg-blue-50 px-4 py-3 text-xs text-blue-800">
          Trial ends {formatDate(sub.trialEndsAt)}. Your subscription will
          begin billing after the trial period.
        </div>
      )}

      {/* Pending cancel notice */}
      {sub.status === "pending_cancel" && (
        <div className="mx-5 mb-4 rounded-xl bg-orange-50 px-4 py-3 text-xs text-orange-800">
          This subscription is set to cancel at the end of the current
          billing period ({formatDate(sub.currentPeriodEndAt)}).
        </div>
      )}

      {/* Confirmation bar */}
      {confirmAction && (
        <div className="mx-5 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-800">
            {confirmAction === "schedule_cancel"
              ? "Your subscription will cancel at the end of the current period. Are you sure?"
              : confirmAction === "cancel"
                ? "Cancel your subscription immediately? You will lose access right away."
                : `Are you sure you want to ${confirmAction} this subscription?`}
          </p>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={() => void handleAction(confirmAction)}
              disabled={busy}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              {busy ? "Processing..." : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground"
            >
              Never mind
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <div className="flex gap-2">
          {canPause && (
            <button
              type="button"
              onClick={() => void handleAction("pause")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
          )}
          {canResume && (
            <button
              type="button"
              onClick={() => void handleAction("resume")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </button>
          )}
          {canScheduleCancel && !confirmAction && (
            <button
              type="button"
              onClick={() => setConfirmAction("schedule_cancel")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </button>
          )}
          {canCancelNow && !canScheduleCancel && !confirmAction && (
            <button
              type="button"
              onClick={() => setConfirmAction("cancel")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel Now
            </button>
          )}
        </div>

        <Link
          to="/dashboard/subscriptions/$subscriptionId"
          params={{ subscriptionId: sub._id }}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Details
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

function DashboardSubscriptionsPage() {
  const settings = useSettings();
  const subscriptionsEnabled =
    settings?.plugins?.commerceSubscriptionsEnabled === true;
  const subscriptions = useQuery(
    (api as any).commerceSubscriptions.queries.listMySubscriptions,
    subscriptionsEnabled ? {} : "skip",
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
        trialEndsAt?: number;
        product?: {
          _id: string;
          title?: string;
          slug?: string;
        } | null;
        entitlements?: Array<{
          _id: string;
          entitlementCode: string;
          status: string;
        }>;
      }>
    | undefined;

  const activeCount =
    subscriptions?.filter(
      (s) => s.status === "active" || s.status === "trialing",
    ).length ?? 0;

  return (
    <PublicPluginGate pluginId="commerceSubscriptions">
      <div className="space-y-6">
      <div>
        <h1 className="text-sm font-medium text-foreground">Subscriptions</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Manage your active subscriptions, billing, and renewal settings.
        </p>
      </div>

      {subscriptions === undefined ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-2xl bg-muted"
            />
          ))}
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <RefreshCw className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            You don't have any subscriptions yet.
          </p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            {activeCount} active subscription{activeCount === 1 ? "" : "s"} out
            of {subscriptions.length} total
          </div>

          {/* Subscription cards */}
          <div className="space-y-4">
            {subscriptions.map((sub) => (
              <SubscriptionCard key={sub._id} subscription={sub} />
            ))}
          </div>
        </>
      )}
      </div>
    </PublicPluginGate>
  );
}
