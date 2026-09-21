import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerceBundles/queries.ts": () => import("../queries"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
const query = (name: string) => makeFunctionReference<"query">(`commerceBundles/queries:${name}`);
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "bundle-public@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true, commerceBundlesEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: user });
    const common = { status: "publish" as const, productType: "simple" as const, authorId: user, categoryIds: [], galleryMediaIds: [], trackInventory: false, allowBackorders: false, isVirtual: true, isDownloadable: false, createdAt: 1, updatedAt: 1 };
    const owner = await ctx.db.insert("commerce_products", { ...common, title: "Bundle", slug: "bundle-owner", basePrice: { amount: 0, currencyCode: "USD" } });
    const product = await ctx.db.insert("commerce_products", { ...common, title: "Notebook", slug: "notebook", productType: "variable", basePrice: { amount: 1000, currencyCode: "USD" }, rawSourceMeta: "PRIVATE_IMPORT" });
    const variant = await ctx.db.insert("commerce_product_variants", { productId: product, title: "Ink", optionSummary: "Ink", price: { amount: 2500, currencyCode: "USD" }, status: "publish", isDefault: true, createdAt: 1, updatedAt: 1 });
    const privateVariant = await ctx.db.insert("commerce_product_variants", { productId: product, title: "PRIVATE_PROTOTYPE", optionSummary: "Secret", price: { amount: 1, currencyCode: "USD" }, status: "private", isDefault: false, createdAt: 1, updatedAt: 1 });
    const bundle = await ctx.db.insert("commerce_bundles", { productId: owner, name: "Study kit", slug: "study-kit", images: [], bundleType: "fixed", pricingType: "percent_off", discountPercent: 10, status: "active", purchaseCount: 123, createdAt: 1, updatedAt: 1 });
    const component = await ctx.db.insert("commerce_bundle_components", { bundleId: bundle, productId: product, variantId: variant, quantity: 2, isRequired: true, allowVariantChange: true, sortOrder: 0, createdAt: 1, updatedAt: 1 });
    return { user, owner, product, variant, privateVariant, bundle, component };
  });
  return { t, ids };
}
test("public bundle details expose a closed projection and only public variant choices", async () => {
  const { t, ids } = await fixture();
  const bundle = await t.query(query("getBySlug"), { slug: "study-kit" });
  const encoded = JSON.stringify(bundle);
  expect(encoded).not.toContain("PRIVATE_IMPORT");
  expect(encoded).not.toContain("PRIVATE_PROTOTYPE");
  expect(encoded).not.toContain("authorId");
  expect(encoded).not.toContain("purchaseCount");
  expect(bundle.components[0].variants.map((v: { _id: string }) => v._id)).toEqual([ids.variant]);
  expect(bundle.bundlePrice).toBe(4500);
  expect(bundle.currencyCode).toBe("USD");
});
test("draft, future, private-component and missing-owner bundles have no public detail or pricing", async () => {
  const { t, ids } = await fixture();
  const assertHidden = async () => {
    expect(await t.query(query("getBySlug"), { slug: "study-kit" })).toBeNull();
    expect(await t.query(query("calculatePrice"), { bundleId: ids.bundle })).toBeNull();
    expect(await t.query(query("listActive"), {})).toEqual([]);
  };
  await t.run(ctx => ctx.db.patch(ids.bundle, { status: "draft" })); await assertHidden();
  await t.run(ctx => ctx.db.patch(ids.bundle, { status: "active", publishedAt: Date.now() + 60000 })); await assertHidden();
  await t.run(async ctx => { await ctx.db.patch(ids.bundle, { publishedAt: undefined }); await ctx.db.patch(ids.product, { status: "private" }); }); await assertHidden();
  await t.run(async ctx => { await ctx.db.patch(ids.product, { status: "publish" }); await ctx.db.patch(ids.bundle, { productId: undefined }); }); await assertHidden();
});
test("private variant overrides cannot be priced or bought through public availability", async () => {
  const { t, ids } = await fixture();
  const args = { bundleId: ids.bundle, selections: [{ componentId: ids.component, quantity: 2, variantId: ids.privateVariant }] };
  expect(await t.query(query("calculatePrice"), args)).toBeNull();
  expect(await t.query(query("checkAvailability"), args)).toMatchObject({ available: false });
});
test("product authoring relationships require permission", async () => {
  const { t, ids } = await fixture();
  await expect(t.query(query("getBundlesForProduct"), { productId: ids.product })).rejects.toThrow();
});

