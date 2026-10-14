/**
 * Form subscriptions: submitter-bound checkout and server-verified activation
 * (upstream PR 020).
 *
 * Drives the real Convex functions through convex-test: the Forms `submit`
 * mutation, the `subscription` action runner, `beginSubscriptionFirstCharge`,
 * the public `confirmFirstCharge`, and the signed Stripe webhook. Stripe is
 * faked at the SDK resource prototypes (the seam the commerce Stripe tests use),
 * backed by an in-memory store the test settles the way Stripe would.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { SIGN_IN_REQUIRED_ERROR } from "../../extensions/forms/commerce";
import * as checkoutModule from "../checkout";
import {
  clientSecretObjectId,
  decideFirstChargeConfirmation,
  type FirstChargeExpectation,
  type RetrievedFirstCharge,
} from "../firstChargeConfirmation";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/http.ts": () => import("../../http"),
  "./convex/commerce/payments.ts": () => import("../../commerce/payments"),
  "./convex/settings/httpInternals.ts": () => import("../../settings/httpInternals"),
  "./convex/settings/queries.ts": () => import("../../settings/queries"),
  "./convex/commerceSubscriptions/checkout.ts": () => import("../checkout"),
  "./convex/commerceSubscriptions/internals.ts": () => import("../internals"),
  "./convex/commerceSubscriptions/queries.ts": () => import("../queries"),
  "./convex/commerceSubscriptions/stripeCharge.ts": () => import("../stripeCharge"),
  "./convex/commerceSubscriptions/publicCharge.ts": () => import("../publicCharge"),
  "./convex/commerceSubscriptions/portal.ts": () => import("../portal"),
  "./convex/commerceSubscriptions/paymentMethods.ts": () => import("../paymentMethods"),
  "./convex/purchases/internals.ts": () => import("../../purchases/internals"),
  "./convex/membership/internals.ts": () => import("../../membership/internals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/extensions/forms/actions.ts": () => import("../../extensions/forms/actions"),
  "./convex/extensions/forms/commerce.ts": () => import("../../extensions/forms/commerce"),
  "./convex/extensions/forms/mutations.ts": () => import("../../extensions/forms/mutations"),
  "./convex/extensions/forms/spam.ts": () => import("../../extensions/forms/spam"),
  "./convex/extensions/forms/orderPayments.ts": () => import("../../extensions/forms/orderPayments"),
  "./convex/notifications/internals.ts": () => import("../../notifications/internals"),
};

const ADMIN_ISSUER = "https://convexpress-admin.local";
const WEBHOOK_SECRET = "whsec_form_subscription_checkout";
const STRIPE_KEY = "sk_test_form_subscription_checkout";
const CUSTOMER = "cus_formcheckout";
const stripe = new Stripe(STRIPE_KEY);

// ─── Fake Stripe (resource prototypes) ──────────────────────────────────────

type FakeStripeObject = {
  id: string;
  object: "payment_intent" | "setup_intent";
  status: string;
  client_secret: string;
  customer: string | null;
  payment_method: string | null;
  metadata: Record<string, string>;
  amount?: number;
  amount_received?: number;
  currency?: string;
};
type CreateParams = { amount?: number; currency?: string; customer?: string; metadata?: Record<string, string> };
type CreateOptions = { idempotencyKey?: string };
interface FakeableIntents {
  create(params: CreateParams, options?: CreateOptions): Promise<unknown>;
  retrieve(id: string): Promise<unknown>;
}
interface FakeablePaymentMethods {
  retrieve(id: string): Promise<unknown>;
}
interface FakeableCustomers {
  list(params: { email?: string }): Promise<unknown>;
  create(params: { email?: string }): Promise<unknown>;
}

const store = new Map<string, FakeStripeObject>();
const byIdempotencyKey = new Map<string, string>();
let sequence = 0;
let stripeCreates = 0;

function fakeCreate(object: FakeStripeObject["object"]) {
  return async (params: CreateParams, options?: CreateOptions): Promise<FakeStripeObject> => {
    stripeCreates += 1;
    const known = options?.idempotencyKey ? byIdempotencyKey.get(options.idempotencyKey) : undefined;
    const existing = known ? store.get(known) : undefined;
    if (existing) return existing;
    sequence += 1;
    const id = `${object === "payment_intent" ? "pi" : "seti"}_fake${sequence}`;
    const created: FakeStripeObject = {
      id,
      object,
      status: "requires_payment_method",
      client_secret: `${id}_secret_proof${sequence}`,
      customer: params.customer ?? null,
      payment_method: null,
      metadata: params.metadata ?? {},
      ...(object === "payment_intent"
        ? { amount: params.amount ?? 0, amount_received: 0, currency: params.currency ?? "usd" }
        : {}),
    };
    store.set(id, created);
    if (options?.idempotencyKey) byIdempotencyKey.set(options.idempotencyKey, id);
    return created;
  };
}

async function fakeRetrieve(id: string): Promise<FakeStripeObject> {
  const found = store.get(id);
  if (!found) {
    throw Object.assign(new Error(`No such object: '${id}'`), {
      type: "StripeInvalidRequestError",
      code: "resource_missing",
    });
  }
  return found;
}

/** Settle a stored object the way Stripe would after the card confirms. */
function settle(id: string, patch: Partial<FakeStripeObject> = {}) {
  const found = store.get(id);
  if (!found) throw new Error(`unknown Stripe object ${id}`);
  store.set(id, {
    ...found,
    status: "succeeded",
    payment_method: "pm_formcheckout",
    ...(found.object === "payment_intent" ? { amount_received: found.amount } : {}),
    ...patch,
  });
}

