import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerce/assistant/queries.ts": () => import("../assistant/queries"),
  "./convex/commerce/assistant/mutations.ts": () => import("../assistant/mutations"),
  "./convex/commerce/cart.ts": () => import("../cart"),
  "./convex/commerce/cartRecovery.ts": () => import("../cartRecovery"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};

test("duplicate guest lines accumulate instead of overwriting merged quantities", async () => {
  const { t, ids, a } = await fixture();
  await t.run(ctx => ctx.db.insert("commerce_cart_items", { cartId: ids.guest, productId: ids.product, quantity: 3, unitPriceAmount: 2400, lineTotalAmount: 7200, createdAt: 2, updatedAt: 2 }));
  await a.mutation(settle, { sessionToken: guestToken });
  const lines = await t.run(ctx => ctx.db.query("commerce_cart_items").withIndex("by_cart", q => q.eq("cartId", ids.owned)).collect());
  expect(lines).toHaveLength(1);
  expect(lines[0].quantity).toBe(5);
});

test("merging guest contents revives an abandoned destination", async () => {
  const { t, ids, a } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.owned, { status: "abandoned" }));
  await a.mutation(settle, { sessionToken: guestToken });
  expect(await t.run(ctx => ctx.db.get(ids.owned))).toMatchObject({ status: "active", itemCount: 2 });
});

test("legacy owned tokens survive recovery without changing pending payment identity", async () => {
  const { t, ids, a, b } = await fixture();
  const legacy = "legacy-customer-basket";
  await t.run(ctx => ctx.db.patch(ids.owned, { sessionToken: legacy, status: "pending_payment" }));
  const before = await t.run(ctx => ctx.db.get(ids.owned));
  expect(await a.mutation(settle, { sessionToken: freshToken })).toBe(legacy);
  expect(await a.mutation(settle, { sessionToken: legacy })).toBe(legacy);
  expect(await b.mutation(settle, { sessionToken: legacy })).not.toBe(legacy);
  expect(await t.mutation(settle, { sessionToken: legacy })).not.toBe(legacy);
  expect(await t.run(ctx => ctx.db.get(ids.owned))).toEqual(before);
});

test("stock conflict rolls back partial transfers and keeps the current basket usable", async () => {
  const { t, ids, a } = await fixture();
  await t.run(async ctx => {
    const product = await ctx.db.get(ids.product);
    const { _id, _creationTime, ...fields } = product!;
    const second = await ctx.db.insert("commerce_products", { ...fields, slug: "other-notebook", trackInventory: true, stockQuantity: 1 });
    // The first product merges before this second product fails its stock check.
    for (const cartId of [ids.owned, ids.guest]) await ctx.db.insert("commerce_cart_items", { cartId, productId: second, quantity: 1, unitPriceAmount: 2400, lineTotalAmount: 2400, createdAt: 2, updatedAt: 2 });
  });
  const before = await t.run(async ctx => ({ owned: await ctx.db.get(ids.owned), lines: await ctx.db.query("commerce_cart_items").collect() }));
  expect(await a.mutation(settle, { sessionToken: guestToken })).toBe(guestToken);
  expect(await t.run(ctx => ctx.db.get(ids.owned))).toEqual(before.owned);
  expect(await t.run(ctx => ctx.db.query("commerce_cart_items").collect())).toEqual(before.lines);
  expect(await t.run(ctx => ctx.db.get(ids.guest))).toMatchObject({ status: "active", userId: ids.a });
});

