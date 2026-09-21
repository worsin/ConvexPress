import { expect, test } from "bun:test";
import { makeFunctionReference as ref } from "convex/server";
import { fixture } from "./ownership.test";
const shared = ref<"query">("commerceWishlists/pages:shared");
const dashboard = ref<"query">("commerceWishlists/pages:dashboard");
const add = ref<"mutation">("commerceWishlists/shared:addToCart");
const pageArgs = { instanceKey: "test-instance", refreshKey: "test", paginationOpts: { cursor: null, numItems: 12 } };
const shareToken = "private-share-token";

test("shared pages traverse hidden items without exposing them or truncating later products", async () => {
  const { t, ids } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch(ids.wishlist, { isPublic: true });
    await ctx.db.patch(ids.product, { status: "draft" });
    for (let i = 0; i < 12; i++) await ctx.db.insert("commerce_wishlist_items", { wishlistId: ids.wishlist, productId: ids.product, notes: "SECRET-NOTE", addedAt: i });
    const product = await ctx.db.get(ids.product);
    if (!product) throw new Error("Fixture product missing");
    const { _id, _creationTime, ...fields } = product;
    const published = await ctx.db.insert("commerce_products", { ...fields, title: "Public notebook", slug: "public-notebook", status: "publish" });
    await ctx.db.insert("commerce_wishlist_items", { wishlistId: ids.wishlist, productId: published, notes: "SECRET-NOTE", addedAt: 99 });
  });
  const first = await t.query(shared, { ...pageArgs, shareToken });
  expect(first.page).toEqual([]); expect(first.isDone).toBe(false);
  const second = await t.query(shared, { ...pageArgs, shareToken, paginationOpts: { numItems: 12, cursor: first.continueCursor } });
  expect(second.page).toHaveLength(1); expect(second.page[0].product.title).toBe("Public notebook");
  for (const value of [first, second]) for (const forbidden of ["SECRET-NOTE", "rawSourceMeta", "userId", "Saved mug"]) expect(JSON.stringify(value)).not.toContain(forbidden);
});

test("adding a shared saved variant uses the real cart with that variant and its current price", async () => {
  const { t, ids } = await fixture();
  const variantId = await t.run(async ctx => {
    await ctx.db.patch(ids.wishlist, { isPublic: true });
    await ctx.db.patch(ids.product, { productType: "variable" });
    const variant = await ctx.db.insert("commerce_product_variants", {
      productId: ids.product, title: "Forest", optionSummary: "Forest", price: { amount: 1800, currencyCode: "USD" },
      isDefault: true, status: "publish", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.patch(ids.item, { variantId: variant }); return variant;
  });
  const cartId = await t.mutation(add, { instanceKey: "test-instance", shareToken, itemId: ids.item, sessionToken: "shared-variant-test" });
  const cart = await t.run(ctx => ctx.db.get(cartId));
  const lines = await t.run(ctx => ctx.db.query("commerce_cart_items").withIndex("by_cart", q => q.eq("cartId", cartId)).collect());
  expect(cart).toMatchObject({ subtotalAmount: 1800, itemCount: 1 });
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ productId: ids.product, variantId, unitPriceAmount: 1800, quantity: 1 });
  expect(await t.run(ctx => ctx.db.get(ids.item))).not.toBeNull();
});

test("revoked sharing, wrong installation and a foreign saved item cannot mutate the viewer cart", async () => {
  const { t, ids } = await fixture();
  const otherItem = await t.run(async ctx => {
    await ctx.db.patch(ids.wishlist, { isPublic: true });
    const list = await ctx.db.insert("commerce_wishlists", { userId: ids.other, name: "Other private list", isDefault: false, isPublic: false, shareToken: "other-token", createdAt: 1, updatedAt: 1 });
    return ctx.db.insert("commerce_wishlist_items", { wishlistId: list, productId: ids.product, addedAt: 1 });
  });
  const args = { instanceKey: "test-instance", shareToken, itemId: ids.item, sessionToken: "shared-refusal-test" };
  await expect(t.mutation(add, { ...args, instanceKey: "other-instance" })).rejects.toThrow();
  await expect(t.mutation(add, { ...args, itemId: otherItem })).rejects.toThrow();
  await t.run(ctx => ctx.db.patch(ids.wishlist, { isPublic: false }));
  expect(await t.query(shared, { ...pageArgs, shareToken })).toBeNull();
  await expect(t.mutation(add, args)).rejects.toThrow();
  expect(await t.run(ctx => ctx.db.query("commerce_carts").collect())).toEqual([]);
});

