/**
 * ConvexPress Forms — Commerce & Subscription Action (the money kernel).
 *
 * Registers the `subscription` (and `payment`) action types into the Form
 * Actions & Feeds registry. The action DRIVES the existing commerceSubscriptions
 * flow — it does NOT reimplement billing:
 *
 *   createCheckoutIntentForSubmission → server recomputes the price + persists an
 *                                       intent bound to the submission's signed-in
 *                                       submitter (account policy enforced here)
 *   beginSubscriptionFirstCharge      → Stripe Customer + PaymentIntent (paid + live)
 *   activateFreeIntentForSubmission   → contract + entitlements (ZERO-amount path only
 *                                       here; membership grant auto-delegates inside it)
 *
 * NON-NEGOTIABLE INVARIANTS:
 *   - Never double-charge · never double-activate · server-authoritative price
 *     only · no card data server-side · PAID activation only after the server
 *     verified the payment with Stripe.
 *
 * The PAID path is the spiky core: `run()` STARTS the charge and returns a
 * NON-terminal `awaitingPayment` outcome. The runner records the run as
 * `awaiting_payment` (no retry, no `form.action_failed`). The intent is
 * activated later through the internal `checkout.activateFromIntent`, by
 * whichever verified path arrives first: the signature-verified Stripe webhook,
 * or `publicCharge.confirmFirstCharge` (the Website calls it after Stripe
 * Elements succeeds; it retrieves the PaymentIntent/SetupIntent from Stripe).
 * That activation completes this run and emits `form.action_completed`
 * (`checkoutRuns.ts`). The action NEVER activates a paid intent.
 *
 * Account policy (`accountPolicy`), enforced server-side when the intent is
 * created: `require_existing` needs a signed-in submitter; `create_on_website`
 * also accepts a signed-out submission, whose paid checkout is activated only
 * for the VERIFIED owner of the email typed into the form. A signed-in
 * submitter is always the intent's account.
 *
 * The ZERO-amount path activates through `checkout.activateFreeIntentForSubmission`.
 * The runner has no caller identity, so the subscription belongs to the
 * signed-in user the server recorded on the submission. An anonymous
 * submission cannot claim one (the visitor signs in and submits again) — an
 * email typed into the form is never proof of account ownership.
 *
 * Idempotency (anti-double-charge):
 *   - Layer 1 (runner): a `completed` run never re-fires.
 *   - Layer 2 (this file): before creating an intent, `run()` reuses an intentId
 *     already stored on this submission's prior run result (so a re-emit / retry
 *     of an `awaiting_payment` run reuses the SAME intent → SAME PaymentIntent).
 *     A `by_form_submission` index + `getIntentBySubmission` query on the
 *     subscription side would be stronger, but that table's indexes are the
 *     subscription system's to own; the per-run reuse here is the additive guard.
 *   - Layer 3 (free): activation's intent-status guard is idempotent.
 *
 * A guest (`create_on_website`) completes signup on the Website with the email
 * typed into the form; until that account is verified, activation reports
 * `USER_NOT_FOUND` (the webhook retries, `confirmFirstCharge` answers pending).
 *
 * `emitSubscriptionStarted` is an internalMutation wrapper because a Convex
 * action ctx cannot call `emitEvent` (needs MutationCtx) — mirrors the
 * media/internals emit-wrapper + actions.ts:emitActionEvent.
 */

import { z } from "zod";
import { v } from "convex/values";
import { emitEvent } from "../../helpers/events";
import { FORM_EVENTS, SYSTEM } from "../../events/constants";
import { internalMutation, internalQuery } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import {
  registerActionType,
  type ActionResult,
  type ActionRunContext,
} from "./actionRegistry";
import { normalizeFormReturnUrl } from "./redirects";

// ─── Config + Zod boundary ───────────────────────────────────────────────────