test("different currency baskets remain separate and usable on sign-in", async () => {
  const { t, ids, a } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.owned, { currencyCode: "EUR" }));
  const before = await t.run(ctx => ctx.db.get(ids.owned));
  expect(await a.mutation(settle, { sessionToken: guestToken })).toBe(guestToken);
  expect(await t.run(ctx => ctx.db.get(ids.owned))).toEqual(before);
  expect(await t.run(ctx => ctx.db.get(ids.guest))).toMatchObject({ userId: ids.a, currencyCode: "USD" });
});
const settle = makeFunctionReference<"mutation">("commerce/assistant/mutations:resolveSession");
const listSaved = makeFunctionReference<"query">("commerce/cartRecovery:listSaved");
const selectSaved = makeFunctionReference<"mutation">("commerce/cartRecovery:selectSaved");
const combineSaved = makeFunctionReference<"mutation">("commerce/cartRecovery:combineSaved");
const existingToken = "11111111-1111-4111-8111-111111111111";
const guestToken = "22222222-2222-4222-8222-222222222222";
const freshToken = "33333333-3333-4333-8333-333333333333";

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const a = await ctx.db.insert("users", { authSource: "local", email: "recovery-a@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const b = await ctx.db.insert("users", { authSource: "local", email: "recovery-b@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: a });
    const product = await ctx.db.insert("commerce_products", { title: "Notebook", slug: "recovery-notebook", status: "publish", productType: "simple", authorId: a, categoryIds: [], galleryMediaIds: [], basePrice: { amount: 2400, currencyCode: "USD" }, trackInventory: false, allowBackorders: false, isVirtual: true, isDownloadable: false, createdAt: 1, updatedAt: 1 });
    const amounts = { currencyCode: "USD", subtotalAmount: 2400, discountAmount: 0, shippingAmount: 0, taxAmount: 0, totalAmount: 2400, itemCount: 1, lastActiveAt: 1, createdAt: 1, updatedAt: 1 };
    const owned = await ctx.db.insert("commerce_carts", { ...amounts, userId: a, sessionToken: existingToken, status: "active" });
    const guest = await ctx.db.insert("commerce_carts", { ...amounts, sessionToken: guestToken, status: "active" });
    for (const cartId of [owned, guest]) await ctx.db.insert("commerce_cart_items", { cartId, productId: product, quantity: 1, unitPriceAmount: 2400, lineTotalAmount: 2400, createdAt: 1, updatedAt: 1 });
    return { a, b, product, owned, guest };
  });
  const as = (id: string) => t.withIdentity({ subject: id, tokenIdentifier: `https://convexpress-admin.local|${id}` });
  return { t, ids, a: as(ids.a), b: as(ids.b) };
}

test("fresh login returns the existing customer's cart token without rebinding its checkout", async () => {
  const { t, ids, a } = await fixture();
  const before = await t.run(ctx => ctx.db.get(ids.owned));
  expect(await a.mutation(settle, { sessionToken: freshToken })).toBe(existingToken);
  expect(await t.run(ctx => ctx.db.get(ids.owned))).toEqual(before);
});

test("guest sign-in merges matching lines once and returns the owned cart's usable token", async () => {
  const { t, ids, a } = await fixture();
  expect(await a.mutation(settle, { sessionToken: guestToken })).toBe(existingToken);
  expect(await a.mutation(settle, { sessionToken: guestToken })).toBe(existingToken);
  expect(await a.mutation(settle, { sessionToken: existingToken })).toBe(existingToken);
  const result = await t.run(async ctx => ({ owned: await ctx.db.get(ids.owned), guest: await ctx.db.get(ids.guest), lines: await ctx.db.query("commerce_cart_items").withIndex("by_cart", q => q.eq("cartId", ids.owned)).collect() }));
  expect(result.owned).toMatchObject({ itemCount: 2, subtotalAmount: 4800, sessionToken: existingToken });
  expect(result.guest).toMatchObject({ status: "merged", userId: ids.a, mergedIntoCartId: ids.owned, itemCount: 0 });
  expect(result.lines).toHaveLength(1); expect(result.lines[0].quantity).toBe(2);
});