test("product and bundle route membership protect detail, catalog and quote", async () => {
  const { t, ids } = await fixture();
  await t.run(async ctx => {
    const settings = await ctx.db.query("settings").unique();
    await ctx.db.patch(settings!._id, { values: { commerceEnabled: true, commerceBundlesEnabled: true, membershipEnabled: true } });
  });
  for (const resource of [
    { resourceType: "product" as const, resourceIdOrKey: ids.product },
    { resourceType: "route" as const, resourceIdOrKey: "/products/notebook" },
    { resourceType: "route" as const, resourceIdOrKey: "/bundles/study-kit" },
  ]) {
    const rule = await t.run(ctx => ctx.db.insert("membership_restriction_rules", { ...resource, ruleMode: "allow_only", planIds: [], teaserMode: "hide", loginRequired: true, createdAt: 1, updatedAt: 1 }));
    expect(await t.query(query("getBySlug"), { slug: "study-kit" })).toBeNull();
    expect(await t.query(query("calculatePrice"), { bundleId: ids.bundle })).toBeNull();
    expect(await t.query(query("listActive"), {})).toEqual([]);
    await t.run(ctx => ctx.db.delete(rule));
  }
});

test("component and variant overflow refuse the whole projection", async () => {
  const { t, ids } = await fixture();
  await t.run(async ctx => {
    for (let i = 0; i < 128; i++) await ctx.db.insert("commerce_product_variants", { productId: ids.product, title: `Variant ${i}`, optionSummary: `${i}`, price: { amount: 100, currencyCode: "USD" }, status: "publish", isDefault: false, createdAt: 1, updatedAt: 1 });
  });
  await expect(t.query(query("getBySlug"), { slug: "study-kit" })).rejects.toThrow("No partial bundle");
  await t.run(async ctx => {
    await ctx.db.patch(ids.component, { allowVariantChange: false });
    for (let i = 0; i < 128; i++) await ctx.db.insert("commerce_bundle_components", { bundleId: ids.bundle, productId: ids.product, variantId: ids.variant, quantity: 1, isRequired: true, sortOrder: i + 1, createdAt: 1, updatedAt: 1 });
  });
  await expect(t.query(query("getBySlug"), { slug: "study-kit" })).rejects.toThrow("No partial bundle");
});

test("public availability aggregates repeated components and prices remain visible when sold out", async () => {
  const { t, ids } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch(ids.product, { trackInventory: true, stockQuantity: 3 });
    await ctx.db.patch(ids.variant, { manageStock: "parent" });
    await ctx.db.insert("commerce_bundle_components", { bundleId: ids.bundle, productId: ids.product, variantId: ids.variant, quantity: 2, isRequired: true, sortOrder: 1, createdAt: 1, updatedAt: 1 });
  });
  const price = await t.query(query("calculatePrice"), { bundleId: ids.bundle });
  expect(price).toMatchObject({ bundlePrice: 9000, available: false });
  expect(await t.query(query("checkAvailability"), { bundleId: ids.bundle })).toMatchObject({ available: false });
});

test("cart selection lookup requires its guest token and respects later account ownership", async () => {
  const { t, ids } = await fixture();
  const cartIds = await t.run(async ctx => {
    const cart = await ctx.db.insert("commerce_carts", { sessionToken: "private-bundle-cart", status: "active", currencyCode: "USD", subtotalAmount: 4500, discountAmount: 0, shippingAmount: 0, taxAmount: 0, totalAmount: 4500, itemCount: 1, lastActiveAt: 1, createdAt: 1, updatedAt: 1 });
    const item = await ctx.db.insert("commerce_cart_items", { cartId: cart, productId: ids.owner, quantity: 1, unitPriceAmount: 4500, lineTotalAmount: 4500, createdAt: 1, updatedAt: 1 });
    const selection = await ctx.db.insert("commerce_bundle_selections", { bundleId: ids.bundle, cartItemId: item, selections: [{ componentId: ids.component, productId: ids.product, variantId: ids.variant, quantity: 2 }], totalPrice: 4500, createdAt: 1, updatedAt: 1 });
    return { cart, item, selection };
  });
  await expect(t.query(query("getSelectionByCartItem"), { cartItemId: cartIds.item })).rejects.toThrow();
  expect((await t.query(query("getSelectionByCartItem"), { cartItemId: cartIds.item, sessionToken: "private-bundle-cart" }))._id).toBe(cartIds.selection);
  await t.run(ctx => ctx.db.patch(cartIds.cart, { userId: ids.user }));
  await expect(t.query(query("getSelectionByCartItem"), { cartItemId: cartIds.item, sessionToken: "private-bundle-cart" })).rejects.toThrow("another account");
});

test("route identities are refused instead of silently truncated into broken links", async () => {
  const { t, ids } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.bundle, { slug: "x".repeat(257) }));
  expect(await t.query(query("listActive"), {})).toEqual([]);
  await t.run(async ctx => { await ctx.db.patch(ids.bundle, { slug: "study-kit" }); await ctx.db.patch(ids.product, { slug: "x".repeat(257) }); });
  expect(await t.query(query("getBySlug"), { slug: "study-kit" })).toBeNull();
});
