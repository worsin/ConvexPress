/**
 * Customer portal: what a subscriber sees and can do on the account page
 * (upstream PR 024).
 *
 * Drives the real portal queries, mutations and card-change actions through
 * convex-test. Stripe is faked at the SDK resource prototypes; a SetupIntent is
 * "confirmed" the way the Payment Element would leave it, and the server must
 * still retrieve it from Stripe before recording anything.
 */
import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from "bun:test";
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/http.ts": () => import("../../http"),
  "./convex/commerce/payments.ts": () => import("../../commerce/payments"),
  "./convex/settings/httpInternals.ts": () => import("../../settings/httpInternals"),
  "./convex/settings/queries.ts": () => import("../../settings/queries"),
  "./convex/commerceSubscriptions/internals.ts": () => import("../internals"),
  "./convex/commerceSubscriptions/portal.ts": () => import("../portal"),
  "./convex/commerceSubscriptions/paymentMethods.ts": () => import("../paymentMethods"),
  "./convex/commerceSubscriptions/renewal.ts": () => import("../renewal"),
  "./convex/commerceSubscriptions/dunning.ts": () => import("../dunning"),
  "./convex/commerceSubscriptions/stripeCharge.ts": () => import("../stripeCharge"),
  "./convex/commerceSubscriptions/proration.ts": () => import("../proration"),
  "./convex/purchases/internals.ts": () => import("../../purchases/internals"),
  "./convex/membership/internals.ts": () => import("../../membership/internals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/notifications/internals.ts": () => import("../../notifications/internals"),
};

const ADMIN_ISSUER = "https://convexpress-admin.local";
const WEBHOOK_SECRET = "whsec_customer_portal";
const STRIPE_KEY = "sk_test_customer_portal";
const PUBLISHABLE_KEY = "pk_test_customer_portal";
const CUSTOMER = "cus_portal";
const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 14, 12, 0, 0);
const stripe = new Stripe(STRIPE_KEY);

// ─── Fake Stripe ────────────────────────────────────────────────────────────

type FakeCard = { brand: string; last4: string; exp_month: number; exp_year: number };
type FakePaymentMethod = { id: string; object: "payment_method"; card: FakeCard };
type FakeSetupIntent = {
  id: string;
  object: "setup_intent";
  status: "requires_payment_method" | "succeeded";
  client_secret: string;
  customer: string;
  payment_method: string | null;
  metadata: Record<string, string>;
};
type SetupParams = { customer?: string; metadata?: Record<string, string> };
type RetrieveOptions = { expand?: string[] };

interface FakeableSetupIntents {
  create(params: SetupParams): Promise<unknown>;
  retrieve(id: string, options?: RetrieveOptions): Promise<unknown>;
}
interface FakeablePaymentMethods {
  retrieve(id: string): Promise<unknown>;
}
interface FakeableCustomers {
  create(params: { email?: string }): Promise<unknown>;
}

const setupIntents = new Map<string, FakeSetupIntent>();
const paymentMethods = new Map<string, FakePaymentMethod>([
  ["pm_visa", { id: "pm_visa", object: "payment_method", card: { brand: "visa", last4: "4242", exp_month: 4, exp_year: 2030 } }],
  ["pm_amex", { id: "pm_amex", object: "payment_method", card: { brand: "amex", last4: "0005", exp_month: 9, exp_year: 2031 } }],
]);
let sequence = 0;

function expandSetupIntent(intent: FakeSetupIntent, options?: RetrieveOptions) {
  if (!options?.expand?.includes("payment_method") || !intent.payment_method) return intent;
  return { ...intent, payment_method: paymentMethods.get(intent.payment_method) ?? intent.payment_method };
}

function missing(id: string): Error {
  return Object.assign(new Error(`No such object: '${id}'`), { type: "StripeInvalidRequestError", code: "resource_missing" });
}

