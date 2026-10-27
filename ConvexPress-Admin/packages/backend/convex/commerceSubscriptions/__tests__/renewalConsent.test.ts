/**
 * Automatic-renewal consent (upstream PR 061): the buyer's consent to the
 * renewal terms shown beside the pay button is recorded on the checkout, with
 * the exact words, before the card is charged; and the checkout summary says
 * when a cancellation takes effect.
 */
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { checkoutSummary } from "../checkoutSummary";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceSubscriptions/checkout.ts": () => import("../checkout"),
};
const TERMS = "Practice renews automatically at $299.00 per month until you cancel. Cancel any time from your account.";

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const buyer = await ctx.db.insert("users", { authSource: "local", email: "buyer@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const other = await ctx.db.insert("users", { authSource: "local", email: "other@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true, commerceSubscriptionsEnabled: true }, updatedAt: 1, updatedBy: buyer });
    const template = (cancelAtPeriodEndDefault: boolean) =>
      ctx.db.insert("commerce_subscription_templates", {
        title: "Monthly", slug: `monthly-${cancelAtPeriodEndDefault}`, status: "active", billingInterval: "month", billingIntervalCount: 1,
        pausable: false, cancelAtPeriodEndDefault, version: 1, createdAt: 1, updatedAt: 1,
      });
    const offer = async (slug: string, cancelAtPeriodEndDefault: boolean) =>
      ctx.db.insert("commerce_subscription_offers", {
        title: "Practice", slug, status: "active", templateId: await template(cancelAtPeriodEndDefault), sourceType: "custom", availableInCart: false,
        availableInDirectForms: true, availableForAdminProvisioning: true, createNewSubscription: true, allowAddToExistingSubscription: false,
        currencyCode: "USD", recurringAmount: 29_900, entitlementCodes: ["portal"], createdAt: 1, updatedAt: 1,
      });
    const periodEnd = await offer("practice", true);
    const atOnce = await offer("practice-now", false);
    const intent = (fields: { userId?: Id<"users">; status?: "payment_pending" | "payment_succeeded" | "activated" | "expired"; offerId?: Id<"commerce_subscription_offers"> }) =>
      ctx.db.insert("commerce_subscription_checkout_intents", {
        sourceChannel: "direct_form", status: fields.status ?? "payment_pending", ...(fields.userId ? { userId: fields.userId } : {}),
        selectedOfferIds: [fields.offerId ?? periodEnd], initialAmount: 29_900, recurringAmount: 29_900, setupFeeAmount: 0, currencyCode: "USD",
        createdAt: 1, updatedAt: 1,
      });
    return {
      buyer, other, atOnce,
      owned: await intent({ userId: buyer }),
      guest: await intent({}),
      paid: await intent({ userId: buyer, status: "payment_succeeded" }),
      immediate: await intent({ userId: buyer, offerId: atOnce }),
    };
  });
  const as = (user: Id<"users">) => t.withIdentity({ subject: user, tokenIdentifier: `https://convexpress-admin.local|${user}` });
  const consent = (intentId: Id<"commerce_subscription_checkout_intents">) => t.run(async (ctx) => (await ctx.db.get(intentId))?.renewalConsent ?? null);
  return { t, ids, as, consent };
}

test("the buyer's consent is recorded with the exact terms; a later consent replaces it", async () => {
  const f = await fixture();
  await f.as(f.ids.buyer).mutation(api.commerceSubscriptions.checkout.recordRenewalConsent, { checkoutIntentRef: f.ids.owned, text: `  ${TERMS}  ` });
  const first = await f.consent(f.ids.owned);
  expect(first).toMatchObject({ text: TERMS });
  expect(typeof first?.acceptedAt).toBe("number");
  await f.as(f.ids.buyer).mutation(api.commerceSubscriptions.checkout.recordRenewalConsent, { checkoutIntentRef: f.ids.owned, text: "Updated terms." });
  expect((await f.consent(f.ids.owned))?.text).toBe("Updated terms.");
  // A guest checkout (no account) is consented by whoever holds it.
  await f.t.mutation(api.commerceSubscriptions.checkout.recordRenewalConsent, { checkoutIntentRef: f.ids.guest, text: TERMS });
  expect((await f.consent(f.ids.guest))?.text).toBe(TERMS);
});

test("only the buyer, on an unpaid checkout, with terms of a sensible length", async () => {
  const f = await fixture();
  const record = (who: "buyer" | "other" | "anonymous", checkoutIntentRef: string, text = TERMS) =>
    (who === "anonymous" ? f.t : f.as(who === "buyer" ? f.ids.buyer : f.ids.other)).mutation(api.commerceSubscriptions.checkout.recordRenewalConsent, { checkoutIntentRef, text });
  await expect(record("other", f.ids.owned)).rejects.toThrow(/another account/);
  await expect(record("anonymous", f.ids.owned)).rejects.toThrow(/another account/);
  await expect(record("buyer", f.ids.paid)).rejects.toThrow(/can no longer be changed/);
  await expect(record("buyer", f.ids.owned, "   ")).rejects.toThrow(/missing or too long/);
  await expect(record("buyer", f.ids.owned, "x".repeat(2001))).rejects.toThrow(/missing or too long/);
  await expect(record("buyer", "not-an-intent")).rejects.toThrow(/not found/);
  expect(await f.consent(f.ids.owned)).toBeNull();
});

test("the checkout summary says whether cancelling waits for the end of the paid period", async () => {
  const f = await fixture();
  const summary = (intentId: string) => f.t.run((ctx) => checkoutSummary(ctx, intentId));
  expect((await summary(f.ids.owned))?.cancelAtPeriodEnd).toBe(true);
  expect((await summary(f.ids.immediate))?.cancelAtPeriodEnd).toBe(false);
});
