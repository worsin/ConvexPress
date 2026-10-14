/**
 * Payment trust boundary (upstream PR 011).
 *
 * A subscription grants access, so its activation must never rest on a
 * client's word that a payment happened. These tests drive the real Convex
 * functions through convex-test, including the Stripe webhook HTTP route with
 * genuinely signed events.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import schema from "../../schema";
import * as checkoutModule from "../checkout";
import * as couponsModule from "../coupons";
import * as mutationsModule from "../mutations";
import * as offersModule from "../offers";
import * as portalModule from "../portal";
import * as publicChargeModule from "../publicCharge";
import * as queriesModule from "../queries";
import * as paymentsModule from "../../commerce/payments";
import * as storeCreditModule from "../../commerceReturns/storeCredit";
import * as formsCommerceModule from "../../extensions/forms/commerce";
import * as orderPaymentActionsModule from "../../extensions/forms/orderPaymentActions";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/http.ts": () => import("../../http"),
  "./convex/commerce/payments.ts": () => import("../../commerce/payments"),
  "./convex/settings/httpInternals.ts": () => import("../../settings/httpInternals"),
  "./convex/commerceSubscriptions/checkout.ts": () => import("../checkout"),
  "./convex/commerceSubscriptions/internals.ts": () => import("../internals"),
  "./convex/commerceSubscriptions/paymentMethods.ts": () => import("../paymentMethods"),
  "./convex/commerceSubscriptions/stripeCharge.ts": () => import("../stripeCharge"),
  "./convex/commerceSubscriptions/publicCharge.ts": () => import("../publicCharge"),
  "./convex/commerceSubscriptions/portal.ts": () => import("../portal"),
  "./convex/commerceSubscriptions/mutations.ts": () => import("../mutations"),
  "./convex/commerceSubscriptions/proration.ts": () => import("../proration"),
  "./convex/purchases/internals.ts": () => import("../../purchases/internals"),
  "./convex/membership/internals.ts": () => import("../../membership/internals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/extensions/forms/mutations.ts": () => import("../../extensions/forms/mutations"),
  "./convex/extensions/forms/spam.ts": () => import("../../extensions/forms/spam"),
  "./convex/extensions/forms/orderPayments.ts": () => import("../../extensions/forms/orderPayments"),
  "./convex/notifications/internals.ts": () => import("../../notifications/internals"),
};

const ADMIN_ISSUER = "https://convexpress-admin.local";
const WEBHOOK_SECRET = "whsec_payment_trust_boundary";
const stripe = new Stripe("sk_test_payment_trust_boundary");

type OfferPricing = {
  recurringAmount: number;
  setupFeeAmount?: number;
  trialDaysOverride?: number;
  status?: Doc<"commerce_subscription_offers">["status"];
  availableInDirectForms?: boolean;
  availableInCart?: boolean;
};

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
      values: { stripeSecretKey: "sk_test_payment_trust_boundary", stripeWebhookSecret: WEBHOOK_SECRET },
      updatedAt: 1,
      updatedBy: owner,
    });
    const template = await ctx.db.insert("commerce_subscription_templates", {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1,
      pausable: true, cancelAtPeriodEndDefault: true, version: 1, createdAt: 1, updatedAt: 1,
    });
    const offer = (slug: string, pricing: OfferPricing) =>
      ctx.db.insert("commerce_subscription_offers", {
        title: slug, slug, status: pricing.status ?? "active", templateId: template, sourceType: "custom",
        availableInCart: pricing.availableInCart ?? false,
        availableInDirectForms: pricing.availableInDirectForms ?? true,
        availableForAdminProvisioning: true, createNewSubscription: true, allowAddToExistingSubscription: false,
        currencyCode: "USD", recurringAmount: pricing.recurringAmount, setupFeeAmount: pricing.setupFeeAmount,
        trialDaysOverride: pricing.trialDaysOverride, entitlementCodes: ["pro"], createdAt: 1, updatedAt: 1,
      });
    const plan = await ctx.db.insert("membership_plans", {
      title: "Pro", slug: "pro", status: "active", grantMode: "subscription", linkedSubscriptionCode: "pro",
      priority: 1, createdAt: 1, updatedAt: 1,
    });
    return {
      owner, other, unverified, template, plan,
      free: await offer("free", { recurringAmount: 0 }),
      paid: await offer("paid", { recurringAmount: 1500 }),
      trial: await offer("trial", { recurringAmount: 1500, trialDaysOverride: 14 }),
      setupFee: await offer("setup-fee", { recurringAmount: 0, setupFeeAmount: 500 }),
      draft: await offer("draft", { recurringAmount: 0, status: "draft" }),
      adminOnly: await offer("admin-only", { recurringAmount: 0, availableInDirectForms: false }),
    };
  });
  const as = (userId: Id<"users">) =>
    t.withIdentity({ subject: userId, tokenIdentifier: `${ADMIN_ISSUER}|${userId}` });
  const snapshot = () =>
    t.run(async (ctx) => ({
      subscriptions: await ctx.db.query("commerce_subscriptions").collect(),
      entitlements: await ctx.db.query("commerce_subscription_entitlements").collect(),
      grants: await ctx.db.query("membership_grants").collect(),
    }));
  const intent = (intentId: Id<"commerce_subscription_checkout_intents">) => t.run((ctx) => ctx.db.get(intentId));
  return { t, ids, owner: as(ids.owner), other: as(ids.other), unverified: as(ids.unverified), snapshot, intent };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function signedStripeEvent(f: Fixture, event: Record<string, unknown>, signature?: string) {
  const payload = JSON.stringify(event);
  const header = signature ?? (await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: WEBHOOK_SECRET }));
  return await f.t.fetch("/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": header } });
}

function paymentIntentSucceeded(
  eventId: string,
  checkoutIntentId: string,
  amountReceived: number,
  currency = "usd",
) {
  return {
    id: eventId,
    object: "event",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: `pi_${eventId}`, object: "payment_intent", status: "succeeded", amount: amountReceived,
        amount_received: amountReceived, currency, customer: "cus_trust_boundary", payment_method: "pm_trust_boundary",
        metadata: { kind: "subscription_first_charge", checkoutIntentId },
      },
    },
  };
}

function setupIntentSucceeded(eventId: string, checkoutIntentId: string) {
  return {
    id: eventId,
    object: "event",
    type: "setup_intent.succeeded",
    data: {
      object: {
        id: `seti_${eventId}`, object: "setup_intent", status: "succeeded", customer: "cus_trust_boundary",
        payment_method: "pm_trust_boundary", metadata: { kind: "subscription_setup", checkoutIntentId },
      },
    },
  };
}

/** The JSON arg validator of a registered public function, or null. */
function publicArgsOf(value: unknown): string | null {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return null;
  if (!("isPublic" in value) || value.isPublic !== true) return null;
  if (!("exportArgs" in value) || typeof value.exportArgs !== "function") return null;
  const exported: unknown = value.exportArgs();
  return typeof exported === "string" ? exported : null;
}

