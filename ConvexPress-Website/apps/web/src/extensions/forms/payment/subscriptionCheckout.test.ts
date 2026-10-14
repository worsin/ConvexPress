/**
 * Form subscription checkout — payment-step state machine + return helpers.
 * Run: `bun test apps/web/src/extensions/forms/payment/subscriptionCheckout.test.ts`
 *
 * Locks the wizard's checkout step: the card step appears only when the server
 * says a card is needed, Stripe success always goes through server
 * confirmation, pending confirmations retry with backoff before explaining
 * what happens next, a declined card returns to the card step, and closed or
 * unverifiable checkouts end with a clear message. Also covers the Stripe
 * redirect-return parsing and the per-tab checkout record.
 */

import { describe, expect, test } from "bun:test";

import { idFromString } from "@/lib/ids";
import {
  CONFIRM_RETRY_DELAYS_MS,
  DECLINED_CARD_MESSAGE,
  INITIAL_CHECKOUT_STATE,
  clearStoredCheckout,
  confirmationFromClientSecret,
  failureMessage,
  isRetryableConfirmError,
  nextConfirmDelay,
  parseSubscriptionReturn,
  pendingMessage,
  readStoredCheckout,
  reduceCheckout,
  returnedCheckoutState,
  stripSubscriptionReturn,
  subscriptionReturnPath,
  writeStoredCheckout,
  type CheckoutEvent,
  type CheckoutState,
  type CheckoutStorage,
  type StripeConfirmation,
} from "./subscriptionCheckout";

const inPage = { cardAvailable: true };
const returnedPage = { cardAvailable: false };
const confirmation: StripeConfirmation = {
  kind: "payment_intent",
  objectId: "pi_123",
  clientSecret: "pi_123_secret_abc",
};
const subscriptionId = idFromString<"commerce_subscriptions">("subscription_1");
const submissionId = idFromString<"form_submissions">("submission_1");

function run(
  events: CheckoutEvent[],
  start: CheckoutState = INITIAL_CHECKOUT_STATE,
  context = inPage,
): CheckoutState {
  return events.reduce((state, event) => reduceCheckout(state, event, context), start);
}

const activating: CheckoutState = { phase: "activating", attempt: 1, delayMs: 0, confirmation };
const pendingResult: CheckoutEvent = {
  type: "confirm_result",
  result: { status: "pending", reason: "processing" },
};

describe("checkout status before the card step", () => {
  test("a form without a checkout finishes straight away", () => {
    expect(run([{ type: "status", status: { state: "none" } }])).toEqual({ phase: "done", paid: false });
  });

  test("the card step appears only once the server has a payment waiting", () => {
    expect(run([{ type: "status", status: { state: "preparing" } }])).toEqual({ phase: "preparing" });
    expect(
      run([
        { type: "status", status: { state: "preparing" } },
        { type: "status", status: { state: "awaiting_payment" } },
      ]),
    ).toEqual({ phase: "card", error: null });
  });

  test("a free subscription completes without a card", () => {
    expect(run([{ type: "status", status: { state: "completed", paid: false } }])).toEqual({
      phase: "done",
      paid: false,
    });
  });

  test("a checkout that needs a signed-in submitter says so", () => {
    expect(run([{ type: "status", status: { state: "failed", reason: "sign_in_required" } }])).toEqual({
      phase: "failed",
      reason: "sign_in_required",
    });
  });

  test("stripe confirmations are ignored until the card step is showing", () => {
    expect(run([{ type: "stripe_confirmed", confirmation }])).toEqual({ phase: "preparing" });
  });
});

describe("card step", () => {
  const card: CheckoutState = { phase: "card", error: null };

  test("a Stripe error keeps the card step with the message", () => {
    expect(run([{ type: "card_error", message: "Your card has insufficient funds." }], card)).toEqual({
      phase: "card",
      error: "Your card has insufficient funds.",
    });
  });

  test("Stripe success always goes through server confirmation first", () => {
    expect(run([{ type: "stripe_confirmed", confirmation }], card)).toEqual(activating);
  });

  test("an activation the webhook finished while the card was showing completes the step", () => {
    expect(run([{ type: "status", status: { state: "completed", paid: true } }], card)).toEqual({
      phase: "done",
      paid: true,
    });
  });
});

