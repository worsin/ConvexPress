import { describe, expect, test, spyOn } from "bun:test";
import Stripe from "stripe";
import * as payments from "../payments";
import { createStripeIntent, processStripeRefund, processProviderRefundAction } from "../paymentActions";
import * as orders from "../orders";
import * as cart from "../cart";
import { runRenewalSweep } from "../../commerceSubscriptions/renewal";
import { commerceHarness } from "./handlerHarness.test-support";
import { complete, updateSession } from "../checkout";
import { createDueInvoices, applyDueScheduledOfferChanges } from "../../commerceSubscriptions/internals";
import http from "../../http";

const invoke = (fn: any, ctx: any, args: any = {}) => fn._handler(ctx, args);

describe("commerce hardening: production handlers", () => {
  test("B01 pre-provider failure marks the local transaction failed and allows a fresh attempt", async () => {
    const ctx = commerceHarness({ commerce_orders: [{ _id: "order", paymentStatus: "pending", totalAmount: 1000, currencyCode: "USD" }], commerce_payment_transactions: [{ _id: "txn", orderId: "order", provider: "stripe", status: "pending", amount: { amount: 1000, currencyCode: "USD" } }] });
    ctx.handlers["commerce/workflows:beginInternal"] = () => ({ runId: "workflow", existing: false });
    ctx.handlers["settings/httpInternals:getBySectionInternal"] = () => { throw new Error("Synthetic missing configuration"); };
    ctx.handlers["commerce/payments:confirmPaymentFailure"] = payments.confirmPaymentFailure;
    // The repaired action uses this explicit local-ID endpoint.
    ctx.handlers["commerce/payments:failPaymentCreation"] = (payments as any).failPaymentCreation;
    await invoke(createStripeIntent, ctx, { transactionId: "txn", orderId: "order", amount: 1000, currency: "USD" });
    expect(ctx.tables.commerce_payment_transactions[0].status).toBe("failed");
    const retry = await invoke(payments.initiatePayment, ctx, { orderId: "order" });
    expect(retry.transactionId).not.toBe("txn");
    expect(ctx.calls.some((call: any) => call.name === "commerce/paymentActions:createStripeIntent")).toBe(true);
  });

  test("B03 bulk cancel restores committed stock exactly as a single cancellation", async () => {
    const seed = { commerce_orders: [{ _id: "order", status: "processing", paymentStatus: "paid", inventoryCommittedAt: 1 }], commerce_order_items: [{ _id: "item", orderId: "order", productId: "product", quantity: 2, productTitle: "Fixture" }], commerce_products: [{ _id: "product", title: "Fixture", trackInventory: true, stockQuantity: 3 }] };
    const single = commerceHarness(seed); const bulk = commerceHarness(seed);
    await invoke(orders.updateStatus, single, { orderId: "order", status: "cancelled" });
    await invoke(orders.bulkCancel, bulk, { orderIds: ["order"] });
    expect(bulk.tables.commerce_products[0].stockQuantity).toBe(single.tables.commerce_products[0].stockQuantity);
    expect(bulk.tables.commerce_orders[0].inventoryReleasedAt).toBeNumber();
    await invoke(orders.bulkCancel, bulk, { orderIds: ["order"] });
    expect(bulk.tables.commerce_products[0].stockQuantity).toBe(5);
  });

  test("B02 pending refund preserves pending state; duplicate success is accounted once", async () => {
    const ctx = commerceHarness({ commerce_payment_transactions: [{ _id: "txn", status: "succeeded", amount: { amount: 1000, currencyCode: "USD" } }], commerce_payment_refunds: [{ _id: "refund", transactionId: "txn", status: "pending", amount: { amount: 400, currencyCode: "USD" } }] });
    const args = { refundId: "refund", transactionId: "txn", providerRefundId: "re_fixture", amount: 400, success: false, providerStatus: "pending" };
    await invoke(payments.completeRefund, ctx, args);
    expect(ctx.tables.commerce_payment_refunds[0].status).toBe("pending");
    expect(ctx.tables.commerce_payment_refunds[0].providerRefundId).toBe("re_fixture");
    await invoke(payments.completeRefund, ctx, { ...args, success: true, providerStatus: "succeeded" });
    await invoke(payments.completeRefund, ctx, { ...args, success: true, providerStatus: "succeeded" });
    expect(ctx.tables.commerce_payment_transactions[0].refundedAmount).toBe(400);
  });

  test("B05 due offer changes run before invoice generation even when there are no invoices", async () => {
    const ctx = commerceHarness();
    ctx.handlers["commerceSubscriptions/internals:createDueInvoices"] = () => ({ createdCount: 0, invoiceIds: [] });
    await invoke(runRenewalSweep, ctx);
    const names = ctx.calls.map((call: any) => call.name);
    expect(names.indexOf("commerceSubscriptions/internals:applyDueScheduledOfferChanges")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("commerceSubscriptions/internals:applyDueScheduledOfferChanges")).toBeLessThan(names.indexOf("commerceSubscriptions/internals:createDueInvoices"));
  });

  test("B04 cart rejects a coupon restricted to another customer's email", async () => {
    const ctx = commerceHarness({ commerce_carts: [{ _id: "cart", sessionToken: "session", status: "active", userId: "admin" }], commerce_cart_items: [{ _id: "item", cartId: "cart", productId: "product", quantity: 1, unitPriceAmount: 1000, lineTotalAmount: 1000 }], commerce_products: [{ _id: "product", title: "Fixture", basePrice: { amount: 1000, currencyCode: "USD" } }], commerce_discount_codes: [{ _id: "discount", code: "PRIVATE", status: "active", discountType: "percent", amount: 50, usageCount: 0, allowedEmails: ["another@example.invalid"] }] });
    await expect(invoke(cart.applyDiscountCode, ctx, { sessionToken: "session", code: "PRIVATE" })).rejects.toThrow();
    expect(ctx.tables.commerce_carts[0].appliedDiscountCode).toBeUndefined();
  });

  test("B09 accepted free shipping coupon persists its shipping benefit", async () => {
    const ctx = commerceHarness({ commerce_carts: [{ _id: "cart", sessionToken: "session", status: "active", userId: "admin" }], commerce_cart_items: [{ _id: "item", cartId: "cart", productId: "product", quantity: 1, unitPriceAmount: 1000, lineTotalAmount: 1000 }], commerce_products: [{ _id: "product", title: "Fixture", basePrice: { amount: 1000, currencyCode: "USD" } }], commerce_discount_codes: [{ _id: "discount", code: "SHIP", status: "active", discountType: "free_shipping", amount: 1, usageCount: 0 }] });
    await invoke(cart.applyDiscountCode, ctx, { sessionToken: "session", code: "SHIP" });
    expect(ctx.tables.commerce_carts[0].freeShippingByCoupon).toBe(true);
    await invoke(cart.removeDiscountCode, ctx, { sessionToken: "session" });
    expect(ctx.tables.commerce_carts[0].freeShippingByCoupon).not.toBe(true);
  });
});

