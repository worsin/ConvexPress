import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { changesCatalogSource, changesCatalogPolicy, readCatalogRevision, recordCatalogWrite } from "../catalogRevision";
import { insertWithMediaReferences, patchWithMediaReferences, replaceWithMediaReferences, deleteWithMediaReferences,
  insertDynamicWithMediaReferences, patchDynamicWithMediaReferences, deleteDynamicWithMediaReferences } from "../../media/attachmentGuard";

const modules = {"./convex/_generated/api.js": () => import("../../_generated/api.js")};
const category = {name: "Field", slug: "field", productCount: 0, createdAt: 1, updatedAt: 1};
const setup = () => convexTest({schema, modules});

test("category source writes invalidate while derived counts and thumbnails do not change eligibility", async () => {
  const t = setup();
  expect(await t.run(ctx => readCatalogRevision(ctx, "source"))).toBeNull();
  const id = await t.run(ctx => insertWithMediaReferences(ctx, "commerce_product_categories", category));
  const first = await t.run(ctx => readCatalogRevision(ctx, "source"));
  expect(first?.revision).toBe(1);
  await t.run(ctx => patchWithMediaReferences(ctx, "commerce_product_categories", id, {productCount: 10, updatedAt: 2}));
  expect(await t.run(ctx => readCatalogRevision(ctx, "source"))).toEqual(first);
  await t.run(ctx => patchWithMediaReferences(ctx, "commerce_product_categories", id, {isVisible: false}));
  expect((await t.run(ctx => readCatalogRevision(ctx, "source")))?.revision).toBe(2);
  await t.run(ctx => replaceWithMediaReferences(ctx, "commerce_product_categories", id, category));
  expect((await t.run(ctx => readCatalogRevision(ctx, "source")))?.revision).toBe(3);
  await t.run(ctx => deleteWithMediaReferences(ctx, "commerce_product_categories", id));
  expect((await t.run(ctx => readCatalogRevision(ctx, "source")))?.revision).toBe(4);
});

test("dynamic category imports, edits and deletes participate in the same source stamp", async () => {
  const t = setup();
  const id = await t.run(ctx => insertDynamicWithMediaReferences(ctx, "commerce_product_categories", category));
  await t.run(ctx => patchDynamicWithMediaReferences(ctx, id, {slug: "new-field"}));
  await t.run(ctx => deleteDynamicWithMediaReferences(ctx, id));
  expect((await t.run(ctx => readCatalogRevision(ctx, "source")))?.revision).toBe(3);
});

test("source eligibility fields include future publication and variant ownership without price-only churn", () => {
  for (const patch of [{publishedAt: 10}, {status: "draft"}, {categoryIds: []}, {slug: "new"}, {productType: "variable"}, {description: "search changed"}])
    expect(changesCatalogSource("commerce_products", "patch", patch)).toBe(true);
  for (const patch of [{stockQuantity: 5}, {basePrice: {amount: 100, currencyCode: "USD"}}, {updatedAt: 3}, {collectionIndexVersion: 1}])
    expect(changesCatalogSource("commerce_products", "patch", patch)).toBe(false);
  expect(changesCatalogSource("commerce_product_variants", "patch", {productId: "other"})).toBe(true);
  expect(changesCatalogSource("commerce_product_variants", "patch", {status: undefined})).toBe(true);
  expect(changesCatalogSource("commerce_bundles", "patch", {productId: undefined})).toBe(true);
  expect(changesCatalogSource("commerce_bundles", "patch", {purchaseCount: 5})).toBe(false);
  expect(changesCatalogSource("commerce_orders", "insert")).toBe(false);
});

test("revision and source change roll back together after a failed transaction", async () => {
  const t = setup();
  const id = await t.run(ctx => insertWithMediaReferences(ctx, "commerce_product_categories", category));
  const before = await t.run(ctx => readCatalogRevision(ctx, "source"));
  await expect(t.run(async ctx => {
    await patchWithMediaReferences(ctx, "commerce_product_categories", id, {slug: "must-not-commit"});
    throw new Error("abort catalog change");
  })).rejects.toThrow("abort catalog change");
  expect(await t.run(ctx => readCatalogRevision(ctx, "source"))).toEqual(before);
  expect((await t.run(ctx => ctx.db.get(id)))?.slug).toBe("field");
});