beforeEach(() => {
  store.clear();
  byIdempotencyKey.clear();
  sequence = 0;
  stripeCreates = 0;
  const paymentIntents: FakeableIntents = Object.getPrototypeOf(stripe.paymentIntents);
  const setupIntents: FakeableIntents = Object.getPrototypeOf(stripe.setupIntents);
  const customers: FakeableCustomers = Object.getPrototypeOf(stripe.customers);
  spyOn(paymentIntents, "create").mockImplementation(fakeCreate("payment_intent"));
  spyOn(paymentIntents, "retrieve").mockImplementation(fakeRetrieve);
  spyOn(setupIntents, "create").mockImplementation(fakeCreate("setup_intent"));
  spyOn(setupIntents, "retrieve").mockImplementation(fakeRetrieve);
  spyOn(customers, "list").mockImplementation(async () => ({ data: [] }));
  spyOn(customers, "create").mockImplementation(async () => ({ id: CUSTOMER }));
  const paymentMethodsApi: FakeablePaymentMethods = Object.getPrototypeOf(stripe.paymentMethods);
  spyOn(paymentMethodsApi, "retrieve").mockImplementation(async (id: string) => ({
    id,
    object: "payment_method",
    card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 },
  }));
});

afterEach(() => {
  // Each spy targets a shared prototype; restore so other suites see real Stripe.
  const paymentIntents: FakeableIntents = Object.getPrototypeOf(stripe.paymentIntents);
  const setupIntents: FakeableIntents = Object.getPrototypeOf(stripe.setupIntents);
  const customers: FakeableCustomers = Object.getPrototypeOf(stripe.customers);
  for (const target of [paymentIntents, setupIntents]) {
    for (const name of ["create", "retrieve"] as const) {
      const fn = target[name];
      if ("mockRestore" in fn && typeof fn.mockRestore === "function") fn.mockRestore();
    }
  }
  for (const name of ["list", "create"] as const) {
    const fn = customers[name];
    if ("mockRestore" in fn && typeof fn.mockRestore === "function") fn.mockRestore();
  }
  const paymentMethodsApi: FakeablePaymentMethods = Object.getPrototypeOf(stripe.paymentMethods);
  const retrieve = paymentMethodsApi.retrieve;
  if ("mockRestore" in retrieve && typeof retrieve.mockRestore === "function") retrieve.mockRestore();
});

// ─── Fixture ────────────────────────────────────────────────────────────────

