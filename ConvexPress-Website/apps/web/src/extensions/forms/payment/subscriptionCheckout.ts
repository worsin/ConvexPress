/**
 * Form subscription checkout — the wizard's payment-step state machine (pure).
 *
 * After a form with a `subscription`/`payment` action is submitted, the action
 * runs asynchronously on the server. The wizard follows it through
 * `extensions.forms.actions.getCheckoutStatus` and, when a card is needed,
 * mounts Stripe Elements on-site (never a Stripe-hosted page). Once Stripe
 * reports success, in-page or on the `return_url` after a redirect-based
 * method, the wizard asks the server to verify the payment with Stripe and
 * activate (`commerceSubscriptions.publicCharge.confirmFirstCharge`). The
 * browser never decides that a payment happened; it only names the Stripe
 * object and proves it holds that object's client secret.
 *
 *   preparing ──status──▶ card ──stripe_confirmed──▶ activating ──active──▶ done
 *       │                  ▲                            │  ▲
 *       │                  └──── declined card ─────────┤  └─ pending: retry with backoff
 *       ▼                                               ▼
 *     done (no checkout / free)                pending (still processing, or the
 *     failed (sign in / unavailable)           guest account is not verified yet)
 *                                              failed (closed / unverifiable)
 *
 * Everything here is pure so the transitions are unit-tested without a DOM,
 * Convex or Stripe. The redirect-return helpers and the per-tab checkout record
 * (sessionStorage) live here too, behind a minimal storage interface.
 */

import type { FunctionReturnType } from "convex/server";
import type { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

export type CheckoutStatus = FunctionReturnType<
  typeof api.extensions.forms.actions.getCheckoutStatus
>;
export type FirstChargeResult = FunctionReturnType<
  typeof api.commerceSubscriptions.publicCharge.confirmFirstCharge
>;

/** The Stripe object Elements confirmed, or that Stripe named on the return URL. */
export interface StripeConfirmation {
  kind: "payment_intent" | "setup_intent";
  objectId: string;
  clientSecret: string;
}

export type PendingReason = Extract<FirstChargeResult, { status: "pending" }>["reason"];
export type FailureReason =
  | Extract<FirstChargeResult, { status: "failed" }>["reason"]
  | Extract<CheckoutStatus, { state: "failed" }>["reason"]
  | "missing_checkout"
  | "error";

export type CheckoutState =
  | { phase: "preparing" }
  | { phase: "card"; error: string | null }
  | {
      phase: "activating";
      /** 1-based attempt number of the next `confirmFirstCharge` call. */
      attempt: number;
      /** Wait before making that call. */
      delayMs: number;
      confirmation: StripeConfirmation;
    }
  | { phase: "pending"; reason: PendingReason; confirmation: StripeConfirmation }
  | { phase: "failed"; reason: FailureReason; detail?: string }
  | { phase: "done"; paid: boolean; formSubmissionId?: Id<"form_submissions"> };

export type CheckoutEvent =
  | { type: "status"; status: CheckoutStatus }
  | { type: "card_error"; message: string }
  | { type: "stripe_confirmed"; confirmation: StripeConfirmation }
  | { type: "confirm_result"; result: FirstChargeResult }
  | { type: "confirm_error"; retryable: boolean; message: string }
  | { type: "check_again" };

export interface CheckoutContext {
  /** False on the redirect-return page, where no card form is mounted. */
  cardAvailable: boolean;
}

/**
 * Waits before each retry of a `pending` confirmation: after the first call
 * (immediate), retry after 1s, 2s, 4s and 8s — about 15s in all — then show
 * the pending message with a "check again" action.
 */
export const CONFIRM_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000];

/** The wait before attempt `attempt + 1`, or null once retries are exhausted. */
export function nextConfirmDelay(attempt: number): number | null {
  return CONFIRM_RETRY_DELAYS_MS[attempt - 1] ?? null;
}

export const DECLINED_CARD_MESSAGE =
  "Your card was declined. Try another card or payment method.";

/** Where the checkout starts after a successful submit. */
export const INITIAL_CHECKOUT_STATE: CheckoutState = { phase: "preparing" };

/** Where a redirect return starts: confirm what Stripe (or this tab) recorded. */
export function returnedCheckoutState(confirmation: StripeConfirmation | null): CheckoutState {
  return confirmation
    ? { phase: "activating", attempt: 1, delayMs: 0, confirmation }
    : { phase: "failed", reason: "missing_checkout" };
}

function fromStatus(state: CheckoutState, status: CheckoutStatus): CheckoutState {
  switch (status.state) {
    case "none":
      // The form starts no checkout: only meaningful before the card step.
      return state.phase === "preparing" ? { phase: "done", paid: false } : state;
    case "preparing":
      return state;
    case "awaiting_payment":
      return state.phase === "preparing" ? { phase: "card", error: null } : state;
    case "completed":
      // Activated (possibly by the webhook while this page waited).
      return { phase: "done", paid: status.paid };
    case "failed":
      return { phase: "failed", reason: status.reason };
  }
}

