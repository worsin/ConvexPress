import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { getBySlug, listPublished } from "../products";

async function fixture() {
  const t = convexTest({ schema, modules: {
    "./convex/_generated/api.js": () => import("../../_generated/api.js"),
    "./convex/_generated/server.js": () => import("../../_generated/server.js"),
    "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  } });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "catalog-reader@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true, membershipEnabled: true }, updatedAt: 1, updatedBy: user });
    const root = await ctx.db.insert("commerce_product_categories", { name: "Public root", slug: "root", isVisible: true, productCount: 0, createdAt: 1, updatedAt: 1 });
    const child = await ctx.db.insert("commerce_product_categories", { name: "Public child", slug: "child", parentId: root, isVisible: true, productCount: 0, createdAt: 1, updatedAt: 1 });
    const hidden = await ctx.db.insert("commerce_product_categories", { name: "Secret department", slug: "hidden", isVisible: false, productCount: 0, createdAt: 1, updatedAt: 1 });
    const hiddenChild = await ctx.db.insert("commerce_product_categories", { name: "Secret subdepartment", slug: "hidden-child", parentId: hidden, path: [], isVisible: true, productCount: 0, createdAt: 1, updatedAt: 1 });
    const product = (slug: string, extra: object = {}) => ctx.db.insert("commerce_products", {
      title: slug, slug, status: "publish", productType: "simple", authorId: user,
      basePrice: { amount: 2500, currencyCode: "USD" }, categoryIds: [root, child, hiddenChild], galleryMediaIds: [],
      trackInventory: false, allowBackorders: false, isVirtual: true, isDownloadable: false,
      createdAt: 1, updatedAt: 1, publishedAt: 1, ...extra,
    });
    const publicId = await product("public"), restricted = await product("restricted"), route = await product("route-protected");
    const future = await product("future", { publishedAt: Date.now() + 3_600_000 });
    const variable = await product("no-public-variant", { productType: "variable" });
    await ctx.db.insert("commerce_product_variants", { productId: variable, title: "Private", optionSummary: "Private", price: { amount: 1, currencyCode: "USD" }, status: "private", isDefault: true, createdAt: 1, updatedAt: 1 });
    const plan = await ctx.db.insert("membership_plans", { title: "Members", slug: "members", status: "active", grantMode: "manual", priority: 1, createdAt: 1, updatedAt: 1 });
    for (const target of [{ resourceType: "product" as const, resourceIdOrKey: restricted }, { resourceType: "route" as const, resourceIdOrKey: "/products/route-protected" }])
      await ctx.db.insert("membership_restriction_rules", { ...target, ruleMode: "allow_only", planIds: [plan], teaserMode: "excerpt", loginRequired: true, createdAt: 1, updatedAt: 1 });
    const grant = await ctx.db.insert("membership_grants", { userId: user, planId: plan, sourceType: "manual", status: "active", startsAt: 1, createdAt: 1, updatedAt: 1 });
    return { user, root, child, hidden, hiddenChild, publicId, restricted, route, future, variable, grant };
  });
  const call = (fn: any, args: object = {}) => t.run(ctx => fn._handler(ctx, args));
  return { t, ids, call };
}

test("public list totals and detail enforce product/route membership, publication time and public variants", async () => {
  const { call, ids } = await fixture();
  const result = await call(listPublished, { perPage: 1 });
  expect(result.products.map((p: any) => p._id)).toEqual([ids.publicId]);
  expect(result.total).toBe(1); expect(result.totalPages).toBe(1);
  for (const slug of ["restricted", "route-protected", "future", "no-public-variant"])
    expect(await call(getBySlug, { slug })).toBeNull();
  expect((await call(listPublished, { search: "restricted" })).total).toBe(0);
  expect((await call(listPublished, { page: 2, perPage: 1 })).products).toEqual([]);
});

test("membership grant revocation changes both details and counts without retaining viewer authority", async () => {
  const { t, ids } = await fixture();
  const member = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  const list = () => member.run(ctx => (listPublished as any)._handler(ctx, { categorySlug: "root" }));
  const detail = () => member.run(ctx => (getBySlug as any)._handler(ctx, { slug: "restricted" }));
  expect((await list()).total).toBe(3); expect((await detail())._id).toBe(ids.restricted);
  await t.run(ctx => ctx.db.patch(ids.grant, { status: "revoked" }));
  expect((await list()).total).toBe(1); expect(await detail()).toBeNull();
});

test("hidden category ancestry cannot be enumerated through product archives or product category labels", async () => {
  const { call, t, ids } = await fixture();
  for (const categorySlug of ["hidden", "hidden-child", "missing"])
    expect((await call(listPublished, { categorySlug })).total).toBe(0);
  const listing = await call(listPublished, { categorySlug: "root" });
  expect(listing.total).toBe(1);
  expect(listing.products[0].categories.map((c: any) => c.slug).sort()).toEqual(["child", "root"]);
  expect(JSON.stringify(await call(getBySlug, { slug: "public" }))).not.toContain("Secret");
  await t.run(ctx => ctx.db.patch(ids.root, { isVisible: false }));
  expect((await call(listPublished, { categorySlug: "child" })).total).toBe(0);
  expect((await call(getBySlug, { slug: "public" })).categories).toEqual([]);
});
