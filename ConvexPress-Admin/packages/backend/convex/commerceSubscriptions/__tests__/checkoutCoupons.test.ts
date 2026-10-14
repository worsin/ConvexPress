/**
 * Coupons at checkout (upstream PR 036): every code is checked the same way
 * signed in or out (status, dates, scope, limits) with a message a customer
 * understands; a valid code discounts the first charge, which counts as its
 * first use, and the signup invoice shows the discount; the checkout summary
 * says what is bought and when the next charge runs.
 */
import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from "bun:test";
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { checkoutSummary } from "../../extensions/forms/actions";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceSubscriptions/checkout.ts": () => import("../checkout"),
  "./convex/commerceSubscriptions/internals.ts": () => import("../internals"),
  "./convex/commerceSubscriptions/paymentMethods.ts": () => import("../paymentMethods"),
  "./convex/commerceSubscriptions/stripeCharge.ts": () => import("../stripeCharge"),
  "./convex/commerceSubscriptions/portal.ts": () => import("../portal"),
  "./convex/purchases/internals.ts": () => import("../../purchases/internals"),
  "./convex/membership/internals.ts": () => import("../../membership/internals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/notifications/internals.ts": () => import("../../notifications/internals"),
};

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const stripe = new Stripe("sk_test_checkout_coupons");
interface FakeablePaymentMethods {
  retrieve(id: string): Promise<unknown>;
}

const liveTests: Array<ReturnType<typeof convexTest>> = [];
async function drainScheduled(t: ReturnType<typeof convexTest>): Promise<void> {
  for (let round = 0; round < 5; round++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await t.finishInProgressScheduledFunctions();
  }
}

beforeEach(() => {
  setSystemTime(new Date(NOW));
  const methods: FakeablePaymentMethods = Object.getPrototypeOf(stripe.paymentMethods);
  spyOn(methods, "retrieve").mockImplementation(async () => ({
    id: "pm_card", object: "payment_method", card: { brand: "visa", last4: "4242", exp_month: 1, exp_year: 2031 },
  }));
});
afterEach(async () => {
  for (const t of liveTests.splice(0)) await drainScheduled(t);
  setSystemTime();
  const fn: unknown = Object.getPrototypeOf(stripe.paymentMethods).retrieve;
  if (typeof fn === "function" && "mockRestore" in fn && typeof fn.mockRestore === "function") fn.mockRestore();
});