test("variable products without a saved choice cannot silently add their default option", async () => {
  const { t, ids } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch(ids.wishlist, { isPublic: true });
    await ctx.db.patch(ids.product, { productType: "variable" });
    await ctx.db.insert("commerce_product_variants", { productId: ids.product, title: "Default", optionSummary: "Default",
      price: { amount: 1800, currencyCode: "USD" }, isDefault: true, status: "publish", createdAt: 1, updatedAt: 1 });
  });
  expect((await t.query(shared, { ...pageArgs, shareToken })).page[0].purchaseMode).toBe("chooseOptions");
  await expect(t.mutation(add, { instanceKey: "test-instance", shareToken, itemId: ids.item, sessionToken: "no-default-test" })).rejects.toThrow();
  expect(await t.run(ctx => ctx.db.query("commerce_carts").collect())).toEqual([]);
});

test("dashboard metadata and share tokens remain owner-only and stop when the owner is inactive", async () => {
  const { t, owner, other, ids } = await fixture();
  expect(await t.query(dashboard, pageArgs)).toBeNull();
  expect((await other.query(dashboard, pageArgs)).page).toEqual([]);
  expect((await owner.query(dashboard, pageArgs)).page[0].shareToken).toBe(shareToken);
  await t.run(async ctx => { await ctx.db.patch(ids.wishlist, { isPublic: true }); await ctx.db.patch(ids.owner, { status: "inactive" }); });
  expect(await owner.query(dashboard, pageArgs)).toBeNull();
  expect(await t.query(shared, { ...pageArgs, shareToken })).toBeNull();
  await expect(t.mutation(add, { instanceKey: "test-instance", shareToken, itemId: ids.item, sessionToken: "inactive-owner-test" })).rejects.toThrow();
});

test("saving a product and saving its chosen variant have distinct idempotent identities", async () => {
  const { t, owner, ids } = await fixture();
  const variantId = await t.run(async ctx => {
    await ctx.db.patch(ids.product, { productType: "variable" });
    return ctx.db.insert("commerce_product_variants", { productId: ids.product, title: "Forest", optionSummary: "Forest",
      price: { amount: 1800, currencyCode: "USD" }, isDefault: true, status: "publish", createdAt: 1, updatedAt: 1 });
  });
  const save = ref<"mutation">("commerceWishlists/mutations:addItem");
  const chosen = await owner.mutation(save, { wishlistId: ids.wishlist, productId: ids.product, variantId });
  expect(chosen).not.toBe(ids.item);
  expect(await owner.mutation(save, { wishlistId: ids.wishlist, productId: ids.product, variantId })).toBe(chosen);
  expect(await owner.mutation(save, { wishlistId: ids.wishlist, productId: ids.product })).toBe(ids.item);
  expect(await t.run(ctx => ctx.db.query("commerce_wishlist_items").withIndex("by_wishlist", q => q.eq("wishlistId", ids.wishlist)).collect())).toHaveLength(2);
});

test("owner move rechecks future publication before it can touch the cart", async () => {
  const { t, owner, ids } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.product, { publishedAt: Date.now() + 60_000 }));
  await expect(owner.mutation(ref<"mutation">("commerceWishlists/mutations:moveToCart"), { itemId: ids.item, sessionToken: "future-product-test" })).rejects.toThrow();
  expect(await t.run(ctx => ctx.db.get(ids.item))).not.toBeNull();
  expect(await t.run(ctx => ctx.db.query("commerce_carts").collect())).toEqual([]);
});
