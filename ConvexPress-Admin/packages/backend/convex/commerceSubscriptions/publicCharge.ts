"use node";
/**
 * Public-facing first-charge actions for subscription checkout.
 *
 * `beginFirstCharge` wraps the internal `beginSubscriptionFirstCharge` action.
 * The website calls it after `createCheckoutIntent` has returned a checkout
 * intent id. It creates the Stripe Customer + PaymentIntent (with
 * `setup_future_usage: off_session`) and returns the `client_secret` so Stripe
 * Elements can confirm the card. Starting a charge never activates anything.
 *
 * `confirmFirstCharge` is the server-verified activation the website calls
 * once Stripe Elements reports success (in-page, or on the `return_url` after a
 * redirect). It does not take the browser's word for anything: it retrieves the
 * PaymentIntent/SetupIntent from Stripe with the secret key, checks it against
 * the intent (`firstChargeConfirmation.ts`), and activates through the SAME
 * internal path as the signature-verified webhook. Whichever arrives first
 * activates; the other replays the existing contract. This gives the buyer
 * access immediately instead of waiting on webhook delivery.
 *
 * Both are `action`s (not internalActions) so signed-out visitors can pay for
 * the intent they just created. Node-runtime actions can't touch the DB
 * directly, so access is decided by internal queries that run with the
 * caller's identity: an intent created by (or for) a signed-in account can only
 * be paid and confirmed from that account. A guest intent is addressed by its
 * unguessable id, and confirming it also requires the Stripe client secret
 * issued for it.
 */

import { ConvexError, v } from "convex/values";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  clientSecretObjectId,
  decideFirstChargeConfirmation,
  type RetrievedFirstCharge,
} from "./firstChargeConfirmation";
import { getStripeSecretKey } from "./stripeCharge";
import {
  firstChargeConfirmationValidator,
  type ActivationResult,
  type FirstChargeConfirmation,
} from "./validators";

export const beginFirstCharge = action({
  args: {
    checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
  },
  returns: v.object({
    clientSecret: v.union(v.null(), v.string()),
    paymentIntentId: v.string(),
    amount: v.number(),
    currency: v.string(),
    stripeCustomerId: v.string(),
    mode: v.union(v.literal("payment"), v.literal("setup")),
  }),
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(
      internal.commerceSubscriptions.checkout.getChargeStartAccess,
      { intentId: args.checkoutIntentId },
    );
    if (!access.allowed) {
      throw new ConvexError({
        code: access.reason === "not_owner" ? "FORBIDDEN" : "INTENT_NOT_PAYABLE",
        message:
          access.reason === "not_owner"
            ? "This checkout belongs to another account."
            : "This checkout can no longer be paid. Start a new checkout.",
      });
    }
    return await ctx.runAction(
      internal.commerceSubscriptions.stripeCharge.beginSubscriptionFirstCharge,
      { checkoutIntentId: args.checkoutIntentId },
    );
  },
});

// ─── confirmFirstCharge ─────────────────────────────────────────────────────

type ConfirmationTarget = { kind: "payment_intent" | "setup_intent"; id: string };

const STRIPE_ID_PATTERN = {
  payment_intent: /^pi_[A-Za-z0-9]{1,200}$/,
  setup_intent: /^seti_[A-Za-z0-9]{1,200}$/,
} as const;

function invalidArguments(message: string): ConvexError<{ code: string; message: string }> {
  return new ConvexError({ code: "VALIDATION_ERROR", message });
}

/** Exactly one well-formed Stripe id, matching the client secret's object. */
function confirmationTarget(args: {
  paymentIntentId?: string;
  setupIntentId?: string;
  clientSecret: string;
}): ConfirmationTarget {
  let target: ConfirmationTarget;
  if (args.paymentIntentId !== undefined && args.setupIntentId === undefined) {
    target = { kind: "payment_intent", id: args.paymentIntentId };
  } else if (args.setupIntentId !== undefined && args.paymentIntentId === undefined) {
    target = { kind: "setup_intent", id: args.setupIntentId };
  } else {
    throw invalidArguments("Pass exactly one of paymentIntentId or setupIntentId.");
  }
  if (!STRIPE_ID_PATTERN[target.kind].test(target.id)) {
    throw invalidArguments("The Stripe payment id is not well formed.");
  }
  if (clientSecretObjectId(args.clientSecret) !== target.id) {
    throw invalidArguments("The client secret does not belong to this payment.");
  }
  return target;
}

