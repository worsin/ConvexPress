/**
 * The renewal notice (upstream PR 091): a yearly (or longer) plan's customer is
 * told about 30 days before it renews, once per renewal, with what it charges
 * and how to cancel, as automatic-renewal laws ask. Shorter plans aren't.
 */
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { convexTest } from "convex-test";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { billedYearlyOrLonger, RENEWAL_NOTICE_DAYS } from "../internals";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceSubscriptions/internals.ts": () => import("../internals"),
  "./convex/commerceSubscriptions/emails.ts": () => import("../emails"),
  "./convex/emails/internals.ts": () => import("../../emails/internals"),
};

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 15, 18, 0, 0);

beforeEach(() => setSystemTime(new Date(NOW)));
afterEach(() => setSystemTime());

type Contract = Partial<Doc<"commerce_subscriptions">>;

async function fixture() {
  const t = convexTest({ schema, modules });
  const base = await t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", {
      authSource: "local", email: "admin@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1,
    });
    const customer = await ctx.db.insert("users", {
      authSource: "local", email: "casey@example.invalid", firstName: "Casey", emailVerified: true, status: "active",
      createdAt: 1, updatedAt: 1,
    });
    for (const [section, values] of [
      ["general", { siteTitle: "Clinic", siteUrl: "https://clinic.example", timezone: "America/Los_Angeles" }],
      ["email", { enabled: true }],
      ["plugins", { commerceEnabled: true, commerceSubscriptionsEnabled: true }],
    ] as const) {
      await ctx.db.insert("settings", { section, values, updatedAt: 1, updatedBy: admin });
    }
    const templateId = await ctx.db.insert("commerce_subscription_templates", {
      title: "Yearly", slug: "yearly", status: "active", billingInterval: "year", billingIntervalCount: 1, pausable: true,
      cancelAtPeriodEndDefault: true, version: 1, createdAt: 1, updatedAt: 1,
    });
    const offerId = await ctx.db.insert("commerce_subscription_offers", {
      title: "Practice Annual", slug: "practice-annual", status: "active", templateId, sourceType: "custom", availableInCart: false,
      availableInDirectForms: true, availableForAdminProvisioning: true, createNewSubscription: true,
      allowAddToExistingSubscription: false, currencyCode: "USD", recurringAmount: 299_000, createdAt: 1, updatedAt: 1,
    });
    return { customer, templateId, offerId };
  });
  await t.mutation(internal.emails.internals.bootstrapTemplates, {});

  /** A contract renewing in `days` days; yearly and active unless overridden. */
  const contract = (days: number, overrides: Contract = {}) =>
    t.run(async (ctx) => {
      const id = await ctx.db.insert("commerce_subscriptions", {
        userId: base.customer, sourceChannel: "direct_form", templateId: base.templateId, status: "active", currencyCode: "USD",
        recurringAmount: 299_000, billingInterval: "year", billingIntervalCount: 1, currentPeriodStartAt: NOW - (365 - days) * DAY,
        currentPeriodEndAt: NOW + days * DAY, nextBillingAt: NOW + days * DAY, createdAt: 1, updatedAt: 1, ...overrides,
      });
      await ctx.db.insert("commerce_subscription_items", {
        subscriptionId: id, sourceOfferId: base.offerId, titleSnapshot: "Practice Annual", quantity: 1, unitAmount: 299_000,
        currencyCode: "USD", status: "active", createdAt: 1, updatedAt: 1,
      });
      return id;
    });
  const sweep = () => t.mutation(internal.commerceSubscriptions.internals.emitRenewalUpcomingEvents, {});
  const notices = () =>
    t.run(async (ctx) =>
      (await ctx.db.query("events").collect())
        .filter((event) => event.code === "commerce.subscription_renewal_upcoming")
        .map((event) => ({ id: event._id, payload: JSON.parse(event.payload) as { subscriptionId: string; renewsAt: number } })),
    );
  const deliver = async (eventId: Id<"events">) => {
    await t.mutation(internal.commerceSubscriptions.emails.onSubscriptionRenewalUpcoming, { eventId });
    return t.run(async (ctx) => (await ctx.db.query("emailQueue").collect()).map((row) => ({ subject: row.subject, text: row.bodyText ?? "", html: row.bodyHtml, to: row.to })));
  };
  const patch = (id: Id<"commerce_subscriptions">, value: Contract) => t.run((ctx) => ctx.db.patch(id, value));
  return { t, contract, sweep, notices, deliver, patch };
}