/**
 * Subscription action config. The offer is either fixed (one offer for every
 * submission) or resolved from a field's submitted value (a select whose option
 * values are offer ids, optionally remapped via `offerFieldMap`).
 */
export const subscriptionConfigSchema = z
  .object({
    offerMode: z.enum(["fixed", "fromField"]),
    offerId: z.string().min(1).optional(),
    offerFieldName: z.string().min(1).optional(),
    /** optionValue -> offerId remap (when fromField). */
    offerFieldMap: z.record(z.string(), z.string()).optional(),
    /** fieldKey carrying the customer email. */
    emailFieldName: z.string().min(1),
    couponMode: z.enum(["none", "fixed", "fromField"]).optional(),
    couponFieldName: z.string().min(1).optional(),
    couponCode: z.string().min(1).optional(),
    accountPolicy: z.enum(["require_existing", "create_on_website"]),
    returnUrl: z
      .string()
      .min(1)
      .refine((value) => normalizeFormReturnUrl(value) !== undefined, {
        message: "Return URL must be a local path or HTTP(S) URL.",
      })
      .optional(),
    /** Server-amount ceiling (integer cents). A charge above this is refused. */
    maxInitialAmount: z.number().int().nonnegative().optional(),
  })
  .refine(
    (c) => c.offerMode !== "fixed" || (c.offerId && c.offerId.length > 0),
    { message: "A fixed offer requires offerId.", path: ["offerId"] },
  )
  .refine(
    (c) =>
      c.offerMode !== "fromField" ||
      (c.offerFieldName && c.offerFieldName.length > 0),
    {
      message: "A from-field offer requires offerFieldName.",
      path: ["offerFieldName"],
    },
  );

export type SubscriptionActionConfig = z.infer<typeof subscriptionConfigSchema>;

/**
 * Resolve the per-submission inputs from config + committed answers.
 * - offer: fixed → offerId; fromField → map[optionValue] ?? optionValue.
 * - email: trimmed value of emailFieldName.
 * - coupon: by mode (fixed code / field value / none).
 */
export function resolveInputs(
  config: SubscriptionActionConfig,
  values: Record<string, string>,
): { offerId?: string; customerEmail?: string; couponCode?: string } {
  let offerId: string | undefined;
  if (config.offerMode === "fixed") {
    offerId = config.offerId;
  } else if (config.offerFieldName) {
    const raw = (values[config.offerFieldName] ?? "").trim();
    if (raw) {
      offerId =
        config.offerFieldMap && config.offerFieldMap[raw] !== undefined
          ? config.offerFieldMap[raw]
          : raw;
    }
  }

  const customerEmail = (values[config.emailFieldName] ?? "").trim() || undefined;

  let couponCode: string | undefined;
  const mode = config.couponMode ?? "none";
  if (mode === "fixed") {
    couponCode = config.couponCode?.trim() || undefined;
  } else if (mode === "fromField" && config.couponFieldName) {
    couponCode = (values[config.couponFieldName] ?? "").trim() || undefined;
  }

  return { offerId, customerEmail, couponCode };
}

// ─── Pure pricing → charge-shape mapping (server-trusted integer cents) ──────
//
// The amounts here are ALWAYS the server-recomputed price (integer cents) read
// from the persisted checkout intent / createCheckoutIntent return — NEVER a
// client-supplied value. This function is pure + synchronous and decides the
// three mutually-exclusive billing shapes the downstream Stripe call takes, so
// the mapping can be unit-tested without a Convex/Stripe context. It mirrors the
// branch in commerceSubscriptions/stripeCharge.ts:beginSubscriptionFirstCharge:
//
//   initialAmount <= 0 && recurringAmount <= 0  → "free"    (no Stripe object)
//   initialAmount <= 0 && recurringAmount  > 0  → "setup"   (collect card, $0 now)
//   initialAmount  > 0                          → "payment" (charge now)
//
// `recurringInterval` is carried through for the recurring (setup/payment-with-
// -recurring) shapes so the renderer / Stripe price_data can describe the
// subscription cadence. A non-positive amount never becomes a positive charge.

