/**
 * Form Commerce — the wizard's on-site subscription checkout step.
 *
 * Rendered by `FormWizard` after a submit whose form starts a checkout, and on
 * the Stripe `return_url` after a redirect-based payment method. The state
 * machine lives in `subscriptionCheckout.ts`; this component wires it to
 * Convex (`getCheckoutStatus`, `getPendingPayment`, `confirmFirstCharge`) and
 * to Stripe Elements (`FormStripePaymentForm`, in-page confirmation). It reads
 * `getPendingPayment` directly rather than through `useFormSubscriptionPayment`,
 * which also mounts Clerk sign-up and would tie every form render to it.
 *
 * Activation is server-verified: after Stripe reports success the step calls
 * `confirmFirstCharge`, which retrieves the PaymentIntent/SetupIntent from
 * Stripe and activates through the same path as the webhook. While Stripe is
 * still settling it retries with backoff, then explains what happens next.
 * When activated, the wizard follows the form's confirmation.
 *
 * Theme tokens only; no Stripe-hosted pages.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { Loader2 } from "lucide-react";

import { AuthError } from "@/components/auth/AuthError";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import { FormStripePaymentForm } from "./FormStripePaymentForm";
import type { PendingPaymentDescriptor } from "./useFormSubscriptionPayment";
import {
  INITIAL_CHECKOUT_STATE,
  browserCheckoutStorage,
  clearStoredCheckout,
  confirmationFromClientSecret,
  failureMessage,
  isRetryableConfirmError,
  pendingMessage,
  readStoredCheckout,
  reduceCheckout,
  returnedCheckoutState,
  stripSubscriptionReturn,
  subscriptionReturnPath,
  writeStoredCheckout,
  type CheckoutEvent,
  type CheckoutState,
  type SubscriptionReturn,
} from "./subscriptionCheckout";

/** The submission whose form confirmation to follow once checkout finishes. */
export interface CheckoutSubmission {
  submissionId: Id<"form_submissions">;
  confirmationToken?: string;
}

export interface SubscriptionCheckoutFinish {
  paid: boolean;
  submission: CheckoutSubmission | null;
  /** The action's configured post-payment destination, if any. */
  afterPaymentUrl?: string;
}

interface Props {
  formId: Id<"forms">;
  formTitle: string;
  /** In-page flow: the submission that was just made. */
  submission?: CheckoutSubmission;
  /** Redirect return: what Stripe put on the return URL. */
  returned?: SubscriptionReturn;
  onFinished: (finish: SubscriptionCheckoutFinish) => void;
}

/** Show a "taking longer than usual" note after this long in `preparing`. */
const SLOW_PREPARE_MS = 20_000;

function convexErrorCode(err: unknown): string | undefined {
  if (!(err instanceof ConvexError)) return undefined;
  const data: unknown = err.data;
  if (typeof data !== "object" || data === null || !("code" in data)) return undefined;
  return typeof data.code === "string" ? data.code : undefined;
}

function errorText(err: unknown): string {
  if (err instanceof ConvexError) {
    const data: unknown = err.data;
    if (typeof data === "object" && data !== null && "message" in data && typeof data.message === "string") {
      return data.message;
    }
  }
  return err instanceof Error ? err.message : "Unknown error";
}

function formatMinor(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

/** Replace the address bar's query without reloading (drops Stripe's params). */
function replaceSearch(search: string): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
}

