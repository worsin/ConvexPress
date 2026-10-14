import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Calendar, CreditCard, Pause, Play, RotateCcw, Tag, XCircle } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { cn, getErrorMessage } from "@/lib/utils";
import { PaymentMethodPanel } from "./PaymentMethodPanel";
import {
  INVOICE_STATUS_LABEL,
  discountText,
  formatCadence,
  formatDate,
  formatMoney,
  grantStatusText,
  type CustomerContract,
  type CustomerLifecycleAction,
} from "./portalTypes";

/**
 * One subscription on the account page.
 *
 * Renders the plan, status and next charge (what it takes, with any coupon,
 * and when); the coupons still discounting renewals; the card on file (with on-site
 * card replacement and a past-due notice); scheduled changes and
 * cancellations; coupon entry; and the lifecycle actions the server says this
 * contract allows (`contract.actions`), so the page never offers something the
 * backend will refuse. A past_due subscription can be cancelled now or
 * recovered with a new card; a scheduled cancellation can be withdrawn.
 *
 * Theme tokens only — primary / accent / destructive / muted.
 */

interface CustomerPortalCardProps {
  contract: CustomerContract;
  /** Optional slot for the `<ChangePlanFlow />` button/modal pair. */
  planChangeSlot?: React.ReactNode;
  className?: string;
}

const STATUS_LABELS: Record<CustomerContract["status"], string> = {
  draft: "Draft",
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  paused: "Paused",
  pending_cancel: "Cancels at period end",
  cancelled: "Cancelled",
  expired: "Ended",
};

function StatusBadge({ status }: { status: CustomerContract["status"] }) {
  const tone =
    status === "active" || status === "trialing"
      ? "bg-primary/10 text-primary"
      : status === "past_due" || status === "pending_cancel" || status === "cancelled"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", tone)}>{STATUS_LABELS[status]}</span>;
}

const CONFIRM_TEXT: Partial<Record<CustomerLifecycleAction, string>> = {
  schedule_cancel: "Cancel at the end of the current period? Your access continues until then.",
  cancel_now: "Cancel now? Your access ends immediately and the unpaid invoice is cancelled.",
};

