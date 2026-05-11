import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  Pause,
  Play,
  XCircle,
  Calendar,
  CreditCard,
  Shield,
  Tag,
} from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { cn } from "@/lib/utils";

/**
 * One-stop card for a single subscription in the customer portal.
 *
 * Renders:
 *   • Plan + status + next charge
 *   • Current recurring amount, trial notice, pending-cancel notice
 *   • Pause / Resume / Cancel actions (delegated to portal.* mutations)
 *   • Inline coupon-code entry with validation feedback
 *   • Child slot for plan-change button
 *   • Linked membership grants (from the Wave 3 bridge)
 *
 * All state management is local — parent passes the enriched contract object
 * from `portal.getMyActiveContracts`. Plan-change / invoice-history are
 * rendered by sibling components in this directory.
 *
 * Theme-tokens only — primary / accent / destructive / muted. Never reach
 * for hex palette classes.
 */

type Contract = {
  _id: string;
  status: string;
  currencyCode?: string;
  recurringAmount?: number;
  nextBillingAt?: number;
  nextChargeAt?: number;
  currentPeriodStartAt?: number;
  currentPeriodEndAt?: number;
  createdAt: number;
  trialEndsAt?: number;
  offer?: {
    _id: string;
    title: string;
    slug?: string;
    recurringAmount?: number;
    currencyCode?: string;
    features?: Array<{ text: string; highlighted?: boolean; icon?: string }>;
  } | null;
  product?: {
    _id: string;
    title?: string;
    slug?: string;
  } | null;
  currentInvoice?: {
    _id: string;
    status: string;
    totalAmount: number;
    currencyCode: string;
    dueAt?: number;
    paidAt?: number;
    createdAt: number;
  } | null;
  membershipGrants?: Array<{
    _id: string;
    planId: string;
    plan?: { _id: string; name?: string; slug?: string } | null;
    status: string;
    startsAt: number;
    endsAt?: number;
    graceEndsAt?: number;
  }>;
  entitlements?: Array<{
    _id: string;
    entitlementCode: string;
    status: string;
  }>;
};

interface CustomerPortalCardProps {
  contract: Contract;
  /**
   * Optional slot for the `<ChangePlanFlow />` button/modal pair. Parent
   * composes; the card just reserves the space.
   */
  planChangeSlot?: React.ReactNode;
  className?: string;
}