/** A normalized, Stripe-aligned charge shape derived purely from server pricing. */
export interface ChargeShape {
  /** "free" → zero checkout; "setup" → $0 now + future recurring; "payment" → charge now. */
  mode: "free" | "setup" | "payment";
  /** Integer cents charged NOW (always 0 for free/setup). */
  amountNow: number;
  /** Integer cents billed each recurring period (0 for one-time / free). */
  recurringAmount: number;
  /** Recurring cadence, when recurring; undefined for one-time / free. */
  recurringInterval?: "day" | "week" | "month" | "year";
  /** Uppercase ISO currency (defaulted to USD when absent/blank). */
  currency: string;
  /** True when this submission requires the Website to confirm a card. */
  needsPayment: boolean;
}

/** Coerce an amount to a safe non-negative integer cents value (NaN/neg → 0). */
function toCents(amount: unknown): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

/**
 * Map server-trusted pricing (integer cents) to the charge shape. Inputs are the
 * intent's recomputed amounts; this never reads a client value. Negative,
 * NaN, or fractional inputs are clamped to a safe non-negative integer so a
 * malformed price can never invert the free/paid decision or mint a charge.
 */
export function pricingToChargeShape(input: {
  initialAmount: number;
  recurringAmount?: number;
  currency?: string;
  recurringInterval?: "day" | "week" | "month" | "year";
}): ChargeShape {
  const amountNow = toCents(input.initialAmount);
  const recurringAmount = toCents(input.recurringAmount);
  const currency = (input.currency ?? "USD").trim().toUpperCase() || "USD";
  const hasRecurring = recurringAmount > 0;
  const recurringInterval = hasRecurring ? input.recurringInterval : undefined;

  if (amountNow <= 0 && recurringAmount <= 0) {
    return { mode: "free", amountNow: 0, recurringAmount: 0, currency, needsPayment: false };
  }
  if (amountNow <= 0) {
    // $0 due now but a recurring charge follows → collect a card via setup.
    return {
      mode: "setup",
      amountNow: 0,
      recurringAmount,
      recurringInterval,
      currency,
      needsPayment: true,
    };
  }
  return {
    mode: "payment",
    amountNow,
    recurringAmount,
    recurringInterval,
    currency,
    needsPayment: true,
  };
}

// ─── Event wrapper (action ctx cannot emitEvent) ─────────────────────────────

export const emitSubscriptionStarted = internalMutation({
  args: {
    formId: v.id("forms"),
    submissionId: v.id("form_submissions"),
    checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
    offerId: v.string(),
    customerEmail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await emitEvent(ctx, FORM_EVENTS.SUBSCRIPTION_STARTED, SYSTEM.FORMS, {
      formId: args.formId,
      submissionId: args.submissionId,
      checkoutIntentId: args.checkoutIntentId,
      offerId: args.offerId,
      customerEmail: args.customerEmail,
    });
  },
});

// ─── Shared orchestration (used by subscription + payment) ───────────────────

/**
 * The run error recorded when a checkout needs a signed-in submitter. Stable:
 * `actions.getCheckoutStatus` recognises it to tell the Website to sign in.
 */
export const SIGN_IN_REQUIRED_ERROR =
  "Sign in before submitting this form to start this subscription.";

/** Map a permanent ConvexError code → a non-retryable failure result. */
const PERMANENT_CODES = new Set([
  "OFFER_ARCHIVED",
  "OFFER_UNAVAILABLE",
  "COUPON_INVALID",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "FORBIDDEN",
  "PAYMENT_REQUIRED",
  "INTENT_ALREADY_PROCESSED",
]);

/** Extract a ConvexError `data.code`, if any. */
function errorCode(err: unknown): string | undefined {
  const e = err as { data?: { code?: string } };
  return e?.data?.code;
}

