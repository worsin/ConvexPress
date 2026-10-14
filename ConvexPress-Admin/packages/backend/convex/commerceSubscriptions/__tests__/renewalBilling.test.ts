/**
 * Subscription renewals and dunning (upstream PR 023).
 *
 * Drives the real Convex functions through convex-test: the hourly renewal
 * sweep, the dunning sweep, the off-session Stripe charge and the signed Stripe
 * webhook. Stripe is faked at the SDK resource prototypes (the seam the PR 020
 * checkout tests use). The fake honours idempotency keys the way Stripe does: a
 * repeated key replays the first result, success or decline.
 *
 * Each contract here is a custom offer with no store product, the shape a
 * subscription-only site (CaseMedix) sells.
 */
import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from "bun:test";
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/http.ts": () => import("../../http"),
  "./convex/commerce/payments.ts": () => import("../../commerce/payments"),
  "./convex/settings/httpInternals.ts": () => import("../../settings/httpInternals"),
  "./convex/settings/queries.ts": () => import("../../settings/queries"),
  "./convex/commerceSubscriptions/internals.ts": () => import("../internals"),
  "./convex/commerceSubscriptions/renewal.ts": () => import("../renewal"),
  "./convex/commerceSubscriptions/dunning.ts": () => import("../dunning"),
  "./convex/commerceSubscriptions/stripeCharge.ts": () => import("../stripeCharge"),
  "./convex/commerceSubscriptions/mutations.ts": () => import("../mutations"),
  "./convex/commerceSubscriptions/proration.ts": () => import("../proration"),
  "./convex/purchases/internals.ts": () => import("../../purchases/internals"),
  "./convex/membership/internals.ts": () => import("../../membership/internals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/notifications/internals.ts": () => import("../../notifications/internals"),
};

const ADMIN_ISSUER = "https://convexpress-admin.local";
const WEBHOOK_SECRET = "whsec_renewal_billing";
const STRIPE_KEY = "sk_test_renewal_billing";
const CUSTOMER = "cus_renewal";
const CARD_OK = "pm_card_ok";
const CARD_DECLINED = "pm_card_declined";
const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 1, 12, 0, 0);
const stripe = new Stripe(STRIPE_KEY);

// ─── Fake Stripe ────────────────────────────────────────────────────────────

type FakePaymentIntent = {
  id: string;
  object: "payment_intent";
  status: "succeeded" | "requires_payment_method";
  amount: number;
  amount_received: number;
  currency: string;
  customer: string | null;
  payment_method: string | null;
  metadata: Record<string, string>;
  last_payment_error: { code: string; message: string } | null;
};
type ChargeParams = {
  amount?: number;
  currency?: string;
  customer?: string;
  payment_method?: string;
  off_session?: boolean;
  confirm?: boolean;
  receipt_email?: string;
  metadata?: Record<string, string>;
};
type CreateOptions = { idempotencyKey?: string };
interface FakeablePaymentIntents {
  create(params: ChargeParams, options?: CreateOptions): Promise<unknown>;
}

type Replay = { params: string; intentId: string };
const intents = new Map<string, FakePaymentIntent>();
const byIdempotencyKey = new Map<string, Replay>();
const charges: Array<{ key: string | undefined; paymentMethod: string | undefined; amount: number | undefined }> = [];
let sequence = 0;

function cardError(intent: FakePaymentIntent): Error {
  return Object.assign(new Error("Your card was declined."), {
    type: "StripeCardError",
    code: "card_declined",
    decline_code: "generic_decline",
    payment_intent: intent,
  });
}

