import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerce/cart.ts": () => import("../cart"),
  "./convex/commerce/checkout.ts": () => import("../checkout"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/purchases/internals.ts": () => import("../../purchases/internals"),
};
const add = makeFunctionReference<"mutation">("commerce/cart:addItem");
const update = makeFunctionReference<"mutation">("commerce/cart:updateItemQuantity");
const complete = makeFunctionReference<"mutation">("commerce/checkout:complete");
const token = "bundle-cart-regression";

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "bundle-cart@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const plugins = await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true, commerceBundlesEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: user });
    const common = { status: "publish" as const, productType: "simple" as const, authorId: user, categoryIds: [], galleryMediaIds: [], trackInventory: false, allowBackorders: false, isVirtual: true, isDownloadable: false, createdAt: 1, updatedAt: 1 };
    const owner = await ctx.db.insert("commerce_products", { ...common, title: "Study kit", slug: "study-kit", basePrice: { amount: 0, currencyCode: "USD" } });
    const product = await ctx.db.insert("commerce_products", { ...common, title: "Notebook", slug: "notebook", productType: "variable", basePrice: { amount: 2000, currencyCode: "USD" } });
    const variant = await ctx.db.insert("commerce_product_variants", { productId: product, title: "Ink", optionSummary: "Ink", price: { amount: 2500, currencyCode: "USD" }, status: "publish", isDefault: true, createdAt: 1, updatedAt: 1 });
    const bundle = await ctx.db.insert("commerce_bundles", { productId: owner, name: "Study kit", slug: "study-kit", images: [], bundleType: "fixed", pricingType: "percent_off", discountPercent: 10, status: "active", purchaseCount: 0, createdAt: 1, updatedAt: 1 });
    const component = await ctx.db.insert("commerce_bundle_components", { bundleId: bundle, productId: product, variantId: variant, quantity: 2, isRequired: true, sortOrder: 0, createdAt: 1, updatedAt: 1 });
    return { user, plugins, owner, product, variant, bundle, component };
  });
  const metadata = { lineType: "bundle", bundleId: ids.bundle, selections: [{ componentId: ids.component, variantId: ids.variant, quantity: 2 }] };
  const read = () => t.run(async ctx => ({ cart: await ctx.db.query("commerce_carts").unique(), lines: await ctx.db.query("commerce_cart_items").collect() }));
  return { t, ids, metadata, read };
}

test("registered cart add derives bundle price and metadata, then merges explicit and default selections", async () => {
  const { t, ids, metadata, read } = await fixture();
  await t.mutation(add, { sessionToken: token, productId: ids.owner, quantity: 1, metadata });
  let state = await read();
  expect(state.cart?.subtotalAmount).toBe(4500);
  expect(state.lines[0]?.metadata).toMatchObject({ resolvedBundlePriceAmount: 4500, regularPriceAmount: 5000, selections: [{ productId: ids.product, variantId: ids.variant, quantity: 2, unitPriceAmount: 2500 }] });
  await t.mutation(add, { sessionToken: token, productId: ids.owner, quantity: 1 });
  state = await read();
  expect(state.lines).toHaveLength(1);
  expect(state.cart?.subtotalAmount).toBe(9000);
  await t.run(ctx => ctx.db.patch(ids.variant, { price: { amount: 3000, currencyCode: "USD" } }));
  await t.mutation(update, { sessionToken: token, cartItemId: state.lines[0]!._id, quantity: 3 });
  state = await read();
  expect(state.cart?.subtotalAmount).toBe(16200);
  expect(state.lines[0]?.baseUnitPriceAmount).toBe(5400);
  expect(state.lines[0]?.metadata.selections[0].variantId).toBe(ids.variant);
});

test("bundle identity, plugin state, private variants and currency cannot bypass cart validation", async () => {
  const { t, ids, metadata, read } = await fixture();
  await expect(t.mutation(add, { sessionToken: token, productId: ids.product, variantId: ids.variant, quantity: 1, metadata })).rejects.toThrow();
  await t.run(ctx => ctx.db.patch(ids.variant, { status: "draft" }));
  await expect(t.mutation(add, { sessionToken: token, productId: ids.owner, quantity: 1, metadata })).rejects.toThrow();
  await t.run(async ctx => {
    await ctx.db.patch(ids.variant, { status: "publish" });
    await ctx.db.patch(ids.owner, { basePrice: { amount: 0, currencyCode: "EUR" } });
  });
  await expect(t.mutation(add, { sessionToken: token, productId: ids.owner, quantity: 1, metadata })).rejects.toThrow();
  await t.run(async ctx => {
    await ctx.db.patch(ids.owner, { basePrice: { amount: 0, currencyCode: "USD" } });
    await ctx.db.patch(ids.plugins, { values: { commerceEnabled: true, commerceBundlesEnabled: false } });
  });
  await expect(t.mutation(add, { sessionToken: token, productId: ids.owner, quantity: 1 })).rejects.toThrow();
  expect((await read()).lines).toHaveLength(0);
});