type AccountPolicy = "require_existing" | "create_on_website";

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const user = (email: string, emailVerified = true) =>
      ctx.db.insert("users", { authSource: "local", email, emailVerified, status: "active", createdAt: 1, updatedAt: 1 });
    const owner = await user("owner@example.invalid");
    const other = await user("other@example.invalid");
    const unverified = await user("claimed@example.invalid", false);
    await ctx.db.insert("settings", {
      section: "plugins",
      values: { commerceEnabled: true, commerceSubscriptionsEnabled: true, membershipEnabled: true, formsEnabled: true },
      updatedAt: 1,
      updatedBy: owner,
    });
    await ctx.db.insert("settings", {
      section: "commerce.payments",
      values: {
        stripeSecretKey: STRIPE_KEY,
        stripeWebhookSecret: WEBHOOK_SECRET,
        stripePublishableKey: "pk_test_form_subscription_checkout",
        subscriptionChargingEnabled: true,
      },
      updatedAt: 1,
      updatedBy: owner,
    });
    const template = await ctx.db.insert("commerce_subscription_templates", {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1,
      pausable: true, cancelAtPeriodEndDefault: true, version: 1, createdAt: 1, updatedAt: 1,
    });
    const offer = (slug: string, recurringAmount: number, trialDaysOverride?: number) =>
      ctx.db.insert("commerce_subscription_offers", {
        title: slug, slug, status: "active", templateId: template, sourceType: "custom",
        availableInCart: false, availableInDirectForms: true, availableForAdminProvisioning: true,
        createNewSubscription: true, allowAddToExistingSubscription: false, currencyCode: "USD",
        recurringAmount, trialDaysOverride, entitlementCodes: ["pro"], createdAt: 1, updatedAt: 1,
      });
    await ctx.db.insert("membership_plans", {
      title: "Pro", slug: "pro", status: "active", grantMode: "subscription", linkedSubscriptionCode: "pro",
      priority: 1, createdAt: 1, updatedAt: 1,
    });
    const group = await ctx.db.insert("fieldGroups", {
      title: "Fields", key: "doctor-signup", locationRules: [], position: "normal", style: "default",
      labelPlacement: "top", instructionPlacement: "label", isActive: true, menuOrder: 0, createdBy: owner,
      createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("fieldDefinitions", {
      groupId: group, key: "email", name: "email", label: "Email", type: "email", required: true, settings: "{}",
      menuOrder: 0, createdAt: 1, updatedAt: 1,
    });
    const form = await ctx.db.insert("forms", {
      title: "Doctor signup", slug: "doctor-signup", status: "published", fieldGroupId: group, settings: "{}",
      createdBy: owner, createdAt: 1, updatedAt: 1,
    });
    return {
      owner, other, unverified, form,
      paid: await offer("paid", 1500),
      trial: await offer("trial", 1500, 14),
      free: await offer("free", 0),
    };
  });
  const as = (userId: Id<"users">) =>
    t.withIdentity({ subject: userId, tokenIdentifier: `${ADMIN_ISSUER}|${userId}` });
  return { t, ids, owner: as(ids.owner), other: as(ids.other), unverified: as(ids.unverified), as };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Client = Fixture["owner"];

/** Configure the form's checkout action. */
async function addAction(f: Fixture, offerId: Id<"commerce_subscription_offers">, accountPolicy: AccountPolicy) {
  return await f.t.run((ctx) =>
    ctx.db.insert("form_actions", {
      formId: f.ids.form, type: "subscription", label: "Subscribe", enabled: true, order: 0,
      config: JSON.stringify({ offerMode: "fixed", offerId, emailFieldName: "email", accountPolicy }),
    }),
  );
}

/**
 * Submit the form as `client`, then run the form's checkout action the way the
 * `form.submitted` runner does (claim a run, dispatch it).
 */
async function submitAndRun(f: Fixture, client: Client, email: string, actionId: Id<"form_actions">) {
  const { submissionId } = await client.mutation(api.extensions.forms.mutations.submit, {
    formId: f.ids.form,
    values: [{ fieldKey: "email", value: email }],
    isComplete: true,
    startedAt: Date.now() - 10_000,
  });
  const runId = await f.t.run((ctx) =>
    ctx.db.insert("form_action_runs", {
      submissionId, formActionId: actionId, type: "subscription", status: "pending", attempts: 0,
      formId: f.ids.form, nextAttemptAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
    }),
  );
  await f.t.action(internal.extensions.forms.actions.dispatchAction, { runId });
  const run = await f.t.run((ctx) => ctx.db.get(runId));
  if (!run) throw new Error("run vanished");
  return { submissionId, runId, run };
}

/** Submit + run, and return the pending-payment descriptor the Website reads. */
async function startPaidCheckout(f: Fixture, client: Client, email: string, actionId: Id<"form_actions">) {
  const started = await submitAndRun(f, client, email, actionId);
  expect(started.run.status).toBe("awaiting_payment");
  const pending = await client.query(api.extensions.forms.actions.getPendingPayment, {
    submissionId: started.submissionId,
  });
  if (!pending?.intentId || !pending.clientSecret) throw new Error("no pending payment descriptor");
  const objectId = clientSecretObjectId(pending.clientSecret);
  if (!objectId) throw new Error("malformed client secret");
  return { ...started, pending, intentId: pending.intentId, clientSecret: pending.clientSecret, objectId };
}

type Started = Awaited<ReturnType<typeof startPaidCheckout>>;

function confirmArgs(started: Started, overrides: Partial<{ clientSecret: string; checkoutIntentId: string }> = {}) {
  const idArg = started.objectId.startsWith("seti_")
    ? { setupIntentId: started.objectId }
    : { paymentIntentId: started.objectId };
  return { checkoutIntentId: started.intentId, clientSecret: started.clientSecret, ...idArg, ...overrides };
}

