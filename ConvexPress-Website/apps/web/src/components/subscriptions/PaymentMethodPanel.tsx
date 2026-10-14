/**
 * The card a subscription renews on, and replacing it — entirely on this site.
 *
 * "Update card" asks the server for a Stripe SetupIntent and mounts the Payment
 * Element with only its client secret and the publishable key. Once Stripe
 * confirms the card in the page, the server retrieves the SetupIntent from
 * Stripe and records the card (`paymentMethods.confirmPaymentMethodUpdate`);
 * a past_due subscription is then retried on it straight away. Cards that need
 * a bank redirect come back to this page, which finishes the same way.
 *
 * Theme tokens only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { AlertTriangle, CreditCard } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

import { FormStripePaymentForm, type ConfirmedStripeObject } from "@/extensions/forms/payment/FormStripePaymentForm";
import { cn, getErrorMessage } from "@/lib/utils";
import {
  describeFailure,
  formatCardBrand,
  formatDate,
  formatMoney,
  type BillingIssue,
  type PaymentMethodSummary,
} from "./portalTypes";

/** Query parameter naming the contract a redirect-based card change was for. */
const RETURN_PARAM = "card_update";

interface PaymentMethodPanelProps {
  contractId: Id<"commerce_subscriptions">;
  paymentMethod: PaymentMethodSummary | null;
  billingIssue: BillingIssue | null;
  canUpdate: boolean;
  className?: string;
}

type CardForm = { clientSecret: string; publishableKey: string };

export function PaymentMethodPanel({ contractId, paymentMethod, billingIssue, canUpdate, className }: PaymentMethodPanelProps) {
  const begin = useAction(api.commerceSubscriptions.paymentMethods.beginPaymentMethodUpdate);
  const confirm = useAction(api.commerceSubscriptions.paymentMethods.confirmPaymentMethodUpdate);
  const [form, setForm] = useState<CardForm | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);

  const finish = useCallback(
    async (setupIntentId: string) => {
      setWorking(true);
      try {
        const result = await confirm({ contractId, setupIntentId });
        setForm(null);
        setError(null);
        toast.success(
          result.retryScheduled
            ? "Card updated. We're retrying your payment now."
            : "Card updated. Your subscription will renew on it.",
        );
      } catch (failure) {
        setError(getErrorMessage(failure, "Your card could not be saved."));
      } finally {
        setWorking(false);
      }
    },
    [confirm, contractId],
  );

  // A card that needed a bank redirect returns here with the SetupIntent.
  useEffect(() => {
    if (typeof window === "undefined" || finishing.current) return;
    const params = new URLSearchParams(window.location.search);
    const setupIntentId = params.get("setup_intent");
    if (!setupIntentId || params.get(RETURN_PARAM) !== contractId) return;
    finishing.current = true;
    for (const key of ["setup_intent", "setup_intent_client_secret", "redirect_status", RETURN_PARAM]) params.delete(key);
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    void finish(setupIntentId);
  }, [contractId, finish]);

  async function start() {
    setWorking(true);
    setError(null);
    try {
      const started = await begin({ contractId });
      setForm({ clientSecret: started.clientSecret, publishableKey: started.publishableKey });
    } catch (failure) {
      setError(getErrorMessage(failure, "The card form could not be opened."));
    } finally {
      setWorking(false);
    }
  }

  function onConfirmed(confirmed: ConfirmedStripeObject) {
    if (confirmed.kind !== "setup_intent") return;
    void finish(confirmed.id);
  }

  const returnUrl =
    typeof window === "undefined" ? "/" : `${window.location.pathname}?${RETURN_PARAM}=${encodeURIComponent(contractId)}`;

  return (
    <div className={cn("space-y-3", className)} data-slot="payment-method-panel">
      {billingIssue ? (
        <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="space-y-1 text-xs text-foreground">
            <p className="font-medium text-destructive">
              Payment of {formatMoney(billingIssue.amountDue, billingIssue.currencyCode)} is past due.
            </p>
            <p>{describeFailure(billingIssue.lastFailureReason)}</p>
            {billingIssue.nextRetryAt ? <p>We'll try again on {formatDate(billingIssue.nextRetryAt)}.</p> : null}
            {billingIssue.accessEndsAt ? (
              <p>Your access continues until {formatDate(billingIssue.accessEndsAt)}. Update your card to pay now.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Card on file</p>
            <p className="text-sm font-medium text-foreground">
              {paymentMethod
                ? `${formatCardBrand(paymentMethod.brand)} ending ${paymentMethod.last4}, expires ${String(paymentMethod.expMonth).padStart(2, "0")}/${paymentMethod.expYear}`
                : "Saved with Stripe"}
            </p>
          </div>
        </div>
        {canUpdate && !form ? (
          <button
            type="button"
            onClick={() => void start()}
            disabled={working}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
              billingIssue
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border border-border text-foreground hover:bg-muted",
            )}
          >
            {working ? "Opening…" : "Update card"}
          </button>
        ) : null}
      </div>

      {form ? (
        <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
          <FormStripePaymentForm
            publishableKey={form.publishableKey}
            clientSecret={form.clientSecret}
            mode="setup"
            returnUrl={returnUrl}
            onError={setError}
            onConfirmed={onConfirmed}
            submitLabel={working ? "Saving…" : "Save card"}
          />
          <button
            type="button"
            onClick={() => setForm(null)}
            disabled={working}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Keep the current card
          </button>
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