test("first sign-in claims a guest cart even before another purchase action", async () => {
  const { t, ids, a } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.owned, { status: "converted" }));
  expect(await a.mutation(settle, { sessionToken: guestToken })).toBe(guestToken);
  expect(await t.run(ctx => ctx.db.get(ids.guest))).toMatchObject({ userId: ids.a, status: "active", itemCount: 1 });
});

test("pending payment is recovered without repricing or merging another guest basket into it", async () => {
  const { t, ids, a } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.owned, { status: "pending_payment" }));
  const before = await t.run(ctx => ctx.db.get(ids.owned));
  expect(await a.mutation(settle, { sessionToken: guestToken })).toBe(guestToken);
  expect(await t.run(ctx => ctx.db.get(ids.owned))).toEqual(before);
  expect(await t.run(ctx => ctx.db.get(ids.guest))).toMatchObject({ userId: ids.a, status: "active", itemCount: 1 });
});

test("anonymous and another customer cannot recover a foreign owned cart", async () => {
  const { t, ids, b } = await fixture();
  const before = await t.run(ctx => ctx.db.get(ids.owned));
  expect(await t.mutation(settle, { sessionToken: existingToken })).not.toBe(existingToken);
  expect(await b.mutation(settle, { sessionToken: existingToken })).not.toBe(existingToken);
  expect(await b.mutation(settle, { sessionToken: freshToken })).toBe(freshToken);
  expect(await t.run(ctx => ctx.db.get(ids.owned))).toEqual(before);
});

test("recovering an abandoned cart does not revive closed order history", async () => {
  const { t, ids, a } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.owned, { status: "abandoned" }));
  expect(await a.mutation(settle, { sessionToken: freshToken })).toBe(existingToken);
  expect(await t.run(ctx => ctx.db.get(ids.owned))).toMatchObject({ status: "active", userId: ids.a });
  await t.run(ctx => ctx.db.patch(ids.owned, { status: "converted" }));
  const closed = await t.run(ctx => ctx.db.get(ids.owned));
  expect(await a.mutation(settle, { sessionToken: freshToken })).toBe(freshToken);
  expect(await t.run(ctx => ctx.db.get(ids.owned))).toEqual(closed);
});

test("saved basket pagination excludes the current basket, closed history, foreign owners and bearer tokens", async () => {
  const { t, ids, a } = await fixture();
  await t.run(async ctx => {
    const cart = await ctx.db.get(ids.owned);
    const { _id, _creationTime, ...fields } = cart!;
    for (let i = 0; i < 5; i++) await ctx.db.insert("commerce_carts", { ...fields, sessionToken: `owned-${i}` });
    await ctx.db.insert("commerce_carts", { ...fields, userId: ids.b, sessionToken: "foreign" });
    await ctx.db.insert("commerce_carts", { ...fields, status: "converted", sessionToken: "closed" });
  });
  let cursor: string | null = null;
  const rows: any[] = [];
  for (let page = 0; page < 4; page++) {
    const result = await a.query(listSaved, { sessionToken: existingToken, status: "active", paginationOpts: { numItems: 2, cursor } });
    expect(result.page.length).toBeLessThanOrEqual(2);
    rows.push(...result.page);
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  expect(rows).toHaveLength(5);
  expect(new Set(rows.map(row => row.id)).size).toBe(5);
  for (const row of rows) expect(Object.keys(row).sort()).toEqual(["currencyCode", "id", "itemCount", "status", "updatedAt"]);
  await expect(t.query(listSaved, { sessionToken: freshToken, status: "active", paginationOpts: { numItems: 2, cursor: null } })).rejects.toThrow("Sign in");
});

test("only the owner can select a saved basket and pending payment records remain untouched", async () => {
  const { t, ids, a, b } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.owned, { status: "pending_payment" }));
  const before = await t.run(ctx => ctx.db.get(ids.owned));
  expect(await a.mutation(selectSaved, { sessionToken: freshToken, cartId: ids.owned })).toBe(existingToken);
  for (const caller of [t, b]) await expect(caller.mutation(selectSaved, { sessionToken: freshToken, cartId: ids.owned })).rejects.toThrow("no longer available");
  expect(await t.run(ctx => ctx.db.get(ids.owned))).toEqual(before);
});

