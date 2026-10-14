/**
 * The account page's next charge (upstream PR 040): what the next charge takes
 * after the contract's coupons, which coupons still apply and for how long,
 * and the new plan's price when a scheduled change lands first.
 */
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceSubscriptions/portal.ts": () => import("../portal"),
};

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);

beforeEach(() => setSystemTime(new Date(NOW)));
afterEach(() => setSystemTime());

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const customer = await ctx.db.insert("users", {
      authSource: "local", email: "casey@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", {
      section: "plugins", values: { commerceEnabled: true, commerceSubscriptionsEnabled: true }, updatedAt: 1, updatedBy: customer,
    });
    const templateId = await ctx.db.insert("commerce_subscription_templates", {
      title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1, pausable: true,
      cancelAtPeriodEndDefault: true, version: 1, createdAt: 1, updatedAt: 1,
    });
    const offer = (title: string, amount: number) =>
      ctx.db.insert("commerce_subscription_offers", {
        title, slug: title.toLowerCase(), status: "active", templateId, sourceType: "custom", availableInCart: false,
        availableInDirectForms: true, availableForAdminProvisioning: true, createNewSubscription: true,
        allowAddToExistingSubscription: false, currencyCode: "USD", recurringAmount: amount, createdAt: 1, updatedAt: 1,
      });
    const growth = await offer("Growth", 59_900);
    const launch = await offer("Launch", 29_900);
    const contractId = await ctx.db.insert("commerce_subscriptions", {
      userId: customer, sourceChannel: "direct_form", templateId, status: "active", currencyCode: "USD", recurringAmount: 59_900,
      billingInterval: "month", billingIntervalCount: 1, currentPeriodStartAt: NOW - 10 * DAY, currentPeriodEndAt: NOW + 20 * DAY,
      nextBillingAt: NOW + 20 * DAY, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("commerce_subscription_items", {
      subscriptionId: contractId, sourceOfferId: growth, titleSnapshot: "Growth", quantity: 1, unitAmount: 59_900, currencyCode: "USD",
      status: "active", createdAt: 1, updatedAt: 1,
    });
    return { customer, contractId, launch };
  });
  const customer = t.withIdentity({ subject: ids.customer, tokenIdentifier: `https://convexpress-admin.local|${ids.customer}` });
  const contract = async () => {
    const rows = await customer.query(api.commerceSubscriptions.portal.getMyActiveContracts, {});
    const row = rows[0];
    if (!row) throw new Error("no contract");
    return row;
  };
  return { t, ids, contract };
}

describe("next charge on the account page", () => {
  test("without coupons it is the plan's price on the next billing date", async () => {
    const f = await fixture();
    expect(await f.contract()).toMatchObject({ nextChargeAmount: 59_900, nextChargeAt: NOW + 20 * DAY, discounts: [] });
  });

  test("coupons that still apply come off in turn, and say how long they last", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      const ten = await ctx.db.insert("commerce_subscription_coupons", {
        code: "TEN", discountType: "percent", amount: 10, duration: "forever", status: "active", createdBy: f.ids.customer, createdAt: 1,
      });
      const off25 = await ctx.db.insert("commerce_subscription_coupons", {
        code: "OFF25", discountType: "fixed", amount: 2_500, duration: "n_months", durationMonths: 3, status: "active",
        createdBy: f.ids.customer, createdAt: 1,
      });
      const used = await ctx.db.insert("commerce_subscription_coupons", {
        code: "USED", discountType: "percent", amount: 50, duration: "once", status: "active", createdBy: f.ids.customer, createdAt: 1,
      });
      const redemptions = [
        { couponId: ten, remainingApplications: 9_997 },
        { couponId: off25, remainingApplications: 2 },
        { couponId: used, remainingApplications: 0 },
      ];
      for (const { couponId, remainingApplications } of redemptions) {
        await ctx.db.insert("commerce_subscription_coupon_redemptions", {
          couponId, contractId: f.ids.contractId, customerId: f.ids.customer, remainingApplications, redeemedAt: 1,
        });
      }
    });
    const contract = await f.contract();
    // $599.00 − 10% = $539.10, then − $25.00 = $514.10. The used-up coupon is gone.
    expect(contract.nextChargeAmount).toBe(51_410);
    expect(contract.discounts).toEqual([
      { code: "TEN", discountType: "percent", amount: 10, remainingCharges: null },
      { code: "OFF25", discountType: "fixed", amount: 2_500, remainingCharges: 2 },
    ]);
  });

  test("a plan change that lands before the next charge sets its price", async () => {
    const f = await fixture();
    await f.t.run((ctx) =>
      ctx.db.patch("commerce_subscriptions", f.ids.contractId, {
        scheduledOfferChange: { toOfferId: f.ids.launch, effectiveAt: NOW + 20 * DAY },
      }),
    );
    expect((await f.contract()).nextChargeAmount).toBe(29_900);
    await f.t.run((ctx) =>
      ctx.db.patch("commerce_subscriptions", f.ids.contractId, {
        scheduledOfferChange: { toOfferId: f.ids.launch, effectiveAt: NOW + 50 * DAY },
      }),
    );
    expect((await f.contract()).nextChargeAmount).toBe(59_900);
  });
});
