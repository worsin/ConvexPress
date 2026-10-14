/**
 * One email per subscription charge (upstream PR 037): the subscription's own
 * emails speak for its charges, so the purchase ledger sends the customer no
 * second receipt or failure notice (admins are still alerted). The welcome is
 * the first charge's receipt, "next charge" amounts include the contract's
 * discounts, and a refund tells the customer what came back.
 */
import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from "bun:test";
import { convexTest } from "convex-test";
import type { Infer } from "convex/values";
import Stripe from "stripe";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import type { verifiedStripeSettlementValidator } from "../checkout";

type VerifiedStripeSettlement = Infer<typeof verifiedStripeSettlementValidator>;

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceSubscriptions/checkout.ts": () => import("../checkout"),
  "./convex/commerceSubscriptions/internals.ts": () => import("../internals"),
  "./convex/commerceSubscriptions/emails.ts": () => import("../emails"),
  "./convex/commerceSubscriptions/paymentMethods.ts": () => import("../paymentMethods"),
  "./convex/commerceSubscriptions/stripeCharge.ts": () => import("../stripeCharge"),
  "./convex/commerceSubscriptions/portal.ts": () => import("../portal"),
  "./convex/purchases/internals.ts": () => import("../../purchases/internals"),
  "./convex/membership/internals.ts": () => import("../../membership/internals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/notifications/internals.ts": () => import("../../notifications/internals"),
  "./convex/emails/internals.ts": () => import("../../emails/internals"),
  "./convex/settings/internals.ts": () => import("../../settings/internals"),
};

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 14, 18, 0, 0);
const stripe = new Stripe("sk_test_charge_emails");
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
    const roleId = await ctx.db.insert("roles", {
      name: "Administrator", slug: "administrator", description: "Test", level: 100, type: "internal", isDefault: false,
      isProtected: true, capabilities: ["manage_options"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1,
    });
    const admin = await ctx.db.insert("users", {
      authSource: "local", email: "admin@example.invalid", emailVerified: true, status: "active", roleId, createdAt: 1, updatedAt: 1,
    });
    const customer = await ctx.db.insert("users", {
      authSource: "local", email: "casey@example.invalid", firstName: "Casey", emailVerified: true, status: "active",
      createdAt: 1, updatedAt: 1,
    });
    const setting = (section: string, values: Record<string, unknown>) =>
      ctx.db.insert("settings", { section, values, updatedAt: 1, updatedBy: admin });
    await setting("plugins", { commerceEnabled: true, commerceSubscriptionsEnabled: true });
    await setting("commerce.payments", { stripeSecretKey: "sk_test_charge_emails", subscriptionChargingEnabled: true });
    await setting("general", { siteTitle: "Clinic", siteUrl: "https://clinic.example", timezone: "America/Los_Angeles" });
    await setting("email", { enabled: true });
    const template = await ctx.db.insert("commerce_subscription_templates", {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1, pausable: true,
      cancelAtPeriodEndDefault: true, version: 1, createdAt: 1, updatedAt: 1,
    });
    const offer = (slug: string, extra: { setupFeeAmount?: number; trialDaysOverride?: number } = {}) =>
      ctx.db.insert("commerce_subscription_offers", {
        title: slug === "launch" ? "Launch" : "Trial", slug, status: "active", templateId: template, sourceType: "custom",
        availableInCart: false, availableInDirectForms: true, availableForAdminProvisioning: true, createNewSubscription: true,
        allowAddToExistingSubscription: false, currencyCode: "USD", recurringAmount: 29_900, entitlementCodes: ["pro"],
        createdAt: 1, updatedAt: 1, ...extra,
      });
    const launch = await offer("launch", { setupFeeAmount: 5_000 });
    const trial = await offer("trial", { trialDaysOverride: 14 });
    const coupon = (code: string, extra: { amount?: number; duration?: "once" | "forever" } = {}) =>
      ctx.db.insert("commerce_subscription_coupons", {
        code, discountType: "percent", amount: 20, duration: "once", status: "active", createdBy: admin, createdAt: 1, ...extra,
      });
    await coupon("SAVE20");
    await coupon("FOREVER10", { amount: 10, duration: "forever" });
    return { customer, launch, trial };
  });
  await t.mutation(internal.emails.internals.bootstrapTemplates, {});
  const customer = t.withIdentity({ subject: ids.customer, tokenIdentifier: `https://convexpress-admin.local|${ids.customer}` });

  async function subscribe(offerId: Id<"commerce_subscription_offers">, couponCode: string) {
    const created = await customer.mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, { offerId, couponCode });
    // A trial saves the card (a SetupIntent); a paid start charges it.
    const settlement: VerifiedStripeSettlement =
      created.amount === 0
        ? {
            kind: "setup_intent", setupIntentId: "seti_trial", status: "succeeded",
            checkoutIntentRef: created.intentId, paymentMethodId: "pm_card", stripeCustomerId: "cus_charge",
          }
        : {
            kind: "payment_intent", paymentIntentId: `pi_${couponCode}`, status: "succeeded",
            amountReceived: created.amount, currency: "usd", checkoutIntentRef: created.intentId, paymentMethodId: "pm_card",
            stripeCustomerId: "cus_charge",
          };
    const activated = await t.mutation(internal.commerceSubscriptions.checkout.activateFromIntent, {
      intentId: created.intentId,
      settlement,
    });
    if (!activated.ok) throw new Error("activation failed");
    await drainScheduled(t);
    return activated.contractId;
  }

  const emails = () =>
    t.run(async (ctx) =>
      (await ctx.db.query("emailQueue").collect()).map((row) => ({
        slug: row.templateSlug, to: row.to, subject: row.subject, text: row.bodyText ?? "",
      })),
    );
  const event = (code: string) =>
    t.run(async (ctx) => {
      const row = (await ctx.db.query("events").collect()).find((entry) => entry.code === code);
      if (!row) throw new Error(`no ${code} event`);
      return row._id;
    });
  const emit = (code: string, payload: Record<string, unknown>) =>
    t.run((ctx) =>
      ctx.db.insert("events", {
        code, system: "commerce", payload: JSON.stringify(payload), status: "pending", listenersTotal: 0,
        listenersCompleted: 0, listenersFailed: 0, emittedAt: NOW,
      }),
    );
  async function deliver(
    handler: "onSubscriptionCreated" | "onSubscriptionTrialEnding" | "onSubscriptionRefunded",
    eventId: Id<"events">,
  ) {
    const before = (await emails()).length;
    await t.mutation(internal.commerceSubscriptions.emails[handler], { eventId });
    const after = await emails();
    const email = after[after.length - 1];
    if (after.length !== before + 1 || !email) throw new Error(`${handler} queued no email`);
    return email;
  }
  return { t, ids, subscribe, emails, event, emit, deliver };
}

