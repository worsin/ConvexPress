import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { Check, Loader2, Tag } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

import { AccountStep } from "@/components/auth/AccountStep";
import { AuthError } from "@/components/auth/AuthError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormStripePaymentForm } from "@/extensions/forms/payment/FormStripePaymentForm";
import { renewalConsent, renewalTermsText } from "./renewalTerms";
import { useConfirmFirstCharge } from "@/extensions/forms/payment/useConfirmFirstCharge";
import {
  confirmationFromClientSecret,
  failureMessage,
  parseSubscriptionReturn,
  pendingMessage,
  reduceCheckout,
  returnedCheckoutState,
  stripSubscriptionReturn,
  subscriptionReturnPath,
  type CheckoutState,
  type FailureReason,
  type SubscriptionReturn,
} from "@/extensions/forms/payment/subscriptionCheckout";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import { clearPendingSubscriptionIntent, clearPendingVerificationContext, getPendingVerificationCouponCodeForOffer } from "@/lib/auth/verification";
import { useClerk } from "@/lib/auth/clerk";
import { goTo } from "@/lib/browser/navigate";
import { idFromString } from "@/lib/ids";
import { cn, getErrorMessage } from "@/lib/utils";
import { OrderSummary, formatMinor } from "./OrderSummary";

/**
 * Direct signup for one subscription offer (`/signup/<offer>`), for sites that
 * link a plan straight to checkout rather than through a signup form.
 *
 * Three steps on one page, nothing hosted elsewhere:
 *   1. Account: create one (the email is verified in place) or sign in
 *      (`AccountStep`); a signed-in visitor goes straight on.
 *   2. Plan: what it costs and when, with an optional coupon checked by the
 *      server before any charge (`createCheckoutIntent`).
 *   3. Payment: the order summary and Stripe Elements on the page. Once Stripe
 *      confirms, the server verifies the payment with Stripe and activates
 *      (`confirmFirstCharge`, retried while Stripe settles), so access starts
 *      at once instead of waiting for the webhook. Redirect-based payment
 *      methods return here and finish the same way. A plan with nothing to
 *      pay activates without a card (`activateFreeIntent`).
 *
 * Theme tokens only.
 */

interface Offer {
  _id: Id<"commerce_subscription_offers">;
  title: string;
  publicSummary?: string;
  recurringAmount: number;
  currencyCode: string;
  setupFeeAmount?: number;
  trialDaysOverride?: number;
  features?: Array<{ text: string; highlighted?: boolean; icon?: string }>;
  template?: {
    billingInterval: "day" | "week" | "month" | "year";
    billingIntervalCount: number;
    trialDays?: number;
  } | null;
}

interface SignupFormProps {
  offer: Offer;
  className?: string;
}

interface StartedCheckout {
  intentId: Id<"commerce_subscription_checkout_intents">;
  clientSecret: string;
  publishableKey: string;
  mode: "payment" | "setup";
}

function cadenceText(offer: Offer): string {
  const unit = offer.template?.billingInterval ?? "month";
  const n = offer.template?.billingIntervalCount ?? 1;
  return n > 1 ? `every ${n} ${unit}s` : `per ${unit}`;
}

function trialDays(offer: Offer): number {
  return offer.trialDaysOverride ?? offer.template?.trialDays ?? 0;
}

function errorCode(err: unknown): string | undefined {
  if (!(err instanceof ConvexError)) return undefined;
  const data: unknown = err.data;
  if (typeof data !== "object" || data === null || !("code" in data)) return undefined;
  return typeof data.code === "string" ? data.code : undefined;
}

/** Failures in this page's words (the shared copy speaks of forms). */
function signupFailureMessage(reason: FailureReason): string {
  switch (reason) {
    case "sign_in_required":
      return "Sign in to finish subscribing.";
    case "unavailable":
      return "This plan can't be bought right now. Please contact us.";
    case "payment_failed":
      return "Your payment didn't go through, and you haven't been charged. Start again with another card.";
    case "checkout_closed":
      return "This checkout has expired. Start again to subscribe.";
    default:
      return failureMessage(reason);
  }
}