/** Parameters compared the way Stripe compares them: by value, not key order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    entries.sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function fakeCreate(params: ChargeParams, options?: CreateOptions): Promise<FakePaymentIntent> {
  const key = options?.idempotencyKey;
  charges.push({ key, paymentMethod: params.payment_method, amount: params.amount });
  const fingerprint = stableJson(params);
  const replay = key ? byIdempotencyKey.get(key) : undefined;
  if (replay) {
    if (replay.params !== fingerprint) {
      throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters."), {
        type: "StripeIdempotencyError",
        code: "idempotency_key_in_use",
      });
    }
    const first = intents.get(replay.intentId);
    if (!first) throw new Error("replayed intent vanished");
    if (first.status !== "succeeded") throw cardError(first);
    return first;
  }
  sequence += 1;
  const succeeded = params.payment_method === CARD_OK;
  const intent: FakePaymentIntent = {
    id: `pi_renewal${sequence}`,
    object: "payment_intent",
    status: succeeded ? "succeeded" : "requires_payment_method",
    amount: params.amount ?? 0,
    amount_received: succeeded ? (params.amount ?? 0) : 0,
    currency: params.currency ?? "usd",
    customer: params.customer ?? null,
    payment_method: params.payment_method ?? null,
    metadata: params.metadata ?? {},
    last_payment_error: succeeded ? null : { code: "card_declined", message: "Your card was declined." },
  };
  intents.set(intent.id, intent);
  if (key) byIdempotencyKey.set(key, { params: fingerprint, intentId: intent.id });
  if (!succeeded) throw cardError(intent);
  return intent;
}

beforeEach(() => {
  intents.clear();
  byIdempotencyKey.clear();
  charges.length = 0;
  sequence = 0;
  setSystemTime(new Date(START));
  const paymentIntents: FakeablePaymentIntents = Object.getPrototypeOf(stripe.paymentIntents);
  spyOn(paymentIntents, "create").mockImplementation(fakeCreate);
});

afterEach(() => {
  setSystemTime();
  const paymentIntents: FakeablePaymentIntents = Object.getPrototypeOf(stripe.paymentIntents);
  const fn = paymentIntents.create;
  if ("mockRestore" in fn && typeof fn.mockRestore === "function") fn.mockRestore();
});

// ─── Fixture ────────────────────────────────────────────────────────────────

type ContractOptions = { card?: string; recurringAmount?: number; email?: string };

async function fixture(options: { gracePeriodDays?: number } = {}) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      authSource: "local", email: "owner@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", {
      section: "plugins",
      values: { commerceEnabled: true, commerceSubscriptionsEnabled: true, membershipEnabled: true },
      updatedAt: 1,
      updatedBy: owner,
    });
    await ctx.db.insert("settings", {
      section: "commerce.payments",
      values: { stripeSecretKey: STRIPE_KEY, stripeWebhookSecret: WEBHOOK_SECRET, subscriptionChargingEnabled: true },
      updatedAt: 1,
      updatedBy: owner,
    });
    const template = await ctx.db.insert("commerce_subscription_templates", {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1,
      gracePeriodDays: options.gracePeriodDays ?? 7, pausable: false, cancelAtPeriodEndDefault: true, version: 1,
      createdAt: 1, updatedAt: 1,
    });
    const offer = await ctx.db.insert("commerce_subscription_offers", {
      title: "Launch", slug: "launch", status: "active", templateId: template, sourceType: "custom",
      availableInCart: false, availableInDirectForms: true, availableForAdminProvisioning: true,
      createNewSubscription: true, allowAddToExistingSubscription: false, currencyCode: "USD",
      recurringAmount: 29_900, entitlementCodes: ["portal"], createdAt: 1, updatedAt: 1,
    });
    const growth = await ctx.db.insert("commerce_subscription_offers", {
      title: "Growth", slug: "growth", status: "active", templateId: template, sourceType: "custom",
      availableInCart: false, availableInDirectForms: true, availableForAdminProvisioning: true,
      createNewSubscription: true, allowAddToExistingSubscription: false, currencyCode: "USD",
      recurringAmount: 59_900, entitlementCodes: ["portal", "analytics"], createdAt: 1, updatedAt: 1,
    });
    return { owner, template, offer, growth };
  });

  /** An active contract whose paid period ended an hour ago: due for renewal. */
  async function contract(opts: ContractOptions = {}) {
    return await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        authSource: "local", email: opts.email ?? `buyer${Math.random().toString(36).slice(2, 8)}@example.invalid`,
        emailVerified: true, status: "active", createdAt: 1, updatedAt: 1,
      });
      const periodEnd = START - 60 * 60 * 1000;
      const amount = opts.recurringAmount ?? 29_900;
      const subscriptionId = await ctx.db.insert("commerce_subscriptions", {
        userId, sourceChannel: "direct_form", templateId: ids.template, status: "active", currencyCode: "USD",
        recurringAmount: amount, billingInterval: "month", billingIntervalCount: 1,
        nextBillingAt: periodEnd, currentPeriodStartAt: periodEnd - 30 * DAY, currentPeriodEndAt: periodEnd,
        defaultPaymentMethodId: opts.card ?? CARD_OK, stripeCustomerId: CUSTOMER, paymentProvider: "stripe",
        manualBilling: false, createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("commerce_subscription_items", {
        subscriptionId, sourceOfferId: ids.offer, titleSnapshot: "Launch", quantity: 1, unitAmount: amount,
        unitRecurringAmount: amount, currencyCode: "USD", status: "active", startsAt: 1, currentPeriodEndAt: periodEnd,
        cancelAtPeriodEnd: false, entitlementCodes: ["portal"], createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("commerce_subscription_entitlements", {
        subscriptionId, userId, entitlementCode: "portal", status: "active", startsAt: 1, createdAt: 1, updatedAt: 1,
      });
      return { subscriptionId, userId, periodEnd };
    });
  }

  const state = (subscriptionId: Id<"commerce_subscriptions">) =>
    t.run(async (ctx) => {
      const subscription = await ctx.db.get(subscriptionId);
      if (!subscription) throw new Error("subscription vanished");
      const invoices = await ctx.db
        .query("commerce_subscription_invoices")
        .withIndex("by_subscription", (q) => q.eq("subscriptionId", subscriptionId))
        .collect();
      const attempts = await ctx.db
        .query("commerce_subscription_dunning_attempts")
        .withIndex("by_subscription", (q) => q.eq("subscriptionId", subscriptionId))
        .collect();
      const entitlements = await ctx.db
        .query("commerce_subscription_entitlements")
        .withIndex("by_subscription", (q) => q.eq("subscriptionId", subscriptionId))
        .collect();
      return { subscription, invoices, attempts, entitlements };
    });

  const setCard = (subscriptionId: Id<"commerce_subscriptions">, card: string) =>
    t.run((ctx) => ctx.db.patch("commerce_subscriptions", subscriptionId, { defaultPaymentMethodId: card }));

  const as = (userId: Id<"users">) =>
    t.withIdentity({ subject: userId, tokenIdentifier: `${ADMIN_ISSUER}|${userId}` });

  return { t, ids, contract, state, setCard, as };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const renew = (f: Fixture) => f.t.action(internal.commerceSubscriptions.renewal.runRenewalSweep, {});
const dun = (f: Fixture) => f.t.action(internal.commerceSubscriptions.dunning.runDunningSweep, {});

async function webhook(f: Fixture, type: "payment_intent.succeeded" | "payment_intent.payment_failed", intent: FakePaymentIntent) {
  sequence += 1;
  const payload = JSON.stringify({ id: `evt_renewal${sequence}`, object: "event", type, data: { object: intent } });
  const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: WEBHOOK_SECRET });
  const response = await f.t.fetch("/webhooks/stripe", {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": header },
  });
  expect(response.status).toBe(200);
}