/** The id of a Stripe reference that may be expanded into an object. */
function stripeRefId(ref: string | { id: string } | null): string | undefined {
  if (ref === null) return undefined;
  return typeof ref === "string" ? ref : ref.id;
}

/** A field Stripe puts on a thrown StripeError, read without trusting its shape. */
function stripeErrorField(err: unknown, key: "code" | "type"): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const value =
    key === "code"
      ? "code" in err ? err.code : undefined
      : "type" in err ? err.type : undefined;
  return typeof value === "string" ? value : undefined;
}

/**
 * Retrieve the PaymentIntent/SetupIntent from Stripe with the secret key.
 * Returns null when Stripe has no such object.
 */
async function retrieveFirstCharge(
  stripeKey: string,
  target: ConfirmationTarget,
): Promise<RetrievedFirstCharge | null> {
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(stripeKey);
  try {
    if (target.kind === "payment_intent") {
      const intent = await stripe.paymentIntents.retrieve(target.id);
      return {
        kind: "payment_intent",
        id: intent.id,
        status: intent.status,
        clientSecret: intent.client_secret,
        metadata: intent.metadata,
        customerId: stripeRefId(intent.customer),
        paymentMethodId: stripeRefId(intent.payment_method),
        amount: intent.amount,
        amountReceived: intent.amount_received,
        currency: intent.currency,
      };
    }
    const intent = await stripe.setupIntents.retrieve(target.id);
    return {
      kind: "setup_intent",
      id: intent.id,
      status: intent.status,
      clientSecret: intent.client_secret,
      metadata: intent.metadata ?? {},
      customerId: stripeRefId(intent.customer),
      paymentMethodId: stripeRefId(intent.payment_method),
    };
  } catch (err) {
    if (stripeErrorField(err, "code") === "resource_missing") return null;
    console.error(
      "[confirmFirstCharge] Stripe retrieve failed:",
      stripeErrorField(err, "type") ?? "unknown_error",
      stripeErrorField(err, "code") ?? "",
    );
    throw new ConvexError({
      code: "PAYMENT_PROVIDER_UNAVAILABLE",
      message: "The payment provider could not be reached. Please try again.",
    });
  }
}

/** The `code` of a ConvexError thrown by an activation, if any. */
function convexErrorCode(err: unknown): string | undefined {
  if (!(err instanceof ConvexError)) return undefined;
  const data: unknown = err.data;
  if (typeof data !== "object" || data === null || !("code" in data)) return undefined;
  return typeof data.code === "string" ? data.code : undefined;
}

/**
 * Activate a checkout intent from its first charge, verified with Stripe.
 *
 * Args: the checkout intent id, EXACTLY ONE of `paymentIntentId` /
 * `setupIntentId`, and the `clientSecret` Stripe issued for that object (the
 * value Stripe Elements confirmed with, also appended by Stripe to the
 * `return_url` after a redirect).
 *
 * Activates only when the caller may act for the intent (its own account, or
 * the client-secret holder of a guest intent) and the retrieved object
 * belongs to the intent and its Stripe customer, has `succeeded`, and (for a
 * PaymentIntent) received exactly the intent's initial amount in its currency.
 * Idempotent with the webhook.
 *
 * Returns `active` (with the contract), `pending` (Stripe still processing, or
 * a guest checkout whose email has no verified account yet: ask again later)
 * or `failed` (declined card, closed checkout, or a payment that does not
 * settle this checkout).
 *
 * Throws `VALIDATION_ERROR` (malformed arguments), `NOT_FOUND` (no such
 * checkout), `FORBIDDEN` (not the caller's checkout) or
 * `PAYMENT_PROVIDER_UNAVAILABLE` (Stripe unreachable or not configured).
 */