// Activation reads the card's display summary from Stripe in the background
// (paymentMethods.refreshPaymentMethodSummary); answer it locally.
interface FakeablePaymentMethods {
  retrieve(id: string): Promise<unknown>;
}
beforeEach(() => {
  const paymentMethodsApi: FakeablePaymentMethods = Object.getPrototypeOf(new Stripe("sk_test_summary").paymentMethods);
  spyOn(paymentMethodsApi, "retrieve").mockImplementation(async (id: string) => ({
    id,
    object: "payment_method",
    card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 },
  }));
});
afterEach(() => {
  const paymentMethodsApi: FakeablePaymentMethods = Object.getPrototypeOf(new Stripe("sk_test_summary").paymentMethods);
  const fn = paymentMethodsApi.retrieve;
  if ("mockRestore" in fn && typeof fn.mockRestore === "function") fn.mockRestore();
});

describe("payment trust boundary: subscription activation", () => {
  test("no public function accepts a payment outcome, and paid activation is internal", () => {
    expect(checkoutModule.activateFromIntent.isInternal).toBe(true);
    expect(checkoutModule.activateFreeIntentForSubmission.isInternal).toBe(true);
    expect(storeCreditModule.redeem.isInternal).toBe(true);
    const paymentFacts = /"(paymentResult|settlement|providerTransactionId|amountReceived|paymentIntentStatus|paidAt|succeeded)"/;
    const surfaces = {
      checkoutModule, couponsModule, mutationsModule, offersModule, portalModule, publicChargeModule,
      queriesModule, paymentsModule, storeCreditModule, formsCommerceModule, orderPaymentActionsModule,
    };
    let publicFunctions = 0;
    for (const [surface, exports] of Object.entries(surfaces)) {
      for (const [name, value] of Object.entries(exports)) {
        const args = publicArgsOf(value);
        if (args === null) continue;
        publicFunctions += 1;
        expect({ fn: `${surface}.${name}`, acceptsPaymentFact: paymentFacts.test(args) }).toEqual({
          fn: `${surface}.${name}`,
          acceptsPaymentFact: false,
        });
      }
    }
    expect(publicFunctions).toBeGreaterThan(40);
  });

  test("a client cannot activate a paid intent through the public free activation", async () => {
    const f = await fixture();
    for (const offerId of [f.ids.paid, f.ids.trial, f.ids.setupFee]) {
      const created = await f.owner.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, { offerId });
      await expect(
        f.owner.mutation(api.commerceSubscriptions.checkout.activateFreeIntent, { intentId: created.intentId }),
      ).rejects.toThrow("This checkout has a price");
      expect((await f.intent(created.intentId))?.status).toBe("payment_pending");
    }
    expect(await f.snapshot()).toEqual({ subscriptions: [], entitlements: [], grants: [] });
  });

  test("a free intent is rejected when any server-computed amount is non-zero", async () => {
    const f = await fixture();
    // Stored amounts claim free, but the offer prices it: the recomputation wins.
    const tampered = await f.t.run((ctx) =>
      ctx.db.insert("commerce_subscription_checkout_intents", {
        sourceChannel: "direct_form", status: "payment_pending", userId: f.ids.owner, email: "owner@example.invalid",
        selectedOfferIds: [f.ids.paid], initialAmount: 0, recurringAmount: 0, setupFeeAmount: 0, currencyCode: "USD",
        createdAt: 1, updatedAt: 1,
      }),
    );
    await expect(
      f.owner.mutation(api.commerceSubscriptions.checkout.activateFreeIntent, { intentId: tampered }),
    ).rejects.toThrow("This checkout has a price");
    // A free offer whose stored intent carries a non-zero setup fee is refused too.
    const staleFee = await f.t.run((ctx) =>
      ctx.db.insert("commerce_subscription_checkout_intents", {
        sourceChannel: "direct_form", status: "payment_pending", userId: f.ids.owner, email: "owner@example.invalid",
        selectedOfferIds: [f.ids.free], initialAmount: 0, recurringAmount: 0, setupFeeAmount: 250, currencyCode: "USD",
        createdAt: 1, updatedAt: 1,
      }),
    );
    await expect(
      f.owner.mutation(api.commerceSubscriptions.checkout.activateFreeIntent, { intentId: staleFee }),
    ).rejects.toThrow("This checkout has a price");
    expect((await f.snapshot()).subscriptions).toEqual([]);
  });

  test("a non-owner cannot activate someone else's free intent", async () => {
    const f = await fixture();
    const signedIn = await f.owner.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, { offerId: f.ids.free });
    await expect(
      f.t.mutation(api.commerceSubscriptions.checkout.activateFreeIntent, { intentId: signedIn.intentId }),
    ).rejects.toThrow("Authentication required");
    await expect(
      f.other.mutation(api.commerceSubscriptions.checkout.activateFreeIntent, { intentId: signedIn.intentId }),
    ).rejects.toThrow("belongs to another account");

    // Created signed-out for an email: only the VERIFIED owner of that email may claim it.
    const signedOut = await f.t.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, {
      offerId: f.ids.free,
      customerEmail: "Claimed@Example.invalid",
    });
    await expect(
      f.other.mutation(api.commerceSubscriptions.checkout.activateFreeIntent, { intentId: signedOut.intentId }),
    ).rejects.toThrow("belongs to another account");
    await expect(
      f.unverified.mutation(api.commerceSubscriptions.checkout.activateFreeIntent, { intentId: signedOut.intentId }),
    ).rejects.toThrow("belongs to another account");
    expect(await f.snapshot()).toEqual({ subscriptions: [], entitlements: [], grants: [] });

    await f.t.run((ctx) => ctx.db.patch("users", f.ids.unverified, { emailVerified: true }));
    const claimed = await f.unverified.mutation(api.commerceSubscriptions.checkout.activateFreeIntent, {
      intentId: signedOut.intentId,
    });
    expect((await f.t.run((ctx) => ctx.db.get(claimed.contractId)))?.userId).toBe(f.ids.unverified);
  });

  test("the owner activates a free intent once, with entitlements, and replays are idempotent", async () => {
    const f = await fixture();
    const created = await f.owner.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, { offerId: f.ids.free });
    const first = await f.owner.mutation(api.commerceSubscriptions.checkout.activateFreeIntent, { intentId: created.intentId });
    const replay = await f.owner.mutation(api.commerceSubscriptions.checkout.activateFreeIntent, { intentId: created.intentId });
    expect(replay.contractId).toBe(first.contractId);
    const state = await f.snapshot();
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]).toMatchObject({ userId: f.ids.owner, status: "active", paymentProvider: "free" });
    expect(state.entitlements.map((row) => [row.userId, row.entitlementCode, row.status])).toEqual([[f.ids.owner, "pro", "active"]]);
    expect(state.grants.map((row) => [row.userId, row.planId, row.status])).toEqual([[f.ids.owner, f.ids.plan, "active"]]);
    expect((await f.intent(created.intentId))?.status).toBe("activated");
  });

  test("draft and admin-only offers cannot be checked out or self-activated", async () => {
    const f = await fixture();
    for (const offerId of [f.ids.draft, f.ids.adminOnly]) {
      await expect(
        f.owner.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, { offerId }),
      ).rejects.toThrow("not available for signup");
    }
    // An intent created while the offer was open cannot be claimed after it closes.
    const created = await f.owner.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, { offerId: f.ids.free });
    await f.t.run((ctx) => ctx.db.patch("commerce_subscription_offers", f.ids.free, { availableInDirectForms: false }));
    await expect(
      f.owner.mutation(api.commerceSubscriptions.checkout.activateFreeIntent, { intentId: created.intentId }),
    ).rejects.toThrow("not available for signup");
  });
});