describe("server confirmation", () => {
  test("an active subscription finishes with the submission to confirm", () => {
    expect(
      run(
        [
          {
            type: "confirm_result",
            result: { status: "active", subscriptionId, subscriptionStatus: "active", formSubmissionId: submissionId },
          },
        ],
        activating,
      ),
    ).toEqual({ phase: "done", paid: true, formSubmissionId: submissionId });
  });

  test("pending retries with backoff, then explains what happens next", () => {
    const delays: number[] = [];
    let state: CheckoutState = activating;
    for (let i = 0; i < CONFIRM_RETRY_DELAYS_MS.length; i += 1) {
      state = reduceCheckout(state, pendingResult, inPage);
      if (state.phase !== "activating") throw new Error(`expected a retry, got ${state.phase}`);
      delays.push(state.delayMs);
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000]);
    expect(reduceCheckout(state, pendingResult, inPage)).toEqual({
      phase: "pending",
      reason: "processing",
      confirmation,
    });
    expect(nextConfirmDelay(5)).toBeNull();
  });

  test("a guest checkout waiting on its account ends pending with that reason", () => {
    const exhausted: CheckoutState = { ...activating, attempt: CONFIRM_RETRY_DELAYS_MS.length + 1 };
    const result: CheckoutEvent = { type: "confirm_result", result: { status: "pending", reason: "account_required" } };
    expect(run([result], exhausted)).toEqual({ phase: "pending", reason: "account_required", confirmation });
  });

  test("check again starts a fresh confirmation cycle; a later activation completes it", () => {
    const pending: CheckoutState = { phase: "pending", reason: "processing", confirmation };
    expect(run([{ type: "check_again" }], pending)).toEqual(activating);
    expect(run([{ type: "status", status: { state: "completed", paid: true } }], pending)).toEqual({
      phase: "done",
      paid: true,
    });
  });

  test("a declined card returns to the card step in-page, and ends the flow on a return page", () => {
    const declined: CheckoutEvent = { type: "confirm_result", result: { status: "failed", reason: "payment_failed" } };
    expect(run([declined], activating, inPage)).toEqual({ phase: "card", error: DECLINED_CARD_MESSAGE });
    expect(run([declined], activating, returnedPage)).toEqual({ phase: "failed", reason: "payment_failed" });
  });

  test("closed, unverifiable or mismatched checkouts end with that reason", () => {
    for (const reason of ["checkout_closed", "verification_failed", "account_mismatch"] as const) {
      expect(run([{ type: "confirm_result", result: { status: "failed", reason } }], activating)).toEqual({
        phase: "failed",
        reason,
      });
    }
  });

  test("provider outages retry; a refused request does not", () => {
    const outage: CheckoutEvent = { type: "confirm_error", retryable: true, message: "unreachable" };
    expect(run([outage], activating)).toEqual({ ...activating, attempt: 2, delayMs: 1000 });
    expect(run([{ type: "confirm_error", retryable: false, message: "Checkout not found." }], activating)).toEqual({
      phase: "failed",
      reason: "error",
      detail: "Checkout not found.",
    });
    expect(isRetryableConfirmError(undefined)).toBe(true);
    expect(isRetryableConfirmError("PAYMENT_PROVIDER_UNAVAILABLE")).toBe(true);
    for (const code of ["VALIDATION_ERROR", "NOT_FOUND", "FORBIDDEN"]) {
      expect(isRetryableConfirmError(code)).toBe(false);
    }
  });

  test("finished and failed checkouts never move again", () => {
    const done: CheckoutState = { phase: "done", paid: true };
    const failed: CheckoutState = { phase: "failed", reason: "checkout_closed" };
    for (const event of [pendingResult, { type: "check_again" as const }, { type: "status" as const, status: { state: "awaiting_payment" as const } }]) {
      expect(reduceCheckout(done, event, inPage)).toBe(done);
      expect(reduceCheckout(failed, event, inPage)).toBe(failed);
    }
  });

  test("every pending and failure reason has a message", () => {
    for (const reason of ["processing", "account_required"] as const) {
      expect(pendingMessage(reason).length).toBeGreaterThan(20);
    }
    for (const reason of [
      "sign_in_required", "unavailable", "payment_failed", "checkout_closed", "verification_failed",
      "account_mismatch", "missing_checkout", "error",
    ] as const) {
      expect(failureMessage(reason).length).toBeGreaterThan(20);
    }
  });
});