function onlyIntent(): FakePaymentIntent {
  const all = [...intents.values()];
  expect(all).toHaveLength(1);
  const [intent] = all;
  if (!intent) throw new Error("no PaymentIntent");
  return intent;
}

const monthAfter = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + 1);
  return date.getTime();
};

const scheduled = (attempts: Array<Doc<"commerce_subscription_dunning_attempts">>) =>
  attempts.filter((attempt) => attempt.status === "scheduled");

/** Move the clock to the earliest scheduled retry. */
function advanceToRetry(attempts: Array<Doc<"commerce_subscription_dunning_attempts">>) {
  const next = scheduled(attempts)[0];
  if (!next) throw new Error("no retry is scheduled");
  setSystemTime(new Date(next.scheduledAt + 1000));
}

// ─── Successful renewal ─────────────────────────────────────────────────────

describe("renewal: a successful charge is applied once", () => {
  test("the sweep charges the saved card and advances exactly one period", async () => {
    const f = await fixture();
    const { subscriptionId, periodEnd } = await f.contract();

    const result = await renew(f);
    expect(result).toMatchObject({ generated: 1, succeeded: 1, failed: 0 });

    const after = await f.state(subscriptionId);
    expect(after.subscription.status).toBe("active");
    expect(after.subscription.currentPeriodStartAt).toBe(periodEnd);
    expect(after.subscription.currentPeriodEndAt).toBe(monthAfter(periodEnd));
    expect(after.subscription.nextBillingAt).toBe(monthAfter(periodEnd));
    expect(after.invoices).toHaveLength(1);
    expect(after.invoices[0]).toMatchObject({ status: "paid", totalAmount: 29_900 });
    expect(after.invoices[0]?.paymentTransactionId).toBe(onlyIntent().id);
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ paymentMethod: CARD_OK, amount: 29_900 });
  });

  test("Stripe's payment_intent.succeeded webhook for the same charge changes nothing", async () => {
    const f = await fixture();
    const { subscriptionId, periodEnd } = await f.contract();
    await renew(f);

    await webhook(f, "payment_intent.succeeded", onlyIntent());
    await webhook(f, "payment_intent.succeeded", onlyIntent());

    const after = await f.state(subscriptionId);
    expect(after.subscription.currentPeriodEndAt).toBe(monthAfter(periodEnd));
    expect(after.subscription.nextBillingAt).toBe(monthAfter(periodEnd));
    expect(after.invoices.filter((invoice) => invoice.status === "paid")).toHaveLength(1);
  });

  test("a second sweep in the same period charges nothing", async () => {
    const f = await fixture();
    await f.contract();
    await renew(f);
    expect(await renew(f)).toMatchObject({ generated: 0 });
    expect(charges).toHaveLength(1);
  });
});

