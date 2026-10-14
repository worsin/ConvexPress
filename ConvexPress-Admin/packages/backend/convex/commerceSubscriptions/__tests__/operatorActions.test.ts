/**
 * Operator actions on a customer's contract and invoice refunds (upstream PR
 * 026). Real functions through convex-test; Stripe refunds faked at the SDK
 * resource prototype, honouring idempotency keys as Stripe does.
 */
import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from "bun:test";
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { internal } from "../../_generated/api";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceSubscriptions/internals.ts": () => import("../internals"),
  "./convex/commerceSubscriptions/operator.ts": () => import("../operator"),
  "./convex/commerceSubscriptions/refunds.ts": () => import("../refunds"),
  "./convex/commerceSubscriptions/dunning.ts": () => import("../dunning"),
  "./convex/commerceSubscriptions/stripeCharge.ts": () => import("../stripeCharge"),
  "./convex/purchases/internals.ts": () => import("../../purchases/internals"),
  "./convex/membership/internals.ts": () => import("../../membership/internals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/notifications/internals.ts": () => import("../../notifications/internals"),
  "./convex/settings/queries.ts": () => import("../../settings/queries"),
};

const STRIPE_KEY = "sk_test_operator_actions";
const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 14, 12, 0, 0);
const stripe = new Stripe(STRIPE_KEY);

// ─── Fake Stripe refunds ────────────────────────────────────────────────────

type RefundParams = { payment_intent?: string; amount?: number };
interface FakeableRefunds {
  create(params: RefundParams, options?: { idempotencyKey?: string }): Promise<unknown>;
}
const refundCalls: Array<{ key: string | undefined; amount: number | undefined; paymentIntent: string | undefined }> = [];
const byKey = new Map<string, { id: string; status: string }>();
let refundOutcome: "succeeded" | "pending" | "error" = "succeeded";

const liveTests: Array<ReturnType<typeof convexTest>> = [];
async function drainScheduled(t: ReturnType<typeof convexTest>): Promise<void> {
  for (let round = 0; round < 5; round++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await t.finishInProgressScheduledFunctions();
  }
}

beforeEach(() => {
  refundCalls.length = 0;
  byKey.clear();
  refundOutcome = "succeeded";
  setSystemTime(new Date(START));
  const refunds: FakeableRefunds = Object.getPrototypeOf(stripe.refunds);
  spyOn(refunds, "create").mockImplementation(async (params: RefundParams, options?: { idempotencyKey?: string }) => {
    refundCalls.push({ key: options?.idempotencyKey, amount: params.amount, paymentIntent: params.payment_intent });
    const replay = options?.idempotencyKey ? byKey.get(options.idempotencyKey) : undefined;
    if (replay) return { object: "refund", ...replay };
    if (refundOutcome === "error") {
      throw Object.assign(new Error("This charge has already been refunded."), { type: "StripeInvalidRequestError", code: "charge_already_refunded" });
    }
    const created = { id: `re_op${refundCalls.length}`, status: refundOutcome };
    if (options?.idempotencyKey) byKey.set(options.idempotencyKey, created);
    return { object: "refund", ...created };
  });
});

afterEach(async () => {
  for (const t of liveTests.splice(0)) await drainScheduled(t);
  setSystemTime();
  const refunds: FakeableRefunds = Object.getPrototypeOf(stripe.refunds);
  const fn = refunds.create;
  if ("mockRestore" in fn && typeof fn.mockRestore === "function") fn.mockRestore();
});

// ─── Fixture ────────────────────────────────────────────────────────────────