describe("Stripe redirect return", () => {
  test("a payment return names the PaymentIntent and its client secret", () => {
    const parsed = parseSubscriptionReturn(
      "?subscription_return=intent_9&subscription_form=form_1&payment_intent=pi_9&payment_intent_client_secret=pi_9_secret_z&redirect_status=succeeded",
    );
    expect(parsed).toEqual({
      checkoutIntentId: "intent_9",
      formId: "form_1",
      confirmation: { kind: "payment_intent", objectId: "pi_9", clientSecret: "pi_9_secret_z" },
      redirectStatus: "succeeded",
    });
    expect(returnedCheckoutState(parsed?.confirmation ?? null)).toEqual({
      phase: "activating",
      attempt: 1,
      delayMs: 0,
      confirmation: { kind: "payment_intent", objectId: "pi_9", clientSecret: "pi_9_secret_z" },
    });
  });

  test("a setup return names the SetupIntent", () => {
    expect(
      parseSubscriptionReturn("subscription_return=i&setup_intent=seti_1&setup_intent_client_secret=seti_1_secret_a")
        ?.confirmation,
    ).toEqual({ kind: "setup_intent", objectId: "seti_1", clientSecret: "seti_1_secret_a" });
  });

  test("a return without Stripe's parameters has nothing to confirm on its own", () => {
    expect(parseSubscriptionReturn("?subscription_return=i&subscription_form=f")?.confirmation).toBeNull();
    expect(returnedCheckoutState(null)).toEqual({ phase: "failed", reason: "missing_checkout" });
    expect(parseSubscriptionReturn("?payment_intent=pi_1")).toBeNull();
  });

  test("return paths carry only ids, and stripping keeps unrelated parameters", () => {
    expect(subscriptionReturnPath("/forms/join", "intent_1", "form_1")).toBe(
      "/forms/join?subscription_return=intent_1&subscription_form=form_1",
    );
    expect(
      stripSubscriptionReturn(
        "?utm=x&subscription_return=i&subscription_form=f&payment_intent=pi_1&payment_intent_client_secret=s&redirect_status=succeeded",
      ),
    ).toBe("?utm=x");
    expect(stripSubscriptionReturn("?subscription_return=i")).toBe("");
  });

  test("a mounted client secret names its Stripe object", () => {
    expect(confirmationFromClientSecret("payment", "pi_1_secret_a")).toEqual({
      kind: "payment_intent",
      objectId: "pi_1",
      clientSecret: "pi_1_secret_a",
    });
    expect(confirmationFromClientSecret("setup", "seti_1_secret_a")?.kind).toBe("setup_intent");
    expect(confirmationFromClientSecret("payment", "garbage")).toBeNull();
  });
});

describe("per-tab checkout record", () => {
  function memoryStorage(): CheckoutStorage & { size(): number } {
    const map = new Map<string, string>();
    return {
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => {
        map.set(key, value);
      },
      removeItem: (key) => {
        map.delete(key);
      },
      size: () => map.size,
    };
  }
  const record = {
    checkoutIntentId: "intent_1",
    formId: "form_1",
    submissionId: "submission_1",
    confirmationToken: "token_1",
    returnUrl: "/welcome",
    confirmation,
  };

  test("round-trips, and is cleared when the checkout ends", () => {
    const storage = memoryStorage();
    writeStoredCheckout(storage, record);
    expect(readStoredCheckout(storage, "intent_1")).toEqual(record);
    expect(readStoredCheckout(storage, "intent_2")).toBeNull();
    clearStoredCheckout(storage, "intent_1");
    expect(storage.size()).toBe(0);
  });

  test("a tampered or malformed record is ignored", () => {
    const storage = memoryStorage();
    const key = "convexpress:form-subscription-checkout:intent_1";
    for (const raw of [
      "not json",
      JSON.stringify({ ...record, checkoutIntentId: "intent_other" }),
      JSON.stringify({ ...record, confirmation: { kind: "charge", objectId: "x", clientSecret: "y" } }),
      JSON.stringify({ ...record, submissionId: 42 }),
    ]) {
      storage.setItem(key, raw);
      expect(readStoredCheckout(storage, "intent_1")).toBeNull();
    }
  });

  test("blocked storage never breaks the checkout", () => {
    const blocked: CheckoutStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    writeStoredCheckout(blocked, record);
    clearStoredCheckout(blocked, "intent_1");
    expect(readStoredCheckout(blocked, "intent_1")).toBeNull();
    expect(readStoredCheckout(null, "intent_1")).toBeNull();
  });
});
