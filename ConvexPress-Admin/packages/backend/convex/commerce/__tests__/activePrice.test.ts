import { test, expect, setSystemTime } from "bun:test";
import { activePriceAmount } from "../activePrice";
import { getVariantDisplayPrice } from "../variantHelpers";
import { resolveCartItemUnitPrice } from "../cartHelpers";
import { addItem, getMine } from "../cart";
import { listPublished } from "../products";
import { commerceHarness } from "./handlerHarness.test-support";

const regular = { amount: 2500, currencyCode: "USD" };
const free = { amount: 0, currencyCode: "USD" };
test("sale windows honor zero prices, explicit epoch boundaries and inclusive end timestamps", () => {
  for (const [now, expected] of [[99, 2500], [100, 0], [200, 0], [201, 2500]])
    expect(activePriceAmount(regular, free, { salePriceFrom: 100, salePriceTo: 200 }, now)).toBe(expected);
  expect(activePriceAmount(regular, free, { salePriceTo: 0 }, 1)).toBe(2500);
  expect(activePriceAmount(regular, free, { salePriceFrom: 0 }, 0)).toBe(0);
  expect(activePriceAmount(regular, free, {}, 500)).toBe(0);
});
test("malformed sale metadata never replaces the valid regular price", () => {
  for (const sale of [{ amount: NaN }, { amount: Infinity }, { amount: -1 }, { amount: 0, currencyCode: "EUR" }])
    expect(activePriceAmount(regular, sale, {}, 100)).toBe(2500);
  for (const window of [{ salePriceFrom: NaN }, { salePriceTo: Infinity }, { salePriceFrom: 200, salePriceTo: 100 }])
    expect(activePriceAmount(regular, free, window, 100)).toBe(2500);
  expect(() => activePriceAmount({ amount: NaN }, free, {}, 100)).toThrow();
});
test("cart and variant display helpers use the same scheduled sale price", () => {
  setSystemTime(150);
  try {
    const price = { price: regular, salePrice: free, salePriceFrom: 100, salePriceTo: 200 };
    expect(getVariantDisplayPrice(price)).toBe(0);
    expect(resolveCartItemUnitPrice({ variant: price, product: { basePrice: regular } })).toBe(0);
    setSystemTime(201);
    expect(getVariantDisplayPrice(price)).toBe(2500);
    expect(resolveCartItemUnitPrice({ variant: price, product: { basePrice: regular } })).toBe(2500);
  } finally { setSystemTime(); }
});

test("real catalog and cart handlers agree on free sales and expired windows", async () => {
  setSystemTime(150);
  try {
    const product = { _id: "mug", title: "Mug", slug: "mug", status: "publish", productType: "simple", categoryIds: [], basePrice: regular, salePrice: free, salePriceFrom: 100, salePriceTo: 200, trackInventory: true, stockQuantity: 10, createdAt: 1 };
    const ctx = commerceHarness({ commerce_products: [product] }, null);
    const call = (fn: any, args: any) => fn._handler(ctx, args);
    expect((await call(listPublished, {})).products[0].displayPrice).toBe(0);
    await call(addItem, { sessionToken: "free-window", productId: "mug", quantity: 1 });
    expect((await call(getMine, { sessionToken: "free-window" })).subtotalAmount).toBe(0);
    setSystemTime(201);
    expect((await call(listPublished, {})).products[0].displayPrice).toBe(2500);
    await call(addItem, { sessionToken: "after-window", productId: "mug", quantity: 1 });
    expect((await call(getMine, { sessionToken: "after-window" })).subtotalAmount).toBe(2500);
  } finally { setSystemTime(); }
});

test("an unpublished default variant cannot determine the public product price", async () => {
  const ctx = commerceHarness({
    commerce_products: [{ _id: "mug", title: "Mug", slug: "mug", status: "publish", productType: "variable", categoryIds: [], basePrice: regular, createdAt: 1 }],
    commerce_product_variants: [
      { _id: "draft", productId: "mug", status: "draft", isDefault: true, price: { amount: 1, currencyCode: "USD" } },
      { _id: "public", productId: "mug", status: "publish", isDefault: false, price: regular },
    ],
  });
  expect((await (listPublished as any)._handler(ctx, {})).products[0].displayPrice).toBe(2500);
});