describe("which plans get a renewal notice", () => {
  test("a year or longer, however the period is written", () => {
    expect(billedYearlyOrLonger("year", 1)).toBe(true);
    expect(billedYearlyOrLonger("year", undefined)).toBe(true);
    expect(billedYearlyOrLonger("month", 12)).toBe(true);
    expect(billedYearlyOrLonger("month", 6)).toBe(false);
    expect(billedYearlyOrLonger("month", 1)).toBe(false);
    expect(billedYearlyOrLonger("week", 52)).toBe(true);
    expect(billedYearlyOrLonger("day", 30)).toBe(false);
    expect(billedYearlyOrLonger(undefined, 1)).toBe(false);
  });
});

describe("the renewal notice sweep", () => {
  test("tells an active yearly plan renewing in about 30 days, once per renewal", async () => {
    const f = await fixture();
    const yearly = await f.contract(RENEWAL_NOTICE_DAYS - 0.5);
    expect(await f.sweep()).toEqual({ emitted: 1 });
    expect(await f.sweep()).toEqual({ emitted: 0 });
    const [notice] = await f.notices();
    expect(notice?.payload).toMatchObject({ subscriptionId: yearly, renewsAt: NOW + (RENEWAL_NOTICE_DAYS - 0.5) * DAY });

    // A new renewal date (the plan renewed, or its date moved) is told again.
    await f.patch(yearly, { nextBillingAt: NOW + (RENEWAL_NOTICE_DAYS - 1) * DAY });
    expect(await f.sweep()).toEqual({ emitted: 1 });
  });

  test("a missed day still sends; too early or too late doesn't", async () => {
    const f = await fixture();
    await f.contract(RENEWAL_NOTICE_DAYS - 1.5); // the sweep missed yesterday
    await f.contract(RENEWAL_NOTICE_DAYS + 1); // tomorrow's
    await f.contract(10); // long past its notice window
    expect(await f.sweep()).toEqual({ emitted: 1 });
  });

  test("monthly plans, and contracts that won't renew, get none", async () => {
    const f = await fixture();
    const days = RENEWAL_NOTICE_DAYS - 0.5;
    await f.contract(days, { billingInterval: "month", billingIntervalCount: 1 });
    await f.contract(days, { cancelAtPeriodEnd: true });
    await f.contract(days, { status: "pending_cancel" });
    await f.contract(days, { status: "paused" });
    await f.contract(days, { status: "trialing" });
    await f.contract(days, { status: "past_due" });
    expect(await f.sweep()).toEqual({ emitted: 0 });
  });

  test("sends nothing while subscriptions are switched off", async () => {
    const f = await fixture();
    await f.contract(RENEWAL_NOTICE_DAYS - 0.5);
    await f.t.run(async (ctx) => {
      const plugins = (await ctx.db.query("settings").collect()).find((row) => row.section === "plugins");
      if (plugins) await ctx.db.patch(plugins._id, { values: { commerceEnabled: true, commerceSubscriptionsEnabled: false } });
    });
    expect(await f.sweep()).toEqual({ emitted: 0 });
  });
});

describe("the renewal notice email", () => {
  // 06:00 UTC on November 14 is still November 13 in Los Angeles: the date follows the site's zone.
  test("says it renews automatically, when, what it charges to which card, and how to cancel", async () => {
    const f = await fixture();
    await f.contract(RENEWAL_NOTICE_DAYS - 0.5, { paymentMethodSummary: { brand: "Visa", last4: "4242", expMonth: 4, expYear: 2029 } });
    await f.sweep();
    const [notice] = await f.notices();
    if (!notice) throw new Error("no notice");
    const [email] = await f.deliver(notice.id);
    expect(email?.to).toBe("casey@example.invalid");
    expect(email?.subject).toBe("Your Practice Annual plan renews on November 13, 2026");
    expect(email?.text).toContain("Your Practice Annual plan renews automatically on November 13, 2026. We'll charge $2,990.00 to your Visa card ending in 4242.");
    expect(email?.text).toContain("It renews per year until you cancel. To change your plan or cancel, visit your account before November 13, 2026.");
    expect(email?.html).toContain('href="https://clinic.example/dashboard/subscriptions"');
  });

  test("a contract that cancelled or moved its date since the notice was raised gets no stale email", async () => {
    const f = await fixture();
    const cancelling = await f.contract(RENEWAL_NOTICE_DAYS - 0.5);
    const moved = await f.contract(RENEWAL_NOTICE_DAYS - 0.75);
    await f.sweep();
    await f.patch(cancelling, { status: "pending_cancel", cancelAtPeriodEnd: true });
    await f.patch(moved, { nextBillingAt: NOW + 200 * DAY });
    for (const notice of await f.notices()) expect(await f.deliver(notice.id)).toEqual([]);
  });
});
