/**
 * Core · dashboard.subscription — one subscription: billing details, the card
 * on file (replaceable on-site), status notices, the lifecycle actions the
 * server allows (with confirmations for cancelling), included access, invoices
 * and a plain-words timeline. Data: `commerceSubscriptions.portal.getMyContract`.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  RefreshCw,
  Pause,
  Play,
  RotateCcw,
  XCircle,
  FileText,
  Shield,
  Tag,
} from "lucide-react";

import { PaymentMethodPanel } from "@/components/subscriptions/PaymentMethodPanel";
import {
  discountText,
  nextChargeText,
  planPriceText,
  type CustomerContractDetail,
  type CustomerLifecycleAction,
} from "@/components/subscriptions/portalTypes";
import type { SurfaceProps } from "@/templates/sdk/types";

export type DashboardSubscriptionAction = CustomerLifecycleAction;

export interface DashboardSubscriptionSurfaceData {
  subscriptionId: string;
  /** The subscription (portal.getMyContract); undefined while loading, null when unknown or not yours. */
  subscription: CustomerContractDetail | null | undefined;
  /** True while an action runs. */
  busy: boolean;
  hrefs: {
    subscriptions: string;
  };
  actions: {
    /** Runs the action and toasts; resolves true on success. */
    run: (action: DashboardSubscriptionAction) => Promise<boolean>;
  };
}

/** Confirmation copy for the actions that end or schedule the end of access. */
export const CONFIRMATIONS: Partial<Record<DashboardSubscriptionAction, string>> = {
  schedule_cancel: "Your subscription will cancel at the end of the current period. Are you sure?",
  cancel_now: "Your access ends now and the unpaid invoice is cancelled. Are you sure?",
};

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
  // All badge tones derive from theme tokens.
  const styles: Record<string, string> = {
    active: "bg-primary/10 text-primary",
    trialing: "bg-accent text-accent-foreground",
    paused: "bg-muted text-muted-foreground",
    past_due: "bg-destructive/10 text-destructive",
    pending_cancel: "bg-destructive/10 text-destructive",
    cancelled: "bg-destructive/10 text-destructive",
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
    paid: "bg-primary/10 text-primary",
    pending: "bg-muted text-muted-foreground",
    failed: "bg-destructive/10 text-destructive",
    refunded: "bg-accent text-accent-foreground",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function CoreDashboardSubscription({ data }: SurfaceProps<DashboardSubscriptionSurfaceData>) {
  const { subscription, busy, hrefs, actions } = data;
  const [confirmAction, setConfirmAction] = useState<DashboardSubscriptionAction | null>(null);

  async function handleAction(action: DashboardSubscriptionAction) {
    const ok = await actions.run(action);
    if (ok) setConfirmAction(null);
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
          to={hrefs.subscriptions}
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
  const allowed = sub.actions;
  const title = sub.offer?.title ?? sub.product?.title ?? "Subscription";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to={hrefs.subscriptions}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to subscriptions
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-sm font-medium text-foreground">
            {title}
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
              <p className="text-xs text-muted-foreground">Plan</p>
              <p className="text-sm font-medium text-foreground">{planPriceText(sub)}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-muted p-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{sub.status === "trialing" ? "First charge" : "Next charge"}</p>
              <p className="text-sm font-medium text-foreground">{nextChargeText(sub)}</p>
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
              <div className="rounded-lg bg-accent p-2">
                <Calendar className="h-4 w-4 text-accent-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Trial Ends</p>
                <p className="text-sm font-medium text-foreground">
                  {formatDate(sub.trialEndsAt)}
                </p>
              </div>
            </div>
          )}
        </div>
        {sub.discounts.length > 0 ? (
          <ul className="space-y-1 border-t border-border px-5 py-3">
            {sub.discounts.map((discount) => (
              <li key={discount.code} className="flex items-center gap-2 text-xs text-foreground">
                <Tag className="h-3.5 w-3.5 text-primary" />
                {discountText(discount, sub.currencyCode)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Card on file and any payment problem */}
      <PaymentMethodPanel
        contractId={sub._id}
        paymentMethod={sub.paymentMethod}
        billingIssue={sub.billingIssue}
        canUpdate={allowed.updatePaymentMethod}
      />

      {/* Status notices */}
      {sub.status === "pending_cancel" && (
        <div className="rounded-xl border border-border bg-muted px-5 py-4 text-sm text-muted-foreground">
          This subscription ends at the close of the current billing period
          ({formatDate(sub.currentPeriodEndAt)}). You can keep it until then.
        </div>
      )}
      {sub.scheduledOffer && (
        <div className="rounded-xl border border-border bg-muted/40 px-5 py-4 text-sm text-foreground">
          Changes to {sub.scheduledOffer.title} ({formatMoney(sub.scheduledOffer.recurringAmount, sub.currencyCode)}) on{" "}
          {formatDate(sub.scheduledOffer.effectiveAt)}.
        </div>
      )}

      {/* Confirmation */}
      {confirmAction && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-4">
          <p className="text-sm text-destructive">
            {CONFIRMATIONS[confirmAction] ?? "Are you sure?"}
          </p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => void handleAction(confirmAction)}
              disabled={busy}
              className="rounded-lg bg-destructive px-4 py-2 text-xs font-medium text-destructive-foreground disabled:opacity-60"
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
      {(allowed.pause || allowed.resume || allowed.keep || allowed.scheduleCancel || allowed.cancelNow) && (
        <div className="flex flex-wrap gap-3">
          {allowed.pause && (
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
          {allowed.resume && (
            <button
              type="button"
              onClick={() => void handleAction("resume")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              Resume Subscription
            </button>
          )}
          {allowed.keep && (
            <button
              type="button"
              onClick={() => void handleAction("keep")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Keep Subscription
            </button>
          )}
          {allowed.scheduleCancel && !confirmAction && (
            <button
              type="button"
              onClick={() => setConfirmAction("schedule_cancel")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Cancel Subscription
            </button>
          )}
          {allowed.cancelNow && !confirmAction && (
            <button
              type="button"
              onClick={() => setConfirmAction("cancel_now")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Cancel Now
            </button>
          )}
        </div>
      )}

      {/* Entitlements */}
      {sub.entitlements.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Entitlements
            </h2>
          </div>
          <div className="divide-y divide-border">
            {sub.entitlements.map((ent) => (
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
      {sub.invoices.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Invoices
            </h2>
          </div>
          <div className="divide-y divide-border">
            {sub.invoices.map((invoice) => (
              <div
                key={invoice._id}
                className="flex items-center justify-between px-5 py-3"
              >
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {invoice.invoiceNumber ?? formatDate(invoice.createdAt)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {invoice.periodStartAt !== undefined && invoice.periodEndAt !== undefined
                      ? `${formatDate(invoice.periodStartAt)} – ${formatDate(invoice.periodEndAt)}`
                      : formatDate(invoice.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-foreground">
                    {formatMoney(invoice.totalAmount, invoice.currencyCode)}
                  </span>
                  <InvoiceStatusBadge status={invoice.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {sub.history.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              History
            </h2>
          </div>
          <div className="divide-y divide-border">
            {sub.history.slice(0, 10).map((event) => (
              <div key={event._id} className="flex items-center justify-between px-5 py-3">
                <p className="text-xs font-medium text-foreground">{event.message}</p>
                <span className="text-[10px] text-muted-foreground">{formatDateTime(event.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
