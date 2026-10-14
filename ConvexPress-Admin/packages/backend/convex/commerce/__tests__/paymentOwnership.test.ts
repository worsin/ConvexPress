/**
 * Payment trust boundary (upstream PR 011): one-time order payments and store
 * credit. Starting or capturing a payment, and reading a payment's client
 * secret, belong to the order's shopper; a store-credit balance can only be
 * debited by the server and read by its owner.
 */
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import * as storeCredit from "../../commerceReturns/storeCredit";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerce/payments.ts": () => import("../payments"),
  "./convex/commerceReturns/storeCredit.ts": () => import("../../commerceReturns/storeCredit"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};

const ADMIN_ISSUER = "https://convexpress-admin.local";
const GUEST_TOKEN = "guest-checkout-token";

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const user = (email: string) =>
      ctx.db.insert("users", { authSource: "local", email, emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const shopper = await user("shopper@example.invalid");
    const stranger = await user("stranger@example.invalid");
    await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true }, updatedAt: 1, updatedBy: shopper });
    const amounts = { currencyCode: "USD", subtotalAmount: 2400, discountAmount: 0, shippingAmount: 0, taxAmount: 0, totalAmount: 2400 };
    const cart = await ctx.db.insert("commerce_carts", {
      ...amounts, sessionToken: GUEST_TOKEN, status: "converted", itemCount: 1, lastActiveAt: 1, createdAt: 1, updatedAt: 1,
    });
    const session = await ctx.db.insert("commerce_checkout_sessions", {
      ...amounts, cartId: cart, sessionToken: GUEST_TOKEN, status: "completed", createdAt: 1, updatedAt: 1,
    });
    const order = (orderNumber: string, owner: Id<"users"> | undefined) =>
      ctx.db.insert("commerce_orders", {
        ...amounts, orderNumber, trackingToken: `track-${orderNumber}`, status: "pending", email: "shopper@example.invalid",
        billingAddress: { line1: "1 Main St", city: "Springfield", postalCode: "00000", countryCode: "US" },
        paymentStatus: "pending", fulfillmentStatus: "unfulfilled", userId: owner,
        checkoutSessionId: owner ? undefined : session, createdAt: 1, updatedAt: 1,
      });
    const owned = await order("1001", shopper);
    const guest = await order("1002", undefined);
    const paypalOrder = await order("1003", shopper);
    const paypal = await ctx.db.insert("commerce_payment_transactions", {
      orderId: paypalOrder, provider: "paypal", providerTransactionId: "PAYPAL-ORDER-OWNED", status: "processing",
      amount: { amount: 2400, currencyCode: "USD" }, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("commerce_store_credit_ledger", {
      userId: shopper, entryType: "issue", amount: 5000, balanceAfter: 5000, createdAt: 1,
    });
    return { shopper, stranger, owned, guest, paypal };
  });
  const as = (userId: Id<"users">) => t.withIdentity({ subject: userId, tokenIdentifier: `${ADMIN_ISSUER}|${userId}` });
  return { t, ids, shopper: as(ids.shopper), stranger: as(ids.stranger) };
}

test("only the order's shopper can start its payment or read its client secret", async () => {
  const f = await fixture();
  for (const caller of [f.t, f.stranger]) {
    await expect(caller.mutation(api.commerce.payments.initiatePayment, { orderId: f.ids.owned })).rejects.toThrow("belongs to another shopper");
    await expect(caller.mutation(api.commerce.payments.createPayPalOrder, { orderId: f.ids.owned })).rejects.toThrow("belongs to another shopper");
  }
  const started = await f.shopper.mutation(api.commerce.payments.initiatePayment, { orderId: f.ids.owned });
  for (const caller of [f.t, f.stranger]) {
    expect(await caller.query(api.commerce.payments.getTransactionStatus, { transactionId: started.transactionId })).toBeNull();
  }
  expect(await f.shopper.query(api.commerce.payments.getTransactionStatus, { transactionId: started.transactionId })).toMatchObject({
    _id: started.transactionId,
    status: "pending",
  });
});

test("a guest order is paid with the checkout session token that placed it", async () => {
  const f = await fixture();
  await expect(f.t.mutation(api.commerce.payments.initiatePayment, { orderId: f.ids.guest })).rejects.toThrow("belongs to another shopper");
  await expect(
    f.t.mutation(api.commerce.payments.initiatePayment, { orderId: f.ids.guest, sessionToken: "another-token" }),
  ).rejects.toThrow("belongs to another shopper");
  const started = await f.t.mutation(api.commerce.payments.initiatePayment, { orderId: f.ids.guest, sessionToken: GUEST_TOKEN });
  expect(await f.t.query(api.commerce.payments.getTransactionStatus, { transactionId: started.transactionId })).toBeNull();
  expect(
    await f.t.query(api.commerce.payments.getTransactionStatus, { transactionId: started.transactionId, sessionToken: GUEST_TOKEN }),
  ).toMatchObject({ _id: started.transactionId });
});

test("a PayPal capture only addresses the PayPal order the server created for that transaction", async () => {
  const f = await fixture();
  await expect(
    f.stranger.mutation(api.commerce.payments.capturePayPalOrder, { transactionId: f.ids.paypal, paypalOrderId: "PAYPAL-ORDER-OWNED" }),
  ).rejects.toThrow("belongs to another shopper");
  for (const paypalOrderId of ["PAYPAL-ORDER-OTHER", "x/../../../v2/payments/captures/CAPTURE/refund?"]) {
    await expect(
      f.shopper.mutation(api.commerce.payments.capturePayPalOrder, { transactionId: f.ids.paypal, paypalOrderId }),
    ).rejects.toThrow("does not belong to this transaction");
  }
  expect(
    await f.shopper.mutation(api.commerce.payments.capturePayPalOrder, { transactionId: f.ids.paypal, paypalOrderId: "PAYPAL-ORDER-OWNED" }),
  ).toEqual({ status: "capture_scheduled" });
});

test("store credit cannot be debited by a client and is readable only by its owner", async () => {
  const f = await fixture();
  // `redeem` is internal: the public API has no debit entry point at all.
  expect(storeCredit.redeem.isInternal).toBe(true);
  for (const caller of [f.t, f.stranger]) {
    await expect(caller.query(api.commerceReturns.storeCredit.getBalance, { userId: f.ids.shopper })).rejects.toThrow("cannot view this store credit");
    await expect(caller.query(api.commerceReturns.storeCredit.listLedger, { userId: f.ids.shopper })).rejects.toThrow("cannot view this store credit");
  }
  expect(await f.shopper.query(api.commerceReturns.storeCredit.getBalance, { userId: f.ids.shopper })).toEqual({ balance: 5000 });
  expect(await f.shopper.query(api.commerceReturns.storeCredit.listLedger, { userId: f.ids.shopper })).toHaveLength(1);
});