function checkoutFixture(discount: any = {}) {
  const address = { firstName: "Synthetic", lastName: "Customer", line1: "123 Test St", city: "Denver", state: "CO", postalCode: "80202", countryCode: "US" };
  return commerceHarness({
    settings: [
      { _id: "plugins", section: "plugins", values: { commerceEnabled: true } },
      { _id: "general", section: "commerce.general", values: { shippingEnabled: true, shippingMethods: [{ code: "flat", label: "Shipping" }], paymentMethods: [{ code: "card", label: "Card", enabled: true }], currencyCode: "USD" } },
    ],
    commerce_carts: [{ _id: "cart", sessionToken: "session", status: "active", userId: "admin", appliedDiscountCode: "SAVE", subtotalAmount: 1000, discountAmount: 100, shippingAmount: 250 }],
    commerce_checkout_sessions: [{ _id: "checkout", cartId: "cart", sessionToken: "session", userId: "admin", status: "ready_for_review", email: "admin@example.invalid", billingAddress: address, shippingAddress: address, selectedPaymentMethodCode: "card", selectedShippingMethodCode: "flat", currencyCode: "USD", subtotalAmount: 1000, discountAmount: 100, shippingAmount: 250 }],
    commerce_cart_items: [{ _id: "item", cartId: "cart", productId: "product", quantity: 1, unitPriceAmount: 1000, lineTotalAmount: 1000 }],
    commerce_products: [{ _id: "product", title: "Fixture", trackInventory: false, basePrice: { amount: 1000, currencyCode: "USD" } }],
    commerce_discount_codes: [{ _id: "discount", code: "SAVE", status: "active", discountType: "percent", amount: 10, usageCount: 0, ...discount }],
  });
}

