/**
 * The direct signup page's checkout read (upstream PR 043): the owner sees
 * what is due today and the plan's terms; nobody else sees anything.
 */
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceSubscriptions/checkout.ts": () => import("../checkout"),
};

const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
beforeEach(() => setSystemTime(new Date(NOW)));
afterEach(() => setSystemTime());

describe("my checkout", () => {
  test("the owner reads the amounts and the summary; another account and a visitor read nothing", async () => {
    const t = convexTest({ schema, modules });
    const ids = await t.run(async (ctx) => {
      const user = (email: string) =>
        ctx.db.insert("users", { authSource: "local", email, emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
      const owner = await user("casey@example.invalid");
      const other = await user("robin@example.invalid");
      await ctx.db.insert("settings", {
        section: "plugins", values: { commerceEnabled: true, commerceSubscriptionsEnabled: true }, updatedAt: 1, updatedBy: owner,
      });
      const templateId = await ctx.db.insert("commerce_subscription_templates", {
        title: "Monthly", slug: "monthly", status: "active", billingInterval: "month", billingIntervalCount: 1, pausable: true,
        cancelAtPeriodEndDefault: true, version: 1, createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("commerce_subscription_offers", {
        title: "Growth", slug: "growth", status: "active", templateId, sourceType: "custom", availableInCart: false,
        availableInDirectForms: true, availableForAdminProvisioning: true, createNewSubscription: true,
        allowAddToExistingSubscription: false, currencyCode: "USD", recurringAmount: 29_900, setupFeeAmount: 5_000,
        createdAt: 1, updatedAt: 1,
      });
      return { owner, other };
    });
    const as = (id: typeof ids.owner) => t.withIdentity({ subject: id, tokenIdentifier: `https://convexpress-admin.local|${id}` });
    const offerId = await t.run(async (ctx) => (await ctx.db.query("commerce_subscription_offers").first())?._id);
    if (!offerId) throw new Error("no offer");
    const created = await as(ids.owner).mutation(api.commerceSubscriptions.checkout.createCheckoutIntent, { offerId });

    const mine = await as(ids.owner).query(api.commerceSubscriptions.checkout.getMyCheckout, { intentId: created.intentId });
    expect(mine).toMatchObject({ amount: 34_900, recurringAmount: 29_900, currency: "USD" });
    expect(mine?.summary).toMatchObject({ planTitle: "Growth", setupFeeAmount: 5_000, billingInterval: "month", trialDays: 0 });

    expect(await as(ids.other).query(api.commerceSubscriptions.checkout.getMyCheckout, { intentId: created.intentId })).toBeNull();
    expect(await t.query(api.commerceSubscriptions.checkout.getMyCheckout, { intentId: created.intentId })).toBeNull();
  });
});