test("creating a product accepts its ordinary legacy-ID-shaped generated slug", async () => {
  const { create } = await import("../products");
  const ctx = commerceHarness();
  const normalize = ctx.db.normalizeId.bind(ctx.db);
  ctx.db.normalizeId = (table: string, value: string) => table === "media" && value === "pricingwindowacceptance" ? "tx7gxswt6rhrg16zdcpge7h7xxkajpww" : normalize(table, value);
  const id = await (create as any)._handler(ctx, { title: "Pricing window acceptance", categoryIds: [], galleryMediaIds: [], basePrice: regular, salePrice: free, status: "publish", stockQuantity: 10, trackInventory: true, isVirtual: true });
  const product = ctx.tables.commerce_products.find((row: any) => row._id === id);
  expect(product.slug).toBe("pricingwindowacceptance");
  expect(product.salePrice.amount).toBe(0);
  expect(product.featuredMediaId).toBeUndefined();
});

test("product updates preserve omitted images and remove explicitly cleared image fields", async () => {
  const { update } = await import("../products");
  const ctx = commerceHarness({ commerce_products: [{ _id: "product", title: "Product", slug: "product", status: "publish", productType: "simple", categoryIds: [], basePrice: regular, featuredMediaId: "image", createdAt: 1 }], media: [{ _id: "image", status: "active" }] });
  await (update as any)._handler(ctx, { productId: "product", title: "Updated" });
  expect(ctx.tables.commerce_products[0].featuredMediaId).toBe("image");
  await (update as any)._handler(ctx, { productId: "product", featuredMediaId: null, status: "draft" });
  expect(ctx.tables.commerce_products[0].featuredMediaId).toBeUndefined();
  expect(ctx.tables.commerce_products[0].status).toBe("draft");
  await (update as any)._handler(ctx, { productId: "product", featuredMediaId: "image" });
  expect(ctx.tables.commerce_products[0].featuredMediaId).toBe("image");
});

test("public product handlers omit private metadata and unpublished variant details", async () => {
  const { getBySlug, get } = await import("../products");
  const product = { _id: "product", title: "Product", slug: "product", status: "publish", productType: "variable", categoryIds: [], basePrice: regular, authorId: "admin", rawSourceMeta: "private import credential", downloadLimit: 123, optionTypes: [{ id: "color", name: "Color", privateNote: "internal", values: [{ id: "blue", label: "Blue" }, { id: "secret", label: "Unreleased" }] }], createdAt: 1 };
  const publicVariant = { _id: "public", productId: "product", title: "Blue", price: regular, salePrice: free, salePriceFrom: 100, salePriceTo: 200, status: "publish", isDefault: false, selections: [{ optionTypeId: "color", optionValueId: "blue", optionValueLabel: "Blue", internal: "private" }], lowStockAmount: 42, downloadLimit: 99 };
  const ctx = commerceHarness({ commerce_products: [product], commerce_product_variants: [publicVariant, { ...publicVariant, _id: "secret", title: "Unreleased", status: "draft", isDefault: true, selections: [{ optionTypeId: "color", optionValueId: "secret" }] }], commerce_inventory_adjustments: [{ _id: "audit", productId: "product", note: "private stock audit" }] });
  const result = await (getBySlug as any)._handler(ctx, { slug: "product" });
  expect(result.variants.map((variant: any) => variant._id)).toEqual(["public"]);
  expect(result.optionTypes).toEqual([{ id: "color", name: "Color", values: [{ id: "blue", label: "Blue" }] }]);
  for (const key of ["rawSourceMeta", "authorId", "inventoryAdjustments", "downloadLimit"]) expect(result).not.toHaveProperty(key);
  expect(result.variants[0]).not.toHaveProperty("lowStockAmount");
  expect(JSON.stringify(result)).not.toContain("private");
  const catalog = await (listPublished as any)._handler(ctx, {});
  expect(catalog.products[0]).not.toHaveProperty("rawSourceMeta");
  const admin = await (get as any)._handler(ctx, { productId: "product" });
  expect(admin.rawSourceMeta).toBe("private import credential");
  expect(admin.variants).toHaveLength(2);
});

