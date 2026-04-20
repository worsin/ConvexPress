import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  RefreshCw,
  Pause,
  Play,
  XCircle,
  FileText,
  Shield,
} from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";

export const Route = createFileRoute(
  "/dashboard/subscriptions/$subscriptionId",
)({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: DashboardSubscriptionDetailPage,
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

function formatDateTime(ts: number | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

function InvoiceStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800",
    pending: "bg-amber-100 text-amber-800",
    failed: "bg-red-100 text-red-800",
    refunded: "bg-purple-100 text-purple-800",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

function DashboardSubscriptionDetailPage() {
  const { subscriptionId } = Route.useParams();
  const settings = useSettings();
  const subscriptionsEnabled =
    settings?.plugins?.commerceSubscriptionsEnabled === true;

  const subscription = useQuery(
    (api as any).commerceSubscriptions.queries.getById,
    subscriptionsEnabled ? { subscriptionId: subscriptionId as any } : "skip",
  ) as any;

  const pauseMutation = useMutation(
    (api as any).commerceSubscriptions.mutations.pause,
  );
  const resumeMutation = useMutation(
    (api as any).commerceSubscriptions.mutations.resume,
  );
  const scheduleCancelMutation = useMutation(
    (api as any).commerceSubscriptions.mutations.scheduleCancel,
  );

  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAction(action: string) {
    setBusy(true);
    try {
      const id = subscriptionId as any;
      if (action === "pause") {
        await pauseMutation({ subscriptionId: id });
        toast.success("Subscription paused");
      } else if (action === "resume") {
        await resumeMutation({ subscriptionId: id });
        toast.success("Subscription resumed");
      } else if (action === "schedule_cancel") {
        await scheduleCancelMutation({ subscriptionId: id });
        toast.success("Cancellation scheduled for end of billing period");
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

  if (subscription === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (subscription === null) {
    return (
      <div className="space-y-4">
        <Link
          to="/dashboard/subscriptions"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to subscriptions
        </Link>
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Subscription not found or you do not have access.
          </p>
        </div>
      </div>
    );
  }

  const sub = subscription;
  const { status } = sub;
  const canPause = status === "active" || status === "trialing";
  const canResume = status === "paused" || status === "pending_cancel";
  const canScheduleCancel = status === "active" || status === "trialing";

  return (
    <PublicPluginGate pluginId="commerceSubscriptions">
      <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/dashboard/subscriptions"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to subscriptions
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-sm font-medium text-foreground">
            {sub.product?.title ?? "Subscription"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Created {formatDate(sub.createdAt)}
          </p>
        </div>
        <SubStatusBadge status={sub.status} />
      </div>

      {/* Billing details card */}
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Billing Details
          </h2>
        </div>
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-muted p-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Recurring Amount</p>
              <p className="text-sm font-medium text-foreground">
                {typeof sub.recurringAmount === "number"
                  ? formatMoney(sub.recurringAmount, sub.currencyCode ?? "USD")
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

          {sub.trialEndsAt && (
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <Calendar className="h-4 w-4 text-blue-700" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Trial Ends</p>
                <p className="text-sm font-medium text-blue-700">
                  {formatDate(sub.trialEndsAt)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status notices */}
      {sub.status === "pending_cancel" && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm text-orange-800">
          This subscription is set to cancel at the end of the current billing
          period ({formatDate(sub.currentPeriodEndAt)}). You can resume to
          keep it active.
        </div>
      )}

      {/* Confirmation */}
      {confirmAction && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm text-red-800">
            {confirmAction === "schedule_cancel"
              ? "Your subscription will cancel at the end of the current period. Are you sure?"
              : `Are you sure you want to ${confirmAction} this subscription?`}
          </p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => void handleAction(confirmAction)}
              disabled={busy}
              className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-60"
            >
              {busy ? "Processing..." : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {(canPause || canResume || canScheduleCancel) && (
        <div className="flex gap-3">
          {canPause && (
            <button
              type="button"
              onClick={() => void handleAction("pause")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Pause className="h-4 w-4" />
              Pause Subscription
            </button>
          )}
          {canResume && (
            <button
              type="button"
              onClick={() => void handleAction("resume")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              Resume Subscription
            </button>
          )}
          {canScheduleCancel && !confirmAction && (
            <button
              type="button"
              onClick={() => setConfirmAction("schedule_cancel")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Cancel Subscription
            </button>
          )}
        </div>
      )}

      {/* Entitlements */}
      {sub.entitlements && sub.entitlements.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Entitlements
            </h2>
          </div>
          <div className="divide-y divide-border">
            {sub.entitlements.map((ent: any) => (
              <div
                key={ent._id}
                className="flex items-center justify-between px-5 py-3"
              >
                <span className="font-mono text-xs text-foreground">
                  {ent.entitlementCode}
                </span>
                <SubStatusBadge status={ent.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoices */}
      {sub.invoices && sub.invoices.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Invoices
            </h2>
          </div>
          <div className="divide-y divide-border">
            {sub.invoices.map((invoice: any) => (
              <div
                key={invoice._id}
                className="flex items-center justify-between px-5 py-3"
              >
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {formatDate(invoice.createdAt)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {invoice.invoiceNumber ?? invoice._id}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-foreground">
                    {typeof invoice.totalAmount === "number"
                      ? formatMoney(
                          invoice.totalAmount,
                          invoice.currencyCode ?? sub.currencyCode ?? "USD",
                        )
                      : "--"}
                  </span>
                  <InvoiceStatusBadge status={invoice.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {sub.history && sub.history.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              History
            </h2>
          </div>
          <div className="divide-y divide-border">
            {sub.history.slice(0, 10).map((event: any) => (
              <div key={event._id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">
                    {event.eventType?.replace(/\./g, " ").replace(/_/g, " ")}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                  </span>
                </div>
                {event.message && event.message !== event.eventType && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {event.message}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </PublicPluginGate>
  );
}
