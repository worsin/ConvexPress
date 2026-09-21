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
    await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",websiteKey:"compare",instanceKey:"staging",environmentKind:"staging",deploymentOrigin:"https://compare.convex.cloud",managementOrigin:"https://controller.convex.cloud",siteOrigin:"https://compare.convex.site",siteContractVersion:"1",schemaVersion:"2026.9.0",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
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

// The block adapter uses the same authorized storefront projection as purchase configuration.
import { readBundleOffer } from "../../canonicalDocuments/bundleOffer";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { resolveCanonicalData } from "../../canonicalDocuments/foundation/resolve";
import { bundleOfferResultSchema } from "../../canonicalDocuments/foundation/bundleOfferContracts";
import { displayContext } from "../../canonicalDocuments/displayContext";

test("bundle block binds a closed live offer to the selected identity", async () => {
  const { t, ids } = await fixture();
  const result = await t.run(ctx => readBundleOffer(ctx, { bundle: ids.bundle }));
  expect(result.bundle?.id).toBe(ids.bundle);
  expect(result.bundle?.defaults).toEqual([{ componentId: ids.component, variantId: ids.variant, quantity: 2 }]);
  expect(result.bundle?.quote?.bundlePrice).toBe(4500);
  expect(result.bundle?.components[0]?.variants.map(variant => variant.id)).toEqual([ids.variant]);
  for (const privateField of ["PRIVATE_IMPORT", "PRIVATE_PROTOTYPE", "authorId", "purchaseCount"]) expect(JSON.stringify(result)).not.toContain(privateField);
  expect(() => bundleOfferResultSchema.parse({ bundle: { ...result.bundle, authorId: ids.user } })).toThrow();
  const tree = [{ id: "bundle", name: "commerce/bundle-offer", version: 1, attrs: { bundle: ids.bundle } }];
  const params: Parameters<typeof resolveCanonicalData> = [tree, { websiteKey: "test", instanceKey: "test" }, { enabledPlugins: ["commerce", "commerceBundles"], capabilities: ["reference.targetResolution"], disabledBlocks: [] }, async () => null];
  await expect(resolveCanonicalData(...params)).rejects.toThrow("Trusted bundle reader");
  params[39] = async () => result;
  expect((await resolveCanonicalData(...params)).dataByBlock.bundle?.resolver).toBe("commerce.bundle");
  params[39] = async () => ({ bundle: { ...result.bundle, id: "another-bundle" } });
  await expect(resolveCanonicalData(...params)).rejects.toThrow("saved selection");
});
test("empty bundle selection never discovers a catalog and hidden components suppress the offer", async () => {
  const { t, ids } = await fixture(), budget = new RequestReadLedger();
  expect(await t.run(ctx => readBundleOffer(ctx, {}, budget))).toEqual({ bundle: null });
  expect(budget.queries).toBe(0);
  await expect(t.run(ctx => readBundleOffer(ctx, { bundle: ids.bundle, viewerId: "forged" }, budget))).rejects.toThrow();
  expect(budget.queries).toBe(0);
  await t.run(ctx => ctx.db.patch(ids.product, { status: "private" }));
  expect(await t.run(ctx => readBundleOffer(ctx, { bundle: ids.bundle }))).toEqual({ bundle: null });
});
test("bundle block editor capability is available only with both commerce plugins", async () => {
  const { t } = await fixture();
  expect((await t.run(ctx => displayContext(ctx, new RequestReadLedger()))).policy.disabledBlocks).not.toContain("commerce/bundle-offer");
  await t.run(async ctx => { const setting = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique(); if (!setting) throw Error(); await ctx.db.patch(setting._id, { values: { commerceEnabled: true, commerceBundlesEnabled: false } }); });
  expect((await t.run(ctx => displayContext(ctx, new RequestReadLedger()))).policy.disabledBlocks).toContain("commerce/bundle-offer");
});
