import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "../../_generated/api";
import schema from "../../schema";
const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerce/cart.ts": () => import("../cart"),
  "./convex/commerce/checkout.ts": () => import("../checkout"),
  "./convex/commerce/storefront.ts": () => import("../storefront"),
  "./convex/shipping/queries.ts": () => import("../../shipping/queries"),
  "./convex/shipping/internals.ts": () => import("../../shipping/internals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
const c = (api as any).commerce.cart;
const checkout = (api as any).commerce.checkout;
const token = "owned-cart-session";
async function fixture(owned = true) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const a = await ctx.db.insert("users", { authSource: "local", email: "a@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const b = await ctx.db.insert("users", { authSource: "local", email: "b@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: a });
    const product = await ctx.db.insert("commerce_products", { title: "Notebook", slug: "notebook", status: "publish", productType: "simple", authorId: a, categoryIds: [], galleryMediaIds: [], basePrice: { amount: 2400, currencyCode: "USD" }, trackInventory: false, allowBackorders: false, isVirtual: true, isDownloadable: false, createdAt: 1, updatedAt: 1 });
    const amounts = { currencyCode: "USD", subtotalAmount: 2400, discountAmount: 0, shippingAmount: 0, taxAmount: 0, totalAmount: 2400, createdAt: 1, updatedAt: 1 };
    const cart = await ctx.db.insert("commerce_carts", { ...amounts, sessionToken: token, userId: owned ? a : undefined, status: "active", itemCount: 1, lastActiveAt: 1 });
    const line = await ctx.db.insert("commerce_cart_items", { cartId: cart, productId: product, quantity: 1, unitPriceAmount: 2400, lineTotalAmount: 2400, createdAt: 1, updatedAt: 1 });
    const session = await ctx.db.insert("commerce_checkout_sessions", { ...amounts, cartId: cart, userId: owned ? a : undefined, sessionToken: token, status: "draft", email: "private@example.invalid" });
    return { a, b, product, cart, line, session };
  });
  const as = (id: string) => t.withIdentity({ subject: id, tokenIdentifier: `https://convexpress-admin.local|${id}` });
  return { t, ids, a: as(ids.a), b: as(ids.b) };
}
test("cart token cannot bypass account ownership for reads, writes, sharing or merge", async () => {
  const { t, a, b, ids } = await fixture();
  for (const caller of [t, b]) {
    for (const ref of [c.getMine, (api as any).commerce.storefront.cartContext, (api as any).commerce.storefront.relatedForCart])
      await expect(caller.query(ref, { sessionToken: token })).rejects.toThrow("another account");
    for (const [ref, args] of [
      [c.addItem, { productId: ids.product, quantity: 1 }], [c.updateItemQuantity, { cartItemId: ids.line, quantity: 2 }],
      [c.removeItem, { cartItemId: ids.line }], [c.clear, {}], [c.applyDiscountCode, { code: "TEST" }],
      [c.removeDiscountCode, {}], [c.enableSharing, {}], [c.disableSharing, {}],
    ] as const) await expect(caller.mutation(ref, { sessionToken: token, ...args })).rejects.toThrow("another account");
  }
  await expect(b.mutation(c.merge, { sessionToken: token })).rejects.toThrow("another account");
  expect((await a.query(c.getMine, {})).items).toHaveLength(1);
  expect((await t.run(ctx => ctx.db.get(ids.cart)))?.userId).toBe(ids.a);
  await a.mutation(c.updateItemQuantity, { cartItemId: ids.line, quantity: 2 });
  expect((await a.query(c.getMine, { sessionToken: token })).itemCount).toBe(2);
});
test("checkout and shipping check both session ownership and legacy adopted-cart ownership", async () => {
  const { t, a, b, ids } = await fixture();
  for (const legacy of [false, true]) {
    if (legacy) await t.run(ctx => ctx.db.patch(ids.session, { userId: undefined }));
    for (const caller of [t, b]) {
      await expect(caller.query(checkout.getSession, { sessionToken: token })).rejects.toThrow("another account");
      for (const ref of [checkout.createSession, checkout.updateSession, checkout.complete, checkout.abandonSession])
        await expect(caller.mutation(ref, { sessionToken: token })).rejects.toThrow("another account");
      await expect(caller.query((api as any).shipping.queries.listCheckoutQuotes, { sessionToken: token })).rejects.toThrow("another account");
      await expect(caller.query((internal as any).shipping.internals.getRateContextForSession, { sessionToken: token })).rejects.toThrow("another account");
    }
  }
  expect((await a.query(checkout.getSession, { sessionToken: token })).email).toBe("private@example.invalid");
  expect(await a.mutation(checkout.createSession, { sessionToken: token, email: "updated@example.invalid" })).toBe(ids.session);
  expect((await a.query(checkout.getSession, { sessionToken: token })).email).toBe("updated@example.invalid");
});
test("foreign callers cannot retire closed tokens or revive abandoned carts", async () => {
  const { t, a, b, ids } = await fixture();
  for (const status of ["abandoned", "converted", "merged"] as const) {
    await t.run(ctx => ctx.db.patch(ids.cart, { status }));
    for (const caller of [t, b]) await expect(caller.mutation(c.addItem, { sessionToken: token, productId: ids.product, quantity: 1 })).rejects.toThrow("another account");
    expect(await t.run(ctx => ctx.db.get(ids.cart))).toMatchObject({ status, sessionToken: token, userId: ids.a });
  }
  await t.run(ctx => ctx.db.patch(ids.cart, { status: "abandoned" }));
  await a.mutation(c.addItem, { sessionToken: token, productId: ids.product, quantity: 1 });
  expect(await t.run(ctx => ctx.db.get(ids.cart))).toMatchObject({ status: "active", userId: ids.a });
});
test("guest shopping and checkout work until sign-in adopts the cart", async () => {
  const { t, a, ids } = await fixture(false);
  await t.mutation(c.addItem, { sessionToken: token, productId: ids.product, quantity: 1 });
  expect((await t.query(c.getMine, { sessionToken: token })).itemCount).toBe(2);
  expect(await t.mutation(checkout.createSession, { sessionToken: token })).toBe(ids.session);
  await a.mutation(c.merge, { sessionToken: token });
  expect((await a.query(c.getMine, {})).itemCount).toBe(2);
  await expect(t.query(checkout.getSession, { sessionToken: token })).rejects.toThrow("another account");
});
test("abandoned guest recovery binds the signed-in owner", async () => {
  const { t, a, ids } = await fixture(false);
  await t.run(ctx => ctx.db.patch(ids.cart, { status: "abandoned" }));
  await a.mutation(c.addItem, { sessionToken: token, productId: ids.product, quantity: 1 });
  expect(await t.run(ctx => ctx.db.get(ids.cart))).toMatchObject({ userId: ids.a, status: "active" });
  await expect(t.query(c.getMine, { sessionToken: token })).rejects.toThrow("another account");
});
test("explicit sharing allows a separate copy without modifying the owner's cart", async () => {
  const { t, a, b, ids } = await fixture();
  const { shareToken } = await a.mutation(c.enableSharing, { sessionToken: token });
  const shared = await t.query(c.getShared, { shareToken });
  expect(shared.items).toHaveLength(1);
  expect(shared).not.toHaveProperty("sessionToken");
  expect(shared).not.toHaveProperty("userId");
  await expect(b.mutation(c.copyShared, { shareToken, sessionToken: token })).rejects.toThrow("another account");
  expect(await b.mutation(c.copyShared, { shareToken, sessionToken: "recipient-session" })).not.toBe(ids.cart);
  expect((await b.query(c.getMine, { sessionToken: "recipient-session" })).items).toHaveLength(1);
  expect((await a.query(c.getMine, {})).itemCount).toBe(1);
  await a.mutation(c.disableSharing, { sessionToken: token });
  expect(await t.query(c.getShared, { shareToken })).toBeNull();
});
test("inactive owners cannot shop with a valid token", async () => {
  const { t, a, ids } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.a, { status: "inactive" }));
  await expect(a.query(c.getMine, { sessionToken: token })).rejects.toThrow("cannot shop");
  await expect(a.query(checkout.getSession, { sessionToken: token })).rejects.toThrow("cannot shop");
});