function retryOrSettle(
  state: Extract<CheckoutState, { phase: "activating" }>,
  settle: CheckoutState,
): CheckoutState {
  const delayMs = nextConfirmDelay(state.attempt);
  if (delayMs === null) return settle;
  return { ...state, attempt: state.attempt + 1, delayMs };
}

export function reduceCheckout(
  state: CheckoutState,
  event: CheckoutEvent,
  context: CheckoutContext,
): CheckoutState {
  // Terminal states never move.
  if (state.phase === "done" || state.phase === "failed") return state;

  if (event.type === "status") return fromStatus(state, event.status);

  switch (state.phase) {
    case "preparing":
      return state;

    case "card":
      if (event.type === "card_error") return { phase: "card", error: event.message };
      if (event.type === "stripe_confirmed") {
        return { phase: "activating", attempt: 1, delayMs: 0, confirmation: event.confirmation };
      }
      return state;

    case "activating":
      if (event.type === "confirm_error") {
        const failed: CheckoutState = { phase: "failed", reason: "error", detail: event.message };
        return event.retryable ? retryOrSettle(state, failed) : failed;
      }
      if (event.type !== "confirm_result") return state;
      switch (event.result.status) {
        case "active":
          return { phase: "done", paid: true, formSubmissionId: event.result.formSubmissionId };
        case "pending":
          return retryOrSettle(state, {
            phase: "pending",
            reason: event.result.reason,
            confirmation: state.confirmation,
          });
        case "failed":
          // A declined card leaves the same PaymentIntent payable with another card.
          if (event.result.reason === "payment_failed" && context.cardAvailable) {
            return { phase: "card", error: DECLINED_CARD_MESSAGE };
          }
          return { phase: "failed", reason: event.result.reason };
      }

    case "pending":
      if (event.type === "check_again") {
        return { phase: "activating", attempt: 1, delayMs: 0, confirmation: state.confirmation };
      }
      return state;
  }
}

/** What the buyer is told while a checkout is pending. */
export function pendingMessage(reason: PendingReason): string {
  return reason === "account_required"
    ? "Your payment was received. Sign in, or finish creating your account, with the email address you entered on this form to activate your subscription."
    : "Your payment is still being processed. Your subscription activates as soon as it clears, and you can safely leave this page.";
}

/** What the buyer is told when a checkout cannot complete. */
export function failureMessage(reason: FailureReason): string {
  switch (reason) {
    case "sign_in_required":
      return "Sign in, then submit this form again to start your subscription.";
    case "already_subscribed":
      return "You already have an active subscription that includes this. To switch packages, change your plan from your account. You have not been charged.";
    case "unavailable":
      return "We couldn't start checkout for this form. Please try again later or contact us.";
    case "payment_failed":
      return "Your payment didn't go through. Return to the form to try again with another card.";
    case "checkout_closed":
      return "This checkout has expired. Submit the form again to start a new one.";
    case "verification_failed":
      return "We couldn't verify this payment. If you were charged, contact us — you won't be charged twice.";
    case "account_mismatch":
      return "This payment belongs to a different account than the one that started checkout. Please contact us so we can activate it for you.";
    case "missing_checkout":
      return "We couldn't find this checkout in this browser. If you completed payment, your subscription activates automatically shortly.";
    case "error":
      return "We couldn't confirm your payment right now. If you completed payment, your subscription activates automatically shortly.";
  }
}

// ─── Redirect return (Stripe `return_url`) ──────────────────────────────────

/** Query parameters this flow and Stripe put on the return URL. */
export const SUBSCRIPTION_RETURN_PARAMS = [
  "subscription_return",
  "subscription_form",
  "payment_intent",
  "payment_intent_client_secret",
  "setup_intent",
  "setup_intent_client_secret",
  "redirect_status",
] as const;

export interface SubscriptionReturn {
  checkoutIntentId: string;
  formId: string | null;
  /** The object Stripe appended to the return URL, if it redirected. */
  confirmation: StripeConfirmation | null;
  redirectStatus: string | null;
}

/** Read a subscription return from a URL query string, or null. */
export function parseSubscriptionReturn(search: string): SubscriptionReturn | null {
  const params = new URLSearchParams(search);
  const checkoutIntentId = params.get("subscription_return");
  if (!checkoutIntentId) return null;
  const paymentIntent = params.get("payment_intent");
  const paymentSecret = params.get("payment_intent_client_secret");
  const setupIntent = params.get("setup_intent");
  const setupSecret = params.get("setup_intent_client_secret");
  const confirmation: StripeConfirmation | null =
    paymentIntent && paymentSecret
      ? { kind: "payment_intent", objectId: paymentIntent, clientSecret: paymentSecret }
      : setupIntent && setupSecret
        ? { kind: "setup_intent", objectId: setupIntent, clientSecret: setupSecret }
        : null;
  return {
    checkoutIntentId,
    formId: params.get("subscription_form"),
    confirmation,
    redirectStatus: params.get("redirect_status"),
  };
}

/**
 * The same-site path Stripe returns to after a redirect-based payment method,
 * and the `returnTo` for signing in mid-checkout. Carries only ids: Stripe
 * appends its own object id + client secret on redirect.
 */