// ─── Declined renewal ───────────────────────────────────────────────────────

describe("renewal: a declined charge enters dunning", () => {
  test("the contract goes past_due, access moves to grace, and a retry is scheduled", async () => {
    const f = await fixture({ gracePeriodDays: 7 });
    const { subscriptionId } = await f.contract({ card: CARD_DECLINED });

    const result = await renew(f);
    expect(result).toMatchObject({ generated: 1, succeeded: 0, failed: 1 });

    const after = await f.state(subscriptionId);
    expect(after.subscription.status).toBe("past_due");
    expect(after.invoices[0]?.status).toBe("failed");
    expect(after.entitlements[0]).toMatchObject({ status: "grace", graceEndsAt: START + 7 * DAY });
    const retries = scheduled(after.attempts);
    expect(retries).toHaveLength(1);
    expect(retries[0]?.scheduledAt).toBe(START + DAY);
  });

  test("Stripe's payment_failed webhook for the same charge records nothing new", async () => {
    const f = await fixture();
    const { subscriptionId } = await f.contract({ card: CARD_DECLINED });
    await renew(f);
    const before = await f.state(subscriptionId);

    await webhook(f, "payment_intent.payment_failed", onlyIntent());

    const after = await f.state(subscriptionId);
    expect(after.attempts).toHaveLength(before.attempts.length);
    expect(scheduled(after.attempts)).toHaveLength(1);
  });

  test("a retry with a replaced card succeeds, restores access and advances one period", async () => {
    const f = await fixture();
    const { subscriptionId, periodEnd } = await f.contract({ card: CARD_DECLINED });
    await renew(f);
    await f.setCard(subscriptionId, CARD_OK);
    advanceToRetry((await f.state(subscriptionId)).attempts);

    const result = await dun(f);
    expect(result).toMatchObject({ processed: 1, succeeded: 1 });

    const after = await f.state(subscriptionId);
    expect(after.subscription.status).toBe("active");
    expect(after.subscription.currentPeriodEndAt).toBe(monthAfter(periodEnd));
    expect(after.invoices).toHaveLength(1);
    expect(after.invoices[0]?.status).toBe("paid");
    expect(after.entitlements[0]?.status).toBe("active");
    expect(scheduled(after.attempts)).toHaveLength(0);
    // Each charge attempt has its own idempotency key, so the new card is used.
    expect(charges.map((charge) => charge.paymentMethod)).toEqual([CARD_DECLINED, CARD_OK]);
    expect(new Set(charges.map((charge) => charge.key)).size).toBe(2);
  });

  test("grace is anchored to the first failure, not extended by each retry", async () => {
    const f = await fixture({ gracePeriodDays: 7 });
    const { subscriptionId } = await f.contract({ card: CARD_DECLINED });
    await renew(f);
    advanceToRetry((await f.state(subscriptionId)).attempts);
    await dun(f);

    const after = await f.state(subscriptionId);
    expect(after.subscription.status).toBe("past_due");
    expect(after.entitlements[0]?.graceEndsAt).toBe(START + 7 * DAY);
  });

  test("dunning exhausts after the policy's retries: cancelled, access revoked, nothing left to charge", async () => {
    const f = await fixture();
    const { subscriptionId } = await f.contract({ card: CARD_DECLINED });
    await renew(f);
    for (let retry = 0; retry < 10; retry++) {
      const current = await f.state(subscriptionId);
      if (scheduled(current.attempts).length === 0) break;
      advanceToRetry(current.attempts);
      await dun(f);
    }

    const after = await f.state(subscriptionId);
    expect(after.subscription.status).toBe("cancelled");
    expect(after.entitlements[0]?.status).toBe("revoked");
    expect(after.invoices[0]?.status).toBe("void");
    expect(scheduled(after.attempts)).toHaveLength(0);
    // The renewal charge plus one charge per retry interval.
    expect(charges).toHaveLength(4);

    setSystemTime(new Date(START + 60 * DAY));
    expect(await dun(f)).toMatchObject({ processed: 0 });
    expect(await renew(f)).toMatchObject({ generated: 0 });
    expect(charges).toHaveLength(4);
  });

  test("cancelling a past_due contract stops its retries", async () => {
    const f = await fixture();
    const { subscriptionId } = await f.contract({ card: CARD_DECLINED });
    await renew(f);
    const { userId } = await f.state(subscriptionId).then((current) => ({ userId: current.subscription.userId }));
    if (!userId) throw new Error("contract has no owner");
    await f.as(userId).mutation(api.commerceSubscriptions.mutations.cancelNow, { subscriptionId });

    const after = await f.state(subscriptionId);
    expect(after.subscription.status).toBe("cancelled");
    expect(scheduled(after.attempts)).toHaveLength(0);
    expect(after.invoices[0]?.status).toBe("void");
    expect(after.entitlements[0]?.status).toBe("revoked");

    setSystemTime(new Date(START + 30 * DAY));
    await dun(f);
    expect(charges).toHaveLength(1);
  });
});