const snapshot = (f: Fixture) =>
  f.t.run(async (ctx) => ({
    subscriptions: await ctx.db.query("commerce_subscriptions").collect(),
    completedEvents: (await ctx.db.query("events").collect()).filter((row) => row.code === "form.action_completed"),
  }));

const intentRow = (f: Fixture, intentId: string) =>
  f.t.run(async (ctx) => {
    const id = ctx.db.normalizeId("commerce_subscription_checkout_intents", intentId);
    return id ? await ctx.db.get(id) : null;
  });

async function signedWebhook(f: Fixture, object: FakeStripeObject, eventId: string) {
  const payload = JSON.stringify({
    id: eventId,
    object: "event",
    type: object.object === "payment_intent" ? "payment_intent.succeeded" : "setup_intent.succeeded",
    data: { object },
  });
  const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: WEBHOOK_SECRET });
  return await f.t.fetch("/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": header } });
}

function storedObject(id: string): FakeStripeObject {
  const found = store.get(id);
  if (!found) throw new Error(`unknown Stripe object ${id}`);
  return found;
}

// ─── Submitter identity ─────────────────────────────────────────────────────

describe("form checkout: submitter identity", () => {
  test("a signed-in submitter's checkout intent is bound to that account and the submission", async () => {
    const f = await fixture();
    const actionId = await addAction(f, f.ids.paid, "require_existing");
    // The email typed into the form names another account; the submitter still owns the intent.
    const started = await startPaidCheckout(f, f.owner, "other@example.invalid", actionId);
    const intent = await intentRow(f, started.intentId);
    expect(intent).toMatchObject({
      userId: f.ids.owner,
      email: "owner@example.invalid",
      initialAmount: 1500,
      status: "payment_pending",
      stripeCustomerId: CUSTOMER,
      paymentTransactionId: started.objectId,
    });
    expect(intent?.metadata).toMatchObject({ sourceFormId: f.ids.form, sourceFormSubmissionId: started.submissionId });
    expect(storedObject(started.objectId).metadata).toEqual({
      kind: "subscription_first_charge",
      checkoutIntentId: started.intentId,
    });
    expect(await f.owner.query(api.extensions.forms.actions.getCheckoutStatus, { submissionId: started.submissionId }))
      .toEqual({ state: "awaiting_payment" });
  });

  test("require_existing refuses a signed-out submission before any charge starts", async () => {
    const f = await fixture();
    const actionId = await addAction(f, f.ids.paid, "require_existing");
    const { submissionId, run } = await submitAndRun(f, f.t, "owner@example.invalid", actionId);
    expect([run.status, run.error]).toEqual(["failed", SIGN_IN_REQUIRED_ERROR]);
    expect(stripeCreates).toBe(0);
    expect(await f.t.run((ctx) => ctx.db.query("commerce_subscription_checkout_intents").collect())).toEqual([]);
    expect(await f.t.query(api.extensions.forms.actions.getCheckoutStatus, { submissionId }))
      .toEqual({ state: "failed", reason: "sign_in_required" });
  });

  test("create_on_website starts a guest checkout for the typed email, with no account bound", async () => {
    const f = await fixture();
    const actionId = await addAction(f, f.ids.paid, "create_on_website");
    const started = await startPaidCheckout(f, f.t, "Guest@Example.invalid", actionId);
    const intent = await intentRow(f, started.intentId);
    expect(intent?.userId).toBeUndefined();
    expect(intent?.email).toBe("Guest@Example.invalid");
  });

  test("a submission recorded with an account that is no longer active never starts a checkout", async () => {
    const f = await fixture();
    const actionId = await addAction(f, f.ids.paid, "create_on_website");
    const { submissionId } = await f.owner.mutation(api.extensions.forms.mutations.submit, {
      formId: f.ids.form, values: [{ fieldKey: "email", value: "owner@example.invalid" }], isComplete: true,
      startedAt: Date.now() - 10_000,
    });
    await f.t.run((ctx) => ctx.db.patch("users", f.ids.owner, { status: "banned" }));
    const created = await f.t.mutation(internal.commerceSubscriptions.checkout.createCheckoutIntentForSubmission, {
      submissionId, offerId: f.ids.paid, customerEmail: "owner@example.invalid", accountPolicy: "create_on_website",
    });
    expect(created).toEqual({ ok: false, reason: "sign_in_required" });
    expect(actionId).toBeDefined();
  });

  test("the public checkout start no longer accepts a client-supplied form linkage", () => {
    const registered: unknown = checkoutModule.createCheckoutIntent;
    const exportArgs =
      typeof registered === "function" && "exportArgs" in registered && typeof registered.exportArgs === "function"
        ? registered.exportArgs()
        : null;
    expect(typeof exportArgs).toBe("string");
    const args = String(exportArgs);
    expect(args.includes('"offerId"')).toBe(true);
    expect(args.includes('"formId"')).toBe(false);
    expect(args.includes('"formSubmissionId"')).toBe(false);
  });

  test("a pending payment and checkout status are readable only by the signed-in submitter", async () => {
    const f = await fixture();
    const actionId = await addAction(f, f.ids.paid, "require_existing");
    const started = await startPaidCheckout(f, f.owner, "owner@example.invalid", actionId);
    for (const stranger of [f.t, f.other]) {
      expect(await stranger.query(api.extensions.forms.actions.getPendingPayment, { submissionId: started.submissionId }))
        .toBeNull();
      expect(await stranger.query(api.extensions.forms.actions.getCheckoutStatus, { submissionId: started.submissionId }))
        .toEqual({ state: "failed", reason: "sign_in_required" });
    }
  });
});

