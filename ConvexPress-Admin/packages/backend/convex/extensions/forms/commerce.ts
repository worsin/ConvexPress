/**
 * ConvexPress Forms — Commerce & Subscription Action (the money kernel).
 *
 * Registers the `subscription` (and `payment`) action types into the Form
 * Actions & Feeds registry. The action DRIVES the existing commerceSubscriptions
 * flow — it does NOT reimplement billing:
 *
 *   createCheckoutIntent  → server recomputes the price + persists an intent
 *   beginFirstCharge      → Stripe Customer + PaymentIntent (paid + live)
 *   activateFromIntent    → contract + entitlements (ZERO-amount path only here;
 *                           membership grant auto-delegates inside it)
 *
 * NON-NEGOTIABLE INVARIANTS:
 *   - Never double-charge · never double-activate · server-authoritative price
 *     only · no card data server-side · PAID activation is WEBHOOK-owned.
 *
 * The PAID path is the spiky core: `run()` STARTS the charge (beginFirstCharge)
 * and returns a NON-terminal `awaitingPayment` outcome. The runner records the
 * run as `awaiting_payment` (no retry, no `form.action_failed`). The Stripe
 * webhook (`provider:"stripe"`) calls `activateFromIntent` later — the action
 * NEVER activates a paid intent.
 *
 * Idempotency (anti-double-charge):
 *   - Layer 1 (runner): a `completed` run never re-fires.
 *   - Layer 2 (this file): before creating an intent, `run()` reuses an intentId
 *     already stored on this submission's prior run result (so a re-emit / retry
 *     of an `awaiting_payment` run reuses the SAME intent → SAME PaymentIntent).
 *     A `by_form_submission` index + `getIntentBySubmission` query on the
 *     subscription side would be stronger, but that table's indexes are the
 *     subscription system's to own; the per-run reuse here is the additive guard.
 *   - Layer 3 (free): `activateFromIntent`'s intent-status guard is idempotent.
 *
 * Anonymous account creation is CLIENT-side Clerk on the Website (out of scope
 * server-side). `USER_NOT_FOUND` from `activateFromIntent` is treated as
 * recoverable (the website completes signup before activation).
 *
 * `emitSubscriptionStarted` is an internalMutation wrapper because a Convex
 * action ctx cannot call `emitEvent` (needs MutationCtx) — mirrors the
 * media/internals emit-wrapper + actions.ts:emitActionEvent.
 */

import { z } from "zod";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import {
  registerActionType,
  type ActionResult,
  type ActionRunContext,
} from "./actionRegistry";

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
    returnUrl: z.string().url().optional(),
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

// ─── Event wrapper (action ctx cannot emitEvent) ─────────────────────────────

