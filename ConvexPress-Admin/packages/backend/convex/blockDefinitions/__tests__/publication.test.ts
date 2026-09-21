import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
import { loadAuthoringComposedRegistry } from "../registry";
import { loadPublishedComposedRegistry } from "../publishedRegistry";
import { encodeComposedDefinition } from "../../canonicalDocuments/foundation/composedDefinitions";
import { RequestReadLedger } from "../../helpers/requestReadLedger";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/blockDefinitions/drafts.ts": () => import("../drafts"),
  "./convex/blockDefinitions/publication.ts": () => import("../publication"),
};
const create = ref<"mutation">("blockDefinitions/drafts:create"), save = ref<"mutation">("blockDefinitions/drafts:save");
const review = ref<"mutation">("blockDefinitions/publication:setVersionState"), get = ref<"query">("blockDefinitions/drafts:get");
const scope = { websiteKey: "approval-test", instanceKey: "staging", deploymentOrigin: "https://approval-test.convex.cloud" };
const capabilities = ["blocks.compose", "post.create", "post.read", "post.update", "post.publish", "post.restore"];
function definition(version = 1) {
  return {
    spec: { name: "composed/approved", title: `Version ${version}`, description: "Publication fixture", category: "text", role: "content", version,
      keywords: [], ai: { useFor: "Heading", avoid: "Navigation" }, fields: [{ id: "title", type: "text", default: `Heading ${version}`, max: 80 }],
      supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{title}", examples: [{}] },
    composition: { version: 1, root: { el: "Heading", bind: "attrs.title" } },
  };
}
const tree = (versions: number[]) => versions.map(version => ({ id: `version-${version}`, name: "composed/approved", version, attrs: {} }));
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Publisher", slug: "publisher", description: "Fixture", level: 10, type: "internal", isDefault: false, isProtected: false, capabilities, pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const userData = { authSource: "local" as const, emailVerified: true, status: "active" as const, roleId: role, createdAt: 1, updatedAt: 1 };
    const author = await ctx.db.insert("users", { ...userData, email: "publisher@example.invalid" });
    const other = await ctx.db.insert("users", { ...userData, email: "other@example.invalid" });
    const site = await ctx.db.insert("convexpress_siteIdentity", { ...scope, identityKey: "site-identity", environmentKind: "staging", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://approval-test.convex.site", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    return { author, other, role, site };
  });
  const as = (id: string) => t.withIdentity({ subject: id, tokenIdentifier: `https://convexpress-admin.local|${id}` });
  const author = as(ids.author), other = as(ids.other);
  const first = await author.mutation(create, { definitionJson: JSON.stringify(definition()) });
  const snapshot = (versions = [1]) => author.run(async ctx => (await loadAuthoringComposedRegistry(ctx, tree(versions))).snapshot);
  const published = async (versions = [1]) => { const saved = await snapshot(versions); return t.run(async ctx => (await loadPublishedComposedRegistry(ctx, tree(versions), saved)).snapshot); };
  const args = (version: number, expectedGeneration: number, enabled = true) => ({ id: first.id, version, expectedGeneration, expectedDigest: encodeComposedDefinition(definition(version)).digest, enabled });
  return { t, ids, author, other, first, snapshot, published, args };
}