beforeEach(() => {
  setupIntents.clear();
  sequence = 0;
  setSystemTime(new Date(START));
  const si: FakeableSetupIntents = Object.getPrototypeOf(stripe.setupIntents);
  const pm: FakeablePaymentMethods = Object.getPrototypeOf(stripe.paymentMethods);
  const customers: FakeableCustomers = Object.getPrototypeOf(stripe.customers);
  spyOn(si, "create").mockImplementation(async (params: SetupParams) => {
    sequence += 1;
    const intent: FakeSetupIntent = {
      id: `seti_portal${sequence}`,
      object: "setup_intent",
      status: "requires_payment_method",
      client_secret: `seti_portal${sequence}_secret_x`,
      customer: params.customer ?? CUSTOMER,
      payment_method: null,
      metadata: params.metadata ?? {},
    };
    setupIntents.set(intent.id, intent);
    return intent;
  });
  spyOn(si, "retrieve").mockImplementation(async (id: string, options?: RetrieveOptions) => {
    const found = setupIntents.get(id);
    if (!found) throw missing(id);
    return expandSetupIntent(found, options);
  });
  spyOn(pm, "retrieve").mockImplementation(async (id: string) => {
    const found = paymentMethods.get(id);
    if (!found) throw missing(id);
    return found;
  });
  spyOn(customers, "create").mockImplementation(async () => ({ id: "cus_created" }));
});

afterEach(() => {
  setSystemTime();
  const targets: Array<Record<string, unknown>> = [
    Object.getPrototypeOf(stripe.setupIntents),
    Object.getPrototypeOf(stripe.paymentMethods),
    Object.getPrototypeOf(stripe.customers),
  ];
  for (const target of targets) {
    for (const name of ["create", "retrieve"]) {
      const fn = target[name];
      if (typeof fn === "function" && "mockRestore" in fn && typeof fn.mockRestore === "function") fn.mockRestore();
    }
  }
});

/** What the Payment Element leaves behind once the customer confirms a card. */
function confirmInStripe(setupIntentId: string, paymentMethod: string) {
  const found = setupIntents.get(setupIntentId);
  if (!found) throw new Error(`unknown SetupIntent ${setupIntentId}`);
  setupIntents.set(setupIntentId, { ...found, status: "succeeded", payment_method: paymentMethod });
}

// ─── Fixture ────────────────────────────────────────────────────────────────

type ContractShape = {
  status?: "active" | "trialing" | "past_due" | "paused" | "pending_cancel";
  pausable?: boolean;
};

