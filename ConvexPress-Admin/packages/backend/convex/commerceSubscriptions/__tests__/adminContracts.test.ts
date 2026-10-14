/**
 * The administrator's contract and billing views and actions (upstream PR 027).
 * Real functions through convex-test; Stripe refunds faked at the SDK prototype.
 */
import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from "bun:test";
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { api } from "../../_generated/api";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceSubscriptions/adminContracts.ts": () => import("../adminContracts"),
  "./convex/commerceSubscriptions/queries.ts": () => import("../queries"),
  "./convex/commerceSubscriptions/portal.ts": () => import("../portal"),
  "./convex/commerceSubscriptions/mutations.ts": () => import("../mutations"),
  "./convex/commerceSubscriptions/internals.ts": () => import("../internals"),
  "./convex/commerceSubscriptions/operator.ts": () => import("../operator"),
  "./convex/commerceSubscriptions/refunds.ts": () => import("../refunds"),
  "./convex/commerceSubscriptions/proration.ts": () => import("../proration"),
  "./convex/commerceSubscriptions/dunning.ts": () => import("../dunning"),
  "./convex/commerceSubscriptions/stripeCharge.ts": () => import("../stripeCharge"),
  "./convex/purchases/internals.ts": () => import("../../purchases/internals"),
  "./convex/membership/internals.ts": () => import("../../membership/internals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/notifications/internals.ts": () => import("../../notifications/internals"),
  "./convex/settings/queries.ts": () => import("../../settings/queries"),
};

const STRIPE_KEY = "sk_test_admin_contracts";
const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 14, 12, 0, 0);
const stripe = new Stripe(STRIPE_KEY);
interface FakeableRefunds {
  create(params: { amount?: number }, options?: { idempotencyKey?: string }): Promise<unknown>;
}
interface FakeablePaymentIntents {
  create(params: { amount?: number; payment_method?: string; metadata?: Record<string, string> }): Promise<unknown>;
}

const liveTests: Array<ReturnType<typeof convexTest>> = [];
async function drainScheduled(t: ReturnType<typeof convexTest>): Promise<void> {
  for (let round = 0; round < 5; round++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await t.finishInProgressScheduledFunctions();
  }
}
const charges: Array<number | undefined> = [];

beforeEach(() => {
  setSystemTime(new Date(START));
  charges.length = 0;
  const refunds: FakeableRefunds = Object.getPrototypeOf(stripe.refunds);
  spyOn(refunds, "create").mockImplementation(async () => ({ id: "re_admin", object: "refund", status: "succeeded" }));
  const intents: FakeablePaymentIntents = Object.getPrototypeOf(stripe.paymentIntents);
  spyOn(intents, "create").mockImplementation(async (params) => {
    charges.push(params.amount);
    return { id: `pi_admin${charges.length}`, object: "payment_intent", status: "succeeded", metadata: params.metadata ?? {} };
  });
});

afterEach(async () => {
  for (const t of liveTests.splice(0)) await drainScheduled(t);
  setSystemTime();
  for (const target of [Object.getPrototypeOf(stripe.refunds), Object.getPrototypeOf(stripe.paymentIntents)]) {
    const fn: unknown = target.create;
    if (typeof fn === "function" && "mockRestore" in fn && typeof fn.mockRestore === "function") fn.mockRestore();
  }
});