export function FormSubscriptionCheckout({ formId, formTitle, submission, returned, onFinished }: Props) {
  const dashboard = useDashboardPath();
  const storage = useMemo(() => browserCheckoutStorage(), []);
  const inPage = submission ?? null;
  const stored = useMemo(
    () => (returned ? readStoredCheckout(storage, returned.checkoutIntentId) : null),
    [returned, storage],
  );
  const cardAvailable = inPage !== null;

  const reducer = useCallback(
    (state: CheckoutState, event: CheckoutEvent) => reduceCheckout(state, event, { cardAvailable }),
    [cardAvailable],
  );
  const [state, dispatch] = useReducer(reducer, null, (): CheckoutState =>
    returned
      ? returnedCheckoutState(returned.confirmation ?? stored?.confirmation ?? null)
      : INITIAL_CHECKOUT_STATE,
  );

  // ── Server state (in-page flow) ───────────────────────────────────────────
  const status = useQuery(
    api.extensions.forms.actions.getCheckoutStatus,
    inPage ? { submissionId: inPage.submissionId } : "skip",
  );
  useEffect(() => {
    if (status) dispatch({ type: "status", status });
  }, [status]);

  const descriptor = useQuery(
    api.extensions.forms.actions.getPendingPayment,
    inPage && state.phase !== "done" && state.phase !== "failed"
      ? { submissionId: inPage.submissionId }
      : "skip",
  );
  const cardConfirmation = useMemo(
    () =>
      descriptor?.clientSecret ? confirmationFromClientSecret(descriptor.mode, descriptor.clientSecret) : null,
    [descriptor?.clientSecret, descriptor?.mode],
  );

  // The checkout id outlives the descriptor (the run stops being pending once
  // activated), and so does the action's post-payment URL.
  const [checkoutIntentId, setCheckoutIntentId] = useState<string | null>(
    returned?.checkoutIntentId ?? null,
  );
  const afterPaymentUrlRef = useRef<string | undefined>(stored?.returnUrl);
  useEffect(() => {
    if (descriptor?.intentId) setCheckoutIntentId(descriptor.intentId);
    if (descriptor?.returnUrl) afterPaymentUrlRef.current = descriptor.returnUrl;
  }, [descriptor?.intentId, descriptor?.returnUrl]);

  // Remember the checkout in this tab before Stripe may redirect away.
  useEffect(() => {
    if (!inPage || !descriptor?.intentId || !cardConfirmation) return;
    writeStoredCheckout(storage, {
      checkoutIntentId: descriptor.intentId,
      formId: String(formId),
      submissionId: String(inPage.submissionId),
      confirmationToken: inPage.confirmationToken,
      returnUrl: descriptor.returnUrl,
      confirmation: cardConfirmation,
    });
  }, [inPage, descriptor?.intentId, descriptor?.returnUrl, cardConfirmation, formId, storage]);

  // On a redirect return, keep only the ids in the address bar: Stripe's
  // client secret is in this tab's state (and record) from here on.
  useEffect(() => {
    if (!returned) return;
    // With an empty pathname this is just the `?…` query carrying the ids.
    replaceSearch(subscriptionReturnPath("", returned.checkoutIntentId, returned.formId ?? String(formId)));
    if (stored && returned.confirmation) {
      writeStoredCheckout(storage, { ...stored, confirmation: returned.confirmation });
    }
  }, [returned, stored, storage, formId]);

  // ── Confirm with the server (retries are scheduled by the reducer) ────────
  const confirmFirstCharge = useAction(api.commerceSubscriptions.publicCharge.confirmFirstCharge);
  useEffect(() => {
    if (state.phase !== "activating" || !checkoutIntentId) return;
    const { confirmation, delayMs } = state;
    let cancelled = false;
    const timer = setTimeout(() => {
      const target =
        confirmation.kind === "payment_intent"
          ? { paymentIntentId: confirmation.objectId }
          : { setupIntentId: confirmation.objectId };
      confirmFirstCharge({ checkoutIntentId, clientSecret: confirmation.clientSecret, ...target }).then(
        (result) => {
          if (!cancelled) dispatch({ type: "confirm_result", result });
        },
        (err: unknown) => {
          if (cancelled) return;
          dispatch({
            type: "confirm_error",
            retryable: isRetryableConfirmError(convexErrorCode(err)),
            message: errorText(err),
          });
        },
      );
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, checkoutIntentId, confirmFirstCharge]);

  // ── Finish ────────────────────────────────────────────────────────────────
  const finishedRef = useRef(false);
  useEffect(() => {
    if (state.phase === "failed" && returned) replaceSearch(stripSubscriptionReturn(window.location.search));
    if (state.phase !== "done" || finishedRef.current) return;
    finishedRef.current = true;
    if (checkoutIntentId) clearStoredCheckout(storage, checkoutIntentId);
    if (returned) replaceSearch(stripSubscriptionReturn(window.location.search));
    // After a redirect, follow the confirmation of the submission this tab
    // recorded, once the server has named the same submission.
    const recorded =
      stored && state.formSubmissionId && String(state.formSubmissionId) === stored.submissionId
        ? { submissionId: state.formSubmissionId, confirmationToken: stored.confirmationToken }
        : null;
    onFinished({
      paid: state.paid,
      submission: inPage ?? recorded,
      afterPaymentUrl: afterPaymentUrlRef.current,
    });
  }, [state, checkoutIntentId, storage, returned, stored, inPage, onFinished]);

  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (state.phase !== "preparing") return;
    const timer = setTimeout(() => setSlow(true), SLOW_PREPARE_MS);
    return () => clearTimeout(timer);
  }, [state.phase]);

  // ── View ──────────────────────────────────────────────────────────────────
  const formPath = typeof window !== "undefined" ? window.location.pathname : "/";
  const resumePath = checkoutIntentId
    ? subscriptionReturnPath(formPath, checkoutIntentId, String(formId))
    : formPath;

  let body: React.ReactNode;
  let heading = "Complete your subscription";
  switch (state.phase) {
    case "preparing":
      body = (
        <Progress
          message={slow ? "This is taking longer than usual. Please keep this page open." : "Preparing secure checkout…"}
        />
      );
      break;
    case "card":
      body = !descriptor ? (
        <Progress message="Preparing secure checkout…" />
      ) : !descriptor.publishableKey || !descriptor.clientSecret || !cardConfirmation ? (
        <AuthError message="Payments are not configured on this site yet. Please contact us to subscribe." />
      ) : (
        <>
          <OrderSummary
            mode={descriptor.mode}
            amount={descriptor.amount}
            recurringAmount={descriptor.recurringAmount}
            currency={descriptor.currency}
            summary={descriptor.summary}
          />
          {state.error ? <AuthError message={state.error} /> : null}
          <FormStripePaymentForm
            publishableKey={descriptor.publishableKey}
            clientSecret={descriptor.clientSecret}
            mode={descriptor.mode}
            returnUrl={resumePath}
            submitLabel={
              descriptor.mode === "setup"
                ? descriptor.summary && descriptor.summary.trialDays > 0
                  ? "Start free trial"
                  : "Save card and subscribe"
                : `Pay ${formatMinor(descriptor.amount, descriptor.currency)} and subscribe`
            }
            onError={(message) => dispatch({ type: "card_error", message })}
            onConfirmed={() => dispatch({ type: "stripe_confirmed", confirmation: cardConfirmation })}
          />
        </>
      );
      break;
    case "activating":
      heading = "Activating your subscription";
      body = (
        <Progress
          message={
            state.attempt > 1
              ? "Still confirming your payment with our payment provider…"
              : "Confirming your payment…"
          }
        />
      );
      break;
    case "pending":
      heading = state.reason === "account_required" ? "Payment received" : "Payment processing";
      body = (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {pendingMessage(state.reason)}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => dispatch({ type: "check_again" })}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Check again
            </button>
            {state.reason === "account_required" ? <AccountLinks returnTo={resumePath} /> : null}
          </div>
        </>
      );
      break;
    case "failed":
      heading =
        state.reason === "sign_in_required"
          ? "Sign in to subscribe"
          : state.reason === "already_subscribed"
            ? "You're already subscribed"
            : "Checkout not completed";
      body = (
        <>
          <AuthError message={failureMessage(state.reason)} />
          {state.reason === "sign_in_required" ? (
            <AccountLinks returnTo={formPath} />
          ) : state.reason === "already_subscribed" ? (
            <a
              href={dashboard.to("/subscriptions")}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Manage my subscription
            </a>
          ) : (
            <a
              href={formPath}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground"
            >
              Return to form
            </a>
          )}
        </>
      );
      break;
    case "done":
      heading = "Subscription active";
      body = <Progress message="Your subscription is active. Finishing up…" />;
      break;
  }

  return (
    <section
      data-slot="form-subscription-checkout"
      data-phase={state.phase}
      aria-busy={state.phase === "preparing" || state.phase === "activating"}
      className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6"
    >
      <div className="flex flex-col gap-1.5 border-b border-border pb-4">
        <p className="text-xs font-medium uppercase text-muted-foreground">{formTitle}</p>
        <h1 className="text-xl font-semibold text-foreground">{heading}</h1>
      </div>
      {body}
    </section>
  );
}