test("checkout rejects a changed bundle price before creating an order", async () => {
  const { t, ids, metadata, read } = await fixture();
  await t.mutation(add, { sessionToken: token, productId: ids.owner, quantity: 1, metadata });
  const { cart } = await read();
  if (!cart) throw Error("Missing fixture cart");
  await t.run(async ctx => {
    await ctx.db.insert("commerce_checkout_sessions", { cartId: cart._id, sessionToken: token, status: "draft", email: "guest@example.invalid", billingAddress: { firstName: "Test", lastName: "Shopper", line1: "1 Test Road", city: "Denver", countryCode: "US", postalCode: "80202" }, currencyCode: "USD", subtotalAmount: cart.subtotalAmount, discountAmount: 0, shippingAmount: 0, taxAmount: 0, totalAmount: cart.totalAmount, createdAt: 1, updatedAt: 1 });
    await ctx.db.patch(ids.variant, { price: { amount: 3000, currencyCode: "USD" } });
  });
  await expect(t.mutation(complete, { sessionToken: token })).rejects.toThrow("Bundle pricing or configuration changed");
  expect(await t.run(ctx => ctx.db.query("commerce_orders").collect())).toHaveLength(0);
});

test("bundle cart refuses inactive, incomplete and unknown option selections before inserting a line", async () => {
  const { t, ids, metadata, read } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.product, { optionTypes: [{ id: "color", name: "Color", values: [{ id: "ink", label: "Ink", active: false }] }] }));
  for (const selections of [
    [{ optionTypeId: "color", optionTypeName: "Color", sortOrder: 0, optionValueLabel: "Ink", optionValueId: "ink" }],
    [],
    [{ optionTypeId: "color", optionTypeName: "Color", sortOrder: 0, optionValueLabel: "Ink", optionValueId: "missing" }],
    [{ optionTypeId: "color", optionTypeName: "Color", sortOrder: 0, optionValueLabel: "Ink", optionValueId: "ink" }, { optionTypeId: "color", optionTypeName: "Color", sortOrder: 0, optionValueLabel: "Ink", optionValueId: "ink" }],
  ]) {
    await t.run(ctx => ctx.db.patch(ids.variant, { selections }));
    await expect(t.mutation(add, { sessionToken: token, productId: ids.owner, quantity: 1, metadata })).rejects.toThrow("unavailable");
    expect((await read()).lines).toHaveLength(0);
  }
  await t.run(async ctx => {
    await ctx.db.patch(ids.product, { optionTypes: [{ id: "color", name: "Color", values: [{ id: "ink", label: "Ink", active: true }] }] });
    await ctx.db.patch(ids.variant, { selections: [{ optionTypeId: "color", optionTypeName: "Color", sortOrder: 0, optionValueLabel: "Ink", optionValueId: "ink" }] });
  });
  await t.mutation(add, { sessionToken: token, productId: ids.owner, quantity: 1, metadata });
  expect((await read()).cart?.subtotalAmount).toBe(4500);
});

test("disabling a bundle variant option invalidates an existing cart at update and checkout", async () => {
  const { t, ids, metadata, read } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch(ids.product, { optionTypes: [{ id: "color", name: "Color", values: [{ id: "ink", label: "Ink" }] }] });
    await ctx.db.patch(ids.variant, { selections: [{ optionTypeId: "color", optionTypeName: "Color", sortOrder: 0, optionValueLabel: "Ink", optionValueId: "ink" }] });
  });
  await t.mutation(add, { sessionToken: token, productId: ids.owner, quantity: 1, metadata });
  const { cart, lines } = await read();
  if (!cart) throw Error("Missing fixture cart");
  await t.run(async ctx => {
    await ctx.db.insert("commerce_checkout_sessions", { cartId: cart._id, sessionToken: token, status: "draft", email: "guest@example.invalid", billingAddress: { line1: "1 Test Road", city: "Denver", countryCode: "US", postalCode: "80202" }, currencyCode: "USD", subtotalAmount: cart.subtotalAmount, discountAmount: 0, shippingAmount: 0, taxAmount: 0, totalAmount: cart.totalAmount, createdAt: 1, updatedAt: 1 });
    await ctx.db.patch(ids.product, { optionTypes: [{ id: "color", name: "Color", values: [{ id: "ink", label: "Ink", active: false }] }] });
  });
  await expect(t.mutation(update, { sessionToken: token, cartItemId: lines[0]!._id, quantity: 2 })).rejects.toThrow("unavailable");
  await expect(t.mutation(complete, { sessionToken: token })).rejects.toThrow("unavailable");
  expect(await t.run(ctx => ctx.db.query("commerce_orders").collect())).toHaveLength(0);
  expect((await read()).cart?.subtotalAmount).toBe(4500);
});