async function fixture(status: "active" | "past_due" = "active") {
  const t = convexTest({ schema, modules });
  liveTests.push(t);
  const ids = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Administrator", slug: "administrator", description: "Test", level: 100, type: "internal", isDefault: false,
      isProtected: true, capabilities: ["manage_options"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1,
    });
    const admin = await ctx.db.insert("users", {
      authSource: "local", email: "admin@example.invalid", displayName: "Avery Admin", emailVerified: true, status: "active",
      roleId, createdAt: 1, updatedAt: 1,
    });
    const customer = await ctx.db.insert("users", {
      authSource: "local", email: "customer@example.invalid", firstName: "Casey", lastName: "Customer", emailVerified: true,
      status: "active", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", {
      section: "plugins", values: { commerceEnabled: true, commerceSubscriptionsEnabled: true }, updatedAt: 1, updatedBy: admin,
    });
    await ctx.db.insert("settings", {
      section: "commerce.payments", values: { stripeSecretKey: STRIPE_KEY, subscriptionChargingEnabled: true }, updatedAt: 1, updatedBy: admin,
    });
    const template = await ctx.db.insert("commerce_subscription_templates", {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1, gracePeriodDays: 7,
      pausable: true, cancelAtPeriodEndDefault: true, version: 1, createdAt: 1, updatedAt: 1,
    });
    const offer = (slug: string, recurringAmount: number) =>
      ctx.db.insert("commerce_subscription_offers", {
        title: slug, slug, status: "active", templateId: template, sourceType: "custom", availableInCart: false,
        availableInDirectForms: true, availableForAdminProvisioning: true, createNewSubscription: true,
        allowAddToExistingSubscription: false, currencyCode: "USD", recurringAmount, entitlementCodes: ["pro"], createdAt: 1, updatedAt: 1,
      });
    const basic = await offer("basic", 10_000);
    const premium = await offer("premium", 30_000);
    const subscriptionId = await ctx.db.insert("commerce_subscriptions", {
      userId: customer, sourceChannel: "direct_form", templateId: template, status, currencyCode: "USD", recurringAmount: 10_000,
      billingInterval: "month", billingIntervalCount: 1, currentPeriodStartAt: START - 15 * DAY, currentPeriodEndAt: START + 15 * DAY,
      nextBillingAt: START + 15 * DAY, defaultPaymentMethodId: "pm_card", stripeCustomerId: "cus_admin",
      paymentMethodSummary: { brand: "visa", last4: "4242", expMonth: 1, expYear: 2031 }, createdAt: START - 15 * DAY, updatedAt: 1,
    });
    await ctx.db.insert("commerce_subscription_items", {
      subscriptionId, sourceOfferId: basic, titleSnapshot: "basic", quantity: 1, unitAmount: 10_000, currencyCode: "USD",
      status: "active", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("commerce_subscription_entitlements", {
      subscriptionId, userId: customer, entitlementCode: "pro", status: status === "active" ? "active" : "grace",
      ...(status === "past_due" ? { graceEndsAt: START + 5 * DAY } : {}), startsAt: 1, createdAt: 1, updatedAt: 1,
    });
    const invoiceId = await ctx.db.insert("commerce_subscription_invoices", {
      subscriptionId, status: status === "active" ? "paid" : "failed", invoiceNumber: "INV-000100", kind: "renewal",
      currencyCode: "USD", subtotalAmount: 10_000, taxAmount: 0, totalAmount: 10_000,
      paymentTransactionId: status === "active" ? "pi_paid" : undefined, paidAt: status === "active" ? START - 15 * DAY : undefined,
      createdAt: START - 15 * DAY, updatedAt: 1,
    });
    if (status === "past_due") {
      await ctx.db.insert("commerce_subscription_dunning_attempts", {
        subscriptionId, invoiceId, attemptNumber: 1, status: "failed", scheduledAt: START - DAY, processedAt: START - DAY,
        errorMessage: "card_declined", createdAt: START - DAY, updatedAt: START - DAY,
      });
      await ctx.db.insert("commerce_subscription_dunning_attempts", {
        subscriptionId, invoiceId, attemptNumber: 2, status: "scheduled", scheduledAt: START + 2 * DAY, createdAt: 1, updatedAt: 1,
      });
    }
    return { admin, customer, subscriptionId, invoiceId, basic, premium };
  });
  const admin = t.withIdentity({ subject: ids.admin, tokenIdentifier: `https://convexpress-admin.local|${ids.admin}` });
  const customer = t.withIdentity({ subject: ids.customer, tokenIdentifier: `https://convexpress-admin.local|${ids.customer}` });
  return { t, ids, admin, customer };
}