test("exact approvals survive new drafts and newer approvals while revocation affects only its selected version", async () => {
  const f = await fixture();
  const original = await f.author.query(get, { id: f.first.id }); expect(original.versionStatus).toBe("draft");
  await expect(f.published()).rejects.toThrow("not approved");
  const first = await f.author.mutation(review, f.args(1, 1)); expect(first.generation).toBe(2); expect(first.activeVersion).toBe(1);
  expect((await f.published()).definitions[0].digest).toBe(f.first.digest);
  await f.author.mutation(save, { id: f.first.id, expectedGeneration: 2, definitionJson: JSON.stringify(definition(2)) });
  expect((await f.author.query(get, { id: f.first.id })).versionStatus).toBe("draft");
  expect((await f.author.query(get, { id: f.first.id, version: 1 })).versionStatus).toBe("active");
  await expect(f.published([2])).rejects.toThrow("not approved");
  expect((await f.published()).definitions[0].version).toBe(1);
  await f.author.mutation(review, f.args(2, 3));
  expect((await f.published([1, 2])).definitions.map(value => value.version)).toEqual([1, 2]);
  const revoked = await f.author.mutation(review, f.args(2, 4, false)); expect(revoked.activeVersion).toBe(1);
  await expect(f.published([2])).rejects.toThrow("not approved"); expect((await f.published()).definitions).toHaveLength(1);
  const history = await f.author.query(ref("blockDefinitions/drafts:history"), { id: f.first.id });
  expect(history.versions.map((row: { version: number; versionStatus: string }) => [row.version, row.versionStatus])).toEqual([[2, "revoked"], [1, "active"]]);
  const none = await f.author.mutation(review, f.args(1, 5, false)); expect(none.activeVersion).toBeNull();
  await expect(f.published()).rejects.toThrow("not approved");
  await f.author.mutation(review, f.args(1, 6));
  const reread = await f.author.query(get, { id: f.first.id, version: 1 });
  expect(reread.definitionJson).toBe(original.definitionJson); expect(reread.digest).toBe(original.digest);
  await f.author.mutation(ref("blockDefinitions/drafts:restore"), { id: f.first.id, version: 1, expectedGeneration: 7, expectedDigest: original.digest });
  expect((await f.author.query(get, { id: f.first.id })).versionStatus).toBe("draft");
  await expect(f.published([3])).rejects.toThrow("not approved");
  expect((await f.published()).definitions[0].version).toBe(1);
});

test("site editors can reuse exact approved versions without gaining access to drafts or definition editing", async () => {
  const f = await fixture();
  const reuse = (versions = [1]) => f.other.run(async ctx => (await loadAuthoringComposedRegistry(ctx, tree(versions))).snapshot);
  await expect(reuse()).rejects.toThrow("not available for reuse");
  await f.author.mutation(review, f.args(1, 1));
  expect((await reuse()).definitions[0].digest).toBe(f.first.digest);
  await expect(f.other.mutation(save, { id: f.first.id, expectedGeneration: 2, definitionJson: JSON.stringify(definition(2)) })).rejects.toThrow("unavailable");
  await expect(f.other.query(get, { id: f.first.id })).rejects.toThrow("unavailable");
  await expect(f.other.mutation(review, f.args(1, 2, false))).rejects.toThrow("unavailable");
  await f.author.mutation(save, { id: f.first.id, expectedGeneration: 2, definitionJson: JSON.stringify(definition(2)) });
  expect((await reuse()).definitions[0].version).toBe(1);
  await expect(reuse([2])).rejects.toThrow("not available for reuse");
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: capabilities.filter(value => value !== "post.update") }));
  await expect(reuse()).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities }));
  await f.author.mutation(review, f.args(1, 3, false));
  await expect(reuse()).rejects.toThrow("not available for reuse");
});

test("approval requires exact generation, reviewed digest, publisher capability, ownership and current installation", async () => {
  const f = await fixture(), args = f.args(1, 1);
  for (const actor of [f.t, f.other]) await expect(actor.mutation(review, args)).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: capabilities.filter(value => value !== "post.publish") }));
  await expect(f.author.mutation(review, args)).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities }));
  await f.t.run(ctx => ctx.db.patch("users", f.ids.author, { status: "inactive" }));
  await expect(f.author.mutation(review, args)).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("users", f.ids.author, { status: "active" }));
  await expect(f.author.mutation(review, { ...args, expectedDigest: "0".repeat(64) })).rejects.toThrow("exact definition version");
  for (const key of ["websiteKey", "instanceKey", "deploymentOrigin"] as const) {
    await f.t.run(ctx => ctx.db.patch("convexpress_siteIdentity", f.ids.site, { [key]: key === "deploymentOrigin" ? "https://foreign.convex.cloud" : "foreign" }));
    await expect(f.author.mutation(review, args)).rejects.toThrow("current website");
    await f.t.run(ctx => ctx.db.patch("convexpress_siteIdentity", f.ids.site, { [key]: scope[key] }));
  }
  expect(await f.t.run(ctx => ctx.db.query("blockDefinitionApprovals").withIndex("by_definition_version", q => q.eq("definitionId", f.first.id)).take(4))).toEqual([]);
  await f.author.mutation(review, args);
  await expect(f.author.mutation(review, args)).rejects.toThrow("changed");
  const noOp = await f.author.mutation(review, { ...args, expectedGeneration: 2 }); expect(noOp.changed).toBe(false); expect(noOp.generation).toBe(2);
});