// ─── confirmFirstCharge ─────────────────────────────────────────────────────

describe("form checkout: server-verified activation", () => {
  test("confirming a succeeded PaymentIntent activates now, completes the form run once, then the webhook is a no-op", async () => {
    const f = await fixture();
    const actionId = await addAction(f, f.ids.paid, "require_existing");
    const started = await startPaidCheckout(f, f.owner, "owner@example.invalid", actionId);

    // Before Stripe settles: pending, nothing activated.
    store.set(started.objectId, { ...storedObject(started.objectId), status: "processing" });
    expect(await f.owner.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, confirmArgs(started)))
      .toEqual({ status: "pending", reason: "processing" });
    expect((await snapshot(f)).subscriptions).toEqual([]);

    settle(started.objectId);
    const confirmed = await f.owner.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, confirmArgs(started));
    if (confirmed.status !== "active") throw new Error(`expected active, got ${JSON.stringify(confirmed)}`);
    expect(confirmed.subscriptionStatus).toBe("active");
    expect(confirmed.formSubmissionId).toBe(started.submissionId);

    const state = await snapshot(f);
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]).toMatchObject({
      _id: confirmed.subscriptionId, userId: f.ids.owner, status: "active", paymentProvider: "stripe",
      paymentTransactionId: started.objectId, stripeCustomerId: CUSTOMER, defaultPaymentMethodId: "pm_formcheckout",
      sourceFormSubmissionId: started.submissionId,
    });
    expect(state.completedEvents).toHaveLength(1);
    expect(JSON.parse(state.completedEvents[0]?.payload ?? "{}")).toMatchObject({
      formId: f.ids.form, submissionId: started.submissionId, formActionId: actionId, actionType: "subscription",
      result: { contractId: confirmed.subscriptionId, paid: true },
    });
    const run: Doc<"form_action_runs"> | null = await f.t.run((ctx) => ctx.db.get(started.runId));
    expect(run?.status).toBe("completed");
    // The single-use client secret is no longer stored on the run.
    expect(run?.result?.includes("_secret_")).toBe(false);
    expect(await f.owner.query(api.extensions.forms.actions.getPendingPayment, { submissionId: started.submissionId }))
      .toBeNull();
    expect(await f.owner.query(api.extensions.forms.actions.getCheckoutStatus, { submissionId: started.submissionId }))
      .toEqual({ state: "completed", paid: true });

    // The signup charge is the contract's first invoice: paid, numbered, for
    // the first period, and listed in the customer's billing history.
    const invoices = await f.owner.query(api.commerceSubscriptions.portal.listMyInvoices, {});
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      kind: "signup", status: "paid", totalAmount: 1500, currencyCode: "USD",
      periodEndAt: state.subscriptions[0]?.currentPeriodEndAt,
    });
    expect(invoices[0]?.invoiceNumber).toMatch(/^INV-\d{6}$/);

    // A replayed confirmation and the late webhook change nothing.
    const replay = await f.owner.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, confirmArgs(started));
    expect(replay).toMatchObject({ status: "active", subscriptionId: confirmed.subscriptionId });
    expect((await signedWebhook(f, storedObject(started.objectId), "evt_late_webhook")).status).toBe(200);
    const after = await snapshot(f);
    expect(after.subscriptions.map((row) => row._id)).toEqual([confirmed.subscriptionId]);
    expect(after.completedEvents).toHaveLength(1);
    expect(await f.owner.query(api.commerceSubscriptions.portal.listMyInvoices, {})).toHaveLength(1);
  });

  test("when the webhook activates first, confirming returns the same contract and completes nothing twice", async () => {
    const f = await fixture();
    const actionId = await addAction(f, f.ids.paid, "require_existing");
    const started = await startPaidCheckout(f, f.owner, "owner@example.invalid", actionId);
    settle(started.objectId);
    expect((await signedWebhook(f, storedObject(started.objectId), "evt_first")).status).toBe(200);
    const byWebhook = await snapshot(f);
    expect(byWebhook.subscriptions).toHaveLength(1);
    expect(byWebhook.completedEvents).toHaveLength(1);
    expect((await f.t.run((ctx) => ctx.db.get(started.runId)))?.status).toBe("completed");

    const confirmed = await f.owner.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, confirmArgs(started));
    expect(confirmed).toMatchObject({ status: "active", subscriptionId: byWebhook.subscriptions[0]?._id });
    const after = await snapshot(f);
    expect(after.subscriptions).toHaveLength(1);
    expect(after.completedEvents).toHaveLength(1);
  });

  test("a payment that does not settle this checkout never activates", async () => {
    const f = await fixture();
    const actionId = await addAction(f, f.ids.paid, "require_existing");
    const started = await startPaidCheckout(f, f.owner, "owner@example.invalid", actionId);
    const confirm = () =>
      f.owner.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, confirmArgs(started));
    const base = storedObject(started.objectId);
    const variants: Array<[string, Partial<FakeStripeObject>]> = [
      ["metadata names another intent", { metadata: { ...base.metadata, checkoutIntentId: "another_intent" } }],
      ["metadata kind is not a first charge", { metadata: { ...base.metadata, kind: "form_order_payment" } }],
      ["another Stripe customer", { customer: "cus_someone_else" }],
      ["short amount received", { amount_received: 100 }],
      ["a different charged amount", { amount: 900, amount_received: 900 }],
      ["another currency", { currency: "eur" }],
    ];
    for (const [label, patch] of variants) {
      settle(started.objectId, patch);
      expect({ label, result: await confirm() }).toEqual({
        label,
        result: { status: "failed", reason: "verification_failed" },
      });
      store.set(started.objectId, base);
    }

    // Stripe's own non-success states.
    for (const [status, expected] of [
      ["requires_payment_method", { status: "failed", reason: "payment_failed" }],
      ["requires_action", { status: "pending", reason: "processing" }],
      ["canceled", { status: "failed", reason: "checkout_closed" }],
    ] as const) {
      store.set(started.objectId, { ...base, status });
      expect(await confirm()).toEqual(expected);
    }

    // A real, succeeded PaymentIntent of ANOTHER checkout cannot settle this one.
    const second = await startPaidCheckout(f, f.owner, "owner@example.invalid", actionId);
    settle(second.objectId);
    settle(started.objectId, { status: "requires_payment_method" });
    await expect(
      f.owner.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, {
        checkoutIntentId: started.intentId,
        paymentIntentId: second.objectId,
        clientSecret: second.clientSecret,
      }),
    ).resolves.toEqual({ status: "failed", reason: "verification_failed" });

    // An object Stripe does not have.
    await expect(
      f.owner.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, {
        checkoutIntentId: started.intentId,
        paymentIntentId: "pi_missing1",
        clientSecret: "pi_missing1_secret_x",
      }),
    ).resolves.toEqual({ status: "failed", reason: "verification_failed" });

    const state = await snapshot(f);
    expect(state.subscriptions).toEqual([]);
    expect(state.completedEvents).toEqual([]);
    expect((await intentRow(f, started.intentId))?.status).toBe("payment_pending");
  });

  test("only the checkout's own account, holding its client secret, may confirm it", async () => {
    const f = await fixture();
    const actionId = await addAction(f, f.ids.paid, "require_existing");
    const started = await startPaidCheckout(f, f.owner, "owner@example.invalid", actionId);
    settle(started.objectId);
    const confirm = (client: Client, args = confirmArgs(started)) =>
      client.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, args);

    await expect(confirm(f.other)).rejects.toThrow("belongs to another account");
    await expect(confirm(f.t)).rejects.toThrow("belongs to another account");
    // The owner with a forged secret for the right object is refused too.
    await expect(
      confirm(f.owner, confirmArgs(started, { clientSecret: `${started.objectId}_secret_forged` })),
    ).rejects.toThrow("not started by this checkout session");
    await expect(
      confirm(f.owner, confirmArgs(started, { checkoutIntentId: "not-an-intent" })),
    ).rejects.toThrow("Checkout not found");
    // Malformed requests never reach Stripe.
    const malformed = [
      { checkoutIntentId: started.intentId, clientSecret: started.clientSecret },
      { ...confirmArgs(started), setupIntentId: "seti_fake99" },
      { checkoutIntentId: started.intentId, paymentIntentId: "pi_bad/../x", clientSecret: "pi_bad/../x_secret_y" },
      { checkoutIntentId: started.intentId, paymentIntentId: started.objectId, clientSecret: "pi_other1_secret_y" },
    ];
    for (const args of malformed) {
      await expect(confirm(f.owner, args)).rejects.toThrow("VALIDATION_ERROR");
    }
    expect((await snapshot(f)).subscriptions).toEqual([]);
  });

  test("a guest checkout activates only for the single verified owner of its email", async () => {
    const f = await fixture();
    const actionId = await addAction(f, f.ids.paid, "create_on_website");
    const started = await startPaidCheckout(f, f.t, "guest@example.invalid", actionId);
    settle(started.objectId);

    // Holding the intent id is not enough: the client secret is the proof.
    await expect(
      f.t.action(
        api.commerceSubscriptions.publicCharge.confirmFirstCharge,
        confirmArgs(started, { clientSecret: `${started.objectId}_secret_guess` }),
      ),
    ).rejects.toThrow("not started by this checkout session");

    // Paid, but the account is not created/verified yet.
    expect(await f.t.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, confirmArgs(started)))
      .toEqual({ status: "pending", reason: "account_required" });
    const guest = await f.t.run((ctx) =>
      ctx.db.insert("users", { authSource: "clerk", email: "guest@example.invalid", emailVerified: false, status: "active", createdAt: 1, updatedAt: 1 }),
    );
    expect(await f.t.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, confirmArgs(started)))
      .toEqual({ status: "pending", reason: "account_required" });
    await f.t.run((ctx) => ctx.db.patch("users", guest, { emailVerified: true }));

    const confirmed = await f.as(guest).action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, confirmArgs(started));
    expect(confirmed).toMatchObject({ status: "active", formSubmissionId: started.submissionId });
    expect((await snapshot(f)).subscriptions.map((row) => row.userId)).toEqual([guest]);
  });

  test("an email verified on more than one account is ambiguous and never activates a guest checkout", async () => {
    const f = await fixture();
    const actionId = await addAction(f, f.ids.paid, "create_on_website");
    const started = await startPaidCheckout(f, f.t, "shared@example.invalid", actionId);
    settle(started.objectId);
    await f.t.run(async (ctx) => {
      for (const authSource of ["local", "clerk"] as const) {
        await ctx.db.insert("users", { authSource, email: "shared@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
      }
    });
    expect(await f.t.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, confirmArgs(started)))
      .toEqual({ status: "failed", reason: "account_mismatch" });
    expect((await signedWebhook(f, storedObject(started.objectId), "evt_ambiguous")).status).toBe(400);
    expect((await snapshot(f)).subscriptions).toEqual([]);
  });

  test("when the checkout's account and its email's verified owner disagree, neither path activates", async () => {
    const f = await fixture();
    const actionId = await addAction(f, f.ids.paid, "require_existing");
    // The submitter's account email is unverified and another account has verified it.
    const started = await startPaidCheckout(f, f.unverified, "claimed@example.invalid", actionId);
    settle(started.objectId);
    await f.t.run((ctx) =>
      ctx.db.insert("users", { authSource: "clerk", email: "claimed@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 }),
    );
    expect(await f.unverified.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, confirmArgs(started)))
      .toEqual({ status: "failed", reason: "account_mismatch" });
    expect((await signedWebhook(f, storedObject(started.objectId), "evt_mismatch")).status).toBe(400);
    expect((await snapshot(f)).subscriptions).toEqual([]);
    expect((await f.t.run((ctx) => ctx.db.get(started.runId)))?.status).toBe("awaiting_payment");
  });

  test("a $0-now trial confirms through its SetupIntent and saves the card", async () => {
    const f = await fixture();
    const actionId = await addAction(f, f.ids.trial, "require_existing");
    const started = await startPaidCheckout(f, f.owner, "owner@example.invalid", actionId);
    expect(started.objectId.startsWith("seti_")).toBe(true);
    expect(started.pending.mode).toBe("setup");

    // Succeeded without a saved payment method is not a usable card.
    settle(started.objectId, { payment_method: null });
    expect(await f.owner.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, confirmArgs(started)))
      .toEqual({ status: "failed", reason: "verification_failed" });

    settle(started.objectId);
    const confirmed = await f.owner.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, confirmArgs(started));
    expect(confirmed).toMatchObject({ status: "active", subscriptionStatus: "trialing" });
    const state = await snapshot(f);
    expect(state.subscriptions[0]).toMatchObject({
      userId: f.ids.owner, status: "trialing", defaultPaymentMethodId: "pm_formcheckout", stripeCustomerId: CUSTOMER,
      sourceFormSubmissionId: started.submissionId,
    });
    expect(state.completedEvents).toHaveLength(1);
    expect((await signedWebhook(f, storedObject(started.objectId), "evt_setup_late")).status).toBe(200);
    expect((await snapshot(f)).subscriptions).toHaveLength(1);
  });

  test("an expired checkout cannot be confirmed", async () => {
    const f = await fixture();
    const actionId = await addAction(f, f.ids.paid, "require_existing");
    const started = await startPaidCheckout(f, f.owner, "owner@example.invalid", actionId);
    settle(started.objectId);
    await f.t.run(async (ctx) => {
      const id = ctx.db.normalizeId("commerce_subscription_checkout_intents", started.intentId);
      if (id) await ctx.db.patch("commerce_subscription_checkout_intents", id, { status: "expired" });
    });
    expect(await f.owner.action(api.commerceSubscriptions.publicCharge.confirmFirstCharge, confirmArgs(started)))
      .toEqual({ status: "failed", reason: "checkout_closed" });
    expect((await snapshot(f)).subscriptions).toEqual([]);
  });
});