test("starting checkout while signed in adopts both an existing guest checkout and its cart", async () => {
  const { t, a, ids } = await fixture(false);
  await a.mutation(checkout.createSession, { sessionToken: token });
  expect(await t.run(ctx => ctx.db.get(ids.cart))).toMatchObject({ userId: ids.a });
  expect(await t.run(ctx => ctx.db.get(ids.session))).toMatchObject({ userId: ids.a });
  await expect(t.query(c.getMine, { sessionToken: token })).rejects.toThrow("another account");
  await expect(t.query(checkout.getSession, { sessionToken: token })).rejects.toThrow("another account");
});

test("checkout-based order access checks the order owner even when legacy checkout and cart are unowned", async () => {
  const { commerceHarness } = await import("./handlerHarness.test-support");
  const { getByCheckoutSession } = await import("../orders");
  for (const userId of [null, "admin"]) {
    const ctx = commerceHarness({
      commerce_orders: [{ _id: "order", userId: "owner", checkoutSessionId: "checkout" }],
      commerce_checkout_sessions: [{ _id: "checkout", cartId: "cart", sessionToken: token }],
      commerce_carts: [{ _id: "cart", sessionToken: token }],
    }, userId);
    await expect((getByCheckoutSession as any)._handler(ctx, { orderId: "order", sessionToken: token })).rejects.toThrow("another account");
  }
});