async function fixture(shape: ContractShape = {}) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const user = (email: string) =>
      ctx.db.insert("users", { authSource: "local", email, emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const owner = await user("owner@example.invalid");
    const stranger = await user("stranger@example.invalid");
    await ctx.db.insert("settings", {
      section: "plugins",
      values: { commerceEnabled: true, commerceSubscriptionsEnabled: true, membershipEnabled: true },
      updatedAt: 1,
      updatedBy: owner,
    });
    await ctx.db.insert("settings", {
      section: "commerce.payments",
      values: {
        stripeSecretKey: STRIPE_KEY,
        stripeWebhookSecret: WEBHOOK_SECRET,
        stripePublishableKey: PUBLISHABLE_KEY,
        subscriptionChargingEnabled: true,
      },
      updatedAt: 1,
      updatedBy: owner,
    });
    const template = await ctx.db.insert("commerce_subscription_templates", {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1,
      gracePeriodDays: 7, pausable: shape.pausable ?? false, cancelAtPeriodEndDefault: true, version: 1,
      createdAt: 1, updatedAt: 1,
    });
    const offer = await ctx.db.insert("commerce_subscription_offers", {
      title: "Launch", slug: "launch", status: "active", templateId: template, sourceType: "custom",
      availableInCart: false, availableInDirectForms: true, availableForAdminProvisioning: true,
      createNewSubscription: true, allowAddToExistingSubscription: false, currencyCode: "USD",
      recurringAmount: 29_900, entitlementCodes: ["portal"], createdAt: 1, updatedAt: 1,
    });
    const status = shape.status ?? "active";
    const periodEnd = START + 10 * DAY;
    const subscriptionId = await ctx.db.insert("commerce_subscriptions", {
      userId: owner, sourceChannel: "direct_form", templateId: template, status, currencyCode: "USD",
      recurringAmount: 29_900, billingInterval: "month", billingIntervalCount: 1,
      nextBillingAt: periodEnd, currentPeriodStartAt: periodEnd - 30 * DAY, currentPeriodEndAt: periodEnd,
      defaultPaymentMethodId: "pm_visa", stripeCustomerId: CUSTOMER, paymentProvider: "stripe",
      manualBilling: false, createdAt: START - 20 * DAY, updatedAt: 1,
      ...(status === "pending_cancel" ? { cancelAtPeriodEnd: true } : {}),
    });
    await ctx.db.insert("commerce_subscription_items", {
      subscriptionId, sourceOfferId: offer, titleSnapshot: "Launch", quantity: 1, unitAmount: 29_900,
      unitRecurringAmount: 29_900, currencyCode: "USD", status: "active", startsAt: 1, currentPeriodEndAt: periodEnd,
      cancelAtPeriodEnd: false, entitlementCodes: ["portal"], createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("commerce_subscription_entitlements", {
      subscriptionId, userId: owner, entitlementCode: "portal",
      status: status === "past_due" || status === "paused" ? "grace" : "active",
      ...(status === "past_due" || status === "paused" ? { graceEndsAt: START + 5 * DAY } : {}),
      startsAt: 1, createdAt: 1, updatedAt: 1,
    });
    if (status === "past_due") {
      const invoiceId = await ctx.db.insert("commerce_subscription_invoices", {
        subscriptionId, status: "failed", invoiceNumber: "INV-000007", currencyCode: "USD", subtotalAmount: 29_900,
        taxAmount: 0, totalAmount: 29_900, kind: "renewal", dueAt: START + 2 * DAY, createdAt: START - DAY, updatedAt: START - DAY,
      });
      await ctx.db.insert("commerce_subscription_dunning_attempts", {
        subscriptionId, invoiceId, attemptNumber: 1, status: "failed", scheduledAt: START - DAY, processedAt: START - DAY,
        errorMessage: "card_declined", paymentTransactionId: "pi_declined", createdAt: START - DAY, updatedAt: START - DAY,
      });
      await ctx.db.insert("commerce_subscription_dunning_attempts", {
        subscriptionId, invoiceId, attemptNumber: 2, status: "scheduled", scheduledAt: START + 2 * DAY,
        createdAt: START - DAY, updatedAt: START - DAY,
      });
    }
    return { owner, stranger, subscriptionId, offer };
  });
  const as = (userId: Id<"users">) => t.withIdentity({ subject: userId, tokenIdentifier: `${ADMIN_ISSUER}|${userId}` });
  const contracts = () => as(ids.owner).query(api.commerceSubscriptions.portal.getMyActiveContracts, {});
  const only = async () => {
    const [contract] = await contracts();
    if (!contract) throw new Error("no contract");
    return contract;
  };
  const row = () =>
    t.run(async (ctx) => {
      const subscription = await ctx.db.get(ids.subscriptionId);
      if (!subscription) throw new Error("vanished");
      return subscription;
    });
  const eventCodes = () => t.run(async (ctx) => (await ctx.db.query("events").collect()).map((event) => event.code));
  return { t, ids, owner: as(ids.owner), stranger: as(ids.stranger), contracts, only, row, eventCodes };
}

// ─── What the account page shows ────────────────────────────────────────────

describe("account page: contract summary", () => {
  test("no provider identifiers reach the browser", async () => {
    const f = await fixture();
    const contract = await f.only();
    const keys = Object.keys(contract);
    for (const hidden of ["defaultPaymentMethodId", "stripeCustomerId", "paymentTransactionId", "sourceMetadata", "pricingSnapshot"]) {
      expect(keys).not.toContain(hidden);
    }
    expect(contract.offer?.title).toBe("Launch");
  });

  test("actions follow the contract's state and plan", async () => {
    expect((await (await fixture()).only()).actions).toEqual({
      pause: false, resume: false, scheduleCancel: true, cancelNow: false, keep: false,
      changePlan: true, updatePaymentMethod: true, applyCoupon: true,
    });
    expect((await (await fixture({ pausable: true })).only()).actions.pause).toBe(true);
    expect((await (await fixture({ status: "past_due" })).only()).actions).toMatchObject({
      pause: false, scheduleCancel: false, cancelNow: true, changePlan: false, updatePaymentMethod: true,
    });
    expect((await (await fixture({ status: "pending_cancel" })).only()).actions).toMatchObject({
      keep: true, scheduleCancel: false, changePlan: false,
    });
  });

  test("a past_due contract shows what is owed, the next retry and when access ends", async () => {
    const f = await fixture({ status: "past_due" });
    expect((await f.only()).billingIssue).toEqual({
      failedAttempts: 1,
      lastFailureReason: "card_declined",
      nextRetryAt: START + 2 * DAY,
      accessEndsAt: START + 5 * DAY,
      amountDue: 29_900,
      currencyCode: "USD",
    });
  });

  test("the card on file shows brand and last four once Stripe reports them", async () => {
    const f = await fixture();
    expect((await f.only()).paymentMethod).toBeNull();
    await f.t.action(internal.commerceSubscriptions.paymentMethods.refreshPaymentMethodSummary, { contractId: f.ids.subscriptionId });
    expect((await f.only()).paymentMethod).toEqual({ brand: "visa", last4: "4242", expMonth: 4, expYear: 2030 });
  });
});

// ─── Lifecycle actions ──────────────────────────────────────────────────────

describe("account page: lifecycle actions", () => {
  test("pause is refused when the plan does not allow it, and allowed when it does", async () => {
    const fixed = await fixture({ pausable: false });
    await expect(
      fixed.owner.mutation(api.commerceSubscriptions.portal.requestPauseContract, { contractId: fixed.ids.subscriptionId }),
    ).rejects.toThrow(/cannot be paused/);

    const flexible = await fixture({ pausable: true });
    await flexible.owner.mutation(api.commerceSubscriptions.portal.requestPauseContract, { contractId: flexible.ids.subscriptionId });
    expect((await flexible.row()).status).toBe("paused");
    expect(await flexible.eventCodes()).toContain("commerce.subscription_paused");
    await flexible.owner.mutation(api.commerceSubscriptions.portal.requestResumeContract, { contractId: flexible.ids.subscriptionId });
    expect((await flexible.row()).status).toBe("active");
    expect(await flexible.eventCodes()).toContain("commerce.subscription_resumed");
  });

  test("a scheduled cancellation keeps access, and keeping the subscription undoes it", async () => {
    const f = await fixture();
    const scheduled = await f.owner.mutation(api.commerceSubscriptions.portal.requestCancelContract, {
      contractId: f.ids.subscriptionId,
    });
    expect(scheduled).toMatchObject({ status: "pending_cancel", effectiveAt: START + 10 * DAY });
    expect((await f.only()).entitlements[0]?.status).toBe("active");
    expect(await f.eventCodes()).toContain("commerce.subscription_cancel_scheduled");

    await f.owner.mutation(api.commerceSubscriptions.portal.requestKeepContract, { contractId: f.ids.subscriptionId });
    const kept = await f.row();
    expect(kept).toMatchObject({ status: "active", cancelAtPeriodEnd: false });
    expect(kept.cancelScheduledAt).toBeUndefined();
  });

  test("a past_due contract can only be cancelled now, which stops its retries", async () => {
    const f = await fixture({ status: "past_due" });
    await expect(
      f.owner.mutation(api.commerceSubscriptions.portal.requestCancelContract, { contractId: f.ids.subscriptionId }),
    ).rejects.toThrow(/cannot schedule the cancellation/);
    await expect(
      f.owner.mutation(api.commerceSubscriptions.portal.requestPlanChange, {
        contractId: f.ids.subscriptionId,
        toOfferId: f.ids.offer,
      }),
    ).rejects.toThrow(/cannot change the plan/);

    await f.owner.mutation(api.commerceSubscriptions.portal.requestCancelContract, {
      contractId: f.ids.subscriptionId,
      immediate: true,
    });
    const state = await f.t.run(async (ctx) => ({
      subscription: await ctx.db.get(f.ids.subscriptionId),
      invoices: await ctx.db.query("commerce_subscription_invoices").collect(),
      attempts: await ctx.db.query("commerce_subscription_dunning_attempts").collect(),
      entitlements: await ctx.db.query("commerce_subscription_entitlements").collect(),
    }));
    expect(state.subscription?.status).toBe("cancelled");
    expect(state.invoices[0]?.status).toBe("void");
    expect(state.attempts.filter((attempt) => attempt.status === "scheduled")).toHaveLength(0);
    expect(state.entitlements[0]?.status).toBe("revoked");
    expect(await f.contracts()).toHaveLength(0);
  });

  test("nobody else can act on the contract", async () => {
    const f = await fixture({ pausable: true });
    await expect(
      f.stranger.mutation(api.commerceSubscriptions.portal.requestPauseContract, { contractId: f.ids.subscriptionId }),
    ).rejects.toThrow(/do not have access/);
    await expect(
      f.stranger.mutation(api.commerceSubscriptions.portal.requestCancelContract, {
        contractId: f.ids.subscriptionId,
        immediate: true,
      }),
    ).rejects.toThrow(/do not have access/);
    expect((await f.row()).status).toBe("active");
  });
});

// ─── Card changes ───────────────────────────────────────────────────────────

describe("account page: changing the card", () => {
  test("a confirmed card replaces the one on file; an unconfirmed one is refused", async () => {
    const f = await fixture();
    const started = await f.owner.action(api.commerceSubscriptions.paymentMethods.beginPaymentMethodUpdate, {
      contractId: f.ids.subscriptionId,
    });
    expect(started.publishableKey).toBe(PUBLISHABLE_KEY);
    expect(setupIntents.get(started.setupIntentId)?.metadata).toEqual({
      kind: "subscription_payment_method",
      contractId: f.ids.subscriptionId,
    });

    await expect(
      f.owner.action(api.commerceSubscriptions.paymentMethods.confirmPaymentMethodUpdate, {
        contractId: f.ids.subscriptionId,
        setupIntentId: started.setupIntentId,
      }),
    ).rejects.toThrow(/has not confirmed/);
    expect((await f.row()).defaultPaymentMethodId).toBe("pm_visa");

    confirmInStripe(started.setupIntentId, "pm_amex");
    const confirmed = await f.owner.action(api.commerceSubscriptions.paymentMethods.confirmPaymentMethodUpdate, {
      contractId: f.ids.subscriptionId,
      setupIntentId: started.setupIntentId,
    });
    expect(confirmed).toEqual({
      ok: true,
      retryScheduled: false,
      card: { brand: "amex", last4: "0005", expMonth: 9, expYear: 2031 },
    });
    expect((await f.row()).defaultPaymentMethodId).toBe("pm_amex");
    expect((await f.only()).paymentMethod).toMatchObject({ brand: "amex", last4: "0005" });
  });

  test("a past_due contract is retried on the new card straight away", async () => {
    const f = await fixture({ status: "past_due" });
    const started = await f.owner.action(api.commerceSubscriptions.paymentMethods.beginPaymentMethodUpdate, {
      contractId: f.ids.subscriptionId,
    });
    confirmInStripe(started.setupIntentId, "pm_amex");
    const confirmed = await f.owner.action(api.commerceSubscriptions.paymentMethods.confirmPaymentMethodUpdate, {
      contractId: f.ids.subscriptionId,
      setupIntentId: started.setupIntentId,
    });
    expect(confirmed.retryScheduled).toBe(true);
    const retry = await f.t.run(async (ctx) =>
      (await ctx.db.query("commerce_subscription_dunning_attempts").collect()).find((a) => a.status === "scheduled"),
    );
    expect(retry?.scheduledAt).toBe(START);
  });

  test("a SetupIntent made for another contract, or by someone else, is not recorded", async () => {
    const f = await fixture();
    await expect(
      f.stranger.action(api.commerceSubscriptions.paymentMethods.beginPaymentMethodUpdate, { contractId: f.ids.subscriptionId }),
    ).rejects.toThrow(/do not have access/);

    // A succeeded SetupIntent whose metadata names a different contract.
    setupIntents.set("seti_foreign", {
      id: "seti_foreign", object: "setup_intent", status: "succeeded", client_secret: "seti_foreign_secret_x",
      customer: CUSTOMER, payment_method: "pm_amex", metadata: { kind: "subscription_payment_method", contractId: "another" },
    });
    await expect(
      f.owner.action(api.commerceSubscriptions.paymentMethods.confirmPaymentMethodUpdate, {
        contractId: f.ids.subscriptionId,
        setupIntentId: "seti_foreign",
      }),
    ).rejects.toThrow(/has not confirmed/);
    expect((await f.row()).defaultPaymentMethodId).toBe("pm_visa");
  });

  test("the signed setup_intent.succeeded webhook records a card the page never confirmed", async () => {
    const f = await fixture();
    const started = await f.owner.action(api.commerceSubscriptions.paymentMethods.beginPaymentMethodUpdate, {
      contractId: f.ids.subscriptionId,
    });
    confirmInStripe(started.setupIntentId, "pm_amex");
    const stored = setupIntents.get(started.setupIntentId);
    const payload = JSON.stringify({ id: "evt_portal_setup", object: "event", type: "setup_intent.succeeded", data: { object: stored } });
    const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: WEBHOOK_SECRET });
    const response = await f.t.fetch("/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": header } });
    expect(response.status).toBe(200);
    expect((await f.row()).defaultPaymentMethodId).toBe("pm_amex");
  });
});