function formatMoney(amount: number | undefined, currencyCode = "USD") {
  if (typeof amount !== "number") return "--";
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

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  // Theme-token palette — see the module header for the rule.
  const tone =
    status === "active" || status === "trialing"
      ? "bg-primary/10 text-primary"
      : status === "paused"
        ? "bg-muted text-muted-foreground"
        : status === "past_due" ||
            status === "pending_cancel" ||
            status === "cancelled"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone,
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export function CustomerPortalCard({
  contract,
  planChangeSlot,
  className,
}: CustomerPortalCardProps) {
  const pauseMutation = useMutation(
    (api as any).commerceSubscriptions.portal.requestPauseContract,
  );
  const resumeMutation = useMutation(
    (api as any).commerceSubscriptions.portal.requestResumeContract,
  );
  const cancelMutation = useMutation(
    (api as any).commerceSubscriptions.portal.requestCancelContract,
  );
  const applyCouponMutation = useMutation(
    (api as any).commerceSubscriptions.portal.applyCouponToMyContract,
  );

  const [confirmAction, setConfirmAction] = useState<null | "cancel">(null);
  const [busy, setBusy] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);

  const { status } = contract;
  const canPause = status === "active" || status === "trialing";
  const canResume = status === "paused";
  const canCancel =
    status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "paused";
  const canChangePlan =
    status === "active" || status === "trialing" || status === "past_due";

  async function handlePause() {
    setBusy(true);
    try {
      await pauseMutation({ contractId: contract._id as any });
      toast.success("Subscription paused");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Could not pause subscription",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResume() {
    setBusy(true);
    try {
      await resumeMutation({ contractId: contract._id as any });
      toast.success("Subscription resumed");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Could not resume subscription",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setBusy(true);
    try {
      await cancelMutation({ contractId: contract._id as any });
      toast.success(
        "Your subscription will cancel at the end of the current period",
      );
      setConfirmAction(null);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Could not cancel subscription",
      );
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
      await applyCouponMutation({
        contractId: contract._id as any,
        couponCode: code,
      });
      toast.success("Coupon applied");
      setCouponCode("");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Coupon could not be applied",
      );
    } finally {
      setCouponBusy(false);
    }
  }

  const nextCharge = contract.nextChargeAt ?? contract.nextBillingAt;
  const currency =
    contract.offer?.currencyCode ?? contract.currencyCode ?? "USD";
  const offerTitle =
    contract.offer?.title ??
    contract.product?.title ??
    "Subscription";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-sm",
        className,
      )}
      data-slot="portal-card"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {offerTitle}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Started {formatDate(contract.createdAt)}
          </p>
        </div>
        <StatusBadge status={contract.status} />
      </div>

      {/* Summary row */}
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Amount</p>
            <p className="text-sm font-medium text-foreground">
              {formatMoney(contract.recurringAmount, currency)} / period
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Next Charge</p>
            <p className="text-sm font-medium text-foreground">
              {formatDate(nextCharge)}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Entitlements</p>
            <p className="text-sm font-medium text-foreground">
              {contract.entitlements?.length ?? 0} active
            </p>
          </div>
        </div>
      </div>

      {/* Trial notice */}
      {contract.trialEndsAt && contract.status === "trialing" && (
        <div className="mx-5 mb-4 rounded-xl bg-accent px-4 py-3 text-xs text-accent-foreground">
          Trial ends {formatDate(contract.trialEndsAt)}. You will be charged
          when the trial completes.
        </div>
      )}

      {/* Pending cancel notice */}
      {contract.status === "pending_cancel" && (
        <div className="mx-5 mb-4 rounded-xl border border-border bg-muted px-4 py-3 text-xs text-muted-foreground">
          Cancels at {formatDate(contract.currentPeriodEndAt)}. Contact
          support to resume.
        </div>
      )}

      {/* Membership grants */}
      {contract.membershipGrants && contract.membershipGrants.length > 0 && (
        <div className="mx-5 mb-4 rounded-xl border border-border bg-muted/40 px-4 py-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Linked Memberships
          </p>
          <ul className="space-y-1">
            {contract.membershipGrants.map((grant) => (
              <li
                key={grant._id}
                className="flex items-center justify-between text-xs text-foreground"
              >
                <span>{grant.plan?.name ?? "Membership"}</span>
                <StatusBadge status={grant.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Coupon input */}
      {(contract.status === "active" ||
        contract.status === "trialing" ||
        contract.status === "past_due" ||
        contract.status === "paused") && (
        <form
          onSubmit={handleApplyCoupon}
          className="mx-5 mb-4 flex items-center gap-2"
        >
          <div className="flex-1 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value)}
              placeholder="Coupon code"
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
      )}

      {/* Confirm cancel bar */}
      {confirmAction === "cancel" && (
        <div className="mx-5 mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-xs text-destructive">
            Cancel at the end of the current period? Your access continues
            until then.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-60"
            >
              {busy ? "Processing…" : "Confirm cancel"}
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

      {/* Action row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <div className="flex flex-wrap gap-2">
          {canPause && (
            <button
              type="button"
              onClick={handlePause}
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
              onClick={handleResume}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </button>
          )}
          {canCancel && !confirmAction && (
            <button
              type="button"
              onClick={() => setConfirmAction("cancel")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </button>
          )}
          {canChangePlan && planChangeSlot}
        </div>

        {contract.currentInvoice && (
          <p className="text-[10px] text-muted-foreground">
            Last invoice:{" "}
            {formatMoney(
              contract.currentInvoice.totalAmount,
              contract.currentInvoice.currencyCode,
            )}{" "}
            {contract.currentInvoice.status}
          </p>
        )}
      </div>
    </div>
  );
}
