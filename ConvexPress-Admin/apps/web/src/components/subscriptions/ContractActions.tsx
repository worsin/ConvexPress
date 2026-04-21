/**
 * ContractActions — the right-rail actions metabox on the contract detail page.
 *
 * Buttons available depend on contract status:
 *   - Pause       (active / trialing)
 *   - Resume      (paused)
 *   - Cancel immediate (destructive)
 *   - Cancel at period end
 *   - Upgrade / Downgrade — inline picker + ProrationPreview
 *   - Apply Coupon — inline input
 *   - Retry Payment (past_due only) — Wave 7 stub
 *   - Change Payment Method — Wave 7 stub
 *
 * Wired mutations: pause / resume / scheduleCancel / cancelNow / redeemCouponForContract.
 * Stubs (Wave 7 target): scheduleUpgrade / scheduleDowngrade / retryInvoicePayment / changePaymentMethod.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  CreditCard,
  Pause,
  Play,
  RefreshCw,
  Tag,
  XCircle,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Doc, Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { ProrationPreview } from "./ProrationPreview";

type Contract = Doc<"commerce_subscriptions">;

interface ContractActionsProps {
  contract: Contract;
}

export function ContractActions({ contract }: ContractActionsProps) {
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
  const redeemCouponMutation = useMutation(
    (api as any).commerceSubscriptions.coupons.redeemCouponForContract,
  );

  const offers = useQuery(
    (api as any).commerceSubscriptions.offers.listOffers,
    { status: "active" },
  ) as
    | Array<{
        _id: Id<"commerce_subscription_offers">;
        title: string;
        slug: string;
        currencyCode?: string;
        recurringAmount?: number;
        status?: string;
      }>
    | null
    | undefined;

  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState<
    "immediate" | "scheduled" | null
  >(null);
  const [offerPickerOpen, setOfferPickerOpen] = useState(false);
  const [pendingOfferId, setPendingOfferId] =
    useState<Id<"commerce_subscription_offers"> | null>(null);
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponCode, setCouponCode] = useState("");

  const { status } = contract;

  const canPause = status === "active" || status === "trialing";
  const canResume = status === "paused";
  const canCancel =
    status !== "cancelled" && status !== "expired" && status !== "draft";
  const canScheduleCancel = canCancel && status !== "past_due";
  const canUpgrade =
    status === "active" || status === "trialing";
  const canRetryPayment = status === "past_due";

  const currentOfferId = useMemo(() => {
    // We don't have a denormalized currentOfferId on the contract (see
    // knowledge doc §11 "Offer-to-Contract Lookup Is Indirect"). The
    // parent detail page will filter out the current offer from the
    // picker via the offerpicker's value itself — here we just expose the
    // full active list and let the admin pick.
    return null;
  }, []);

  async function handleBasicAction(
    action: "pause" | "resume" | "cancel" | "schedule_cancel",
  ) {
    setBusy(action);
    try {
      const id = contract._id;
      if (action === "pause") {
        await pauseMutation({ subscriptionId: id });
        toast.success("Contract paused");
      } else if (action === "resume") {
        await resumeMutation({ subscriptionId: id });
        toast.success("Contract resumed");
      } else if (action === "cancel") {
        await cancelMutation({ subscriptionId: id });
        toast.success("Contract cancelled");
      } else if (action === "schedule_cancel") {
        await scheduleCancelMutation({ subscriptionId: id });
        toast.success("Cancellation scheduled for end of period");
      }
      setConfirmingCancel(null);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          `Failed to ${action.replace("_", " ")}`,
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleApplyCoupon() {
    if (!couponCode.trim()) {
      toast.error("Enter a coupon code.");
      return;
    }
    setBusy("coupon");
    try {
      await redeemCouponMutation({
        contractId: contract._id,
        couponCode: couponCode.trim(),
      });
      toast.success("Coupon applied — takes effect on next invoice.");
      setCouponCode("");
      setCouponOpen(false);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to apply coupon",
      );
    } finally {
      setBusy(null);
    }
  }

  // Determine upgrade vs downgrade based on candidate offer's price
  const pendingOffer = pendingOfferId
    ? offers?.find((o) => o._id === pendingOfferId)
    : null;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">Actions</h3>

      {/* Pause / Resume */}
      {canPause && (
        <button
          type="button"
          onClick={() => void handleBasicAction("pause")}
          disabled={busy !== null}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <Pause className="h-4 w-4" />
          Pause contract
        </button>
      )}
      {canResume && (
        <button
          type="button"
          onClick={() => void handleBasicAction("resume")}
          disabled={busy !== null}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          Resume contract
        </button>
      )}

      {/* Upgrade / Downgrade */}
      {canUpgrade && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setOfferPickerOpen((v) => !v)}
            disabled={busy !== null}
            className="flex w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <ArrowUp className="h-4 w-4" />
            Change offer (upgrade / downgrade)
          </button>
          {offerPickerOpen && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
              <label className="block text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Target offer
              </label>
              {offers === undefined ? (
                <div className="h-9 animate-pulse rounded-lg bg-muted" />
              ) : offers === null || offers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No active offers available.
                </p>
              ) : (
                <select
                  value={pendingOfferId ?? ""}
                  onChange={(e) =>
                    setPendingOfferId(
                      (e.target.value as Id<"commerce_subscription_offers">) ||
                        null,
                    )
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <option value="">Choose an offer…</option>
                  {offers.map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.title}
                    </option>
                  ))}
                </select>
              )}
              {pendingOfferId && (
                <ProrationPreview
                  contractId={contract._id}
                  toOfferId={pendingOfferId}
                />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled
                  title="Wiring pending — Wave 7"
                  className="flex-1 rounded-lg bg-primary/60 px-3 py-2 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed"
                >
                  <ArrowUp className="mr-1 inline h-3 w-3" /> Confirm change
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOfferPickerOpen(false);
                    setPendingOfferId(null);
                  }}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Wiring pending — Wave 7.{" "}
                {pendingOffer?.title
                  ? `Target: ${pendingOffer.title}.`
                  : ""}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Apply coupon */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setCouponOpen((v) => !v)}
          disabled={busy !== null}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <Tag className="h-4 w-4" />
          Apply coupon
        </button>
        {couponOpen && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
            <input
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="COUPON CODE"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm uppercase tracking-wide text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleApplyCoupon()}
                disabled={busy !== null || !couponCode.trim()}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => setCouponOpen(false)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Retry payment (past_due) */}
      {canRetryPayment && (
        <button
          type="button"
          disabled
          title="Wiring pending — Wave 7"
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground opacity-60"
        >
          <RefreshCw className="h-4 w-4" />
          Retry payment (Wave 7)
        </button>
      )}

      {/* Change payment method — stub */}
      <button
        type="button"
        disabled
        title="Coming soon"
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground opacity-60"
      >
        <CreditCard className="h-4 w-4" />
        Change payment method
      </button>

      {/* Cancel at period end */}
      {canScheduleCancel && (
        <button
          type="button"
          onClick={() => setConfirmingCancel("scheduled")}
          disabled={busy !== null}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <XCircle className="h-4 w-4" />
          Cancel at period end
        </button>
      )}

      {/* Cancel immediately (destructive) */}
      {canCancel && (
        <button
          type="button"
          onClick={() => setConfirmingCancel("immediate")}
          disabled={busy !== null}
          className="flex w-full items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          <XCircle className="h-4 w-4" />
          Cancel immediately
        </button>
      )}

      {/* Cancel confirmation */}
      {confirmingCancel && (
        <div
          className={cn(
            "rounded-xl border p-3 text-sm",
            confirmingCancel === "immediate"
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-border bg-muted/40 text-foreground",
          )}
        >
          <p className="font-medium">
            {confirmingCancel === "immediate"
              ? "Cancel immediately?"
              : "Schedule cancel for end of period?"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {confirmingCancel === "immediate"
              ? "This ends access right away."
              : "The customer keeps access until the current period ends."}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() =>
                void handleBasicAction(
                  confirmingCancel === "immediate"
                    ? "cancel"
                    : "schedule_cancel",
                )
              }
              disabled={busy !== null}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50",
                confirmingCancel === "immediate"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              Yes, confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmingCancel(null)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              No
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