// ─── Detail page ────────────────────────────────────────────────────────────

describe("account page: one subscription", () => {
  test("its invoices and a plain-words timeline, without internal rows; nothing for anyone else", async () => {
    const f = await fixture({ status: "past_due" });
    await f.t.run(async (ctx) => {
      const history = (eventType: string, metadata: Record<string, unknown>, createdAt: number) =>
        ctx.db.insert("commerce_subscription_history", {
          subscriptionId: f.ids.subscriptionId, eventType, message: eventType, metadata, createdAt,
        });
      await history("subscription.created_from_intent", {}, START - 20 * DAY);
      await history("subscription.payment_failed", { reason: "card_declined" }, START - DAY);
      await history("subscription.status_changed", { fromStatus: "active", toStatus: "past_due" }, START - DAY + 1);
      await history("subscription.bridge_failed", { data: { error: "internal detail" } }, START - DAY + 2);
    });

    const detail = await f.owner.query(api.commerceSubscriptions.portal.getMyContract, { contractId: f.ids.subscriptionId });
    expect(detail?.invoices.map((invoice) => [invoice.invoiceNumber, invoice.kind, invoice.status])).toEqual([
      ["INV-000007", "renewal", "failed"],
    ]);
    expect(detail?.history.map((entry) => entry.message)).toEqual([
      "Payment past due",
      "A payment did not go through",
      "Subscription started",
    ]);
    expect(detail?.actions.cancelNow).toBe(true);

    expect(await f.stranger.query(api.commerceSubscriptions.portal.getMyContract, { contractId: f.ids.subscriptionId })).toBeNull();
  });
});
