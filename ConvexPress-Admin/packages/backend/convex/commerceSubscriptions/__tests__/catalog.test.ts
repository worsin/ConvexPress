/**
 * The subscription catalog (upstream PR 029): per-template retry schedules
 * that dunning follows, template validation, the admin catalog reads with
 * usage and locks, and the ended-contract item backfill.
 */
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceSubscriptions/adminCatalog.ts": () => import("../adminCatalog"),
  "./convex/commerceSubscriptions/mutations.ts": () => import("../mutations"),
  "./convex/commerceSubscriptions/internals.ts": () => import("../internals"),
  "./convex/commerceSubscriptions/migrations.ts": () => import("../migrations"),
  "./convex/commerceSubscriptions/offers.ts": () => import("../offers"),
  "./convex/commerceSubscriptions/coupons.ts": () => import("../coupons"),
  "./convex/purchases/internals.ts": () => import("../../purchases/internals"),
  "./convex/membership/internals.ts": () => import("../../membership/internals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/notifications/internals.ts": () => import("../../notifications/internals"),
  "./convex/settings/queries.ts": () => import("../../settings/queries"),
};

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 14, 12, 0, 0);

const liveTests: Array<ReturnType<typeof convexTest>> = [];
async function drainScheduled(t: ReturnType<typeof convexTest>): Promise<void> {
  for (let round = 0; round < 5; round++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await t.finishInProgressScheduledFunctions();
  }
}

beforeEach(() => setSystemTime(new Date(START)));
afterEach(async () => {
  for (const t of liveTests.splice(0)) await drainScheduled(t);
  setSystemTime();
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
      authSource: "local", email: "admin@example.invalid", displayName: "Avery Admin", emailVerified: true, status: "active",
      roleId, createdAt: 1, updatedAt: 1,
    });
    const customer = await ctx.db.insert("users", {
      authSource: "local", email: "customer@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", {
      section: "plugins", values: { commerceEnabled: true, commerceSubscriptionsEnabled: true }, updatedAt: 1, updatedBy: admin,
    });
    return { admin, customer };
  });
  const admin = t.withIdentity({ subject: ids.admin, tokenIdentifier: `https://convexpress-admin.local|${ids.admin}` });
  return { t, ids, admin };
}