describe("payment trust boundary: Stripe webhook", () => {
  test("a signed payment_intent.succeeded activates the paid intent and grants entitlements, once", async () => {
    const f = await fixture();
    const created = await f.owner.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, { offerId: f.ids.paid });
    expect(created.amount).toBe(1500);
    const event = paymentIntentSucceeded("evt_paid_ok", created.intentId, 1500);
    expect((await signedStripeEvent(f, event)).status).toBe(200);
    expect((await signedStripeEvent(f, event)).status).toBe(200);

    const state = await f.snapshot();
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]).toMatchObject({
      userId: f.ids.owner, status: "active", paymentProvider: "stripe", paymentTransactionId: "pi_evt_paid_ok",
      defaultPaymentMethodId: "pm_trust_boundary", stripeCustomerId: "cus_trust_boundary", recurringAmount: 1500,
    });
    expect(state.entitlements.map((row) => [row.userId, row.entitlementCode, row.status])).toEqual([[f.ids.owner, "pro", "active"]]);
    expect(state.grants.map((row) => [row.userId, row.planId, row.status])).toEqual([[f.ids.owner, f.ids.plan, "active"]]);
    expect((await f.intent(created.intentId))?.status).toBe("activated");
  });

  test("a signed-out paid intent activates for the verified owner of its email", async () => {
    const f = await fixture();
    const created = await f.t.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, {
      offerId: f.ids.paid,
      customerEmail: "claimed@example.invalid",
    });
    // The only account with that email is unverified: the webhook fails and Stripe retries.
    expect((await signedStripeEvent(f, paymentIntentSucceeded("evt_unverified", created.intentId, 1500))).status).toBe(400);
    expect((await f.snapshot()).subscriptions).toEqual([]);
    await f.t.run((ctx) => ctx.db.patch("users", f.ids.unverified, { emailVerified: true }));
    expect((await signedStripeEvent(f, paymentIntentSucceeded("evt_verified", created.intentId, 1500))).status).toBe(200);
    expect((await f.snapshot()).subscriptions.map((row) => row.userId)).toEqual([f.ids.unverified]);
  });

  test("unsigned, mis-signed or mismatched settlements never activate", async () => {
    const f = await fixture();
    const created = await f.owner.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, { offerId: f.ids.paid });
    const free = await f.owner.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, { offerId: f.ids.free });
    const refused = [
      await signedStripeEvent(f, paymentIntentSucceeded("evt_forged", created.intentId, 1500), "t=1,v1=forged"),
      await signedStripeEvent(f, paymentIntentSucceeded("evt_short", created.intentId, 100)),
      await signedStripeEvent(f, paymentIntentSucceeded("evt_currency", created.intentId, 1500, "eur")),
      // A $0-now SetupIntent cannot settle an intent that charges now.
      await signedStripeEvent(f, setupIntentSucceeded("evt_setup_paid", created.intentId)),
      // A free intent is never settled through Stripe.
      await signedStripeEvent(f, setupIntentSucceeded("evt_setup_free", free.intentId)),
      await signedStripeEvent(f, paymentIntentSucceeded("evt_charge_free", free.intentId, 1500)),
    ];
    expect(refused.map((response) => response.status)).toEqual([400, 400, 400, 400, 400, 400]);
    expect(await f.snapshot()).toEqual({ subscriptions: [], entitlements: [], grants: [] });
    expect((await f.intent(created.intentId))?.status).toBe("payment_pending");
  });

  test("a signed setup_intent.succeeded activates a $0-now paid-recurring (trial) intent", async () => {
    const f = await fixture();
    const created = await f.owner.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, { offerId: f.ids.trial });
    expect([created.amount, created.recurringAmount]).toEqual([0, 1500]);
    expect((await signedStripeEvent(f, setupIntentSucceeded("evt_trial", created.intentId))).status).toBe(200);
    const state = await f.snapshot();
    expect(state.subscriptions[0]).toMatchObject({
      userId: f.ids.owner, status: "trialing", paymentProvider: "stripe", defaultPaymentMethodId: "pm_trust_boundary",
    });
    expect(state.entitlements).toHaveLength(1);
  });

  test("the internal activation re-checks the settlement it is handed", async () => {
    const f = await fixture();
    const created = await f.owner.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, { offerId: f.ids.paid });
    const other = await f.owner.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, { offerId: f.ids.paid });
    await expect(
      f.t.mutation(internal.commerceSubscriptions.checkout.activateFromIntent, {
        intentId: created.intentId,
        settlement: {
          kind: "payment_intent", paymentIntentId: "pi_other", status: "succeeded", amountReceived: 1500,
          currency: "usd", checkoutIntentRef: other.intentId,
        },
      }),
    ).rejects.toThrow("belongs to a different checkout intent");
    expect((await f.snapshot()).subscriptions).toEqual([]);
  });
});