// ─── Pure rules ─────────────────────────────────────────────────────────────

describe("first-charge confirmation rules", () => {
  const expected: FirstChargeExpectation = {
    checkoutIntentId: "intent_1", intentStatus: "payment_pending", initialAmount: 1500, currencyCode: "USD",
    stripeCustomerId: "cus_1", paymentTransactionId: "pi_1",
  };
  const paid: RetrievedFirstCharge = {
    kind: "payment_intent", id: "pi_1", status: "succeeded", clientSecret: "pi_1_secret_a",
    metadata: { kind: "subscription_first_charge", checkoutIntentId: "intent_1" }, customerId: "cus_1",
    paymentMethodId: "pm_1", amount: 1500, amountReceived: 1500, currency: "usd",
  };

  test("a matching succeeded PaymentIntent settles with Stripe's own facts", () => {
    expect(decideFirstChargeConfirmation(expected, paid, "pi_1_secret_a")).toEqual({
      outcome: "settle",
      settlement: {
        kind: "payment_intent", checkoutIntentRef: "intent_1", paymentIntentId: "pi_1", paymentIntentStatus: "succeeded",
        amountReceived: 1500, currency: "usd", paymentMethodId: "pm_1", stripeCustomerId: "cus_1",
      },
    });
  });

  test("proof is checked before anything about the intent is revealed", () => {
    expect(decideFirstChargeConfirmation({ ...expected, intentStatus: "expired" }, paid, "pi_1_secret_b"))
      .toEqual({ outcome: "forbidden" });
    expect(decideFirstChargeConfirmation(expected, { ...paid, clientSecret: null }, "pi_1_secret_a"))
      .toEqual({ outcome: "forbidden" });
  });

  test("an intent the server never recorded a Stripe object or customer for cannot be settled", () => {
    for (const missing of [{ paymentTransactionId: undefined }, { stripeCustomerId: undefined }]) {
      expect(decideFirstChargeConfirmation({ ...expected, ...missing }, paid, "pi_1_secret_a"))
        .toEqual({ outcome: "failed", reason: "verification_failed" });
    }
  });

  test("a SetupIntent never settles an intent that charges now", () => {
    const setup: RetrievedFirstCharge = {
      kind: "setup_intent", id: "pi_1", status: "succeeded", clientSecret: "pi_1_secret_a",
      metadata: { kind: "subscription_setup", checkoutIntentId: "intent_1" }, customerId: "cus_1", paymentMethodId: "pm_1",
    };
    expect(decideFirstChargeConfirmation(expected, setup, "pi_1_secret_a"))
      .toEqual({ outcome: "failed", reason: "verification_failed" });
  });

  test("client secrets name their Stripe object", () => {
    expect(clientSecretObjectId("pi_123_secret_abc")).toBe("pi_123");
    expect(clientSecretObjectId("seti_9_secret_x")).toBe("seti_9");
    expect(clientSecretObjectId("nonsense")).toBeNull();
    expect(clientSecretObjectId("_secret_x")).toBeNull();
  });
});