test("storefront cards respect public variants and active sale windows", async () => {
  const { toProductCard } = await import("../storefront");
  const product = { _id: "product", title: "Product", slug: "product", productType: "variable", basePrice: regular, categoryIds: [] };
  const ctx = commerceHarness({ commerce_product_variants: [{ _id: "hidden", productId: "product", status: "private", isDefault: true, price: regular, salePrice: free }, { _id: "public", productId: "product", status: "publish", price: regular, salePrice: free, salePriceFrom: 100, salePriceTo: 200 }] });
  setSystemTime(150);
  try {
    expect(await toProductCard(ctx, product)).toMatchObject({ defaultVariantId: "public", price: free, compareAtPrice: regular });
    setSystemTime(201);
    expect(await toProductCard(ctx, product)).toMatchObject({ defaultVariantId: "public", price: regular, compareAtPrice: null });
  } finally { setSystemTime(); }
});

test("variant writes preserve zero sales and distinguish clear from omission", async () => {
  const { updateVariant } = await import("../products");
  const ctx = commerceHarness({ commerce_products: [{ _id: "product", productType: "variable", categoryIds: [], basePrice: regular }], commerce_product_variants: [{ _id: "variant", productId: "product", title: "Variant", price: regular, isDefault: true }] });
  const update = (args: any) => (updateVariant as any)._handler(ctx, { variantId: "variant", ...args });
  await update({ salePriceAmount: 0, salePriceFrom: 0, salePriceTo: 200 });
  expect(ctx.tables.commerce_product_variants[0].salePrice).toEqual(free);
  await update({ title: "Renamed" });
  expect(ctx.tables.commerce_product_variants[0].salePriceFrom).toBe(0);
  expect(ctx.tables.commerce_product_variants[0].salePriceTo).toBe(200);
  await update({ salePriceFrom: null, salePriceTo: null });
  expect(ctx.tables.commerce_product_variants[0].salePrice).toEqual(free);
  expect(ctx.tables.commerce_product_variants[0].salePriceFrom).toBeUndefined();
  expect(ctx.tables.commerce_product_variants[0].salePriceTo).toBeUndefined();
  await update({ salePriceAmount: null });
  expect(ctx.tables.commerce_product_variants[0].salePrice).toBeUndefined();
  for (const value of [-1, NaN, Infinity, 1.5]) await expect(update({ salePriceAmount: value })).rejects.toThrow();
});

test("product sale schedule writes preserve omitted boundaries, clear explicit nulls and reject reversed windows", async () => {
  const {create,update}=await import("../products");
  const ctx=commerceHarness({commerce_products:[]});
  const id=await (create as any)._handler(ctx,{title:"Scheduled notebook",basePrice:regular,salePrice:free,salePriceFrom:100,salePriceTo:200});
  const saved=()=>ctx.tables.commerce_products.find((p:any)=>p._id===id);
  expect(saved().salePriceFrom).toBe(100);expect(saved().salePriceTo).toBe(200);
  const write=(args:any)=>(update as any)._handler(ctx,{productId:id,...args});
  await write({title:"Renamed"});expect(saved().salePriceFrom).toBe(100);expect(saved().salePriceTo).toBe(200);
  await expect(write({salePriceFrom:201})).rejects.toThrow("on or after");
  await expect(write({salePriceTo:99})).rejects.toThrow("on or after");
  expect(saved().salePriceFrom).toBe(100);expect(saved().salePriceTo).toBe(200);
  await write({salePriceFrom:null});expect(saved().salePriceFrom).toBeUndefined();expect(saved().salePriceTo).toBe(200);
  await write({salePriceTo:null});expect(saved().salePriceTo).toBeUndefined();expect(saved().salePrice).toEqual(free);
  for(const time of [NaN,Infinity,1.5,8_640_000_000_000_001]) await expect(write({salePriceTo:time})).rejects.toThrow("valid timestamps");
  await expect((create as any)._handler(ctx,{title:"Invalid schedule",basePrice:regular,salePriceFrom:200,salePriceTo:100})).rejects.toThrow("on or after");
});