export const emitSubscriptionStarted = internalMutation({
  args: {
    formId: v.id("forms"),
    submissionId: v.id("form_submissions"),
    checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
    offerId: v.string(),
    customerEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { emitEvent } = await import("../../helpers/events");
    const { FORM_EVENTS, SYSTEM } = await import("../../events/constants");
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

/** Map a permanent ConvexError code → a non-retryable failure result. */
const PERMANENT_CODES = new Set([
  "OFFER_ARCHIVED",
  "COUPON_INVALID",
  "NOT_FOUND",
  "VALIDATION_ERROR",
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

  // Account policy: require_existing means a logged-in user must own the
  // checkout. The action runs server-side without an end-user identity, so we
  // cannot confirm sign-in here; `activateFromIntent` enforces it (USER_NOT_FOUND
  // for an anonymous paid intent). For the paid path the Website client handles
  // sign-in (create_on_website) before confirming the card. We surface the
  // policy in the result so the renderer can branch.

  // ── Idempotency layer 2: reuse an intentId stored on a prior run ──────────
  // A re-emit / retry of an awaiting_payment run must reuse the SAME intent so
  // we never mint a second PaymentIntent. The runner stores run.result; we read
  // the latest run for this submission+action via an internal query.
  const priorIntentId = await ctx.ctx
    .runQuery(internal.extensions.forms.commerce.getPriorIntentId, {
      submissionId: ctx.submissionId as any,
    })
    .catch(() => null);

  let intentId: string | undefined = priorIntentId ?? undefined;
  let amount = 0;
  let recurringAmount = 0;
  let currency = "USD";

  if (!intentId) {
    // ── Call 1: create the checkout intent (server recomputes price) ────────
    let intent: {
      intentId: string;
      amount: number;
      recurringAmount: number;
      currency: string;
      trialDays: number;
      paymentProcessorData: { provider: string; ready: boolean; message: string };
    };
    try {
      intent = (await ctx.ctx.runMutation(
        // Cast to any: the generated commerce API union types exceed TS's
        // instantiation depth (TS2589). Mirrors SignupForm.tsx on the website.
        (api as any).commerceSubscriptions.checkout.createCheckoutIntent,
        {
          offerId: offerId as any,
          customerEmail,
          couponCode,
          returnUrl: config.returnUrl,
          // Stamp form linkage when present (both args are optional on
          // createCheckoutIntent). Guard against an empty id string.
          formId: ctx.formId ? (ctx.formId as any) : undefined,
          formSubmissionId: ctx.submissionId
            ? (ctx.submissionId as any)
            : undefined,
        },
      )) as typeof intent;
    } catch (err) {
      const code = errorCode(err);
      if (code && PERMANENT_CODES.has(code)) {
        return { ok: false, retryable: false, error: errorMessage(err) };
      }
      // Unknown → let the framework retry (transient).
      throw err;
    }

    intentId = String(intent.intentId);
    amount = intent.amount ?? 0;
    recurringAmount = intent.recurringAmount ?? 0;
    currency = intent.currency ?? "USD";

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

    // Funnel event — after intent creation.
    await ctx.ctx.runMutation(
      internal.extensions.forms.commerce.emitSubscriptionStarted,
      {
        formId: ctx.formId as any,
        submissionId: ctx.submissionId as any,
        checkoutIntentId: intent.intentId as any,
        offerId,
        customerEmail,
      },
    );
  } else {
    // Reusing a prior intent — re-read its pricing for the cap/return shape.
    const snapshot = await ctx.ctx
      .runQuery(internal.extensions.forms.commerce.getIntentPricing, {
        intentId: intentId as any,
      })
      .catch(() => null);
    if (snapshot) {
      amount = snapshot.amount ?? 0;
      recurringAmount = snapshot.recurringAmount ?? 0;
      currency = snapshot.currency ?? "USD";
    }
  }

  // ── Zero-amount path: free activation (action owns this) ──────────────────
  const isZeroAmount = amount <= 0 && recurringAmount <= 0;
  if (isZeroAmount) {
    try {
      const activation = (await ctx.ctx.runMutation(
        // Cast to any: see createCheckoutIntent above (TS2589).
        (api as any).commerceSubscriptions.checkout.activateFromIntent,
        {
          intentId: intentId as any,
          paymentResult: {
            provider: "free",
            providerTransactionId: `free_${Date.now()}`,
            status: "succeeded",
          },
        },
      )) as { ok: boolean; contractId?: string; status?: string };
      if (activation.ok) {
        return {
          ok: true,
          data: {
            intentId,
            contractId: activation.contractId,
            status: activation.status,
            amount: 0,
            recurringAmount,
            currency,
            paid: false,
          },
        };
      }
      return { ok: false, retryable: true, error: "Free activation failed." };
    } catch (err) {
      // USER_NOT_FOUND is recoverable (website completes signup) — retryable.
      return { ok: false, retryable: true, error: errorMessage(err) };
    }
  }

  // ── Paid path: start the charge, return NON-terminal awaiting_payment ─────
  // The action NEVER activates a paid intent. The Stripe webhook does.
  let clientSecret: string | null | undefined;
  let mode: "payment" | "setup" | undefined;
  try {
    const charge = (await ctx.ctx.runAction(
      // Cast to any: see createCheckoutIntent above (TS2589).
      (api as any).commerceSubscriptions.publicCharge.beginFirstCharge,
      { checkoutIntentId: intentId as any },
    )) as { clientSecret?: string | null; mode?: "payment" | "setup" };
    clientSecret = charge?.clientSecret;
    mode = charge?.mode;
  } catch (err) {
    const msg = errorMessage(err);
    // Pricing changed under us to zero → fall back to free activation.
    if (msg.includes("no_charge_needed_free_initial_amount")) {
      try {
        const activation = (await ctx.ctx.runMutation(
          // Cast to any: see createCheckoutIntent above (TS2589).
          (api as any).commerceSubscriptions.checkout.activateFromIntent,
          {
            intentId: intentId as any,
            paymentResult: {
              provider: "free",
              providerTransactionId: `free_${Date.now()}`,
              status: "succeeded",
            },
          },
        )) as { ok: boolean; contractId?: string; status?: string };
        if (activation.ok) {
          return {
            ok: true,
            data: {
              intentId,
              contractId: activation.contractId,
              status: activation.status,
              amount: 0,
              recurringAmount,
              currency,
              paid: false,
            },
          };
        }
        return { ok: false, retryable: true, error: "Free activation failed." };
      } catch (innerErr) {
        return { ok: false, retryable: true, error: errorMessage(innerErr) };
      }
    }
    // Otherwise transient — let the framework retry the charge start.
    return { ok: false, retryable: true, error: msg };
  }

  if (!clientSecret) {
    return { ok: false, retryable: true, error: "Could not start payment." };
  }

  // Read the publishable key + live gate for the Website Elements surface.
  const charging = (await ctx.ctx
    // Cast to any: see createCheckoutIntent above (TS2589).
    .runQuery((api as any).commerceSubscriptions.queries.getLiveChargingStatus, {})
    .catch(() => null)) as { live: boolean; publishableKey: string | null } | null;

  // Return the NON-terminal outcome so the runner records awaiting_payment
  // (no retry, no failed event). The Website mounts Stripe Elements from this
  // descriptor; the webhook activates the intent after the card confirms.
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
      returnUrl: config.returnUrl,
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
  handler: async (ctx, { submissionId }): Promise<string | null> => {
    const runs = await ctx.db
      .query("form_action_runs")
      .withIndex("by_submission", (q) => q.eq("submissionId", submissionId))
      .order("desc")
      .collect();
    for (const run of runs) {
      if (!run.result) continue;
      try {
        const parsed = JSON.parse(run.result) as { intentId?: unknown };
        if (typeof parsed.intentId === "string" && parsed.intentId) {
          return parsed.intentId;
        }
      } catch {
        // skip malformed
      }
    }
    return null;
  },
});

/** Read a checkout intent's pricing snapshot (for the reuse branch). */
export const getIntentPricing = internalQuery({
  args: { intentId: v.id("commerce_subscription_checkout_intents") },
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