// ─── Invoices ───────────────────────────────────────────────────────────────

describe("renewal invoices", () => {
  test("invoice numbers are unique without a counters settings row", async () => {
    const f = await fixture();
    await f.contract();
    await f.contract();
    await renew(f);
    const numbers = await f.t.run(async (ctx) =>
      (await ctx.db.query("commerce_subscription_invoices").collect()).map((invoice) => invoice.invoiceNumber),
    );
    expect(numbers).toHaveLength(2);
    expect(new Set(numbers).size).toBe(2);
  });

  test("an active coupon redemption discounts the renewal invoice and is used up", async () => {
    const f = await fixture();
    const { subscriptionId, userId } = await f.contract();
    const redemptionId = await f.t.run(async (ctx) => {
      const couponId = await ctx.db.insert("commerce_subscription_coupons", {
        code: "SAVE10", discountType: "percent", amount: 10, duration: "once", status: "active",
        createdBy: f.ids.owner, createdAt: 1,
      });
      return await ctx.db.insert("commerce_subscription_coupon_redemptions", {
        contractId: subscriptionId, couponId, customerId: userId, redeemedAt: 1, remainingApplications: 1,
      });
    });

    await renew(f);

    const after = await f.state(subscriptionId);
    expect(after.invoices[0]).toMatchObject({ status: "paid", totalAmount: 26_910 });
    expect(charges[0]?.amount).toBe(26_910);
    const redemption = await f.t.run((ctx) => ctx.db.get(redemptionId));
    expect(redemption?.remainingApplications).toBe(0);
  });
});