/** Extract a human message from a ConvexError / Error. */
function errorMessage(err: unknown): string {
  const e = err as { data?: { message?: string } };
  if (e?.data?.message) return e.data.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Core run() shared by `subscription` and `payment`. `kind` only affects copy.
 */
async function runSubscriptionAction(
  ctx: ActionRunContext,
  rawConfig: unknown,
): Promise<ActionResult> {
  const parsed = subscriptionConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    return {
      ok: false,
      retryable: false,
      error: parsed.error.issues[0]?.message ?? "Invalid subscription config.",
    };
  }
  const config = parsed.data;
  const returnUrl = normalizeFormReturnUrl(config.returnUrl);

  const { offerId, customerEmail, couponCode } = resolveInputs(
    config,
    ctx.values,
  );
  if (!offerId) {
    return {
      ok: false,
      retryable: false,
      error: "Could not resolve an offer from the submission.",
    };
  }

  // Account policy is enforced when the intent is created
  // (`createCheckoutIntentForSubmission`): the intent belongs to the signed-in
  // submitter the server recorded on the submission, and `require_existing`
  // refuses a signed-out submission before any charge starts. The policy is
  // also surfaced in the result so the renderer can branch.

  // ── Idempotency layer 2: reuse an intentId stored on a prior run ──────────
  // A re-emit / retry of an awaiting_payment run must reuse the SAME intent so
  // we never mint a second PaymentIntent. The runner stores run.result; we read
  // the latest run for this submission+action via an internal query.
  const priorIntentId = await ctx.ctx
    .runQuery(internal.extensions.forms.commerce.getPriorIntentId, {
      submissionId: ctx.submissionId,
    })
    .catch(() => null);

  let intentId: Id<"commerce_subscription_checkout_intents"> | undefined =
    priorIntentId ?? undefined;
  let amount = 0;
  let recurringAmount = 0;
  let currency = "USD";

  if (!intentId) {
    // ── Call 1: create the checkout intent (server recomputes price) ────────
    const resolvedOfferId = await ctx.ctx.runQuery(
      internal.extensions.forms.commerce.resolveOfferId,
      { offerId },
    );
    if (!resolvedOfferId) {
      return {
        ok: false,
        retryable: false,
        error: "The configured subscription offer does not exist.",
      };
    }
    let created: FunctionReturnType<
      typeof internal.commerceSubscriptions.checkout.createCheckoutIntentForSubmission
    >;
    try {
      // The form linkage and the owning account come from the submission.
      created = await ctx.ctx.runMutation(
        internal.commerceSubscriptions.checkout.createCheckoutIntentForSubmission,
        {
          submissionId: ctx.submissionId,
          offerId: resolvedOfferId,
          customerEmail,
          couponCode,
          returnUrl,
          accountPolicy: config.accountPolicy,
        },
      );
    } catch (err) {
      const code = errorCode(err);
      if (code && PERMANENT_CODES.has(code)) {
        return { ok: false, retryable: false, error: errorMessage(err) };
      }
      // Unknown → let the framework retry (transient).
      throw err;
    }
    if (!created.ok) {
      return { ok: false, retryable: false, error: SIGN_IN_REQUIRED_ERROR };
    }
    const intent = created.intent;

    intentId = intent.intentId;
    amount = intent.amount;
    recurringAmount = intent.recurringAmount;
    currency = intent.currency;

    // maxInitialAmount cap — server amount only, BEFORE any charge.
    if (
      config.maxInitialAmount !== undefined &&
      amount > config.maxInitialAmount
    ) {
      return {
        ok: false,
        retryable: false,
        error: `Initial amount ${amount} exceeds the configured cap ${config.maxInitialAmount}.`,
      };
    }

    // Funnel event — after intent creation (needs the form the run belongs to).
    if (ctx.formId) {
      await ctx.ctx.runMutation(
        internal.extensions.forms.commerce.emitSubscriptionStarted,
        {
          formId: ctx.formId,
          submissionId: ctx.submissionId,
          checkoutIntentId: intent.intentId,
          offerId,
          customerEmail,
        },
      );
    }
  } else {
    // Reusing a prior intent — re-read its pricing for the cap/return shape.
    const snapshot = await ctx.ctx
      .runQuery(internal.extensions.forms.commerce.getIntentPricing, {
        intentId,
      })
      .catch(() => null);
    if (snapshot) {
      amount = snapshot.amount;
      recurringAmount = snapshot.recurringAmount;
      currency = snapshot.currency;
    }
  }

  // ── Zero-amount path: free activation (action owns this) ──────────────────
  // Route the free/paid decision through the pure, unit-tested mapping so the
  // server-recomputed cents are the ONLY thing that picks the branch. The
  // activation itself re-checks that every server-computed amount is 0.
  const chargeShape = pricingToChargeShape({
    initialAmount: amount,
    recurringAmount,
    currency,
  });
  const activateFree = async (
    checkoutIntentId: Id<"commerce_subscription_checkout_intents">,
  ): Promise<ActionResult> => {
    try {
      const activation = await ctx.ctx.runMutation(
        internal.commerceSubscriptions.checkout.activateFreeIntentForSubmission,
        { intentId: checkoutIntentId, submissionId: ctx.submissionId },
      );
      if (!activation.ok) {
        return { ok: false, retryable: false, error: SIGN_IN_REQUIRED_ERROR };
      }
      return {
        ok: true,
        data: {
          intentId: checkoutIntentId,
          contractId: activation.contractId,
          status: activation.status,
          amount: 0,
          recurringAmount,
          currency,
          paid: false,
        },
      };
    } catch (err) {
      const code = errorCode(err);
      if (code && PERMANENT_CODES.has(code)) {
        return { ok: false, retryable: false, error: errorMessage(err) };
      }
      return { ok: false, retryable: true, error: errorMessage(err) };
    }
  };
  if (chargeShape.mode === "free") {
    return await activateFree(intentId);
  }

  // ── Paid path: start the charge, return NON-terminal awaiting_payment ─────
  // The action NEVER activates a paid intent: the server-verified activation
  // (webhook or confirmFirstCharge) does, and completes this run.
  let clientSecret: string | null | undefined;
  let mode: "payment" | "setup" | undefined;
  try {
    const charge = await ctx.ctx.runAction(
      internal.commerceSubscriptions.stripeCharge.beginSubscriptionFirstCharge,
      { checkoutIntentId: intentId },
    );
    clientSecret = charge.clientSecret;
    mode = charge.mode;
  } catch (err) {
    const msg = errorMessage(err);
    // Pricing changed under us to zero → fall back to free activation, which
    // re-verifies the zero price server-side.
    if (msg.includes("no_charge_needed_free_initial_amount")) {
      return await activateFree(intentId);
    }
    // An activated/failed intent can never be charged again.
    if (msg.includes("checkout_intent_not_payable")) {
      return { ok: false, retryable: false, error: "This checkout can no longer be paid." };
    }
    // Otherwise transient — let the framework retry the charge start.
    return { ok: false, retryable: true, error: msg };
  }

  if (!clientSecret) {
    return { ok: false, retryable: true, error: "Could not start payment." };
  }

  // Read the publishable key + live gate for the Website Elements surface.
  const charging = await ctx.ctx
    .runQuery(api.commerceSubscriptions.queries.getLiveChargingStatus, {})
    .catch(() => null);

  // Return the NON-terminal outcome so the runner records awaiting_payment
  // (no retry, no failed event). The Website mounts Stripe Elements from this
  // descriptor and, once the card confirms, asks `confirmFirstCharge` to
  // activate; the webhook activates too if it arrives first.
  return {
    ok: false,
    retryable: false,
    awaitingPayment: true,
    error: "AWAITING_PAYMENT",
    data: {
      needsPayment: true,
      intentId,
      clientSecret,
      publishableKey: charging?.publishableKey ?? null,
      mode: mode ?? "payment",
      amount,
      recurringAmount,
      currency,
      accountPolicy: config.accountPolicy,
      returnUrl,
    },
  };
}