export function subscriptionReturnPath(
  pathname: string,
  checkoutIntentId: string,
  formId?: string,
): string {
  const params = new URLSearchParams({ subscription_return: checkoutIntentId });
  if (formId) params.set("subscription_form", formId);
  return `${pathname}?${params.toString()}`;
}

/** The query string with this flow's (and Stripe's) return parameters removed. */
export function stripSubscriptionReturn(search: string): string {
  const params = new URLSearchParams(search);
  for (const name of SUBSCRIPTION_RETURN_PARAMS) params.delete(name);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/** The Stripe object id a client secret belongs to (`pi_1_secret_x` → `pi_1`). */
export function clientSecretObjectId(clientSecret: string): string | null {
  const marker = clientSecret.indexOf("_secret_");
  return marker > 0 ? clientSecret.slice(0, marker) : null;
}

/** The confirmation for a client secret Stripe Elements was mounted with. */
export function confirmationFromClientSecret(
  mode: "payment" | "setup",
  clientSecret: string,
): StripeConfirmation | null {
  const objectId = clientSecretObjectId(clientSecret);
  if (!objectId) return null;
  return { kind: mode === "setup" ? "setup_intent" : "payment_intent", objectId, clientSecret };
}

// ─── Per-tab checkout record (sessionStorage) ───────────────────────────────

/**
 * What this tab remembers about a checkout so it can finish after a redirect
 * or a mid-checkout sign-in: which submission (to follow the form's
 * confirmation with its receipt token), the Stripe object, and the action's
 * configured post-payment URL. sessionStorage is per tab and cleared when the
 * tab closes; it is cleared here as soon as the checkout ends.
 */
export interface StoredSubscriptionCheckout {
  checkoutIntentId: string;
  formId: string;
  submissionId: string;
  confirmationToken?: string;
  returnUrl?: string;
  confirmation: StripeConfirmation;
}

/** The slice of `Storage` used here (so tests can pass a Map-backed fake). */
export interface CheckoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_PREFIX = "convexpress:form-subscription-checkout:";

function storageKey(checkoutIntentId: string): string {
  return `${STORAGE_PREFIX}${checkoutIntentId}`;
}

export function writeStoredCheckout(
  storage: CheckoutStorage | null,
  record: StoredSubscriptionCheckout,
): void {
  try {
    storage?.setItem(storageKey(record.checkoutIntentId), JSON.stringify(record));
  } catch {
    // Storage full or blocked: the in-page flow still works without it.
  }
}

export function clearStoredCheckout(storage: CheckoutStorage | null, checkoutIntentId: string): void {
  try {
    storage?.removeItem(storageKey(checkoutIntentId));
  } catch {
    // Nothing to clear.
  }
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function parseConfirmation(value: unknown): StripeConfirmation | null {
  if (typeof value !== "object" || value === null) return null;
  const kind = "kind" in value ? value.kind : undefined;
  const objectId = "objectId" in value ? optionalText(value.objectId) : undefined;
  const clientSecret = "clientSecret" in value ? optionalText(value.clientSecret) : undefined;
  if ((kind !== "payment_intent" && kind !== "setup_intent") || !objectId || !clientSecret) return null;
  return { kind, objectId, clientSecret };
}

export function readStoredCheckout(
  storage: CheckoutStorage | null,
  checkoutIntentId: string,
): StoredSubscriptionCheckout | null {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(storageKey(checkoutIntentId)) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed;
  const storedIntentId = "checkoutIntentId" in record ? optionalText(record.checkoutIntentId) : undefined;
  const formId = "formId" in record ? optionalText(record.formId) : undefined;
  const submissionId = "submissionId" in record ? optionalText(record.submissionId) : undefined;
  const confirmation = "confirmation" in record ? parseConfirmation(record.confirmation) : null;
  if (storedIntentId !== checkoutIntentId || !formId || !submissionId || !confirmation) return null;
  return {
    checkoutIntentId,
    formId,
    submissionId,
    confirmationToken: "confirmationToken" in record ? optionalText(record.confirmationToken) : undefined,
    returnUrl: "returnUrl" in record ? optionalText(record.returnUrl) : undefined,
    confirmation,
  };
}

/** `window.sessionStorage`, or null where it is unavailable (SSR, blocked). */
export function browserCheckoutStorage(): CheckoutStorage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

// ─── confirmFirstCharge errors ──────────────────────────────────────────────

/** Error codes `confirmFirstCharge` throws that asking again cannot fix. */
const FINAL_CONFIRM_ERROR_CODES = new Set(["VALIDATION_ERROR", "NOT_FOUND", "FORBIDDEN"]);

/**
 * Whether a thrown confirmation error is worth retrying: provider outages
 * (`PAYMENT_PROVIDER_UNAVAILABLE`) and network failures (no code) are; a
 * malformed request, an unknown checkout or someone else's checkout are not.
 */
export function isRetryableConfirmError(code: string | undefined): boolean {
  return code === undefined || !FINAL_CONFIRM_ERROR_CODES.has(code);
}