async function fixture(status: "active" | "past_due" | "paused" = "active") {
  const t = convexTest({ schema, modules });
  liveTests.push(t);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      authSource: "local", email: "buyer@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", {
      section: "plugins", values: { commerceEnabled: true, commerceSubscriptionsEnabled: true }, updatedAt: 1, updatedBy: owner,
    });
    await ctx.db.insert("settings", {
      section: "commerce.payments", values: { stripeSecretKey: STRIPE_KEY, subscriptionChargingEnabled: true }, updatedAt: 1, updatedBy: owner,
    });
    const subscriptionId = await ctx.db.insert("commerce_subscriptions", {
      userId: owner, sourceChannel: "direct_form", status, currencyCode: "USD", recurringAmount: 29_900,
      billingInterval: "month", billingIntervalCount: 1, currentPeriodStartAt: START - 10 * DAY,
      currentPeriodEndAt: START + 20 * DAY, nextBillingAt: START + 20 * DAY, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("commerce_subscription_entitlements", {
      subscriptionId, userId: owner, entitlementCode: "portal", status: status === "active" ? "active" : "grace",
      startsAt: 1, createdAt: 1, updatedAt: 1,
    });
    const invoiceId = await ctx.db.insert("commerce_subscription_invoices", {
      subscriptionId, status: status === "past_due" ? "failed" : "paid", invoiceNumber: "INV-000010", currencyCode: "USD",
      subtotalAmount: 29_900, taxAmount: 0, totalAmount: 29_900, paymentTransactionId: "pi_paid", kind: "renewal",
      paidAt: status === "past_due" ? undefined : START - 10 * DAY, createdAt: START - 10 * DAY, updatedAt: 1,
    });
    if (status === "past_due") {
      await ctx.db.insert("commerce_subscription_dunning_attempts", {
        subscriptionId, invoiceId, attemptNumber: 2, status: "scheduled", scheduledAt: START + 2 * DAY, createdAt: 1, updatedAt: 1,
      });
    }
    return { subscriptionId, invoiceId };
  });
  const contract = () => t.run((ctx) => ctx.db.get(ids.subscriptionId));
  const invoice = () => t.run((ctx) => ctx.db.get(ids.invoiceId));
  const history = () =>
    t.run(async (ctx) => (await ctx.db.query("commerce_subscription_history").collect()).map((row) => row.eventType));
  return { t, ids, contract, invoice, history };
}

const op = { actorRef: "staff:alex" };

// ─── Lifecycle ──────────────────────────────────────────────────────────────

describe("operator actions", () => {
  test("cancel at period end, resume, then cancel now", async () => {
    const f = await fixture();
    const scheduled = await f.t.mutation(internal.commerceSubscriptions.operator.cancelContract, {
      subscriptionId: f.ids.subscriptionId, immediate: false, ...op,
    });
    expect(scheduled).toEqual({ status: "pending_cancel", effectiveAt: START + 20 * DAY });
    await f.t.mutation(internal.commerceSubscriptions.operator.resumeContract, { subscriptionId: f.ids.subscriptionId, ...op });
    expect((await f.contract())?.status).toBe("active");
    await f.t.mutation(internal.commerceSubscriptions.operator.cancelContract, {
      subscriptionId: f.ids.subscriptionId, immediate: true, ...op, reason: "customer request by phone",
    });
    expect((await f.contract())?.status).toBe("cancelled");
    expect(await f.history()).toEqual(
      expect.arrayContaining([
        "subscription.operator_cancel_scheduled",
        "subscription.operator_resume",
        "subscription.operator_cancel_now",
      ]),
    );
    await expect(
      f.t.mutation(internal.commerceSubscriptions.operator.cancelContract, { subscriptionId: f.ids.subscriptionId, immediate: true, ...op }),
    ).rejects.toThrow("already cancelled");
  });

  test("a past-due contract's retry runs now; other states have none", async () => {
    const pastDue = await fixture("past_due");
    expect(
      await pastDue.t.mutation(internal.commerceSubscriptions.operator.retryPaymentNow, { subscriptionId: pastDue.ids.subscriptionId, ...op }),
    ).toEqual({ scheduled: true });
    const attempt = await pastDue.t.run(async (ctx) => (await ctx.db.query("commerce_subscription_dunning_attempts").collect())[0]);
    expect(attempt?.scheduledAt).toBeLessThanOrEqual(START);

    const active = await fixture("active");
    await expect(
      active.t.mutation(internal.commerceSubscriptions.operator.retryPaymentNow, { subscriptionId: active.ids.subscriptionId, ...op }),
    ).rejects.toThrow("Only a past-due subscription");
  });

  test("a past-due contract can only be cancelled now", async () => {
    const f = await fixture("past_due");
    await expect(
      f.t.mutation(internal.commerceSubscriptions.operator.cancelContract, { subscriptionId: f.ids.subscriptionId, immediate: false, ...op }),
    ).rejects.toThrow("can only be cancelled now");
  });
});

