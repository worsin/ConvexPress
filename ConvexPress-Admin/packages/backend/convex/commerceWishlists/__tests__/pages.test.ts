import { expect, test } from "bun:test";
import { makeFunctionReference as ref } from "convex/server";
import { fixture } from "./ownership.test";
const items = ref<"query">("commerceWishlists/pages:items");
const lists = ref<"query">("commerceWishlists/pages:listMine");
const binding = { instanceKey: "test-instance", refreshKey: "test", paginationOpts: { cursor: null, numItems: 24 } };

test("all saved items remain reachable across bounded pages, without private fields", async () => {
  const { t, owner, ids } = await fixture();
  await t.run(async ctx => { for (let i = 0; i < 130; i++) await ctx.db.insert("commerce_wishlist_items", {
    wishlistId: ids.wishlist, productId: ids.product, notes: "PRIVATE-NOTE", addedAt: i + 2,
  }); });
  const found = new Set<string>(); let cursor: string | null = null;
  for (let n = 0; n < 8; n++) {
    const result = await owner.query(items, { ...binding, wishlistId: ids.wishlist, paginationOpts: { cursor, numItems: 24 } });
    expect(result.page.length).toBeLessThanOrEqual(24);
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(result.expiresAt).toBeLessThanOrEqual(Date.now() + 15_000);
    expect(JSON.stringify(result)).not.toContain("PRIVATE-NOTE");
    for (const row of result.page) { expect(found.has(row._id)).toBe(false); found.add(row._id); }
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  expect(found.size).toBe(131);
});

test("each wishlist page requires the exact installation and active owner", async () => {
  const { t, owner, other, ids } = await fixture();
  const args = { ...binding, wishlistId: ids.wishlist };
  expect(await t.query(items, args)).toBeNull();
  expect(await other.query(items, args)).toBeNull();
  expect(await owner.query(items, { ...args, instanceKey: "other-site" })).toBeNull();
  expect((await owner.query(lists, binding)).page).toEqual([{ id: ids.wishlist, name: "Private saved list", isDefault: true }]);
  await t.run(ctx => ctx.db.patch(ids.owner, { status: "inactive" }));
  expect(await owner.query(items, args)).toBeNull();
  expect(await owner.query(lists, binding)).toBeNull();
});

test("hidden saved products remain removable without disclosing their names or prices", async () => {
  const { t, owner, ids } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.product, { status: "draft" }));
  const result = await owner.query(items, { ...binding, wishlistId: ids.wishlist });
  expect(result.page[0]).toMatchObject({ _id: ids.item, product: null, image: null, effectivePrice: 0, purchaseMode: "unavailable" });
  expect(JSON.stringify(result)).not.toContain("Saved mug");
});

test("list pagination reaches lists beyond the first page and refuses oversized requests", async () => {
  const { t, owner, ids } = await fixture();
  await t.run(async ctx => { for (let i = 0; i < 26; i++) await ctx.db.insert("commerce_wishlists", {
    userId: ids.owner, name: `List ${i}`, isDefault: false, isPublic: false, shareToken: `SECRET-${i}`, createdAt: i, updatedAt: i,
  }); });
  const first = await owner.query(lists, binding);
  const next = await owner.query(lists, { ...binding, paginationOpts: { numItems: 24, cursor: first.continueCursor } });
  expect(first.page.length + next.page.length).toBe(27);
  expect(JSON.stringify([first, next])).not.toContain("SECRET");
  await expect(owner.query(lists, { ...binding, paginationOpts: { cursor: null, numItems: 25 } })).rejects.toThrow();
});

test("saved variable products require a public option belonging to that product", async () => {
  const { t, owner, ids } = await fixture();
  const variants = await t.run(async ctx => {
    await ctx.db.patch(ids.product, { productType: "variable" });
    const publicOption = await ctx.db.insert("commerce_product_variants", {
      productId: ids.product, title: "Forest", optionSummary: "Forest", price: { amount: 1800, currencyCode: "USD" },
      isDefault: true, status: "publish", createdAt: 1, updatedAt: 1,
    });
    const privateOption = await ctx.db.insert("commerce_product_variants", {
      productId: ids.product, title: "SECRET-OPTION", optionSummary: "Secret", price: { amount: 999, currencyCode: "USD" },
      isDefault: false, status: "private", createdAt: 1, updatedAt: 1,
    });
    return { publicOption, privateOption };
  });
  const args = { ...binding, wishlistId: ids.wishlist };
  expect((await owner.query(items, args)).page[0].purchaseMode).toBe("chooseOptions");
  await t.run(ctx => ctx.db.patch(ids.item, { variantId: variants.publicOption }));
  expect((await owner.query(items, args)).page[0]).toMatchObject({ purchaseMode: "add", effectivePrice: 1800, variant: { name: "Forest" } });
  await t.run(ctx => ctx.db.patch(ids.item, { variantId: variants.privateOption }));
  const hidden = await owner.query(items, args);
  expect(hidden.page[0].product).toBeNull();
  expect(JSON.stringify(hidden)).not.toContain("SECRET-OPTION");
  await expect(owner.mutation(ref<"mutation">("commerceWishlists/mutations:addItem"), {
    wishlistId: ids.wishlist, productId: ids.product, variantId: variants.privateOption,
  })).rejects.toThrow();
});

test("sale boundaries shorten a saved-products page lease and zero prices stay zero", async () => {
  const { t, owner, ids } = await fixture();
  const boundary = Date.now() + 5_000;
  await t.run(ctx => ctx.db.patch(ids.product, { salePrice: { amount: 0, currencyCode: "USD" }, salePriceTo: boundary }));
  const result = await owner.query(items, { ...binding, wishlistId: ids.wishlist });
  expect(result.page[0].effectivePrice).toBe(0);
  // Storefront sale-end timestamps are inclusive; the next millisecond expires the price.
  expect(result.expiresAt).toBe(boundary + 1);
});
