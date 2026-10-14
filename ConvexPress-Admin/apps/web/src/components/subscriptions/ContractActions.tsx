/**
 * ContractActions — the contract page's actions rail.
 *
 * Offers exactly what the contract's state allows (`billing.actions`, computed
 * by `adminContracts.getContractBilling`): retry a past-due payment now, pause,
 * resume or withdraw a scheduled cancellation, cancel at period end or now,
 * change the plan (upgrades charge the rest of the period, downgrades wait for
 * renewal) and apply a coupon. Destructive actions ask for a reason, which is
 * kept in the contract's history.
 */
import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import { ArrowUpDown, Pause, Play, RefreshCw, Tag, XCircle } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Doc, Id } from "@backend/convex/_generated/dataModel";
import { cn, getErrorMessage } from "@/lib/utils";

import { formatMoney, type ContractBilling } from "./billingFormat";

interface ContractActionsProps {
  contract: Doc<"commerce_subscriptions">;
  billing: ContractBilling;
}

type Pending = "cancel_now" | "cancel_at_end" | null;

const buttonBase =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function ContractActions({ contract, billing }: ContractActionsProps) {
  const pause = useMutation(api.commerceSubscriptions.mutations.pause);
  const resume = useMutation(api.commerceSubscriptions.mutations.resume);
  const scheduleCancel = useMutation(api.commerceSubscriptions.mutations.scheduleCancel);
  const cancelNow = useMutation(api.commerceSubscriptions.mutations.cancelNow);
  const retryPayment = useMutation(api.commerceSubscriptions.adminContracts.retryPayment);
  const changePlan = useMutation(api.commerceSubscriptions.adminContracts.changePlan);
  const redeemCoupon = useMutation(api.commerceSubscriptions.coupons.redeemCouponForContract);
  const offers = useQuery(api.commerceSubscriptions.offers.listOffers, { status: "active" });

  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  const [toOfferId, setToOfferId] = useState<Id<"commerce_subscription_offers"> | "">("");
  const [couponCode, setCouponCode] = useState("");

  const { actions } = billing;
  const subscriptionId = contract._id;
  const otherOffers = (offers ?? []).filter((offer) => offer._id !== billing.planOfferId);

  async function run(success: string, work: () => Promise<unknown>) {
    setBusy(true);
    try {
      await work();
      toast.success(success);
      setPending(null);
      setReason("");
    } catch (error) {
      toast.error(getErrorMessage(error, "That did not work."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-slot="contract-actions">
      {actions.retryPayment ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("Payment retry started", () => retryPayment({ subscriptionId }))}
          className={cn(buttonBase, "border-primary/30 bg-primary text-primary-foreground hover:bg-primary/90")}
        >
          <RefreshCw className="h-4 w-4" /> Retry payment now
        </button>
      ) : null}

      {actions.resume ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(contract.status === "pending_cancel" ? "Cancellation withdrawn" : "Subscription resumed", () =>
              resume({ subscriptionId }),
            )
          }
          className={cn(buttonBase, "border-border hover:bg-muted")}
        >
          <Play className="h-4 w-4" /> {contract.status === "pending_cancel" ? "Withdraw cancellation" : "Resume"}
        </button>
      ) : null}

      {actions.pause ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("Subscription paused", () => pause({ subscriptionId }))}
          className={cn(buttonBase, "border-border hover:bg-muted")}
        >
          <Pause className="h-4 w-4" /> Pause
        </button>
      ) : null}

      {actions.scheduleCancel || actions.cancelNow ? (
        <div className="space-y-2">
          {pending === null ? (
            <div className="grid gap-2">
              {actions.scheduleCancel ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPending("cancel_at_end")}
                  className={cn(buttonBase, "border-border hover:bg-muted")}
                >
                  <XCircle className="h-4 w-4" /> Cancel at period end
                </button>
              ) : null}
              {actions.cancelNow ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPending("cancel_now")}
                  className={cn(buttonBase, "border-destructive/40 text-destructive hover:bg-destructive/10")}
                >
                  <XCircle className="h-4 w-4" /> Cancel now
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs text-destructive">
                {pending === "cancel_now"
                  ? "Access ends now; unpaid invoices are voided and retries stop. Refunds are separate."
                  : "Access continues until the paid period ends; nothing renews after that."}
              </p>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason (kept in the contract history)"
                aria-label="Cancellation reason"
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || reason.trim().length === 0}
                  onClick={() =>
                    void run(pending === "cancel_now" ? "Subscription cancelled" : "Cancellation scheduled", () =>
                      pending === "cancel_now"
                        ? cancelNow({ subscriptionId, reason: reason.trim() })
                        : scheduleCancel({ subscriptionId, reason: reason.trim() }),
                    )
                  }
                  className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-50"
                >
                  Confirm
                </button>
                <button type="button" onClick={() => setPending(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs">
                  Keep subscription
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {actions.changePlan && otherOffers.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ArrowUpDown className="h-3.5 w-3.5" /> Change plan
          </p>
          <select
            value={toOfferId}
            onChange={(event) => {
              const chosen = otherOffers.find((offer) => offer._id === event.target.value);
              setToOfferId(chosen ? chosen._id : "");
            }}
            aria-label="New plan"
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Choose a plan…</option>
            {otherOffers.map((offer) => (
              <option key={offer._id} value={offer._id}>
                {offer.title} — {formatMoney(offer.recurringAmount, offer.currencyCode)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || toOfferId === ""}
            onClick={() => {
              if (toOfferId === "") return;
              void run("Plan change started", async () => {
                const result = await changePlan({ subscriptionId, toOfferId });
                if (result.mode === "downgrade") toast.message("The new plan takes effect at the next renewal.");
              });
            }}
            className={cn(buttonBase, "border-border hover:bg-muted")}
          >
            Apply plan change
          </button>
        </div>
      ) : null}

      {!["cancelled", "expired"].includes(contract.status) ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const code = couponCode.trim();
            if (!code) return;
            void run("Coupon applied to the next renewal", async () => {
              await redeemCoupon({ contractId: subscriptionId, couponCode: code });
              setCouponCode("");
            });
          }}
        >
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-border px-2">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value)}
              placeholder="Coupon code"
              aria-label="Coupon code"
              className="w-full bg-transparent py-1.5 text-sm focus:outline-none"
            />
          </div>
          <button type="submit" disabled={busy || !couponCode.trim()} className="rounded-lg border border-border px-3 text-xs font-medium disabled:opacity-50">
            Apply
          </button>
        </form>
      ) : null}
    </div>
  );
}