test("the owner can retry a stock-conflicted merge exactly once after fixing stock", async () => {
  const { t, ids, a } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.product, { trackInventory: true, stockQuantity: 1 }));
  expect(await a.mutation(settle, { sessionToken: guestToken })).toBe(guestToken);
  await expect(a.mutation(combineSaved, { sessionToken: guestToken, cartId: ids.owned })).rejects.toThrow("stock");
  expect(await t.run(ctx => ctx.db.get(ids.guest))).toMatchObject({ status: "active", itemCount: 1 });
  await t.run(ctx => ctx.db.patch(ids.product, { stockQuantity: 10 }));
  expect(await a.mutation(combineSaved, { sessionToken: guestToken, cartId: ids.owned })).toBe(existingToken);
  expect(await a.mutation(combineSaved, { sessionToken: guestToken, cartId: ids.owned })).toBe(existingToken);
  expect(await t.run(ctx => ctx.db.get(ids.owned))).toMatchObject({ itemCount: 2, totalAmount: 4800 });
});

test("explicit combining refuses foreign baskets and payment-locked baskets atomically", async () => {
  const { t, ids, a, b } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.guest, { userId: ids.b }));
  const before = await t.run(ctx => ctx.db.query("commerce_cart_items").collect());
  await expect(b.mutation(combineSaved, { sessionToken: guestToken, cartId: ids.owned })).rejects.toThrow("no longer available");
  await t.run(ctx => ctx.db.patch(ids.guest, { userId: ids.a, status: "pending_payment" }));
  await expect(a.mutation(combineSaved, { sessionToken: guestToken, cartId: ids.owned })).rejects.toThrow("pending payment");
  expect(await t.run(ctx => ctx.db.query("commerce_cart_items").collect())).toEqual(before);
});

test("two guest-only lines for the same product become one line with their full quantity", async () => {
  const { t, ids, a } = await fixture();
  await t.run(async ctx => {
    const line = await ctx.db.query("commerce_cart_items").withIndex("by_cart", q => q.eq("cartId", ids.owned)).first();
    await ctx.db.delete(line!._id);
    await ctx.db.insert("commerce_cart_items", { cartId: ids.guest, productId: ids.product, quantity: 3, unitPriceAmount: 2400, lineTotalAmount: 7200, createdAt: 2, updatedAt: 2 });
  });
  await a.mutation(settle, { sessionToken: guestToken });
  const lines = await t.run(ctx => ctx.db.query("commerce_cart_items").withIndex("by_cart", q => q.eq("cartId", ids.owned)).collect());
  expect(lines).toHaveLength(1);
  expect(lines[0].quantity).toBe(4);
});

test("explicit basket combination adopts its conversation just like sign-in recovery", async () => {
  const { t, ids, a } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.guest, { userId: ids.a }));
  const append = makeFunctionReference<"mutation">("commerce/assistant/mutations:appendMessage");
  const query = makeFunctionReference<"query">("commerce/assistant/queries:getThread");
  await a.mutation(append, { sessionToken: guestToken, role: "user", text: "Keep my current question", blocks: [] });
  await a.mutation(append, { sessionToken: existingToken, role: "assistant", text: "Keep my saved answer", blocks: [] });
  expect(await a.mutation(combineSaved, { sessionToken: guestToken, cartId: ids.owned })).toBe(existingToken);
  const result = await a.query(query, { sessionToken: existingToken });
  expect(result.messages.map((x: any) => x.text).sort()).toEqual(["Keep my current question", "Keep my saved answer"]);
  await a.mutation(combineSaved, { sessionToken: guestToken, cartId: ids.owned });
  expect((await a.query(query, { sessionToken: existingToken })).messages).toHaveLength(2);
});
