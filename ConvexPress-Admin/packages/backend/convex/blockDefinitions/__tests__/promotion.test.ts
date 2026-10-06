import { expect, test } from "bun:test";
import resourceComposition from "./fixtures/resource-composition.json";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
import { loadAuthoringComposedRegistry } from "../registry";
import { loadPublishedComposedRegistry } from "../publishedRegistry";
import { decodeBlockPromotion } from "../../canonicalDocuments/foundation/blockPromotion";
import { installedPromotions, type InstalledPromotion } from "../../canonicalDocuments/foundation/generated/promotions";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/blockDefinitions/drafts.ts": () => import("../drafts"),
  "./convex/blockDefinitions/publication.ts": () => import("../publication"),
  "./convex/blockDefinitions/promotion.ts": () => import("../promotion"),
};
const create = ref<"mutation">("blockDefinitions/drafts:create"), save = ref<"mutation">("blockDefinitions/drafts:save");
const review = ref<"mutation">("blockDefinitions/publication:setVersionState");
const exportPackage = ref<"query">("blockDefinitions/promotion:exportPackage"), confirm = ref<"mutation">("blockDefinitions/promotion:confirm");
const scope = { websiteKey: "promotion-test", instanceKey: "staging", deploymentOrigin: "https://promotion-test.convex.cloud" };
const capabilities = ["blocks.compose", "blocks.promote", "post.create", "post.read", "post.update", "post.publish"];
function definition(version = 1) {
  return { spec: { name: "composed/promotion-test", title: "Services", description: "Promotion acceptance fixture", category: "marketing", role: "content", version,
    keywords: [], ai: { useFor: "Services", avoid: "Checkout" }, fields: [{ id: "headline", type: "text", default: "Carefully considered" }],
    supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{headline}", examples: [{}] },
    composition: { version: 1, root: { el: "Heading", bind: "attrs.headline" } } };
}
const tree = [{ id: "services", name: "composed/promotion-test", version: 1, attrs: {} }];
async function fixture(source: unknown = definition()) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Publisher", slug: "publisher", description: "Fixture", level: 10, type: "internal", isDefault: false, isProtected: false, capabilities, pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = { authSource: "local" as const, emailVerified: true, status: "active" as const, roleId: role, createdAt: 1, updatedAt: 1 };
    const author = await ctx.db.insert("users", { ...user, email: "promoter@example.invalid" });
    const other = await ctx.db.insert("users", { ...user, email: "other@example.invalid" });
    const site = await ctx.db.insert("convexpress_siteIdentity", { ...scope, identityKey: "site-identity", environmentKind: "staging", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://promotion-test.convex.site", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    return { author, other, role, site };
  });
  const as = (id: string) => t.withIdentity({ subject: id, tokenIdentifier: `https://convexpress-admin.local|${id}` });
  const author = as(ids.author), other = as(ids.other);
  const first = await author.mutation(create, { definitionJson: JSON.stringify(source) });
  const args = { id: first.id, version: 1, expectedGeneration: 1, expectedDigest: first.digest, targetName: "blocks/promotion-test" };
  const approve = () => author.mutation(review, { id: first.id, version: 1, expectedGeneration: 1, expectedDigest: first.digest, enabled: true });
  return { t, ids, author, other, first, args, approve };
}
async function withInstalled(json: string, body: (record: InstalledPromotion) => Promise<void>) {
  const package_ = decodeBlockPromotion(json), key = package_.bundle.targetName;
  const records = installedPromotions as Record<string, InstalledPromotion>;
  if (records[key]) throw Error("Test fixture must not replace a real installed promotion");
  const record = { sourceName: package_.bundle.sourceName, sourceVersion: package_.bundle.sourceVersion, sourceDigest: package_.bundle.sourceDigest,
    packageDigest: package_.bundle.packageDigest, specDigest: package_.specDigest, rendererDigest: "a".repeat(64) };
  records[key] = record;
  try { await body(record); } finally { delete records[key]; }
}

test("export is read-only and contains exact portable source without website or author identity", async () => {
  const f = await fixture(), before = await f.t.run(ctx => ctx.db.get("blockDefinitions", f.first.id));
  const output = await f.author.query(exportPackage, f.args);
  const decoded = decodeBlockPromotion(output.packageJson);
  expect(decoded.bundle.sourceDigest).toBe(f.first.digest);
  expect(decoded.targetSpec.name).toBe("blocks/promotion-test");
  for (const value of [scope.deploymentOrigin, scope.instanceKey, f.ids.author, f.first.id]) expect(output.packageJson).not.toContain(value);
  expect(await f.t.run(ctx => ctx.db.get("blockDefinitions", f.first.id))).toEqual(before);
  await expect(f.author.query(exportPackage, { ...f.args, expectedDigest: "f".repeat(64) })).rejects.toThrow("exact definition");
  await expect(f.author.query(exportPackage, { ...f.args, expectedGeneration: 0 })).rejects.toThrow("changed");
});