describe("payment trust boundary: charge start", () => {
  test("only the owner may start a charge for a signed-in intent, and never after activation", async () => {
    const f = await fixture();
    const created = await f.owner.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, { offerId: f.ids.paid });
    await expect(
      f.other.action(api.commerceSubscriptions.publicCharge.beginFirstCharge, { checkoutIntentId: created.intentId }),
    ).rejects.toThrow("belongs to another account");
    await expect(
      f.t.action(api.commerceSubscriptions.publicCharge.beginFirstCharge, { checkoutIntentId: created.intentId }),
    ).rejects.toThrow("belongs to another account");
    expect(await f.owner.query(internal.commerceSubscriptions.checkout.getChargeStartAccess, { intentId: created.intentId })).toEqual({ allowed: true });

    expect((await signedStripeEvent(f, paymentIntentSucceeded("evt_then_charge", created.intentId, 1500))).status).toBe(200);
    await expect(
      f.owner.action(api.commerceSubscriptions.publicCharge.beginFirstCharge, { checkoutIntentId: created.intentId }),
    ).rejects.toThrow("can no longer be paid");
  });
});

describe("payment trust boundary: customer lifecycle", () => {
  async function contract(f: Fixture, status: Doc<"commerce_subscriptions">["status"], currentPeriodEndAt: number) {
    return await f.t.run(async (ctx) => {
      const subscriptionId = await ctx.db.insert("commerce_subscriptions", {
        userId: f.ids.owner, sourceChannel: "direct_form", status, currencyCode: "USD", recurringAmount: 1500,
        billingInterval: "month", billingIntervalCount: 1, currentPeriodStartAt: currentPeriodEndAt - 30 * 86_400_000,
        currentPeriodEndAt, nextBillingAt: currentPeriodEndAt, cancelAtPeriodEnd: false, manualBilling: false,
        createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("commerce_subscription_items", {
        subscriptionId, sourceOfferId: f.ids.paid, titleSnapshot: "paid", quantity: 1, unitAmount: 1500,
        unitRecurringAmount: 1500, currencyCode: "USD", status: "active", startsAt: 1, cancelAtPeriodEnd: false,
        createdAt: 1, updatedAt: 1,
      });
      return subscriptionId;
    });
  }
  const statusOf = (f: Fixture, id: Id<"commerce_subscriptions">) => f.t.run(async (ctx) => (await ctx.db.get(id))?.status);

  test("an owner cannot walk a past_due, cancelled or expired contract back to active", async () => {
    const f = await fixture();
    const lapsed = Date.now() - 86_400_000;
    for (const status of ["past_due", "cancelled", "expired"] as const) {
      const id = await contract(f, status, lapsed);
      await expect(f.owner.mutation(api.commerceSubscriptions.portal.requestPauseContract, { contractId: id })).rejects.toThrow(`You cannot pause a subscription that is ${status.replace("_", " ")}`);
      await expect(f.owner.mutation(api.commerceSubscriptions.mutations.pause, { subscriptionId: id })).rejects.toThrow("You cannot pause");
      await expect(f.owner.mutation(api.commerceSubscriptions.mutations.resume, { subscriptionId: id })).rejects.toThrow("You cannot resume");
      await expect(f.owner.mutation(api.commerceSubscriptions.mutations.scheduleCancel, { subscriptionId: id })).rejects.toThrow("You cannot schedule cancellation");
      if (status !== "cancelled") {
        await expect(f.owner.mutation(api.commerceSubscriptions.portal.requestCancelContract, { contractId: id })).rejects.toThrow("You cannot schedule the cancellation");
      }
      expect(await statusOf(f, id)).toBe(status);
    }
    // Cancelling outright is always the owner's right.
    const pastDue = await contract(f, "past_due", lapsed);
    await f.owner.mutation(api.commerceSubscriptions.portal.requestCancelContract, { contractId: pastDue, immediate: true });
    expect(await statusOf(f, pastDue)).toBe("cancelled");
  });

  test("resuming after the paid period ended bills now instead of granting a free period", async () => {
    const f = await fixture();
    const lapsed = Date.now() - 86_400_000;
    for (const resume of ["portal", "mutations"] as const) {
      const id = await contract(f, "paused", lapsed);
      const before = Date.now();
      if (resume === "portal") await f.owner.mutation(api.commerceSubscriptions.portal.requestResumeContract, { contractId: id });
      else await f.owner.mutation(api.commerceSubscriptions.mutations.resume, { subscriptionId: id });
      const resumed = await f.t.run((ctx) => ctx.db.get(id));
      expect(resumed?.status).toBe("active");
      expect(resumed?.nextBillingAt).toBeGreaterThanOrEqual(before);
      expect(resumed?.nextBillingAt).toBeLessThanOrEqual(Date.now());
      expect(resumed?.currentPeriodEndAt).toBe(resumed?.nextBillingAt);
    }
    // A pause inside a paid period keeps that period's end.
    const future = Date.now() + 10 * 86_400_000;
    const id = await contract(f, "active", future);
    await f.owner.mutation(api.commerceSubscriptions.portal.requestPauseContract, { contractId: id });
    await f.owner.mutation(api.commerceSubscriptions.portal.requestResumeContract, { contractId: id });
    expect((await f.t.run((ctx) => ctx.db.get(id)))?.nextBillingAt).toBe(future);
  });

  test("a plan change can only target an offer customers can buy", async () => {
    const f = await fixture();
    const id = await contract(f, "active", Date.now() + 10 * 86_400_000);
    for (const toOfferId of [f.ids.adminOnly, f.ids.draft]) {
      await expect(
        f.owner.mutation(api.commerceSubscriptions.portal.requestPlanChange, { contractId: id, toOfferId }),
      ).rejects.toThrow("Target offer is not available");
    }
    const items = await f.t.run((ctx) =>
      ctx.db.query("commerce_subscription_items").withIndex("by_subscription", (q) => q.eq("subscriptionId", id)).collect(),
    );
    expect(items.map((item) => item.sourceOfferId)).toEqual([f.ids.paid]);
  });
});

describe("payment trust boundary: Forms zero-amount path", () => {
  async function formFixture(f: Fixture) {
    return await f.t.run(async (ctx) => {
      const group = await ctx.db.insert("fieldGroups", {
        title: "Fields", key: "subscription-form", locationRules: [], position: "normal", style: "default",
        labelPlacement: "top", instructionPlacement: "label", isActive: true, menuOrder: 0, createdBy: f.ids.owner,
        createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("fieldDefinitions", {
        groupId: group, key: "email", name: "email", label: "Email", type: "email", required: true, settings: "{}",
        menuOrder: 0, createdAt: 1, updatedAt: 1,
      });
      return await ctx.db.insert("forms", {
        title: "Subscribe", slug: "subscribe", status: "published", fieldGroupId: group, settings: "{}",
        createdBy: f.ids.owner, createdAt: 1, updatedAt: 1,
      });
    });
  }

  test("a submission records its signed-in submitter, and only that account receives the free subscription", async () => {
    const f = await fixture();
    const formId = await formFixture(f);
    const submit = (client: Fixture["owner"]) =>
      client.mutation(api.extensions.forms.mutations.submit, {
        formId,
        values: [{ fieldKey: "email", value: "other@example.invalid" }],
        isComplete: true,
        startedAt: Date.now() - 10_000,
      });
    const signedIn = await submit(f.owner);
    const anonymous = await submit(f.t);
    const submissions = await f.t.run((ctx) => ctx.db.query("form_submissions").collect());
    expect(submissions.map((row) => row.userId)).toEqual([f.ids.owner, undefined]);

    // The runner creates the intent without an identity, with the email typed into the form;
    // the server binds it to the submission's recorded submitter.
    const startIntent = async (submissionId: Id<"form_submissions">) => {
      const created = await f.t.mutation(internal.commerceSubscriptions.checkout.createCheckoutIntentForSubmission, {
        submissionId, offerId: f.ids.free, customerEmail: "other@example.invalid", accountPolicy: "create_on_website",
      });
      if (!created.ok) throw new Error(`no intent: ${created.reason}`);
      return created.intent;
    };
    const anonymousIntent = await startIntent(anonymous.submissionId);
    expect(
      await f.t.mutation(internal.commerceSubscriptions.checkout.activateFreeIntentForSubmission, {
        intentId: anonymousIntent.intentId, submissionId: anonymous.submissionId,
      }),
    ).toEqual({ ok: false, reason: "sign_in_required" });

    const ownerIntent = await startIntent(signedIn.submissionId);
    await expect(
      f.t.mutation(internal.commerceSubscriptions.checkout.activateFreeIntentForSubmission, {
        intentId: ownerIntent.intentId, submissionId: anonymous.submissionId,
      }),
    ).rejects.toThrow("not started by this form submission");
    const activated = await f.t.mutation(internal.commerceSubscriptions.checkout.activateFreeIntentForSubmission, {
      intentId: ownerIntent.intentId, submissionId: signedIn.submissionId,
    });
    expect(activated.ok).toBe(true);
    // The subscription belongs to the submitter, not to the account whose email was typed in.
    expect((await f.snapshot()).subscriptions.map((row) => row.userId)).toEqual([f.ids.owner]);
  });

  test("a signed-in submitter's order form can only be paid from that account", async () => {
    const f = await fixture();
    const submissionId = await f.t.run(async (ctx) => {
      const form = await ctx.db.insert("forms", {
        title: "Order", slug: "order", status: "published", settings: JSON.stringify({ orderForm: { enabled: true } }),
        createdBy: f.ids.owner, createdAt: 1, updatedAt: 1,
      });
      return await ctx.db.insert("form_submissions", {
        formId: form, status: "complete", userId: f.ids.owner, read: false, starred: false,
        meta: JSON.stringify({ pricing: { oneTime: 4200, currency: "usd", lineItems: [] } }), createdAt: 1, updatedAt: 1,
      });
    });
    for (const caller of [f.t, f.other]) {
      expect(await caller.query(internal.extensions.forms.orderPayments.getOrderPaymentSource, { submissionId })).toBeNull();
    }
    expect(await f.owner.query(internal.extensions.forms.orderPayments.getOrderPaymentSource, { submissionId })).toMatchObject({
      submissionId,
      amount: 4200,
      currency: "USD",
    });
  });
});