describe("commerce boundary and provider regressions", () => {
  test("B01 successful Stripe creation passes the actual provider ID to confirmation", async () => {
    const stripe = new Stripe("sk_test_synthetic");
    const create = spyOn(Object.getPrototypeOf(stripe.paymentIntents), "create").mockResolvedValue({ id: "pi_synthetic", status: "succeeded", client_secret: "synthetic_secret" } as any);
    try {
      const ctx = commerceHarness();
      ctx.handlers["commerce/workflows:beginInternal"] = () => ({ runId: "workflow", existing: false });
      ctx.handlers["settings/httpInternals:getBySectionInternal"] = () => ({ stripeSecretKey: "sk_test_synthetic" });
      await invoke(createStripeIntent, ctx, { transactionId: "txn", orderId: "order", amount: 1000, currency: "USD" });
      expect(ctx.calls.find((c: any) => c.name === "commerce/payments:confirmPaymentSuccess")?.args).toEqual({ providerTransactionId: "pi_synthetic", provider: "stripe" });
      expect(create.mock.calls[0][1]).toEqual({ idempotencyKey: "commerce_payment_txn" });
    } finally { create.mockRestore(); }
  });

  test("B02 both refund actions preserve a provider's pending status", async () => {
    const stripe = new Stripe("sk_test_synthetic");
    const create = spyOn(Object.getPrototypeOf(stripe.refunds), "create").mockResolvedValue({ id: "re_synthetic", status: "pending" } as any);
    try {
      for (const action of [processStripeRefund, processProviderRefundAction]) {
        const ctx = commerceHarness();
        ctx.handlers["commerce/workflows:beginInternal"] = () => ({ runId: "workflow", existing: false });
        ctx.handlers["settings/httpInternals:getBySectionInternal"] = () => ({ stripeSecretKey: "sk_test_synthetic" });
        await invoke(action, ctx, { refundId: "refund", transactionId: "txn", provider: "stripe", providerTransactionId: "pi_synthetic", amount: 400 });
        expect(ctx.calls.find((c: any) => c.name === "commerce/payments:completeRefund")?.args).toMatchObject({ providerStatus: "pending", success: false });
      }
      expect(create.mock.calls.every((call: any) => call[1].idempotencyKey === "commerce_refund_refund")).toBe(true);
    } finally { create.mockRestore(); }
  });

  test("B02 real signed Stripe HTTP events reconcile once and invalid signatures cannot mutate refunds", async () => {
    const stripe = new Stripe("sk_test_synthetic");
    const ctx = commerceHarness({ commerce_payment_transactions: [{ _id: "txn", provider: "stripe", providerTransactionId: "pi_synthetic", status: "succeeded", amount: { amount: 1000, currencyCode: "USD" } }], commerce_payment_refunds: [{ _id: "refund", transactionId: "txn", status: "pending", amount: { amount: 400, currencyCode: "USD" } }] });
    ctx.handlers["settings/httpInternals:getBySectionInternal"] = () => ({ stripeSecretKey: "sk_test_synthetic", stripeWebhookSecret: "whsec_synthetic" });
    ctx.handlers["commerce/payments:logWebhookEvent"] = () => ({ eventId: "event", alreadyExists: false });
    ctx.handlers["commerce/payments:reconcileProviderRefund"] = payments.reconcileProviderRefund;
    const route = http.lookup("/webhooks/stripe", "POST")![0] as any;
    const body = JSON.stringify({ id: "evt_synthetic", type: "refund.updated", data: { object: { id: "re_synthetic", status: "succeeded", amount: 400, payment_intent: "pi_synthetic", metadata: { refundId: "refund" } } } });
    const request = (signature: string) => new Request("https://synthetic.invalid/webhooks/stripe", { method: "POST", body, headers: { "stripe-signature": signature } });
    const rejected = await route._handler(ctx, request("invalid"));
    expect(rejected.status).toBe(400);
    expect(ctx.tables.commerce_payment_refunds[0].status).toBe("pending");
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret: "whsec_synthetic" });
    expect((await route._handler(ctx, request(signature))).status).toBe(200);
    expect((await route._handler(ctx, request(signature))).status).toBe(200);
    expect(ctx.tables.commerce_payment_transactions[0].refundedAmount).toBe(400);
  });

  test("B04 final checkout rejects a previously applied coupon that expired", async () => {
    const ctx = checkoutFixture({ endsAt: Date.now() - 1000 });
    await expect(invoke(complete, ctx, { sessionToken: "session" })).rejects.toThrow("invalid or unavailable");
    expect(ctx.tables.commerce_orders ?? []).toHaveLength(0);
  });

  test("B04 order reservation prevents another checkout consuming the last coupon use", async () => {
    const ctx = checkoutFixture({ usageLimit: 1 });
    const orderId = await invoke(complete, ctx, { sessionToken: "session" });
    expect(ctx.tables.commerce_discount_usages).toHaveLength(1);
    expect(ctx.tables.commerce_discount_usages[0]).toMatchObject({ orderId, status: "reserved" });
    expect(await invoke(complete, ctx, { sessionToken: "session" })).toBe(orderId);
    const second = checkoutFixture({ usageLimit: 1 });
    ctx.tables.commerce_carts.push({ ...second.tables.commerce_carts[0], _id: "cart2", sessionToken: "session2" });
    ctx.tables.commerce_checkout_sessions.push({ ...second.tables.commerce_checkout_sessions[0], _id: "checkout2", cartId: "cart2", sessionToken: "session2" });
    ctx.tables.commerce_cart_items.push({ ...second.tables.commerce_cart_items[0], _id: "item2", cartId: "cart2" });
    await expect(invoke(complete, ctx, { sessionToken: "session2" })).rejects.toThrow("usage limit");
    await invoke(orders.bulkCancel, ctx, { orderIds: [orderId] });
    expect(ctx.tables.commerce_discount_usages[0].status).toBe("released");
    expect(await invoke(complete, ctx, { sessionToken: "session2" })).toBeString();
  });

  test("B04 trusted order history blocks existing customers and exhausted per-user coupons", async () => {
    for (const restriction of [{ newCustomersOnly: true }, { perUserUsageLimit: 1 }]) {
      const ctx = checkoutFixture(restriction);
      ctx.tables.commerce_orders = [{ _id: "previous", userId: "admin", email: "admin@example.invalid", status: "processing", appliedDiscountCode: "SAVE" }];
      await expect(invoke(cart.applyDiscountCode, ctx, { sessionToken: "session", code: "SAVE" })).rejects.toThrow();
    }
  });

  test("B09 final order and checkout total waive an otherwise paid shipping rate", async () => {
    const ctx = checkoutFixture({ discountType: "free_shipping", amount: 1 });
    ctx.tables.commerce_carts[0].discountAmount = 0;
    ctx.tables.commerce_checkout_sessions[0].discountAmount = 0;
    const orderId = await invoke(complete, ctx, { sessionToken: "session" });
    const order = await ctx.db.get(orderId);
    expect(order).toMatchObject({ freeShippingByCoupon: true, shippingAmount: 0, totalAmount: 1000 });
    expect(ctx.tables.commerce_checkout_sessions[0]).toMatchObject({ shippingAmount: 0, totalAmount: 1000 });
  });

  test("B05 actual invoice generation applies the due lower price and excludes canceled historical items", async () => {
    const ctx = commerceHarness({ commerce_subscriptions: [{ _id: "sub", status: "active", nextBillingAt: Date.now() - 1, currentPeriodEndAt: Date.now() - 1, recurringAmount: 10000, currencyCode: "USD", scheduledOfferChange: { toOfferId: "offer", effectiveAt: Date.now() - 1 } }], commerce_subscription_offers: [{ _id: "offer", title: "Lower", recurringAmount: 5000, currencyCode: "USD" }], commerce_subscription_items: [{ _id: "old", subscriptionId: "sub", sourceOfferId: "oldOffer", status: "active", quantity: 1, unitAmount: 10000, currencyCode: "USD" }] });
    const result = await invoke(createDueInvoices, ctx);
    expect(result.createdCount).toBe(1);
    expect(ctx.tables.commerce_subscription_invoices[0].totalAmount).toBe(5000);
    expect(ctx.tables.commerce_subscription_invoice_items).toHaveLength(1);
    expect(ctx.tables.commerce_subscription_invoice_items[0].lineTotalAmount).toBe(5000);
    expect((await invoke(createDueInvoices, ctx)).createdCount).toBe(0);
  });

  test("B03 bulk paid and fulfilled update associated state, with no duplicate allocation", async () => {
    const ctx = commerceHarness({ commerce_orders: [{ _id: "order", status: "pending", paymentStatus: "pending", fulfillmentStatus: "unfulfilled" }], commerce_order_items: [{ _id: "item", orderId: "order", productId: "product", quantity: 2, productTitle: "Fixture" }], commerce_products: [{ _id: "product", title: "Fixture", trackInventory: true, stockQuantity: 3 }] });
    await invoke(orders.bulkUpdateStatus, ctx, { orderIds: ["order", "order"], status: "paid" });
    expect(ctx.tables.commerce_orders[0]).toMatchObject({ paymentStatus: "paid", status: "paid" });
    expect(ctx.tables.commerce_products[0].stockQuantity).toBe(1);
    await invoke(orders.bulkUpdateStatus, ctx, { orderIds: ["order"], status: "paid" });
    expect(ctx.tables.commerce_products[0].stockQuantity).toBe(1);
    await invoke(orders.bulkUpdateStatus, ctx, { orderIds: ["order"], status: "fulfilled" });
    expect(ctx.tables.commerce_orders[0].fulfillmentStatus).toBe("fulfilled");
  });

  test("B02 late payment-success replay cannot erase a refunded transaction", async () => {
    const ctx = commerceHarness({ commerce_payment_transactions: [{ _id: "txn", provider: "stripe", providerTransactionId: "pi_synthetic", status: "partially_refunded", refundedAmount: 400, amount: { amount: 1000, currencyCode: "USD" } }] });
    await invoke(payments.confirmPaymentSuccess, ctx, { provider: "stripe", providerTransactionId: "pi_synthetic" });
    expect(ctx.tables.commerce_payment_transactions[0].status).toBe("partially_refunded");
    expect(ctx.tables.commerce_payment_captures ?? []).toHaveLength(0);
  });

  test("B02 refund failure and stale pending callbacks do not alter paid balances", async () => {
    const ctx = commerceHarness({ commerce_payment_transactions: [{ _id: "txn", status: "succeeded", amount: { amount: 1000, currencyCode: "USD" } }], commerce_payment_refunds: [{ _id: "refund", transactionId: "txn", status: "pending", amount: { amount: 400, currencyCode: "USD" } }] });
    const args = { refundId: "refund", transactionId: "txn", providerRefundId: "re_synthetic", amount: 400, success: false };
    await invoke(payments.completeRefund, ctx, { ...args, providerStatus: "failed", error: "provider_declined" });
    await invoke(payments.completeRefund, ctx, { ...args, providerStatus: "pending" });
    expect(ctx.tables.commerce_payment_refunds[0]).toMatchObject({ status: "failed", providerRefundId: "re_synthetic" });
    expect(ctx.tables.commerce_payment_transactions[0].refundedAmount).toBeUndefined();
  });

  test("B04 confirmed payment consumes an order coupon reservation once", async () => {
    const ctx = checkoutFixture({ usageLimit: 1 });
    const orderId = await invoke(complete, ctx, { sessionToken: "session" });
    ctx.tables.commerce_payment_transactions = [{ _id: "txn", orderId, provider: "stripe", providerTransactionId: "pi_synthetic", status: "processing", amount: { amount: 1150, currencyCode: "USD" } }];
    await invoke(payments.confirmPaymentSuccess, ctx, { provider: "stripe", providerTransactionId: "pi_synthetic" });
    await invoke(payments.confirmPaymentSuccess, ctx, { provider: "stripe", providerTransactionId: "pi_synthetic" });
    expect(ctx.tables.commerce_discount_codes[0].usageCount).toBe(1);
    expect(ctx.tables.commerce_discount_usages[0].status).toBe("consumed");
  });
});