export const confirmFirstCharge = action({
  args: {
    checkoutIntentId: v.string(),
    paymentIntentId: v.optional(v.string()),
    setupIntentId: v.optional(v.string()),
    clientSecret: v.string(),
  },
  returns: firstChargeConfirmationValidator,
  handler: async (ctx, args): Promise<FirstChargeConfirmation> => {
    const target = confirmationTarget(args);
    const access = await ctx.runQuery(
      internal.commerceSubscriptions.checkout.getFirstChargeConfirmAccess,
      { checkoutIntentRef: args.checkoutIntentId },
    );
    if (!access.allowed) {
      throw access.reason === "not_owner"
        ? new ConvexError({ code: "FORBIDDEN", message: "This checkout belongs to another account." })
        : new ConvexError({ code: "NOT_FOUND", message: "Checkout not found." });
    }

    const stripeKey = await getStripeSecretKey(ctx);
    if (!stripeKey) {
      throw new ConvexError({
        code: "PAYMENT_PROVIDER_UNAVAILABLE",
        message: "Payments are not configured on this site.",
      });
    }
    const observed = await retrieveFirstCharge(stripeKey, target);
    if (!observed) return { status: "failed", reason: "verification_failed" };

    const decision = decideFirstChargeConfirmation(
      {
        checkoutIntentId: String(access.intentId),
        intentStatus: access.status,
        initialAmount: access.initialAmount,
        currencyCode: access.currencyCode,
        stripeCustomerId: access.stripeCustomerId,
        paymentTransactionId: access.paymentTransactionId,
      },
      observed,
      args.clientSecret,
    );
    if (decision.outcome === "forbidden") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "This payment was not started by this checkout session.",
      });
    }
    if (decision.outcome === "pending") return { status: "pending", reason: decision.reason };
    if (decision.outcome === "failed") return { status: "failed", reason: decision.reason };

    // The same activation path the webhook takes for each mode.
    const settlement = decision.settlement;
    let activation: ActivationResult | null;
    try {
      activation =
        settlement.kind === "payment_intent"
          ? await ctx.runMutation(
              internal.commerceSubscriptions.internals.activateCheckoutIntentFromStripe,
              {
                checkoutIntentRef: settlement.checkoutIntentRef,
                paymentIntentId: settlement.paymentIntentId,
                paymentIntentStatus: settlement.paymentIntentStatus,
                amountReceived: settlement.amountReceived,
                currency: settlement.currency,
                paymentMethodId: settlement.paymentMethodId,
                stripeCustomerId: settlement.stripeCustomerId,
              },
            )
          : await ctx.runAction(
              internal.commerceSubscriptions.stripeCharge.saveSetupIntentResult,
              {
                checkoutIntentRef: settlement.checkoutIntentRef,
                stripeCustomerId: settlement.stripeCustomerId,
                paymentMethodId: settlement.paymentMethodId,
                setupIntentId: settlement.setupIntentId,
                activateCheckout: true,
              },
            );
    } catch (err) {
      switch (convexErrorCode(err)) {
        case "USER_NOT_FOUND":
          return { status: "pending", reason: "account_required" };
        case "ACCOUNT_MISMATCH":
          return { status: "failed", reason: "account_mismatch" };
        case "PAYMENT_MISMATCH":
          return { status: "failed", reason: "verification_failed" };
        case "INTENT_ALREADY_PROCESSED":
          return { status: "failed", reason: "checkout_closed" };
        default:
          throw err;
      }
    }
    if (!activation) return { status: "failed", reason: "verification_failed" };
    return {
      status: "active",
      subscriptionId: activation.contractId,
      subscriptionStatus: activation.status,
      formSubmissionId: access.formSubmissionId,
    };
  },
});