async function fixture() {
  const t = convexTest({ schema, modules });
  liveTests.push(t);
  const ids = await t.run(async (ctx) => {
    const customer = await ctx.db.insert("users", {
      authSource: "local", email: "casey@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", {
      section: "plugins", values: { commerceEnabled: true, commerceSubscriptionsEnabled: true }, updatedAt: 1, updatedBy: customer,
    });
    await ctx.db.insert("settings", {
      section: "commerce.payments", values: { stripeSecretKey: "sk_test_checkout_coupons", subscriptionChargingEnabled: true },
      updatedAt: 1, updatedBy: customer,
    });
    const template = await ctx.db.insert("commerce_subscription_templates", {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1, pausable: true,
      cancelAtPeriodEndDefault: true, version: 1, createdAt: 1, updatedAt: 1,
    });
    const offer = (slug: string, extra: { setupFeeAmount?: number; trialDaysOverride?: number } = {}) =>
      ctx.db.insert("commerce_subscription_offers", {
        title: slug === "launch" ? "Launch" : slug, slug, status: "active", templateId: template, sourceType: "custom",
        availableInCart: false, availableInDirectForms: true, availableForAdminProvisioning: true, createNewSubscription: true,
        allowAddToExistingSubscription: false, currencyCode: "USD", recurringAmount: 29_900, entitlementCodes: ["pro"],
        createdAt: 1, updatedAt: 1, ...extra,
      });
    const launch = await offer("launch", { setupFeeAmount: 5_000 });
    const trial = await offer("trial", { trialDaysOverride: 14 });
    const other = await offer("other");
    const coupon = (code: string, extra: Record<string, unknown>) =>
      ctx.db.insert("commerce_subscription_coupons", {
        code, discountType: "percent", amount: 20, duration: "once", status: "active", createdBy: customer, createdAt: 1, ...extra,
      });
    await coupon("SAVE20", {});
    await coupon("FOREVER10", { amount: 10, duration: "forever" });
    await coupon("RETIRED", { status: "archived" });
    await coupon("LASTYEAR", { expiresAt: NOW - DAY });
    await coupon("SOON", { startsAt: NOW + DAY });
    await coupon("OTHERONLY", { offerIds: [other] });
    return { customer, launch, trial };
  });
  const customer = t.withIdentity({ subject: ids.customer, tokenIdentifier: `https://convexpress-admin.local|${ids.customer}` });
  return { t, ids, customer };
}

describe("coupons at checkout", () => {
  test("a signed-out checkout refuses codes that aren't usable, saying why", async () => {
    const f = await fixture();
    const attempt = (couponCode: string) =>
      f.t.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, {
        offerId: f.ids.launch, couponCode, customerEmail: "new@example.invalid",
      });
    await expect(attempt("NOPE")).rejects.toThrow("That code isn't valid.");
    await expect(attempt("retired")).rejects.toThrow("That code isn't active.");
    await expect(attempt("LastYear")).rejects.toThrow("That code has expired.");
    await expect(attempt("SOON")).rejects.toThrow("That code isn't active yet.");
    await expect(attempt("OTHERONLY")).rejects.toThrow("That code doesn't apply to this plan.");
  });

  test("a valid code takes its discount off the first charge, invoices it, and counts it as the first use", async () => {
    const f = await fixture();
    const created = await f.customer.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, {
      offerId: f.ids.launch, couponCode: " save20 ",
    });
    // $50 setup + $299 − 20% of $299 ($59.80) = $289.20.
    expect(created.amount).toBe(5_000 + 29_900 - 5_980);

    const summary = await f.t.run((ctx) => checkoutSummary(ctx, created.intentId));
    expect(summary).toMatchObject({
      planTitle: "Launch", billingInterval: "month", recurringAmount: 29_900, setupFeeAmount: 5_000, trialDays: 0,
      couponCode: "SAVE20", firstChargeDiscount: 5_980,
    });
    expect(summary?.nextChargeAt).toBe(Date.UTC(2026, 10, 14, 12, 0, 0));

    const activated = await f.t.mutation(internal.commerceSubscriptions.checkout.activateFromIntent, {
      intentId: created.intentId,
      settlement: {
        kind: "payment_intent", paymentIntentId: "pi_coupon", status: "succeeded", amountReceived: created.amount, currency: "usd",
        checkoutIntentRef: created.intentId, paymentMethodId: "pm_card", stripeCustomerId: "cus_coupon",
      },
    });
    if (!activated.ok) throw new Error("activation failed");
    const subscriptionId: Id<"commerce_subscriptions"> = activated.contractId;
    const state = await f.t.run(async (ctx) => {
      const invoice = (
        await ctx.db.query("commerce_subscription_invoices").withIndex("by_subscription", (q) => q.eq("subscriptionId", subscriptionId)).collect()
      )[0];
      const lines = invoice
        ? await ctx.db.query("commerce_subscription_invoice_items").withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id)).collect()
        : [];
      const redemptions = await ctx.db.query("commerce_subscription_coupon_redemptions").collect();
      return { invoice, lines, redemptions };
    });
    expect(state.invoice).toMatchObject({ kind: "signup", subtotalAmount: 34_900, totalAmount: 28_920 });
    expect(state.lines.map((line) => [line.lineType, line.lineTotalAmount])).toEqual([
      ["setup_fee", 5_000],
      ["recurring", 29_900],
      ["coupon_discount", -5_980],
    ]);
    // A once-only coupon is used up by the first charge; renewals pay full price.
    expect(state.redemptions.map((row) => row.remainingApplications)).toEqual([0]);
  });

  test("a forever coupon keeps applying after the first charge; with a trial the first paid renewal takes it", async () => {
    const f = await fixture();
    const created = await f.customer.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, {
      offerId: f.ids.launch, couponCode: "FOREVER10",
    });
    await f.t.mutation(internal.commerceSubscriptions.checkout.activateFromIntent, {
      intentId: created.intentId,
      settlement: {
        kind: "payment_intent", paymentIntentId: "pi_forever", status: "succeeded", amountReceived: created.amount, currency: "usd",
        checkoutIntentRef: created.intentId, paymentMethodId: "pm_card", stripeCustomerId: "cus_forever",
      },
    });
    const remaining = await f.t.run(async (ctx) => (await ctx.db.query("commerce_subscription_coupon_redemptions").collect())[0]?.remainingApplications);
    expect(remaining).toBe(9_998);

    const trial = await fixture();
    const trialIntent = await trial.customer.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, {
      offerId: trial.ids.trial, couponCode: "SAVE20",
    });
    expect(trialIntent.amount).toBe(0);
    const trialSummary = await trial.t.run((ctx) => checkoutSummary(ctx, trialIntent.intentId));
    expect(trialSummary).toMatchObject({ trialDays: 14, firstChargeDiscount: 0, couponCode: "SAVE20", nextChargeAt: NOW + 14 * DAY });
  });
});