export function CustomerPortalCard({ contract, planChangeSlot, className }: CustomerPortalCardProps) {
  const pauseMutation = useMutation(api.commerceSubscriptions.portal.requestPauseContract);
  const resumeMutation = useMutation(api.commerceSubscriptions.portal.requestResumeContract);
  const cancelMutation = useMutation(api.commerceSubscriptions.portal.requestCancelContract);
  const keepMutation = useMutation(api.commerceSubscriptions.portal.requestKeepContract);
  const applyCouponMutation = useMutation(api.commerceSubscriptions.portal.applyCouponToMyContract);

  const [confirmAction, setConfirmAction] = useState<CustomerLifecycleAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);

  const { actions } = contract;
  const contractId = contract._id;
  const currency = contract.offer?.currencyCode ?? contract.currencyCode;

  async function run(action: CustomerLifecycleAction) {
    setBusy(true);
    try {
      if (action === "pause") {
        await pauseMutation({ contractId });
        toast.success("Subscription paused");
      } else if (action === "resume") {
        await resumeMutation({ contractId });
        toast.success("Subscription resumed");
      } else if (action === "keep") {
        await keepMutation({ contractId });
        toast.success("Your subscription will continue");
      } else if (action === "schedule_cancel") {
        await cancelMutation({ contractId });
        toast.success("Your subscription will cancel at the end of the current period");
      } else {
        await cancelMutation({ contractId, immediate: true });
        toast.success("Subscription cancelled");
      }
      setConfirmAction(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "That did not work. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleApplyCoupon(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = couponCode.trim();
    if (code.length === 0) return;
    setCouponBusy(true);
    try {
      const applied = await applyCouponMutation({ contractId, couponCode: code });
      const off =
        applied.coupon.discountType === "percent"
          ? `${applied.coupon.amount}% off`
          : `${formatMoney(applied.coupon.amount, currency)} off`;
      toast.success(`${off} applies from your next charge`);
      setCouponCode("");
    } catch (error) {
      toast.error(getErrorMessage(error, "Coupon could not be applied"));
    } finally {
      setCouponBusy(false);
    }
  }

  const offerTitle = contract.offer?.title ?? contract.product?.title ?? "Subscription";
  const confirmText = confirmAction ? CONFIRM_TEXT[confirmAction] : undefined;
  const discounted = contract.nextChargeAmount !== contract.recurringAmount;

  const next: { label: string; value: string; detail?: string } =
    contract.status === "pending_cancel"
      ? { label: "Access until", value: formatDate(contract.currentPeriodEndAt), detail: "No further charges" }
      : contract.status === "past_due" && contract.billingIssue
        ? {
            label: "Payment due",
            value: formatMoney(contract.billingIssue.amountDue, contract.billingIssue.currencyCode),
            detail: contract.billingIssue.nextRetryAt ? `Next try ${formatDate(contract.billingIssue.nextRetryAt)}` : "Update your card",
          }
        : contract.status === "paused"
          ? { label: "Next charge", value: "Paused", detail: "Resume to continue billing" }
          : contract.nextChargeAt
            ? {
                label: contract.status === "trialing" ? "First charge" : "Next charge",
                value: formatMoney(contract.nextChargeAmount, currency),
                detail: `on ${formatDate(contract.nextChargeAt)}${discounted ? ", with your discount" : ""}`,
              }
            : { label: "Next charge", value: "--" };

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card shadow-sm", className)} data-slot="portal-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{offerTitle}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Started {formatDate(contract.createdAt)}</p>
        </div>
        <StatusBadge status={contract.status} />
      </div>

      {/* Summary row */}
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Plan</p>
            <p className="text-sm font-medium text-foreground">
              {formatMoney(contract.recurringAmount, currency)} {formatCadence(contract.billingInterval, contract.billingIntervalCount)}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{next.label}</p>
            <p className="text-sm font-medium text-foreground">{next.value}</p>
            {next.detail ? <p className="text-[11px] text-muted-foreground">{next.detail}</p> : null}
          </div>
        </div>
      </div>

      {/* Discounts */}
      {contract.discounts.length > 0 ? (
        <ul className="mx-5 mb-4 space-y-1 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          {contract.discounts.map((discount) => (
            <li key={discount.code} className="flex items-center gap-2 text-xs text-foreground">
              <Tag className="h-3.5 w-3.5 text-primary" />
              {discountText(discount, currency)}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Notices */}
      {contract.trialEndsAt && contract.status === "trialing" ? (
        <div className="mx-5 mb-4 rounded-xl bg-accent px-4 py-3 text-xs text-accent-foreground">
          Your free trial ends {formatDate(contract.trialEndsAt)}. Your first charge of {formatMoney(contract.nextChargeAmount, currency)} is
          that day; cancel before then and you won't be charged.
        </div>
      ) : null}
      {contract.status === "pending_cancel" ? (
        <div className="mx-5 mb-4 rounded-xl border border-border bg-muted px-4 py-3 text-xs text-muted-foreground">
          Your subscription ends on {formatDate(contract.currentPeriodEndAt)}. You keep full access until then, and you can keep the
          subscription instead.
        </div>
      ) : null}
      {contract.status === "paused" ? (
        <div className="mx-5 mb-4 rounded-xl border border-border bg-muted px-4 py-3 text-xs text-muted-foreground">
          Paused since {formatDate(contract.pausedAt)}. Resume to restore full access.
        </div>
      ) : null}
      {contract.scheduledOffer ? (
        <div className="mx-5 mb-4 rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-foreground">
          Changes to {contract.scheduledOffer.title} ({formatMoney(contract.scheduledOffer.recurringAmount, currency)}{" "}
          {formatCadence(contract.billingInterval, contract.billingIntervalCount)}) on {formatDate(contract.scheduledOffer.effectiveAt)}.
        </div>
      ) : null}

      {/* Card on file */}
      <PaymentMethodPanel
        className="mx-5 mb-4"
        contractId={contractId}
        paymentMethod={contract.paymentMethod}
        billingIssue={contract.billingIssue}
        canUpdate={actions.updatePaymentMethod}
      />

      {/* Membership grants */}
      {contract.membershipGrants.length > 0 ? (
        <div className="mx-5 mb-4 rounded-xl border border-border bg-muted/40 px-4 py-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Included memberships</p>
          <ul className="space-y-1">
            {contract.membershipGrants.map((grant) => (
              <li key={grant._id} className="flex items-center justify-between text-xs text-foreground">
                <span>{grant.plan?.name ?? "Membership"}</span>
                <span className="text-muted-foreground">{grantStatusText(grant)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Coupon input */}
      {actions.applyCoupon ? (
        <form onSubmit={handleApplyCoupon} className="mx-5 mb-4 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value)}
              placeholder="Coupon code"
              aria-label="Coupon code"
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              disabled={couponBusy}
            />
          </div>
          <button
            type="submit"
            disabled={couponBusy || couponCode.trim().length === 0}
            className="rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {couponBusy ? "Applying…" : "Apply"}
          </button>
        </form>
      ) : null}

      {/* Confirmation */}
      {confirmAction && confirmText ? (
        <div className="mx-5 mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-xs text-destructive">{confirmText}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void run(confirmAction)}
              disabled={busy}
              className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-60"
            >
              {busy ? "Processing…" : "Confirm"}
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
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <div className="flex flex-wrap gap-2">
          {actions.pause ? (
            <button
              type="button"
              onClick={() => void run("pause")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
          ) : null}
          {actions.resume ? (
            <button
              type="button"
              onClick={() => void run("resume")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </button>
          ) : null}
          {actions.keep ? (
            <button
              type="button"
              onClick={() => void run("keep")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Keep subscription
            </button>
          ) : null}
          {actions.scheduleCancel && !confirmAction ? (
            <button
              type="button"
              onClick={() => setConfirmAction("schedule_cancel")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </button>
          ) : null}
          {actions.cancelNow && !confirmAction ? (
            <button
              type="button"
              onClick={() => setConfirmAction("cancel_now")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel now
            </button>
          ) : null}
          {actions.changePlan ? planChangeSlot : null}
        </div>

        {contract.currentInvoice ? (
          <p className="text-[10px] text-muted-foreground">
            Last invoice{contract.currentInvoice.invoiceNumber ? ` ${contract.currentInvoice.invoiceNumber}` : ""} ·{" "}
            {formatMoney(contract.currentInvoice.totalAmount, contract.currentInvoice.currencyCode)} ·{" "}
            {INVOICE_STATUS_LABEL[contract.currentInvoice.status]}
          </p>
        ) : null}
      </div>
    </div>
  );
}