test("counter recreation never matches a prior stamp and corrupt revisions refuse writes", async () => {
  const t = setup();
  await t.run(ctx => recordCatalogWrite(ctx, "commerce_products", "insert"));
  const before = await t.run(ctx => readCatalogRevision(ctx, "source"));
  await t.run(async ctx => {
    const row = await ctx.db.query("commerce_catalog_revisions").withIndex("by_domain", q => q.eq("domain", "source")).unique();
    await ctx.db.delete(row!._id);
    await recordCatalogWrite(ctx, "commerce_products", "insert");
  });
  expect((await t.run(ctx => readCatalogRevision(ctx, "source")))?.revision).toBe(before?.revision);
  expect((await t.run(ctx => readCatalogRevision(ctx, "source")))?.id).not.toBe(before?.id);
  await t.run(async ctx => {
    const row = await ctx.db.query("commerce_catalog_revisions").withIndex("by_domain", q => q.eq("domain", "source")).unique();
    await ctx.db.patch(row!._id, {revision: Number.MAX_SAFE_INTEGER});
  });
  await expect(t.run(ctx => recordCatalogWrite(ctx, "commerce_products", "insert"))).rejects.toThrow("Catalog revision needs repair");
});

test("policy writes invalidate a separate stamp and dynamic rule revocation cannot bypass it", async () => {
  const t = setup();
  const rule = await t.run(ctx => insertWithMediaReferences(ctx, "membership_restriction_rules", {
    resourceType: "product", resourceIdOrKey: "selected-product", ruleMode: "allow_only", planIds: [],
    loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1,
  }));
  expect((await t.run(ctx => readCatalogRevision(ctx, "policy")))?.revision).toBe(1);
  expect(await t.run(ctx => readCatalogRevision(ctx, "source"))).toBeNull();
  await t.run(ctx => patchDynamicWithMediaReferences(ctx, rule, {loginRequired: false}));
  expect((await t.run(ctx => readCatalogRevision(ctx, "policy")))?.revision).toBe(2);
  await t.run(ctx => deleteDynamicWithMediaReferences(ctx, rule));
  expect((await t.run(ctx => readCatalogRevision(ctx, "policy")))?.revision).toBe(3);
});

test("policy invalidation covers role/grant windows and plugin settings without login activity churn", () => {
  for (const [table, patch] of [
    ["users", {roleId: undefined}], ["users", {authSource: "clerk"}], ["users", {internalRole: "subscriber"}],
    ["roles", {capabilities: []}], ["roles", {status: "inactive"}], ["roles", {level: 0}],
    ["membership_grants", {endsAt: 123}], ["membership_grants", {graceEndsAt: undefined}],
    ["membership_plans", {linkedRoleId: undefined}], ["membership_plans", {linkedCapabilities: []}],
    ["settings", {values: {membershipEnabled: false}}],
  ] as const) expect(changesCatalogPolicy(table, "patch", patch)).toBe(true);
  expect(changesCatalogPolicy("users", "patch", {lastActiveAt: 10, updatedAt: 10})).toBe(false);
  expect(changesCatalogPolicy("users", "patch", {postCount: 1, postCountReady: true})).toBe(false);
  expect(changesCatalogPolicy("commerce_products", "patch", {status: "publish"})).toBe(false);
});

test("brand identity and product assignments invalidate catalog continuations transactionally",async()=>{
  const t=setup();
  const id=await t.run(ctx=>insertWithMediaReferences(ctx,"commerce_product_brands",{name:"Aster",slug:"aster",description:"",status:"publish",sortOrder:0,createdAt:1,updatedAt:1}));
  const first=await t.run(ctx=>readCatalogRevision(ctx,"source"));expect(first?.revision).toBe(1);
  await t.run(ctx=>patchWithMediaReferences(ctx,"commerce_product_brands",id,{status:"archived"}));
  expect((await t.run(ctx=>readCatalogRevision(ctx,"source")))?.revision).toBe(2);
  await t.run(ctx=>patchDynamicWithMediaReferences(ctx,id,{slug:"new-aster"}));
  expect((await t.run(ctx=>readCatalogRevision(ctx,"source")))?.revision).toBe(3);
  expect(changesCatalogSource("commerce_products","patch",{brandId:id})).toBe(true);
  expect(changesCatalogSource("commerce_products","patch",{brandId:undefined})).toBe(true);
});