test("export and confirmation enforce actor, capability, scope and session authority", async () => {
  const f = await fixture(), output = await f.author.query(exportPackage, f.args);
  const args = { ...f.args, expectedPackageDigest: output.packageDigest };
  for (const actor of [f.t, f.other]) {
    await expect(actor.query(exportPackage, f.args)).rejects.toThrow();
    await expect(actor.mutation(confirm, args)).rejects.toThrow();
  }
  for (const capability of ["blocks.promote", "blocks.compose", "post.read"]) {
    await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: capabilities.filter(value => value !== capability) }));
    await expect(f.author.query(exportPackage, f.args)).rejects.toThrow();
    await expect(f.author.mutation(confirm, args)).rejects.toThrow();
  }
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities }));
  for (const key of ["websiteKey", "instanceKey", "deploymentOrigin"] as const) {
    await f.t.run(ctx => ctx.db.patch("convexpress_siteIdentity", f.ids.site, { [key]: key === "deploymentOrigin" ? "https://foreign.convex.cloud" : "foreign" }));
    await expect(f.author.query(exportPackage, f.args)).rejects.toThrow("current website");
    await expect(f.author.mutation(confirm, args)).rejects.toThrow("current website");
    await f.t.run(ctx => ctx.db.patch("convexpress_siteIdentity", f.ids.site, { [key]: scope[key] }));
  }
  await f.t.run(ctx => ctx.db.patch("users", f.ids.author, { status: "inactive" }));
  await expect(f.author.query(exportPackage, f.args)).rejects.toThrow();
  await expect(f.author.mutation(confirm, args)).rejects.toThrow();
  expect((await f.t.run(ctx => ctx.db.get("blockDefinitions", f.first.id)))?.generation).toBe(1);
});

test("caller claims never replace installed source evidence or exact approval", async () => {
  const f = await fixture(), output = await f.author.query(exportPackage, f.args);
  const args = { ...f.args, expectedPackageDigest: output.packageDigest };
  await expect(f.author.mutation(confirm, args)).rejects.toThrow("Approve");
  await f.approve();args.expectedGeneration = 2;
  await expect(f.author.mutation(confirm, { ...args, expectedPackageDigest: "a".repeat(64) })).rejects.toThrow("package has changed");
  await expect(f.author.mutation(confirm, args)).rejects.toThrow("Install and deploy");
  await withInstalled(output.packageJson, async record => {
    for (const key of ["sourceName", "sourceVersion", "sourceDigest", "packageDigest", "specDigest"] as const) {
      const original = { ...record };
      Object.assign(record, { [key]: key === "sourceVersion" ? 8 : "wrong" });
      await expect(f.author.mutation(confirm, args)).rejects.toThrow("Install and deploy");
      Object.assign(record, original);
    }
    for (const capability of ["post.update", "post.publish"]) {
      await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: capabilities.filter(value => value !== capability) }));
      await expect(f.author.mutation(confirm, args)).rejects.toThrow();
    }
    await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities }));
  });
  expect((await f.t.run(ctx => ctx.db.get("blockDefinitions", f.first.id)))?.status).toBe("active");
});

test("promotion preserves exact pinned pages and approvals; only the identical confirmation can be retried", async () => {
  const f = await fixture(); await f.approve();
  const output = await f.author.query(exportPackage, { ...f.args, expectedGeneration: 2 });
  const snapshot = await f.author.run(async ctx => (await loadAuthoringComposedRegistry(ctx, tree)).snapshot);
  const before = await f.t.run(async ctx => ({ versions: await ctx.db.query("blockDefinitionVersions").collect(), approvals: await ctx.db.query("blockDefinitionApprovals").collect() }));
  const args = { ...f.args, expectedGeneration: 2, expectedPackageDigest: output.packageDigest };
  await withInstalled(output.packageJson, async () => {
    const result = await f.author.mutation(confirm, args);
    expect(result.changed).toBe(true);expect(result.generation).toBe(3);
    expect(await f.author.mutation(confirm, args)).toEqual({ ...result, changed: false });
    for (const field of ["targetName", "version", "expectedDigest", "expectedPackageDigest", "expectedGeneration"]) {
      await expect(f.author.mutation(confirm, { ...args, [field]: field === "version" || field === "expectedGeneration" ? 10 : "changed" })).rejects.toThrow("different reviewed operation");
    }
  });
  expect(await f.t.run(async ctx => ({ versions: await ctx.db.query("blockDefinitionVersions").collect(), approvals: await ctx.db.query("blockDefinitionApprovals").collect() }))).toEqual(before);
  expect(await f.author.run(async ctx => (await loadAuthoringComposedRegistry(ctx, tree)).snapshot)).toEqual(snapshot);
  expect(await f.t.run(async ctx => (await loadPublishedComposedRegistry(ctx, tree, snapshot)).snapshot)).toEqual(snapshot);
  await expect(f.author.mutation(save, { id: f.first.id, expectedGeneration: 3, definitionJson: JSON.stringify(definition(2)) })).rejects.toThrow();
  await expect(f.author.query(exportPackage, { ...f.args, expectedGeneration: 3 })).rejects.toThrow("already promoted");
  // Revocation remains possible after promotion and immediately removes public authority.
  await f.author.mutation(review, { id: f.first.id, version: 1, expectedGeneration: 3, expectedDigest: f.first.digest, enabled: false });
  await expect(f.t.run(ctx => loadPublishedComposedRegistry(ctx, tree, snapshot))).rejects.toThrow("not approved");
  expect((await f.t.run(ctx => ctx.db.get("blockDefinitions", f.first.id)))?.status).toBe("promoted");
});

