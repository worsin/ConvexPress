import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { normalizeBrand } from "../brands";
import type { Id } from "../../_generated/dataModel";
const modules = { "./convex/_generated/api.js": () => import("../../_generated/api.js"), "./convex/_generated/server.js": () => import("../../_generated/server.js"), "./convex/commerce/brands.ts": () => import("../brands"), "./convex/commerce/products.ts": () => import("../products") };
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const roleId = await ctx.db.insert("roles", { name: "Administrator", slug: "administrator", description: "Test", level: 100, type: "internal", isDefault: false, isProtected: true, capabilities: ["manage_options"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { authSource: "local", email: "brands@example.invalid", emailVerified: true, status: "active", roleId, createdAt: 1, updatedAt: 1 });
    const category = await ctx.db.insert("commerce_product_categories", { name: "Objects", slug: "objects", productCount: 0, createdAt: 1, updatedAt: 1 });
    const plugins = await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true }, updatedAt: 1, updatedBy: user });
    return { user, category, plugins };
  });
  const admin = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  const addProduct = (brandId?: Id<"commerce_product_brands">) => admin.mutation(api.commerce.products.create, { title: "Notebook", basePrice: { amount: 2500, currencyCode: "USD" }, categoryIds: [ids.category], status: "publish", ...(brandId ? { brandId } : {}) });
  return { t, ids, admin, addProduct };
}
test("brand input preserves readable names and rejects invalid limits before writes", () => {
  expect(normalizeBrand({ name: "  Café   Studio " })).toEqual({ name: "Café Studio", slug: "cafe-studio", description: "", sortOrder: 0 });
  expect(normalizeBrand({ name: "工房", slug: "workshop" }).name).toBe("工房");
  for (const input of [{ name: "" }, { name: "工房" }, { name: "x".repeat(161) }, { name: "Valid", description: "x".repeat(3001) }, { name: "Valid", sortOrder: 1.2 }, { name: "Valid", sortOrder: Infinity }]) expect(() => normalizeBrand(input)).toThrow();
});
test("registered brand CRUD defaults to draft, reserves slugs and preserves partial updates", async () => {
  const { admin } = await fixture();
  const id = await admin.mutation(api.commerce.brands.create, { name: "Fieldwork", description: "Useful objects", sortOrder: 2 });
  expect(await admin.query(api.commerce.brands.get, { brandId: id })).toMatchObject({ name: "Fieldwork", slug: "fieldwork", status: "draft", description: "Useful objects", sortOrder: 2 });
  await expect(admin.mutation(api.commerce.brands.create, { name: "FIELDWORK" })).rejects.toThrow("already uses");
  await admin.mutation(api.commerce.brands.update, { brandId: id, status: "publish" });
  await admin.mutation(api.commerce.brands.update, { brandId: id, name: "Fieldwork Studio" });
  expect(await admin.query(api.commerce.brands.get, { brandId: id })).toMatchObject({ name: "Fieldwork Studio", slug: "fieldwork", status: "publish", description: "Useful objects" });
});
test("brand writes emit dedicated audit events and management is permission protected", async () => {
  const { t, admin } = await fixture();
  const id = await admin.mutation(api.commerce.brands.create, { name: "Atelier" });
  await admin.mutation(api.commerce.brands.update, { brandId: id, status: "archived" });
  const events = await t.run(ctx => ctx.db.query("events").take(10));
  expect(events.map(event => event.code)).toEqual(["brand.created", "brand.updated"]);
  await expect(t.mutation(api.commerce.brands.create, { name: "Unauthorized" })).rejects.toThrow();
  await expect(t.mutation(api.commerce.brands.update, { brandId: id, name: "Unauthorized" })).rejects.toThrow();
  await expect(t.query(api.commerce.brands.get, { brandId: id })).rejects.toThrow();
  await expect(t.query(api.commerce.brands.list, { paginationOpts: { cursor: null, numItems: 12 } })).rejects.toThrow();
});
test("brand management paginates the indexed order without silently capping the collection", async () => {
  const { t, admin } = await fixture();
  await t.run(async ctx => { for (let i = 0; i < 55; i++) await ctx.db.insert("commerce_product_brands", { name: `Brand ${i}`, slug: `brand-${i}`, status: "draft", description: "", sortOrder: i, createdAt: 1, updatedAt: 1 }); });
  const first = await admin.query(api.commerce.brands.list, { paginationOpts: { cursor: null, numItems: 48 } });
  expect(first.page).toHaveLength(48); expect(first.isDone).toBe(false);
  const second = await admin.query(api.commerce.brands.list, { paginationOpts: { cursor: first.continueCursor, numItems: 48 } });
  expect(second.page).toHaveLength(7); expect(second.page[0]?.name).toBe("Brand 48"); expect(second.isDone).toBe(true);
  await expect(admin.query(api.commerce.brands.list, { paginationOpts: { cursor: null, numItems: 49 } })).rejects.toThrow("1–48");
});
test("brand logos use the media guard, reject non-images, and clear explicitly", async () => {
  const { t, admin, ids } = await fixture();
  const logo = await t.run(ctx => ctx.db.insert("media", { title: "Brand mark", fileName: "logo.png", slug: "brand-logo", mimeType: "image/png", fileSize: 100, mediaType: "image", url: "https://images.example.invalid/logo.png", status: "active", uploadedBy: ids.user, createdAt: 1, updatedAt: 1 }));
  const id = await admin.mutation(api.commerce.brands.create, { name: "Made Here", logoMediaId: logo });
  expect((await admin.query(api.commerce.brands.get, { brandId: id }))?.logoMediaId).toBe(logo);
  await admin.mutation(api.commerce.brands.update, { brandId: id, logoMediaId: null });
  expect((await admin.query(api.commerce.brands.get, { brandId: id }))?.logoMediaId).toBeUndefined();
  await t.run(ctx => ctx.db.patch(logo, { mimeType: "application/pdf" }));
  await expect(admin.mutation(api.commerce.brands.update, { brandId: id, logoMediaId: logo })).rejects.toThrow("must be an image");
  await t.run(ctx => ctx.db.patch(logo, { mimeType: "image/png", status: "trashed" }));
  await expect(admin.mutation(api.commerce.brands.update, { brandId: id, logoMediaId: logo })).rejects.toThrow("unavailable");
});
test("registered product assignments preserve omitted brands, support clearing and refuse archived or missing brands", async () => {
  const { t, admin, addProduct } = await fixture();
  const brand = await admin.mutation(api.commerce.brands.create, { name: "Fieldwork" });
  const id = await addProduct(brand);
  expect((await t.run(ctx => ctx.db.get(id)))?.brandId).toBe(brand);
  await admin.mutation(api.commerce.products.update, { productId: id, title: "New notebook" });
  expect((await t.run(ctx => ctx.db.get(id)))?.brandId).toBe(brand);
  await admin.mutation(api.commerce.brands.update, { brandId: brand, status: "archived" });
  await expect(addProduct(brand)).rejects.toThrow("missing or archived");
  await admin.mutation(api.commerce.products.update, { productId: id, title: "Still assigned" });
  expect((await t.run(ctx => ctx.db.get(id)))?.brandId).toBe(brand);
  await admin.mutation(api.commerce.products.update, { productId: id, brandId: null });
  expect((await t.run(ctx => ctx.db.get(id)))?.brandId).toBeUndefined();
  await t.run(ctx => ctx.db.delete(brand));
  await expect(admin.mutation(api.commerce.products.update, { productId: id, brandId: brand })).rejects.toThrow("missing or archived");
  await expect(t.mutation(api.commerce.products.update, { productId: id, brandId: null })).rejects.toThrow();
});
test("commerce disabled blocks brand management and product assignment", async () => {
  const { t, admin, ids } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.plugins, { values: { commerceEnabled: false } }));
  await expect(admin.mutation(api.commerce.brands.create, { name: "Hidden" })).rejects.toThrow();
  await expect(admin.query(api.commerce.brands.list, { paginationOpts: { cursor: null, numItems: 12 } })).rejects.toThrow();
});