// ─── Recovery ───────────────────────────────────────────────────────────────

describe("recovery from interrupted charges", () => {
  test("a charge that never reported back is re-driven under the same key: Stripe returns the first charge", async () => {
    const f = await fixture();
    const { subscriptionId, periodEnd } = await f.contract();
    // The invoice is created and charged at Stripe, but the action dies before
    // recording the result.
    const { invoiceIds } = await f.t.mutation(internal.commerceSubscriptions.internals.createDueInvoices, {});
    const [invoiceId] = invoiceIds;
    if (!invoiceId) throw new Error("no invoice");
    const owner = await f.t.run(async (ctx) => {
      const subscription = await ctx.db.get(subscriptionId);
      return subscription?.userId ? await ctx.db.get(subscription.userId) : null;
    });
    await fakeCreate(
      {
        amount: 29_900, currency: "usd", customer: CUSTOMER, payment_method: CARD_OK, off_session: true, confirm: true,
        receipt_email: owner?.email,
        metadata: { kind: "subscription_invoice", invoiceId, subscriptionId, attemptNumber: "1" },
      },
      { idempotencyKey: `sub_inv_${invoiceId}_1` },
    );

    setSystemTime(new Date(START + 20 * 60 * 1000));
    const result = await renew(f);
    expect(result).toMatchObject({ generated: 0, succeeded: 1 });

    const after = await f.state(subscriptionId);
    expect(after.invoices[0]).toMatchObject({ status: "paid", paymentTransactionId: onlyIntent().id });
    expect(after.subscription.currentPeriodEndAt).toBe(monthAfter(periodEnd));
    expect(intents.size).toBe(1);
  });

  test("a retry whose invoice no longer exists is closed without charging", async () => {
    const f = await fixture();
    const { subscriptionId } = await f.contract({ card: CARD_DECLINED });
    await renew(f);
    const before = await f.state(subscriptionId);
    const invoiceId = before.invoices[0]?._id;
    if (!invoiceId) throw new Error("no invoice");
    await f.t.run((ctx) => ctx.db.delete("commerce_subscription_invoices", invoiceId));
    advanceToRetry(before.attempts);

    expect(await dun(f)).toMatchObject({ processed: 1, skipped: 1 });
    const after = await f.state(subscriptionId);
    expect(after.attempts.find((a) => a.attemptNumber === 2)).toMatchObject({ status: "aborted", errorMessage: "invoice_not_found" });
    expect(charges).toHaveLength(1);
  });

  test("a webhook naming no invoice is acknowledged and changes nothing", async () => {
    const f = await fixture();
    await f.contract();
    const stray: FakePaymentIntent = {
      id: "pi_stray", object: "payment_intent", status: "succeeded", amount: 100, amount_received: 100,
      currency: "usd", customer: CUSTOMER, payment_method: CARD_OK,
      metadata: { kind: "subscription_invoice", invoiceId: "not-an-invoice" }, last_payment_error: null,
    };
    await webhook(f, "payment_intent.succeeded", stray);
    const invoices = await f.t.run((ctx) => ctx.db.query("commerce_subscription_invoices").collect());
    expect(invoices).toHaveLength(0);
  });
});