export function SignupForm({ offer, className }: SignupFormProps) {
  const dashboard = useDashboardPath();
  const { signOut } = useClerk();
  const { user } = useCurrentUser();
  const pagePath = `/signup/${offer._id}`;

  // A Stripe redirect (some payment methods) comes back here to finish.
  const [returned] = useState<SubscriptionReturn | null>(() =>
    typeof window === "undefined" ? null : parseSubscriptionReturn(window.location.search),
  );
  const [accountReady, setAccountReady] = useState(false);
  const [checkout, setCheckout] = useState<StartedCheckout | null>(null);

  const createCheckoutIntent = useMutation(api.commerceSubscriptions.checkout.createCheckoutIntent);
  const activateFreeIntent = useMutation(api.commerceSubscriptions.checkout.activateFreeIntent);
  const beginFirstCharge = useAction(api.commerceSubscriptions.publicCharge.beginFirstCharge);
  const chargingStatus = useQuery(api.commerceSubscriptions.queries.getLiveChargingStatus);

  // A coupon carried from an earlier visit (the previous signup flow) is offered again.
  const [couponCode, setCouponCode] = useState(() => getPendingVerificationCouponCodeForOffer(offer._id) ?? "");
  const [couponOpen, setCouponOpen] = useState(() => couponCode.length > 0);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [starting, setStarting] = useState(false);

  const finished = useRef(false);
  function finish() {
    if (finished.current) return;
    finished.current = true;
    clearPendingVerificationContext();
    clearPendingSubscriptionIntent();
    toast.success(`You're subscribed to ${offer.title}`);
    goTo(`${dashboard.to("/subscriptions")}?welcome=1`);
  }

  async function startCheckout() {
    setStarting(true);
    setError(null);
    setCouponError(null);
    try {
      const intent = await createCheckoutIntent({ offerId: offer._id, couponCode: couponCode.trim() || undefined });
      if (intent.amount <= 0 && intent.recurringAmount <= 0) {
        await activateFreeIntent({ intentId: intent.intentId });
        finish();
        return;
      }
      if (!chargingStatus?.live || !chargingStatus.publishableKey) {
        setError("Payments aren't set up on this site yet. Please contact us to subscribe.");
        return;
      }
      const charge = await beginFirstCharge({ checkoutIntentId: intent.intentId });
      if (!charge.clientSecret) {
        setError("We couldn't start secure checkout. Please try again.");
        return;
      }
      setCheckout({ intentId: intent.intentId, clientSecret: charge.clientSecret, publishableKey: chargingStatus.publishableKey, mode: charge.mode });
    } catch (err) {
      const code = errorCode(err);
      if (code === "COUPON_INVALID") setCouponError(getErrorMessage(err, "That code isn't valid."));
      else if (code === "ALREADY_SUBSCRIBED") setAlreadySubscribed(true);
      else setError(getErrorMessage(err, "We couldn't start checkout. Please try again."));
    } finally {
      setStarting(false);
    }
  }

  const trial = trialDays(offer);

  return (
    <div className={cn("flex flex-col gap-5 rounded-2xl border border-border bg-card p-6", className)} data-slot="subscription-signup-form">
      {/* The plan */}
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{offer.title}</h2>
          {offer.publicSummary ? <p className="mt-1 text-xs text-muted-foreground">{offer.publicSummary}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-semibold tabular-nums text-foreground">{formatMinor(offer.recurringAmount, offer.currencyCode)}</div>
          <div className="text-[11px] text-muted-foreground">{cadenceText(offer)}</div>
        </div>
      </div>

      {offer.features && offer.features.length > 0 && !checkout && !returned ? (
        <ul className="space-y-1.5">
          {offer.features.map((feature) => (
            <li key={feature.text} className="flex items-start gap-2 text-xs text-foreground">
              <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", feature.highlighted ? "text-primary" : "text-muted-foreground")} />
              <span>{feature.text}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {returned ? (
        <SignupCheckout
          intentId={idFromString<"commerce_subscription_checkout_intents">(returned.checkoutIntentId)}
          started={null}
          returned={returned}
          pagePath={pagePath}
          onDone={finish}
        />
      ) : checkout ? (
        <SignupCheckout intentId={checkout.intentId} started={checkout} returned={null} pagePath={pagePath} onDone={finish} />
      ) : !accountReady ? (
        <AccountStep
          prefill={{}}
          returnTo={pagePath}
          onReady={() => setAccountReady(true)}
          intro={`Create an account to subscribe to ${offer.title}. You'll use it to manage your subscription and sign in later.`}
          signedInIntro="One moment while we get your account ready."
          createLabel="Create account and continue"
        />
      ) : alreadySubscribed ? (
        <div className="flex flex-col gap-3">
          <AuthError message="You already have a subscription that includes this plan. To switch plans, change it from your account. You haven't been charged." />
          <a href={dashboard.to("/subscriptions")} className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            Manage my subscription
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Subscribing as <span className="font-medium text-foreground">{user?.email ?? "your account"}</span>.{" "}
            <button type="button" onClick={() => void signOut()} className="underline underline-offset-4 hover:text-foreground">
              Not you?
            </button>
          </p>

          {trial > 0 ? (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
              {trial}-day free trial. You won't be charged until it ends, and you can cancel before then.
            </div>
          ) : null}
          {offer.setupFeeAmount && offer.setupFeeAmount > 0 ? (
            <p className="text-xs text-muted-foreground">Plus a one-time setup fee of {formatMinor(offer.setupFeeAmount, offer.currencyCode)}.</p>
          ) : null}

          {couponOpen ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signup-coupon">Coupon code</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Tag className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="signup-coupon"
                    value={couponCode}
                    onChange={(event) => {
                      setCouponCode(event.target.value);
                      setCouponError(null);
                    }}
                    placeholder="SAVE20"
                    autoComplete="off"
                    aria-invalid={couponError ? true : undefined}
                    aria-describedby={couponError ? "signup-coupon-error" : undefined}
                    className="pl-8 uppercase"
                  />
                </div>
              </div>
              {couponError ? (
                <p id="signup-coupon-error" role="alert" className="text-xs text-destructive">
                  {couponError}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">Checked before you pay; the discount shows in your order summary.</p>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => setCouponOpen(true)} className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Have a coupon code?
            </button>
          )}

          {error ? <AuthError message={error} /> : null}

          <Button type="button" onClick={() => void startCheckout()} disabled={starting || chargingStatus === undefined}>
            {starting ? (
              <>
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                Preparing checkout…
              </>
            ) : trial > 0 ? (
              "Continue to start your free trial"
            ) : (
              "Continue to payment"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Payment and activation for one checkout: the order summary, Stripe
 * Elements, and server verification (`useConfirmFirstCharge`) with retries.
 * Starts at the card form for a checkout begun on this page, or straight at
 * activation after a Stripe redirect.
 */
function SignupCheckout({
  intentId,
  started,
  returned,
  pagePath,
  onDone,
}: {
  intentId: Id<"commerce_subscription_checkout_intents">;
  started: StartedCheckout | null;
  returned: SubscriptionReturn | null;
  pagePath: string;
  onDone: () => void;
}) {
  const cardConfirmation = useMemo(
    () => (started ? confirmationFromClientSecret(started.mode, started.clientSecret) : null),
    [started],
  );
  const reducer = (state: CheckoutState, event: Parameters<typeof reduceCheckout>[1]) =>
    reduceCheckout(state, event, { cardAvailable: started !== null });
  const [state, dispatch] = useReducer(reducer, null, (): CheckoutState =>
    returned ? returnedCheckoutState(returned.confirmation) : { phase: "card", error: null },
  );
  useConfirmFirstCharge(state, dispatch, intentId);
  const view = useQuery(api.commerceSubscriptions.checkout.getMyCheckout, { intentId });
  const recordRenewalConsent = useMutation(api.commerceSubscriptions.checkout.recordRenewalConsent);

  // After a redirect, keep only the checkout id in the address bar.
  useEffect(() => {
    if (!returned || typeof window === "undefined") return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${stripSubscriptionReturn(window.location.search)}`);
  }, [returned]);

  useEffect(() => {
    if (state.phase === "done") onDone();
  }, [state.phase, onDone]);

  switch (state.phase) {
    case "card":
      return !started || !cardConfirmation ? (
        <AuthError message="We couldn't continue this checkout. Start again to subscribe." />
      ) : (
        <div className="flex flex-col gap-4" data-slot="signup-checkout" data-phase="card">
          {view ? (
            <OrderSummary mode={started.mode} amount={view.amount} recurringAmount={view.recurringAmount} currency={view.currency} summary={view.summary} />
          ) : (
            <Progress message="Preparing your order…" />
          )}
          {state.error ? <AuthError message={state.error} /> : null}
          <FormStripePaymentForm
            publishableKey={started.publishableKey}
            clientSecret={started.clientSecret}
            mode={started.mode}
            returnUrl={subscriptionReturnPath(pagePath, String(intentId))}
            submitLabel={
              started.mode === "setup"
                ? view?.summary && view.summary.trialDays > 0
                  ? "Start free trial"
                  : "Save card and subscribe"
                : view
                  ? `Pay ${formatMinor(view.amount, view.currency)} and subscribe`
                  : "Pay and subscribe"
            }
            onError={(message) => dispatch({ type: "card_error", message })}
            onConfirmed={() => dispatch({ type: "stripe_confirmed", confirmation: cardConfirmation })}
            consent={
              view?.summary && view.recurringAmount > 0
                ? renewalConsent(renewalTermsText(view.summary, view.currency), (text) =>
                    recordRenewalConsent({ checkoutIntentRef: String(intentId), text }),
                  )
                : undefined
            }
          />
        </div>
      );
    case "preparing":
    case "activating":
      return <Progress message={state.phase === "activating" && state.attempt > 1 ? "Still confirming your payment…" : "Confirming your payment…"} />;
    case "pending":
      return (
        <div className="flex flex-col gap-3" data-slot="signup-checkout" data-phase="pending">
          <p role="status" className="text-sm text-muted-foreground">
            {pendingMessage(state.reason)}
          </p>
          <Button type="button" onClick={() => dispatch({ type: "check_again" })}>
            Check again
          </Button>
        </div>
      );
    case "failed":
      return (
        <div className="flex flex-col gap-3" data-slot="signup-checkout" data-phase="failed">
          <AuthError message={signupFailureMessage(state.reason)} />
          <a href={pagePath} className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground">
            Start again
          </a>
        </div>
      );
    case "done":
      return <Progress message="Your subscription is active. Taking you to your account…" />;
  }
}

function Progress({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