test("public registry checks immutable authority rather than a head pointer or forged stored snapshot", async () => {
  const f = await fixture(), saved = await f.snapshot();
  // A legacy/imported head pointer alone is never an approval.
  await f.t.run(ctx => ctx.db.patch("blockDefinitions", f.first.id, { status: "active", activeVersion: 1 }));
  await expect(f.published()).rejects.toThrow("not approved");
  await f.author.mutation(review, f.args(1, 1));
  const altered = definition(); altered.spec.title = "Substituted";
  const encoded = encodeComposedDefinition(altered), forged = { ...saved, definitions: [{ ...saved.definitions[0], digest: encoded.digest, definitionJson: encoded.json }] };
  await expect(f.t.run(async ctx => (await loadPublishedComposedRegistry(ctx, tree([1]), forged)).snapshot)).rejects.toThrow("immutable site version");
  await expect(f.t.run(async ctx => (await loadPublishedComposedRegistry(ctx, [], saved)).snapshot)).rejects.toThrow("exactly the visible blocks");
  for (const key of ["websiteKey", "instanceKey", "deploymentOrigin"] as const) {
    const foreign = { ...saved, scope: { ...scope, [key]: key === "deploymentOrigin" ? "https://foreign.convex.cloud" : "foreign" } };
    await expect(f.t.run(async ctx => (await loadPublishedComposedRegistry(ctx, tree([1]), foreign)).snapshot)).rejects.toThrow("another site installation");
  }
  const approval = await f.t.run(ctx => ctx.db.query("blockDefinitionApprovals").withIndex("by_definition_version", q => q.eq("definitionId", f.first.id).eq("version", 1)).unique());
  await f.t.run(ctx => ctx.db.patch("blockDefinitionApprovals", approval!._id, { digest: "0".repeat(64) }));
  await expect(f.published()).rejects.toThrow("immutable version");
  await expect(f.author.mutation(review, f.args(1, 2, false))).rejects.toThrow("immutable definition version");
});

test("failed fallback validation rolls back revocation and public reads share a bounded deduplicated ledger", async () => {
  const f = await fixture(); await f.author.mutation(review, f.args(1, 1));
  await f.author.mutation(save, { id: f.first.id, expectedGeneration: 2, definitionJson: JSON.stringify(definition(2)) });
  await f.author.mutation(review, f.args(2, 3));
  const saved = await f.snapshot([1, 2]);
  const reads = await f.t.run(async ctx => { const budget = new RequestReadLedger(); await loadPublishedComposedRegistry(ctx, tree([1, 2]), saved, budget); return budget.queries; });
  expect(reads).toBe(6); // one installation/head, two immutable versions/approvals
  await expect(f.t.run(async ctx => (await loadPublishedComposedRegistry(ctx, tree([1, 2]), saved, new RequestReadLedger({ queries: reads - 1, documents: 2048, bytes: 8 * 1024 * 1024, documentBytes: 512 * 1024 }))).snapshot)).rejects.toThrow("safe read budget");
  const before = await f.author.query(get, { id: f.first.id, version: 2 });
  const one = await f.t.run(ctx => ctx.db.query("blockDefinitionApprovals").withIndex("by_definition_version", q => q.eq("definitionId", f.first.id).eq("version", 1)).unique());
  await f.t.run(ctx => ctx.db.patch("blockDefinitionApprovals", one!._id, { digest: "0".repeat(64) }));
  await expect(f.author.mutation(review, f.args(2, 4, false))).rejects.toThrow("remaining approval");
  expect(await f.author.query(get, { id: f.first.id, version: 2 })).toEqual(before);
});