// ─── Plan changes ───────────────────────────────────────────────────────────

describe("plan changes", () => {
  /** A contract half way through its period: 15 of 30 days left. */
  async function midPeriod(f: Fixture) {
    const { subscriptionId, userId } = await f.contract();
    const periodEnd = START + 15 * DAY;
    await f.t.run((ctx) =>
      ctx.db.patch("commerce_subscriptions", subscriptionId, {
        currentPeriodStartAt: START - 15 * DAY,
        currentPeriodEndAt: periodEnd,
        nextBillingAt: periodEnd,
      }),
    );
    return { subscriptionId, userId, periodEnd };
  }

  test("an upgrade charges the difference for the rest of the period and keeps the period", async () => {
    const f = await fixture();
    const { subscriptionId, userId, periodEnd } = await midPeriod(f);

    const upgrade = await f.t.mutation(internal.commerceSubscriptions.proration.applyUpgradeProration, {
      contractId: subscriptionId, toOfferId: f.ids.growth, triggeredByUserId: userId,
    });
    expect(upgrade).toMatchObject({ success: true, pending: true });
    const invoiceId = upgrade.invoiceId;
    if (!invoiceId) throw new Error("no proration invoice");

    // A second change while the first is settling is refused.
    await expect(
      f.t.mutation(internal.commerceSubscriptions.proration.applyUpgradeProration, {
        contractId: subscriptionId, toOfferId: f.ids.growth, triggeredByUserId: userId,
      }),
    ).rejects.toThrow(/still being processed/);

    await f.t.action(internal.commerceSubscriptions.stripeCharge.chargeSubscriptionInvoice, { invoiceId, attemptNumber: 1 });

    const after = await f.state(subscriptionId);
    const invoice = after.invoices.find((row) => row._id === invoiceId);
    expect(invoice).toMatchObject({ status: "paid", totalAmount: 15_000 });
    expect(Number.isInteger(charges[0]?.amount)).toBe(true);
    expect(after.subscription.recurringAmount).toBe(59_900);
    expect(after.subscription.currentPeriodEndAt).toBe(periodEnd);
    expect(after.subscription.nextBillingAt).toBe(periodEnd);
    expect(after.entitlements.map((row) => [row.entitlementCode, row.status]).sort()).toEqual([
      ["analytics", "active"],
      ["portal", "active"],
    ]);
  });

  test("a declined upgrade charge leaves the plan unchanged and does not enter dunning", async () => {
    const f = await fixture();
    const { subscriptionId, userId } = await midPeriod(f);
    await f.setCard(subscriptionId, CARD_DECLINED);
    const upgrade = await f.t.mutation(internal.commerceSubscriptions.proration.applyUpgradeProration, {
      contractId: subscriptionId, toOfferId: f.ids.growth, triggeredByUserId: userId,
    });
    if (!upgrade.invoiceId) throw new Error("no proration invoice");
    await f.t.action(internal.commerceSubscriptions.stripeCharge.chargeSubscriptionInvoice, {
      invoiceId: upgrade.invoiceId, attemptNumber: 1,
    });

    const after = await f.state(subscriptionId);
    expect(after.subscription).toMatchObject({ status: "active", recurringAmount: 29_900 });
    expect(after.invoices[0]?.status).toBe("void");
    expect(after.attempts).toHaveLength(0);
  });

  test("a scheduled downgrade bills the new price at renewal and revokes what the new offer lacks", async () => {
    const f = await fixture();
    const { subscriptionId, periodEnd } = await f.contract();
    await f.t.run(async (ctx) => {
      await ctx.db.insert("commerce_subscription_entitlements", {
        subscriptionId, entitlementCode: "analytics", status: "active", startsAt: 1, createdAt: 1, updatedAt: 1,
      });
      const lite = await ctx.db.insert("commerce_subscription_offers", {
        title: "Lite", slug: "lite", status: "active", templateId: f.ids.template, sourceType: "custom",
        availableInCart: false, availableInDirectForms: true, availableForAdminProvisioning: true,
        createNewSubscription: true, allowAddToExistingSubscription: false, currencyCode: "USD",
        recurringAmount: 9_900, entitlementCodes: ["portal"], createdAt: 1, updatedAt: 1,
      });
      await ctx.db.patch("commerce_subscriptions", subscriptionId, {
        scheduledOfferChange: { toOfferId: lite, effectiveAt: periodEnd },
      });
    });

    await renew(f);

    const after = await f.state(subscriptionId);
    expect(after.invoices[0]).toMatchObject({ status: "paid", totalAmount: 9_900 });
    expect(after.subscription.recurringAmount).toBe(9_900);
    expect(after.subscription.scheduledOfferChange).toBeUndefined();
    const byCode = Object.fromEntries(after.entitlements.map((row) => [row.entitlementCode, row.status]));
    expect(byCode).toEqual({ portal: "active", analytics: "revoked" });
  });
});