describe("subscription charge emails", () => {
  test("a paid signup sends the customer one email, the welcome, which is the receipt; admins are still alerted", async () => {
    const f = await fixture();
    const contractId = await f.subscribe(f.ids.launch, "SAVE20");

    const queued = await f.emails();
    expect(queued.filter((email) => email.to === "casey@example.invalid").map((email) => email.slug)).toEqual([]);
    expect(queued.map((email) => [email.slug, email.to])).toEqual([["purchase-admin-alert", "admin@example.invalid"]]);

    const welcome = await f.deliver("onSubscriptionCreated", await f.event("commerce.subscription_created"));
    expect(welcome.subject).toBe("Welcome to Launch");
    // $50 setup + $299 − 20% of $299 = $289.20; the once-only code is used up, so the next charge is full price.
    expect(welcome.text).toMatch(/We charged \$289\.20 on October 14, 2026 \(invoice INV-\d+\)\. You pay \$299\.00 per month\. Your next charge is on November 14, 2026\./);

    // The bell points at the subscription, where invoices and the card live.
    const notifications = await f.t.run((ctx) => ctx.db.query("siteNotifications").collect());
    const customerNote = notifications.find((row) => row.actionUrl === "/dashboard/subscriptions");
    expect(customerNote?.actionLabel).toBe("View subscription");
    expect(notifications.some((row) => row.actionUrl?.startsWith("/dashboard/orders/"))).toBe(false);

    // A refund says what came back and from which charge.
    const signupInvoice = await f.t.run(async (ctx) =>
      (await ctx.db.query("commerce_subscription_invoices").collect()).find((row) => row.subscriptionId === contractId),
    );
    if (!signupInvoice) throw new Error("no signup invoice");
    const refund = await f.deliver(
      "onSubscriptionRefunded",
      await f.emit("commerce.subscription_invoice_refunded", { subscriptionId: contractId, invoiceId: signupInvoice._id, amount: 10_000 }),
    );
    expect(refund.subject).toBe("Refund of $100.00 for Launch");
    expect(refund.text).toContain(`We refunded $100.00 of the $289.20 you paid for invoice ${signupInvoice.invoiceNumber}, to your original payment method.`);
    const full = await f.deliver(
      "onSubscriptionRefunded",
      await f.emit("commerce.subscription_invoice_refunded", { subscriptionId: contractId, invoiceId: signupInvoice._id, amount: 28_920 }),
    );
    expect(full.text).toContain("the full charge, to your original payment method.");
  });

  test("a failed renewal sends no purchase failure email; the subscription's own email covers it", async () => {
    const f = await fixture();
    const contractId = await f.subscribe(f.ids.launch, "SAVE20");
    const invoiceId = await f.t.run((ctx) =>
      ctx.db.insert("commerce_subscription_invoices", {
        subscriptionId: contractId, status: "failed", invoiceNumber: "INV-009999", kind: "renewal", currencyCode: "USD",
        subtotalAmount: 29_900, taxAmount: 0, totalAmount: 29_900, createdAt: NOW, updatedAt: NOW,
      }),
    );
    await f.t.mutation(internal.purchases.internals.syncSubscriptionInvoice, { invoiceId, eventType: "subscription_invoice_payment_failed" });
    await drainScheduled(f.t);
    expect((await f.emails()).some((email) => email.slug === "purchase-payment-failed")).toBe(false);
    const failed = (await f.t.run((ctx) => ctx.db.query("siteNotifications").collect())).find((row) => row.title === "Payment failed");
    expect(failed?.actionUrl).toBe("/dashboard/subscriptions");
  });

  test("next-charge amounts include a lasting discount", async () => {
    const f = await fixture();
    await f.subscribe(f.ids.launch, "FOREVER10");
    const welcome = await f.deliver("onSubscriptionCreated", await f.event("commerce.subscription_created"));
    // $50 setup + $299 − 10% = $319.10 today; every renewal is $269.10.
    expect(welcome.text).toContain("We charged $319.10 on October 14, 2026");
    expect(welcome.text).toContain("Your plan is $299.00 per month. Your next charge is $269.10 with your discount, on November 14, 2026.");
  });

  test("a trial's first charge carries the code saved for it", async () => {
    const f = await fixture();
    const contractId = await f.subscribe(f.ids.trial, "SAVE20");
    const welcome = await f.deliver("onSubscriptionCreated", await f.event("commerce.subscription_created"));
    expect(welcome.text).not.toContain("We charged");
    expect(welcome.text).toContain(
      "Your free trial runs until October 28, 2026. Your first charge, $239.20 with your discount, is on that day. Your plan is $299.00 per month.",
    );
    const ending = await f.deliver(
      "onSubscriptionTrialEnding",
      await f.emit("commerce.subscription_trial_ending", { subscriptionId: contractId, trialEndsAt: NOW + 14 * DAY }),
    );
    expect(ending.text).toContain("Your first charge, $239.20 with your discount, runs that day. Your plan is $299.00 per month.");
  });
});