// ─── Internal queries for idempotency layer 2 ────────────────────────────────

/**
 * Latest stored intentId for this submission across its action runs. Reads the
 * runs (newest first) and returns the first `result.intentId` it finds (an
 * awaiting_payment or prior commerce run). Returns null when none — so a fresh
 * submission creates exactly one intent, and a re-emit/retry reuses it.
 */
export const getPriorIntentId = internalQuery({
  args: { submissionId: v.id("form_submissions") },
  returns: v.union(v.null(), v.id("commerce_subscription_checkout_intents")),
  handler: async (
    ctx,
    { submissionId },
  ): Promise<Id<"commerce_subscription_checkout_intents"> | null> => {
    const runs = await ctx.db
      .query("form_action_runs")
      .withIndex("by_submission", (q) => q.eq("submissionId", submissionId))
      .order("desc")
      .collect();
    for (const run of runs) {
      if (!run.result) continue;
      try {
        const parsed: unknown = JSON.parse(run.result);
        const storedId =
          typeof parsed === "object" && parsed !== null && "intentId" in parsed
            ? parsed.intentId
            : undefined;
        const intentId =
          typeof storedId === "string"
            ? ctx.db.normalizeId("commerce_subscription_checkout_intents", storedId)
            : null;
        if (intentId) return intentId;
      } catch {
        // skip malformed
      }
    }
    return null;
  },
});