function Progress({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

type CheckoutSummary = NonNullable<PendingPaymentDescriptor["summary"]>;

function formatLongDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function cadence(summary: CheckoutSummary | null): string {
  if (!summary) return "each billing period";
  const n = summary.billingIntervalCount > 1 ? summary.billingIntervalCount : 1;
  return n === 1 ? `per ${summary.billingInterval}` : `every ${n} ${summary.billingInterval}s`;
}

/**
 * What the customer is buying and paying: the plan, setup fee, coupon, what
 * is due today, and what happens after (the next charge and its date). Every
 * figure comes from the server's checkout intent.
 */
export function OrderSummary({
  mode,
  amount,
  recurringAmount,
  currency,
  summary,
}: {
  mode: "payment" | "setup";
  amount: number;
  recurringAmount: number;
  currency: string;
  summary: CheckoutSummary | null;
}) {
  const money = (value: number) => formatMinor(value, currency);
  const trial = summary && summary.trialDays > 0;
  return (
    <div data-slot="checkout-order-summary" className="flex flex-col gap-3 border-b border-border pb-4 text-sm">
      {summary ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-foreground">{summary.planTitle}</p>
            <p className="text-xs text-muted-foreground">
              {money(summary.recurringAmount)} {cadence(summary)}
              {trial ? ` · ${summary.trialDays}-day free trial` : ""}
            </p>
          </div>
          <span className="shrink-0 tabular-nums text-foreground">{trial ? money(0) : money(summary.recurringAmount)}</span>
        </div>
      ) : null}
      {summary && summary.setupFeeAmount > 0 ? (
        <div className="flex items-center justify-between gap-3 text-muted-foreground">
          <span>One-time setup fee</span>
          <span className="tabular-nums text-foreground">{money(summary.setupFeeAmount)}</span>
        </div>
      ) : null}
      {summary && summary.firstChargeDiscount > 0 ? (
        <div className="flex items-center justify-between gap-3 text-muted-foreground">
          <span>Coupon {summary.couponCode}</span>
          <span className="tabular-nums text-foreground">−{money(summary.firstChargeDiscount)}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="font-medium text-foreground">Due today</span>
        <span className="text-lg font-semibold tabular-nums text-foreground">{money(amount)}</span>
      </div>
      {recurringAmount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {summary
            ? `Then ${money(recurringAmount)} ${cadence(summary)}, starting ${formatLongDate(summary.nextChargeAt)}. Cancel any time from your account.`
            : `Then ${money(recurringAmount)} each billing period. Cancel any time from your account.`}
          {summary?.couponCode && summary.firstChargeDiscount === 0 ? ` Coupon ${summary.couponCode} applies to your upcoming charges.` : ""}
        </p>
      ) : null}
      {mode === "setup" ? (
        <p className="text-xs text-muted-foreground">You won't be charged today. Your card is saved for the charges above.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">Your card details are encrypted and never stored on this site.</p>
    </div>
  );
}

function AccountLinks({ returnTo }: { returnTo: string }) {
  const query = `?${new URLSearchParams({ returnTo }).toString()}`;
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <a
        href={`/login${query}`}
        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Sign in
      </a>
      <a
        href={`/register${query}`}
        className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground"
      >
        Create account
      </a>
    </div>
  );
}