test("registered checkout conserves bundle totals and carries the selected variant into the order", async () => {
  const { t, ids, metadata, read } = await fixture();
  await t.mutation(add, { sessionToken: token, productId: ids.owner, quantity: 2, metadata });
  const { cart } = await read();
  if (!cart) throw Error("Missing fixture cart");
  await t.run(async ctx => {
    await ctx.db.insert("settings", { section: "commerce.general", values: { currencyCode: "USD", shippingEnabled: false, allowGuestCheckout: true, paymentMethods: [{ code: "card", label: "Card", enabled: true }] }, updatedAt: 1, updatedBy: ids.user });
    await ctx.db.insert("commerce_checkout_sessions", { cartId: cart._id, sessionToken: token, status: "ready_for_review", email: "guest@example.invalid", selectedPaymentMethodCode: "card", billingAddress: { line1: "1 Test Road", city: "Denver", countryCode: "US", postalCode: "80202" }, currencyCode: "USD", subtotalAmount: cart.subtotalAmount, discountAmount: 0, shippingAmount: 0, taxAmount: 0, totalAmount: cart.totalAmount, createdAt: 1, updatedAt: 1 });
  });
  await t.mutation(complete, { sessionToken: token });
  await t.run(async ctx => {
    const order = await ctx.db.query("commerce_orders").unique();
    const line = await ctx.db.query("commerce_order_items").unique();
    expect(order).toMatchObject({ subtotalAmount: 9000, totalAmount: 9000, paymentStatus: "pending" });
    expect(line).toMatchObject({ quantity: 2, unitPriceAmount: 4500, lineTotalAmount: 9000, metadata: { resolvedBundlePriceAmount: 4500, selections: [{ variantId: ids.variant, quantity: 2 }] } });
    expect((await ctx.db.get(cart._id))?.status).toBe("pending_payment");
  });
});

test("claim and shared-copy mutations recalculate bundle prices from current component prices", async () => {
  const { t, ids, metadata, read } = await fixture();
  await t.mutation(add, { sessionToken: token, productId: ids.owner, quantity: 1, metadata });
  await t.run(ctx => ctx.db.patch(ids.variant, { price: { amount: 3000, currencyCode: "USD" } }));
  const owner = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  await owner.mutation(makeFunctionReference<"mutation">("commerce/cart:merge"), { sessionToken: token });
  expect((await read()).cart?.subtotalAmount).toBe(5400);
  const shared = await owner.mutation(makeFunctionReference<"mutation">("commerce/cart:enableSharing"), { sessionToken: token });
  await t.run(ctx => ctx.db.patch(ids.variant, { price: { amount: 4000, currencyCode: "USD" } }));
  await t.mutation(makeFunctionReference<"mutation">("commerce/cart:copyShared"), { sessionToken: "bundle-copy-regression", shareToken: shared.shareToken });
  const copy = await t.run(ctx => ctx.db.query("commerce_carts").withIndex("by_session", q => q.eq("sessionToken", "bundle-copy-regression")).unique());
  expect(copy?.subtotalAmount).toBe(7200);
});

test("bundle components and standalone variants share one cart inventory demand", async () => {
  const { t, ids, metadata, read } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch(ids.product, { trackInventory: true, stockQuantity: 3 });
    await ctx.db.patch(ids.variant, { manageStock: "parent" });
  });
  await t.mutation(add, { sessionToken: token, productId: ids.owner, quantity: 1, metadata });
  await t.mutation(add, { sessionToken: token, productId: ids.product, variantId: ids.variant, quantity: 1 });
  await expect(t.mutation(add, { sessionToken: token, productId: ids.product, variantId: ids.variant, quantity: 1 })).rejects.toThrow("Insufficient stock");
  expect((await read()).cart?.subtotalAmount).toBe(7000);
  const state = await read();
  const bundleLine = state.lines.find(line => line.productId === ids.owner);
  await expect(t.mutation(update, { sessionToken: token, cartItemId: bundleLine!._id, quantity: 2 })).rejects.toThrow();
  expect((await read()).cart?.subtotalAmount).toBe(7000);
});

test("separate configurations share the bundle's own stock count", async () => {
  const { t, ids, metadata, read } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch(ids.bundle, { bundleType: "mix_and_match", trackInventory: true, stockCount: 1 });
    await ctx.db.patch(ids.component, { minQuantity: 1, maxQuantity: 3 });
  });
  await t.mutation(add, { sessionToken: token, productId: ids.owner, quantity: 1, metadata });
  await expect(t.mutation(add, { sessionToken: token, productId: ids.owner, quantity: 1, metadata: { ...metadata, selections: [{ componentId: ids.component, variantId: ids.variant, quantity: 1 }] } })).rejects.toThrow("Insufficient stock");
  expect((await read()).lines).toHaveLength(1);
});