test("an edit after export invalidates confirmation without rewriting versions", async () => {
  const f = await fixture(); await f.approve();
  const output = await f.author.query(exportPackage, { ...f.args, expectedGeneration: 2 });
  await f.author.mutation(save, { id: f.first.id, expectedGeneration: 2, definitionJson: JSON.stringify(definition(2)) });
  await withInstalled(output.packageJson, async () => {
    await expect(f.author.mutation(confirm, { ...f.args, expectedGeneration: 2, expectedPackageDigest: output.packageDigest })).rejects.toThrow("changed");
  });
  const head = await f.t.run(ctx => ctx.db.get("blockDefinitions", f.first.id));
  expect(head?.generation).toBe(3);expect(head?.lastVersion).toBe(2);expect(head?.status).not.toBe("promoted");
});

test("inspection reports exact installation and recovers confirmation without replaying or changing state", async () => {
  const f = await fixture(), inspect = ref<"query">("blockDefinitions/promotion:inspect");
  const output = await f.author.query(exportPackage, f.args);
  const args = { ...f.args, expectedPackageDigest: output.packageDigest };
  for (const actor of [f.t, f.other]) await expect(actor.query(inspect, args)).rejects.toThrow();
  expect((await f.author.query(inspect, args)).state).toBe("needs-approval");
  await f.approve();
  expect((await f.author.query(inspect, args)).state).toBe("conflict");
  args.expectedGeneration = 2;
  expect((await f.author.query(inspect, args)).state).toBe("not-installed");
  await withInstalled(output.packageJson, async () => {
    const before = await f.t.run(ctx => ctx.db.get("blockDefinitions", f.first.id));
    expect((await f.author.query(inspect, args)).state).toBe("ready");
    expect(await f.t.run(ctx => ctx.db.get("blockDefinitions", f.first.id))).toEqual(before);
    await f.author.mutation(confirm, args);
    expect(await f.author.query(inspect, args)).toEqual({ state: "promoted", generation: 3, targetName: args.targetName });
    expect((await f.author.query(inspect, { ...args, expectedPackageDigest: "f".repeat(64) })).state).toBe("conflict");
    await f.author.mutation(review, { id: f.first.id, version: 1, expectedGeneration: 3, expectedDigest: f.first.digest, enabled: false });
    expect((await f.author.query(inspect, args)).state).toBe("promoted");
    await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: capabilities.filter(value => value !== "blocks.promote") }));
    await expect(f.author.query(inspect, args)).rejects.toThrow();
  });
});


test("resource-backed export preserves portable selectors, treatment and slot through confirmation", async () => {
  const f = await fixture(resourceComposition);
  await f.approve();
  const args = { ...f.args, expectedGeneration: 2 };
  const before = await f.t.run(async ctx => ({ head: await ctx.db.get("blockDefinitions", f.first.id), versions: await ctx.db.query("blockDefinitionVersions").collect(), approvals: await ctx.db.query("blockDefinitionApprovals").collect() }));
  const output = await f.author.query(exportPackage, args);
  const promotion = decodeBlockPromotion(output.packageJson);
  expect(promotion.definition.spec.data).toEqual(resourceComposition.spec.data);
  expect(promotion.definition.packTreatments).toEqual(resourceComposition.packTreatments);
  expect(promotion.definition.spec.supports.children).toBe(true);
  for (const field of ["page", "media"]) expect(promotion.definition.spec.fields.find(item => item.id === field)?.default).toBe("");
  expect(output.packageJson).not.toContain("promotion-resource");
  expect(await f.t.run(ctx => ctx.db.get("blockDefinitions", f.first.id))).toEqual(before.head);
  await withInstalled(output.packageJson, async () => {
    const reviewed = { ...args, expectedPackageDigest: output.packageDigest };
    expect((await f.author.mutation(confirm, reviewed)).changed).toBe(true);
    expect((await f.author.query(ref<"query">("blockDefinitions/promotion:inspect"), reviewed)).state).toBe("promoted");
  });
  expect(await f.t.run(ctx => ctx.db.query("blockDefinitionVersions").collect())).toEqual(before.versions);
  expect(await f.t.run(ctx => ctx.db.query("blockDefinitionApprovals").collect())).toEqual(before.approvals);
});