describe("admin contracts", () => {
  test("the list and billing view show customer, package, card and what the state allows", async () => {
    const f = await fixture();
    const list = await f.admin.query(api.commerceSubscriptions.adminContracts.listContracts, { paginationOpts: { numItems: 10, cursor: null } });
    expect(list.page[0]).toMatchObject({
      customerEmail: "customer@example.invalid", customerName: "Casey Customer", planTitle: "basic",
      card: { brand: "visa", last4: "4242" }, billingIssue: null, nextChargeAt: START + 15 * DAY,
    });
    const week = await f.admin.query(api.commerceSubscriptions.adminContracts.listUpcomingRenewals, {});
    expect(week).toEqual({ rows: [], expectedAmount: 0, truncated: false });
    const month = await f.admin.query(api.commerceSubscriptions.adminContracts.listUpcomingRenewals, { days: 30 });
    expect(month.rows.map((row) => row._id)).toEqual([f.ids.subscriptionId]);
    expect(month.expectedAmount).toBe(10_000);
    const billing = await f.admin.query(api.commerceSubscriptions.adminContracts.getContractBilling, { subscriptionId: f.ids.subscriptionId });
    expect(billing?.actions).toEqual({ pause: true, resume: false, scheduleCancel: true, cancelNow: true, retryPayment: false, changePlan: true });
    expect(billing?.invoices[0]).toMatchObject({ invoiceNumber: "INV-000100", refundableAmount: 10_000 });
    await expect(
      f.customer.query(api.commerceSubscriptions.adminContracts.listContracts, { paginationOpts: { numItems: 10, cursor: null } }),
    ).rejects.toThrow();
  });

  test("a past-due contract shows its payment problem and can be retried now", async () => {
    const f = await fixture("past_due");
    const queue = await f.admin.query(api.commerceSubscriptions.adminContracts.listDunningQueue, {});
    expect(queue[0]?.billingIssue).toEqual({
      invoiceId: f.ids.invoiceId, amountDue: 10_000, failedAttempts: 1, lastFailureReason: "card_declined",
      nextRetryAt: START + 2 * DAY, accessEndsAt: START + 5 * DAY,
    });
    expect(await f.admin.mutation(api.commerceSubscriptions.adminContracts.retryPayment, { subscriptionId: f.ids.subscriptionId })).toEqual({
      scheduled: true,
    });
    await drainScheduled(f.t);
    expect(charges).toEqual([10_000]);
    const billing = await f.admin.query(api.commerceSubscriptions.adminContracts.getContractBilling, { subscriptionId: f.ids.subscriptionId });
    expect(billing?.billingIssue).toBeNull();
    expect(billing?.timeline.map((row) => row.eventType)).toContain("subscription.operator_retry_now");
    expect(billing?.timeline.find((row) => row.eventType === "subscription.operator_retry_now")?.actor).toBe("Avery Admin");
    const recent = await f.admin.query(api.commerceSubscriptions.adminContracts.listRecentAttempts, {});
    expect(recent[0]).toMatchObject({ status: "succeeded", amount: 10_000, customerEmail: "customer@example.invalid", customerName: "Casey Customer" });
    expect(recent.map((row) => row.status)).toContain("failed");
  });

  test("a refund is issued and recorded against the invoice", async () => {
    const f = await fixture();
    await expect(
      f.admin.mutation(api.commerceSubscriptions.adminContracts.refundInvoice, { invoiceId: f.ids.invoiceId, reason: " " }),
    ).rejects.toThrow("A reason is required");
    await f.admin.mutation(api.commerceSubscriptions.adminContracts.refundInvoice, {
      invoiceId: f.ids.invoiceId, amount: 2_500, reason: "Service credit",
    });
    await drainScheduled(f.t);
    const billing = await f.admin.query(api.commerceSubscriptions.adminContracts.getContractBilling, { subscriptionId: f.ids.subscriptionId });
    expect(billing?.invoices[0]).toMatchObject({ refundedAmount: 2_500, refundableAmount: 7_500 });
    expect(billing?.invoices[0]?.refunds[0]).toMatchObject({ amount: 2_500, status: "succeeded", providerRefundId: "re_admin" });
  });

  test("an admin upgrade is charged for the rest of the period; a downgrade waits for renewal", async () => {
    const f = await fixture();
    const upgrade = await f.admin.mutation(api.commerceSubscriptions.adminContracts.changePlan, {
      subscriptionId: f.ids.subscriptionId, toOfferId: f.ids.premium,
    });
    expect(upgrade.mode).toBe("upgrade");
    await drainScheduled(f.t);
    expect(charges).toEqual([10_000]); // (30,000 − 10,000) × 15/30 days
    const contract = await f.t.run((ctx) => ctx.db.get(f.ids.subscriptionId));
    expect(contract?.recurringAmount).toBe(30_000);

    const downgrade = await f.admin.mutation(api.commerceSubscriptions.adminContracts.changePlan, {
      subscriptionId: f.ids.subscriptionId, toOfferId: f.ids.basic,
    });
    expect(downgrade.mode).toBe("downgrade");
    await drainScheduled(f.t);
    expect(charges).toEqual([10_000]);
    const scheduled = await f.t.run((ctx) => ctx.db.get(f.ids.subscriptionId));
    expect(scheduled?.recurringAmount).toBe(30_000);
    expect(scheduled?.scheduledOfferChange).toMatchObject({ toOfferId: f.ids.basic, effectiveAt: START + 15 * DAY });
  });

  test("search finds a contract by email prefix, any case, or by id; never for non-admins", async () => {
    const f = await fixture();
    const search = (query: string) => f.admin.query(api.commerceSubscriptions.adminContracts.searchContracts, { query });
    expect((await search("customer@")).map((row) => row._id)).toEqual([f.ids.subscriptionId]);
    expect((await search("CUSTOMER@EXAMPLE")).map((row) => row._id)).toEqual([f.ids.subscriptionId]);
    expect((await search(f.ids.subscriptionId)).map((row) => row._id)).toEqual([f.ids.subscriptionId]);
    expect(await search("nobody@")).toEqual([]);
    expect(await search("c")).toEqual([]);
    await expect(
      f.customer.query(api.commerceSubscriptions.adminContracts.searchContracts, { query: "customer@" }),
    ).rejects.toThrow();
  });

  test("metrics normalise every cadence to a month and measure churn against contracts live 30 days ago", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      const base = await ctx.db.get(f.ids.subscriptionId);
      if (!base) throw new Error("fixture missing");
      const { _id, _creationTime, ...contract } = base;
      // A yearly plan at 120,000 bills 10,000 a month; a two-weekly plan at 6,000 bills 13,000.
      await ctx.db.insert("commerce_subscriptions", { ...contract, billingInterval: "year", recurringAmount: 120_000 });
      await ctx.db.insert("commerce_subscriptions", { ...contract, billingInterval: "week", billingIntervalCount: 2, recurringAmount: 6_000 });
      // Trials and paused contracts are not billing.
      await ctx.db.insert("commerce_subscriptions", { ...contract, status: "trialing" });
      await ctx.db.insert("commerce_subscriptions", { ...contract, status: "paused" });
      // Live 30+ days ago, ended last week: churned. Started and ended this month: not counted against the base.
      await ctx.db.insert("commerce_subscriptions", { ...contract, status: "cancelled", createdAt: START - 90 * DAY, cancelledAt: START - 7 * DAY });
      await ctx.db.insert("commerce_subscriptions", { ...contract, status: "expired", createdAt: START - 5 * DAY, cancelledAt: START - DAY });
      // Ended long ago: neither live at the window start nor churned in it.
      await ctx.db.insert("commerce_subscriptions", { ...contract, status: "cancelled", createdAt: START - 400 * DAY, cancelledAt: START - 200 * DAY });
      // The original contract has been live for two months.
      await ctx.db.patch("commerce_subscriptions", _id, { createdAt: START - 60 * DAY });
    });
    const metrics = await f.admin.query(api.commerceSubscriptions.queries.getMetrics, {});
    expect(metrics).toMatchObject({ active: 4, paused: 1, cancelled: 3, mrr: 10_000 + 10_000 + 13_000, arr: 33_000 * 12, cancelledLast30: 2 });
    // Live 30 days ago: the two-month-old contract and the one cancelled last week (the copies are 15 days old).
    expect(metrics.churnRate30d).toBe(50);
  });

  test("invoice and attempt reads accept the billing fields added since they were written", async () => {
    const f = await fixture("past_due");
    await f.t.run(async (ctx) => {
      await ctx.db.patch("commerce_subscription_invoices", f.ids.invoiceId, {
        periodStartAt: START - 15 * DAY, periodEndAt: START + 15 * DAY, refundedAmount: 0, refunds: [],
      });
      const attempts = await ctx.db.query("commerce_subscription_dunning_attempts").collect();
      for (const attempt of attempts) {
        await ctx.db.patch("commerce_subscription_dunning_attempts", attempt._id, { paymentTransactionId: "pi_declined" });
      }
    });
    const invoices = await f.admin.query(api.commerceSubscriptions.queries.listInvoices, {});
    expect(invoices[0]).toMatchObject({ kind: "renewal", periodEndAt: START + 15 * DAY });
    const invoice = await f.admin.query(api.commerceSubscriptions.queries.getInvoice, { invoiceId: f.ids.invoiceId });
    expect(invoice?.kind).toBe("renewal");
    const attempts = await f.admin.query(api.commerceSubscriptions.queries.listDunningAttempts, {});
    expect(attempts?.map((row) => row.paymentTransactionId)).toEqual(["pi_declined", "pi_declined"]);

    await f.t.run((ctx) =>
      ctx.db.insert("commerce_subscription_invoice_items", {
        invoiceId: f.ids.invoiceId, description: "basic", quantity: 1, unitAmount: 10_000, lineTotalAmount: 10_000, createdAt: 1,
      }),
    );
    const page = await f.admin.query(api.commerceSubscriptions.adminContracts.listInvoices, {
      status: "failed", paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page.map((row) => [row.invoiceNumber, row.customerEmail])).toEqual([["INV-000100", "customer@example.invalid"]]);
    const detail = await f.admin.query(api.commerceSubscriptions.adminContracts.getInvoiceDetail, { invoiceId: f.ids.invoiceId });
    expect(detail).toMatchObject({
      planTitle: "basic", customerName: "Casey Customer", refundableAmount: 0,
      lines: [{ title: "basic", quantity: 1, totalAmount: 10_000 }],
    });
    expect(detail?.attempts.map((row) => [row.attemptNumber, row.status])).toEqual([[1, "failed"], [2, "scheduled"]]);
  });

  test("a customer's cancellation shows once in the timeline, and the contract's items end with it", async () => {
    const f = await fixture();
    await f.customer.mutation(api.commerceSubscriptions.portal.requestCancelContract, {
      contractId: f.ids.subscriptionId, immediate: true, reason: "Closing the practice",
    });
    const billing = await f.admin.query(api.commerceSubscriptions.adminContracts.getContractBilling, { subscriptionId: f.ids.subscriptionId });
    const cancels = billing?.timeline.filter((row) => row.toStatus === "cancelled") ?? [];
    expect(cancels).toHaveLength(1);
    expect(cancels[0]).toMatchObject({ eventType: "subscription.portal_cancel_now", fromStatus: "active", actor: "Casey Customer" });
    expect(billing?.timeline.map((row) => row.eventType)).not.toContain("subscription.status_changed");
    expect(billing?.actions).toEqual({ pause: false, resume: false, scheduleCancel: false, cancelNow: false, retryPayment: false, changePlan: false });
    const items = await f.t.run((ctx) =>
      ctx.db.query("commerce_subscription_items").withIndex("by_subscription", (q) => q.eq("subscriptionId", f.ids.subscriptionId)).collect(),
    );
    expect(items.map((item) => item.status)).toEqual(["cancelled"]);

    // An operator's cancel (no separate action row) still shows, with its reason.
    const g = await fixture();
    await g.admin.mutation(api.commerceSubscriptions.mutations.cancelNow, { subscriptionId: g.ids.subscriptionId, reason: "Chargeback" });
    const operator = await g.admin.query(api.commerceSubscriptions.adminContracts.getContractBilling, { subscriptionId: g.ids.subscriptionId });
    expect(operator?.timeline.filter((row) => row.toStatus === "cancelled")).toEqual([
      expect.objectContaining({ eventType: "subscription.status_changed", reason: "Chargeback", actor: "Avery Admin" }),
    ]);
  });
});