// ─── Lifecycle events ───────────────────────────────────────────────────────

describe("lifecycle events", () => {
  const codes = (f: Fixture) =>
    f.t.run(async (ctx) => (await ctx.db.query("events").collect()).map((row) => row.code));

  test("renewal, failure and cancellation each emit their event once", async () => {
    const f = await fixture();
    await f.contract();
    await renew(f);
    expect((await codes(f)).filter((code) => code === "commerce.subscription_renewed")).toHaveLength(1);

    const declined = await fixture();
    const { subscriptionId } = await declined.contract({ card: CARD_DECLINED });
    await renew(declined);
    for (let retry = 0; retry < 10; retry++) {
      const current = await declined.state(subscriptionId);
      if (scheduled(current.attempts).length === 0) break;
      advanceToRetry(current.attempts);
      await dun(declined);
    }
    const emitted = await codes(declined);
    expect(emitted.filter((code) => code === "commerce.subscription_past_due")).toHaveLength(4);
    expect(emitted.filter((code) => code === "commerce.subscription_cancelled")).toHaveLength(1);
    expect(emitted).not.toContain("commerce.subscription_renewed");
  });

  test("a scheduled cancellation ends the contract at period end and revokes access", async () => {
    const f = await fixture();
    const { subscriptionId } = await f.contract();
    await f.t.run((ctx) =>
      ctx.db.patch("commerce_subscriptions", subscriptionId, {
        status: "pending_cancel", cancelAtPeriodEnd: true, currentPeriodEndAt: START + DAY, nextBillingAt: START + DAY,
      }),
    );
    expect(await f.t.mutation(internal.commerceSubscriptions.internals.expirePendingCancellations, {})).toEqual({ cancelledCount: 0 });

    setSystemTime(new Date(START + DAY + 1000));
    expect(await renew(f)).toMatchObject({ generated: 0 });
    expect(await f.t.mutation(internal.commerceSubscriptions.internals.expirePendingCancellations, {})).toEqual({ cancelledCount: 1 });
    const after = await f.state(subscriptionId);
    expect(after.subscription.status).toBe("cancelled");
    expect(after.entitlements[0]?.status).toBe("revoked");
    expect(await codes(f)).toContain("commerce.subscription_cancelled");
    expect(charges).toHaveLength(0);
  });
});