/** Resolve a configured offer id string to a stored offer, or null. */
export const resolveOfferId = internalQuery({
  args: { offerId: v.string() },
  returns: v.union(v.null(), v.id("commerce_subscription_offers")),
  handler: async (ctx, { offerId }) => {
    return ctx.db.normalizeId("commerce_subscription_offers", offerId);
  },
});

/** Read a checkout intent's pricing snapshot (for the reuse branch). */
export const getIntentPricing = internalQuery({
  args: { intentId: v.id("commerce_subscription_checkout_intents") },
  returns: v.union(v.null(), v.object({ amount: v.number(), recurringAmount: v.number(), currency: v.string() })),
  handler: async (
    ctx,
    { intentId },
  ): Promise<{ amount: number; recurringAmount: number; currency: string } | null> => {
    const intent = await ctx.db.get(intentId);
    if (!intent) return null;
    return {
      amount: intent.initialAmount ?? 0,
      recurringAmount: intent.recurringAmount ?? 0,
      currency: intent.currencyCode ?? "USD",
    };
  },
});

// ─── Register the action types ───────────────────────────────────────────────

registerActionType<Record<string, unknown>>({
  type: "subscription",
  label: "Start Subscription",
  validateConfig(config) {
    const parsed = subscriptionConfigSchema.safeParse(config);
    if (parsed.success) return { valid: true };
    return {
      valid: false,
      error: parsed.error.issues[0]?.message ?? "Invalid subscription config.",
    };
  },
  run(ctx, rawConfig) {
    return runSubscriptionAction(ctx, rawConfig);
  },
});

registerActionType<Record<string, unknown>>({
  type: "payment",
  label: "One-time Payment",
  validateConfig(config) {
    const parsed = subscriptionConfigSchema.safeParse(config);
    if (parsed.success) return { valid: true };
    return {
      valid: false,
      error: parsed.error.issues[0]?.message ?? "Invalid payment config.",
    };
  },
  run(ctx, rawConfig) {
    // Same orchestration; the offer is expected to carry recurringAmount:0.
    return runSubscriptionAction(ctx, rawConfig);
  },
});