/** A contract on `templateId` with one open renewal invoice, ready to fail. */
async function contractWithOpenRenewal(
  f: Awaited<ReturnType<typeof fixture>>,
  templateId: Id<"commerce_subscription_templates">,
  status: "active" | "cancelled" = "active",
) {
  return f.t.run(async (ctx) => {
    const offerId = await ctx.db.insert("commerce_subscription_offers", {
      title: "Launch", slug: `launch-${Math.round(Math.random() * 1e9)}`, status: "active", templateId, sourceType: "custom",
      availableInCart: false, availableInDirectForms: true, availableForAdminProvisioning: true, createNewSubscription: true,
      allowAddToExistingSubscription: false, currencyCode: "USD", recurringAmount: 10_000, entitlementCodes: ["pro"],
      createdAt: 1, updatedAt: 1,
    });
    const subscriptionId = await ctx.db.insert("commerce_subscriptions", {
      userId: f.ids.customer, sourceChannel: "direct_form", templateId, status, currencyCode: "USD", recurringAmount: 10_000,
      billingInterval: "month", billingIntervalCount: 1, currentPeriodStartAt: START, currentPeriodEndAt: START + 30 * DAY,
      nextBillingAt: START + 30 * DAY, ...(status === "cancelled" ? { cancelledAt: START - DAY } : {}),
      createdAt: START - 60 * DAY, updatedAt: 1,
    });
    const itemId = await ctx.db.insert("commerce_subscription_items", {
      subscriptionId, sourceOfferId: offerId, titleSnapshot: "Launch", quantity: 1, unitAmount: 10_000, currencyCode: "USD",
      status: "active", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("commerce_subscription_entitlements", {
      subscriptionId, userId: f.ids.customer, entitlementCode: "pro", status: "active", startsAt: 1, createdAt: 1, updatedAt: 1,
    });
    const invoiceId = await ctx.db.insert("commerce_subscription_invoices", {
      subscriptionId, status: "open", kind: "renewal", currencyCode: "USD", subtotalAmount: 10_000, taxAmount: 0, totalAmount: 10_000,
      dueAt: START, createdAt: START, updatedAt: START,
    });
    return { offerId, subscriptionId, itemId, invoiceId };
  });
}

async function failCharge(f: Awaited<ReturnType<typeof fixture>>, invoiceId: Id<"commerce_subscription_invoices">, n: number) {
  await f.t.mutation(internal.commerceSubscriptions.internals.handleInvoicePaymentResult, {
    invoiceId, succeeded: false, failureCode: "card_declined", failureReason: "card_declined", paymentTransactionId: `pi_fail_${n}`,
  });
}

describe("subscription catalog", () => {
  test("a template's retry schedule drives dunning; it can leave the contract past due instead of cancelling", async () => {
    const f = await fixture();
    const templateId = await f.admin.mutation(api.commerceSubscriptions.mutations.createTemplate, {
      title: "Monthly, gentle", slug: "monthly-gentle", status: "active", billingInterval: "month", billingIntervalCount: 1,
      gracePeriodDays: 10, pausable: false, cancelAtPeriodEndDefault: true, dunningRetryDays: [2, 5], cancelAfterFinalFailure: false,
    });
    const { subscriptionId, invoiceId } = await contractWithOpenRenewal(f, templateId);

    await failCharge(f, invoiceId, 1);
    const scheduled = async () =>
      f.t.run(async (ctx) =>
        (await ctx.db.query("commerce_subscription_dunning_attempts").collect())
          .filter((attempt) => attempt.status === "scheduled")
          .map((attempt) => attempt.scheduledAt),
      );
    expect(await scheduled()).toEqual([START + 2 * DAY]);

    // The retry runs and fails: the next one waits 5 days.
    await f.t.run(async (ctx) => {
      for (const attempt of await ctx.db.query("commerce_subscription_dunning_attempts").collect()) {
        if (attempt.status === "scheduled") await ctx.db.patch("commerce_subscription_dunning_attempts", attempt._id, { status: "processing" });
      }
    });
    await failCharge(f, invoiceId, 2);
    expect(await scheduled()).toEqual([START + 5 * DAY]);

    await f.t.run(async (ctx) => {
      for (const attempt of await ctx.db.query("commerce_subscription_dunning_attempts").collect()) {
        if (attempt.status === "scheduled") await ctx.db.patch("commerce_subscription_dunning_attempts", attempt._id, { status: "processing" });
      }
    });
    await failCharge(f, invoiceId, 3);
    expect(await scheduled()).toEqual([]);
    const contract = await f.t.run((ctx) => ctx.db.get(subscriptionId));
    expect(contract?.status).toBe("past_due");

    const editor = await f.admin.query(api.commerceSubscriptions.adminCatalog.getTemplateEditor, { templateId });
    expect(editor?.retryPolicy).toEqual({ retryDays: [2, 5], cancelAfterFinalFailure: false, isDefault: false });
    expect(editor?.defaultRetryDays).toEqual([1, 3, 7]);
  });

  test("template terms are checked before they are saved", async () => {
    const f = await fixture();
    const base = {
      title: "Monthly", slug: "monthly", billingInterval: "month" as const, billingIntervalCount: 1, pausable: true,
      cancelAtPeriodEndDefault: true,
    };
    await expect(f.admin.mutation(api.commerceSubscriptions.mutations.createTemplate, { ...base, dunningRetryDays: [0] })).rejects.toThrow(
      "Each retry waits a whole number of days",
    );
    await expect(
      f.admin.mutation(api.commerceSubscriptions.mutations.createTemplate, { ...base, dunningRetryDays: [1, 1, 1, 1, 1, 1, 1, 1, 1] }),
    ).rejects.toThrow("At most 8 retries");
    await expect(f.admin.mutation(api.commerceSubscriptions.mutations.createTemplate, { ...base, slug: "Monthly Plan" })).rejects.toThrow(
      "lowercase letters",
    );
    await expect(f.admin.mutation(api.commerceSubscriptions.mutations.createTemplate, { ...base, billingIntervalCount: 0 })).rejects.toThrow(
      "Bill every 1 to 36",
    );
    const templateId = await f.admin.mutation(api.commerceSubscriptions.mutations.createTemplate, base);
    await expect(
      f.admin.mutation(api.commerceSubscriptions.mutations.updateTemplate, { templateId, trialDays: -1 }),
    ).rejects.toThrow("A trial is 0 to 365");
    // A schedule change alone is not a new version; a cadence change is.
    await f.admin.mutation(api.commerceSubscriptions.mutations.updateTemplate, { templateId, dunningRetryDays: [] });
    expect((await f.t.run((ctx) => ctx.db.get(templateId)))?.version).toBe(1);
    await f.admin.mutation(api.commerceSubscriptions.mutations.updateTemplate, { templateId, billingInterval: "year" });
    expect((await f.t.run((ctx) => ctx.db.get(templateId)))?.version).toBe(2);
  });

  test("an offer in use shows its live contracts and locked price fields before any edit", async () => {
    const f = await fixture();
    const templateId = await f.admin.mutation(api.commerceSubscriptions.mutations.createTemplate, {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1, pausable: true,
      cancelAtPeriodEndDefault: true,
    });
    const { offerId } = await contractWithOpenRenewal(f, templateId);
    const editor = await f.admin.query(api.commerceSubscriptions.adminCatalog.getOfferEditor, { offerId });
    expect(editor?.usage).toEqual({ liveContracts: 1, totalContracts: 1 });
    expect(editor?.lockedFields).toContain("recurringAmount");
    expect(editor?.template).toMatchObject({ title: "Monthly", billingInterval: "month" });

    const rows = await f.admin.query(api.commerceSubscriptions.adminCatalog.listOfferRows, {});
    expect(rows.map((row) => [row.title, row.usage.liveContracts, row.template?.title])).toEqual([["Launch", 1, "Monthly"]]);
    const templates = await f.admin.query(api.commerceSubscriptions.adminCatalog.listTemplateRows, {});
    expect(templates[0]).toMatchObject({ offerCount: 1, usage: { liveContracts: 1 }, retryPolicy: { retryDays: [1, 3, 7], isDefault: true } });

    // The lock is the one updateOffer enforces.
    await expect(
      f.admin.mutation(api.commerceSubscriptions.offers.updateOffer, { offerId, recurringAmount: 20_000 }),
    ).rejects.toThrow();
  });

  test("the backfill ends the live items of contracts that ended before items followed them", async () => {
    const f = await fixture();
    const templateId = await f.admin.mutation(api.commerceSubscriptions.mutations.createTemplate, {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1, pausable: true,
      cancelAtPeriodEndDefault: true,
    });
    const ended = await contractWithOpenRenewal(f, templateId, "cancelled");
    const live = await contractWithOpenRenewal(f, templateId, "active");
    await f.t.mutation(internal.commerceSubscriptions.migrations.endItemsOfEndedContracts, {});
    await drainScheduled(f.t);
    const items = await f.t.run(async (ctx) => ({
      ended: await ctx.db.get(ended.itemId),
      live: await ctx.db.get(live.itemId),
    }));
    expect(items.ended).toMatchObject({ status: "cancelled", cancelledAt: START - DAY });
    expect(items.live?.status).toBe("active");
  });

  test("coupon codes are stored in capitals and match however the customer types them", async () => {
    const f = await fixture();
    const templateId = await f.admin.mutation(api.commerceSubscriptions.mutations.createTemplate, {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1, pausable: true,
      cancelAtPeriodEndDefault: true,
    });
    const { offerId, subscriptionId } = await contractWithOpenRenewal(f, templateId);
    const couponId = await f.admin.mutation(api.commerceSubscriptions.coupons.createCoupon, {
      code: " save20 ", discountType: "percent", amount: 20, duration: "n_months", durationMonths: 3, offerIds: [offerId],
    });
    expect((await f.t.run((ctx) => ctx.db.get(couponId)))?.code).toBe("SAVE20");
    expect((await f.admin.query(api.commerceSubscriptions.coupons.getCouponByCode, { code: "Save20" }))?._id).toBe(couponId);
    await expect(
      f.admin.mutation(api.commerceSubscriptions.coupons.createCoupon, { code: "SAVE20", discountType: "fixed", amount: 500, duration: "once" }),
    ).rejects.toThrow("already exists");
    await expect(
      f.admin.mutation(api.commerceSubscriptions.coupons.createCoupon, { code: "20% off!", discountType: "percent", amount: 20, duration: "once" }),
    ).rejects.toThrow("3 to 32 letters");

    // A customer redeems it in lower case.
    await f.t.withIdentity({ subject: f.ids.customer, tokenIdentifier: `https://convexpress-admin.local|${f.ids.customer}` })
      .mutation(api.commerceSubscriptions.coupons.redeemCouponForContract, { contractId: subscriptionId, couponCode: "save20" });
    const editor = await f.admin.query(api.commerceSubscriptions.adminCatalog.getCouponEditor, { couponId });
    expect(editor).toMatchObject({ code: "SAVE20", redemptions: 1, offers: [{ _id: offerId, title: "Launch", currencyCode: "USD" }] });
    expect(editor?.recentRedemptions[0]).toMatchObject({ contractId: subscriptionId, customerEmail: "customer@example.invalid", remainingApplications: 3 });
  });

  test("older lower-case coupon codes are normalized unless two would collide", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      const base = { discountType: "percent" as const, amount: 10, duration: "once" as const, status: "active" as const, createdBy: f.ids.admin, createdAt: 1 };
      await ctx.db.insert("commerce_subscription_coupons", { ...base, code: "spring" });
      await ctx.db.insert("commerce_subscription_coupons", { ...base, code: "Fall" });
      await ctx.db.insert("commerce_subscription_coupons", { ...base, code: "FALL" });
      await ctx.db.insert("commerce_subscription_coupons", { ...base, code: "WINTER" });
    });
    const result = await f.t.mutation(internal.commerceSubscriptions.migrations.normalizeCouponCodes, {});
    expect(result).toEqual({ normalized: 1, collisions: ["FALL"] });
    const codes = await f.t.run(async (ctx) => (await ctx.db.query("commerce_subscription_coupons").collect()).map((coupon) => coupon.code).sort());
    expect(codes).toEqual(["FALL", "Fall", "SPRING", "WINTER"]);
  });
});