// ─── Refunds ────────────────────────────────────────────────────────────────

describe("invoice refunds", () => {
  test("a partial then the remaining refund; never more than was paid", async () => {
    const f = await fixture();
    const first = await f.t.mutation(internal.commerceSubscriptions.operator.requestInvoiceRefund, {
      invoiceId: f.ids.invoiceId, amount: 10_000, reason: "duplicate", ...op,
    });
    expect(first.amount).toBe(10_000);
    // Reserved before Stripe answers: the remaining refundable is 19,900.
    await expect(
      f.t.mutation(internal.commerceSubscriptions.operator.requestInvoiceRefund, { invoiceId: f.ids.invoiceId, amount: 20_000, ...op }),
    ).rejects.toThrow("more than what remains");
    await drainScheduled(f.t);
    const rest = await f.t.mutation(internal.commerceSubscriptions.operator.requestInvoiceRefund, { invoiceId: f.ids.invoiceId, ...op });
    expect(rest.amount).toBe(19_900);
    await drainScheduled(f.t);

    const invoice = await f.invoice();
    expect(invoice?.refundedAmount).toBe(29_900);
    expect(invoice?.refunds?.map((refund) => [refund.amount, refund.status])).toEqual([
      [10_000, "succeeded"],
      [19_900, "succeeded"],
    ]);
    expect(refundCalls.map((call) => [call.paymentIntent, call.amount])).toEqual([
      ["pi_paid", 10_000],
      ["pi_paid", 19_900],
    ]);
    await expect(
      f.t.mutation(internal.commerceSubscriptions.operator.requestInvoiceRefund, { invoiceId: f.ids.invoiceId, amount: 1, ...op }),
    ).rejects.toThrow("more than what remains");
    const purchase = await f.t.run(async (ctx) => (await ctx.db.query("purchase_orders").collect())[0]);
    expect(purchase).toMatchObject({ status: "refunded", paymentStatus: "refunded", amountPaid: 29_900, amountRefunded: 29_900 });
    const events = await f.t.run(async (ctx) => (await ctx.db.query("events").collect()).map((row) => row.code));
    expect(events.filter((code) => code === "commerce.subscription_invoice_refunded")).toHaveLength(2);
  });

  test("a refund Stripe refuses releases its reservation", async () => {
    const f = await fixture();
    refundOutcome = "error";
    await f.t.mutation(internal.commerceSubscriptions.operator.requestInvoiceRefund, { invoiceId: f.ids.invoiceId, ...op });
    await drainScheduled(f.t);
    const invoice = await f.invoice();
    expect(invoice?.refunds?.[0]).toMatchObject({ status: "failed", error: "This charge has already been refunded." });
    expect(invoice?.refundedAmount).toBe(0);
    expect(await f.history()).toContain("subscription.refund_failed");
  });

  test("a re-run of the same refund does not refund twice", async () => {
    const f = await fixture();
    const { refundKey } = await f.t.mutation(internal.commerceSubscriptions.operator.requestInvoiceRefund, {
      invoiceId: f.ids.invoiceId, amount: 5_000, ...op,
    });
    await drainScheduled(f.t);
    await f.t.action(internal.commerceSubscriptions.refunds.processInvoiceRefund, { invoiceId: f.ids.invoiceId, refundKey });
    expect(refundCalls).toHaveLength(1);
    expect((await f.invoice())?.refundedAmount).toBe(5_000);
  });

  test("only a paid card payment can be refunded", async () => {
    const f = await fixture("past_due");
    await expect(
      f.t.mutation(internal.commerceSubscriptions.operator.requestInvoiceRefund, { invoiceId: f.ids.invoiceId, ...op }),
    ).rejects.toThrow("Only a paid card payment");
  });
});

