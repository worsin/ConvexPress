import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
import { encodeComposedDefinition } from "../../canonicalDocuments/foundation/composedDefinitions";
import { loadAuthoringComposedRegistry } from "../registry";
import { isMembershipAuthCapability } from "../../helpers/permissions";

const modules = {
  "./convex/blockDefinitions/drafts.ts": () => import("../drafts"),
  "./convex/blockDefinitions/management.ts": () => import("../management"),
  "./convex/blockDefinitions/publication.ts": () => import("../publication"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
};
const create = ref<"mutation">("blockDefinitions/drafts:create"), save = ref<"mutation">("blockDefinitions/drafts:save");
const restore = ref<"mutation">("blockDefinitions/drafts:restore");
const get = ref<"query">("blockDefinitions/drafts:get"), history = ref<"query">("blockDefinitions/drafts:history");
function definition(version = 1, title = "Authored heading") {
  return {
    spec: { name: "composed/heading", title, description: "Custom heading", category: "text", role: "content", version,
      keywords: [], ai: { useFor: "A heading", avoid: "Navigation" }, fields: [{ id: "title", type: "text", default: "Hello", max: 80 }],
      supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{title}", examples: [{}] },
    composition: { version: 1, root: { el: "Heading", bind: "attrs.title" } },
  };
}
const json = (version = 1, title?: string) => JSON.stringify(definition(version, title));
const inventory = ref<"query">("blockDefinitions/management:list");
const review = ref<"mutation">("blockDefinitions/publication:setVersionState");
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Author", slug: "author", description: "Fixture", level: 10, type: "internal", isDefault: false, isProtected: false, capabilities: ["blocks.compose", "post.create", "post.read", "post.update"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const userData = { authSource: "local" as const, emailVerified: true, status: "active" as const, roleId: role, createdAt: 1, updatedAt: 1 };
    const author = await ctx.db.insert("users", { ...userData, email: "author@example.invalid" });
    const other = await ctx.db.insert("users", { ...userData, email: "other@example.invalid" });
    const customer = await ctx.db.insert("users", { authSource: "clerk", clerkUserId: "definition-customer", email: "customer@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const site = await ctx.db.insert("convexpress_siteIdentity", { identityKey: "site-identity", websiteKey: "definition-test", instanceKey: "staging", environmentKind: "staging", deploymentOrigin: "https://definitions.convex.cloud", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://definitions.convex.site", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    return { author, other, customer, role, site };
  });
  const identity = (id: string) => t.withIdentity({ subject: id, tokenIdentifier: `https://convexpress-admin.local|${id}` });
  return { t, ids, author: identity(ids.author), other: identity(ids.other), customer: t.withIdentity({ subject: "definition-customer", tokenIdentifier: "https://clerk.example|definition-customer" }) };
}

test("draft versions are immutable, exact-version reads survive edits and active pointers stay pinned", async () => {
  const { t, author } = await fixture();
  const first = await author.mutation(create, { definitionJson: json() });
  const original = await author.query(get, { id: first.id, version: 1 });
  expect(original.status).toBe("draft"); expect(original.activeVersion).toBeNull();
  // Model a previously reviewed activation; draft saves must not publish v2.
  await t.run(ctx => ctx.db.patch("blockDefinitions", first.id, { status: "active", activeVersion: 1 }));
  const second = await author.mutation(save, { id: first.id, expectedGeneration: 1, definitionJson: json(2, "Changed") });
  expect(second.version).toBe(2); expect(second.generation).toBe(2);
  const pinned = await author.query(get, { id: first.id, version: 1 });
  expect(pinned.definitionJson).toBe(original.definitionJson); expect(pinned.digest).toBe(original.digest);
  expect(pinned.activeVersion).toBe(1);
  expect(JSON.parse((await author.query(get, { id: first.id })).definitionJson).spec.title).toBe("Changed");
  const rows = await t.run(ctx => ctx.db.query("blockDefinitionVersions").withIndex("by_definition_version", q => q.eq("definitionId", first.id)).take(3));
  expect(rows).toHaveLength(2);
  expect(rows[0].digest).toBe(encodeComposedDefinition(definition()).digest);
});

test("compose is independent of post permissions and cannot be supplied by membership", async () => {
  const { t, ids, author } = await fixture();
  const made = await author.mutation(create, { definitionJson: json() });
  await t.run(ctx => ctx.db.patch("roles", ids.role, { capabilities: ["post.create", "post.read", "post.update", "post.publish", "post.restore"] }));
  for (const cap of ["blocks.compose", "blocks.ai", "blocks.promote"]) expect(isMembershipAuthCapability(cap)).toBe(false);
  await expect(author.mutation(create, { definitionJson: json() })).rejects.toThrow();
  await expect(author.query(get, { id: made.id })).rejects.toThrow();
  await expect(author.query(history, { id: made.id })).rejects.toThrow();
  await expect(author.query(inventory, { paginationOpts: { numItems: 20, cursor: null } })).rejects.toThrow();
  await expect(author.mutation(save, { id: made.id, expectedGeneration: 1, definitionJson: json(2) })).rejects.toThrow();
  await expect(author.mutation(restore, { id: made.id, expectedGeneration: 1, version: 1, expectedDigest: made.digest })).rejects.toThrow();
  await expect(author.mutation(review, { id: made.id, expectedGeneration: 1, version: 1, expectedDigest: made.digest, enabled: true })).rejects.toThrow();
  expect((await t.run(ctx => ctx.db.get("blockDefinitions", made.id)))?.generation).toBe(1);
});

test("management inventory is bounded, scoped and owner-filtered before pagination", async () => {
  const { t, ids, author, other } = await fixture();
  const make = (name: string) => JSON.stringify({ ...definition(), spec: { ...definition().spec, name } });
  for (let i = 0; i < 23; i++) await author.mutation(create, { definitionJson: make(`composed/a${String(i).padStart(2, "0")}`) });
  const foreignAuthor = await other.mutation(create, { definitionJson: make("composed/other") });
  const first = await author.query(inventory, { paginationOpts: { numItems: 20, cursor: null } });
  const second = await author.query(inventory, { paginationOpts: { numItems: 20, cursor: first.continueCursor } });
  expect(first.page).toHaveLength(20); expect(first.isDone).toBe(false); expect(second.page).toHaveLength(3); expect(second.isDone).toBe(true);
  expect(new Set([...first.page, ...second.page].map((item: { id: string }) => item.id)).size).toBe(23);
  expect(JSON.stringify(first)).not.toContain("definitionJson");
  expect((await other.query(inventory, { paginationOpts: { numItems: 20, cursor: null } })).page.map((item: { id: string }) => item.id)).toEqual([foreignAuthor.id]);
  for (const count of [0, 21, 1.5]) await expect(author.query(inventory, { paginationOpts: { numItems: count, cursor: null } })).rejects.toThrow();
  await t.run(ctx => ctx.db.patch("roles", ids.role, { level: 80 }));
  const elevated = await author.query(inventory, { paginationOpts: { numItems: 20, cursor: null } });
  expect((await author.query(inventory, { paginationOpts: { numItems: 20, cursor: elevated.continueCursor } })).page).toHaveLength(4);
  for (const key of ["websiteKey", "instanceKey", "deploymentOrigin"] as const) {
    const original = await t.run(ctx => ctx.db.get("convexpress_siteIdentity", ids.site));
    await t.run(ctx => ctx.db.patch("convexpress_siteIdentity", ids.site, { [key]: key === "deploymentOrigin" ? "https://foreign.convex.cloud" : "foreign" }));
    expect((await author.query(inventory, { paginationOpts: { numItems: 20, cursor: null } })).page).toEqual([]);
    await t.run(ctx => ctx.db.patch("convexpress_siteIdentity", ids.site, { [key]: original![key] }));
  }
});

test("capability revocation, author ownership and full installation identity guard draft access", async () => {
  const { t, ids, author, other, customer } = await fixture();
  for (const actor of [t, customer]) await expect(actor.mutation(create, { definitionJson: json() })).rejects.toThrow();
  const { id } = await author.mutation(create, { definitionJson: json() });
  for (const actor of [t, customer, other]) {
    await expect(actor.query(get, { id })).rejects.toThrow();
    await expect(actor.query(history, { id })).rejects.toThrow();
    await expect(actor.mutation(save, { id, expectedGeneration: 1, definitionJson: json(2) })).rejects.toThrow();
  }
  for (const [key, original] of [["websiteKey", "definition-test"], ["instanceKey", "staging"], ["deploymentOrigin", "https://definitions.convex.cloud"]] as const) {
    await t.run(ctx => ctx.db.patch("convexpress_siteIdentity", ids.site, { [key]: key === "deploymentOrigin" ? "https://foreign.convex.cloud" : "foreign" }));
    await expect(author.query(get, { id })).rejects.toThrow();
    await expect(author.query(history, { id })).rejects.toThrow();
    await expect(author.mutation(save, { id, expectedGeneration: 1, definitionJson: json(2) })).rejects.toThrow();
    await t.run(ctx => ctx.db.patch("convexpress_siteIdentity", ids.site, { [key]: original }));
  }
  await t.run(ctx => ctx.db.patch("roles", ids.role, { capabilities: [] }));
  await expect(author.query(get, { id })).rejects.toThrow();
  await expect(author.mutation(save, { id, expectedGeneration: 1, definitionJson: json(2) })).rejects.toThrow();
});

test("duplicate names, stale writes, skipped versions and identity changes do not alter stored content", async () => {
  const { t, author } = await fixture();
  const { id } = await author.mutation(create, { definitionJson: json() });
  await expect(author.mutation(create, { definitionJson: json() })).rejects.toThrow();
  for (const value of [definition(1), definition(3), { ...definition(2), spec: { ...definition(2).spec, name: "composed/renamed" } }, { ...definition(2), composition: { version: 1, root: { el: "script" } } }]) {
    await expect(author.mutation(save, { id, expectedGeneration: 1, definitionJson: JSON.stringify(value) })).rejects.toThrow();
  }
  await author.mutation(save, { id, expectedGeneration: 1, definitionJson: json(2) });
  await expect(author.mutation(save, { id, expectedGeneration: 1, definitionJson: json(3) })).rejects.toThrow();
  expect((await author.query(get, { id })).version).toBe(2);
  expect(await t.run(ctx => ctx.db.query("blockDefinitionVersions").withIndex("by_definition_version", q => q.eq("definitionId", id)).take(10))).toHaveLength(2);
});

test("bounded history paginates without duplicates and corrupt or promoted content cannot be edited", async () => {
  const { t, author } = await fixture();
  const { id } = await author.mutation(create, { definitionJson: json() });
  for (let version = 2; version <= 7; version++) await author.mutation(save, { id, expectedGeneration: version - 1, definitionJson: json(version) });
  const first = await author.query(history, { id });
  expect(first.versions.map((v: { version: number }) => v.version)).toEqual([7, 6, 5, 4]);
  const second = await author.query(history, { id, beforeVersion: first.nextBeforeVersion });
  expect(second.versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]); expect(second.nextBeforeVersion).toBeNull();
  await expect(author.query(history, { id, beforeVersion: 10 })).rejects.toThrow();
  await t.run(ctx => ctx.db.patch("blockDefinitions", id, { status: "promoted", promotedTo: "library/heading" }));
  await expect(author.mutation(save, { id, expectedGeneration: 7, definitionJson: json(8) })).rejects.toThrow();
  await t.run(async ctx => {
    await ctx.db.patch("blockDefinitions", id, { status: "draft" });
    const row = await ctx.db.query("blockDefinitionVersions").withIndex("by_definition_version", q => q.eq("definitionId", id).eq("version", 7)).unique();
    await ctx.db.patch("blockDefinitionVersions", row!._id, { definitionJson: json(7, "Tampered") });
  });
  await expect(author.query(get, { id })).rejects.toThrow("integrity");
  await expect(author.mutation(save, { id, expectedGeneration: 7, definitionJson: json(8) })).rejects.toThrow("integrity");
  expect((await author.query(get, { id, version: 1 })).version).toBe(1);
});

test("reviewed recovery appends a version and repairs a damaged draft without rewriting saved definitions", async () => {
  const { t, ids, author } = await fixture();
  const first = await author.mutation(create, { definitionJson: json() });
  await author.mutation(save, { id: first.id, expectedGeneration: 1, definitionJson: json(2, "Changed") });
  const args = { id: first.id, expectedGeneration: 2, version: 1, expectedDigest: first.digest };
  await expect(author.mutation(restore, args)).rejects.toThrow();
  await t.run(async ctx => {
    await ctx.db.patch("roles", ids.role, { capabilities: ["blocks.compose", "post.create", "post.read", "post.update", "post.restore"] });
    const row = await ctx.db.query("blockDefinitionVersions").withIndex("by_definition_version", q => q.eq("definitionId", first.id).eq("version", 2)).unique();
    await ctx.db.patch("blockDefinitionVersions", row!._id, { definitionJson: "damaged" });
  });
  await expect(author.mutation(restore, { ...args, expectedDigest: "a".repeat(64) })).rejects.toThrow();
  const recovered = await author.mutation(restore, args);
  expect(recovered.version).toBe(3);
  const result = await author.query(get, { id: first.id });
  expect(result.activeVersion).toBeNull();
  expect(JSON.parse(result.definitionJson)).toEqual(definition(3));
  expect((await author.query(get, { id: first.id, version: 1 })).digest).toBe(first.digest);
  await expect(author.query(get, { id: first.id, version: 2 })).rejects.toThrow();
  await expect(author.mutation(restore, args)).rejects.toThrow();
});

test("authoring registry loads exact stored versions and never trusts client definitions or a newer head", async () => {
  const { t, ids, author, other, customer } = await fixture();
  const first = await author.mutation(create, { definitionJson: json() });
  const updated = definition(2);
  updated.spec.fields[0].default = "Changed default";
  await author.mutation(save, { id: first.id, expectedGeneration: 1, definitionJson: JSON.stringify(updated) });
  const tree = [1, 2].map(version => ({ id: `block-${version}`, name: "composed/heading", version, attrs: {} }));
  const result = await author.run(async ctx => {
    const loaded = await loadAuthoringComposedRegistry(ctx, tree);
    return { blocks: loaded.blocks, snapshot: loaded.snapshot };
  });
  expect(result.blocks.map(block => block.attrs.title)).toEqual(["Hello", "Changed default"]);
  expect(result.snapshot.definitions.map(item => item.version)).toEqual([1, 2]);
  for (const actor of [t, customer, other]) await expect(actor.run(ctx => loadAuthoringComposedRegistry(ctx, tree))).rejects.toThrow();
  await expect(author.run(ctx => loadAuthoringComposedRegistry(ctx, [{ ...tree[0], definitionJson: json() }]))).rejects.toThrow();
  await expect(author.run(ctx => loadAuthoringComposedRegistry(ctx, [{ ...tree[0], version: 3 }]))).rejects.toThrow();
  await t.run(ctx => ctx.db.patch("convexpress_siteIdentity", ids.site, { websiteKey: "foreign" }));
  await expect(author.run(ctx => loadAuthoringComposedRegistry(ctx, tree))).rejects.toThrow();
  await t.run(async ctx => { await ctx.db.patch("convexpress_siteIdentity", ids.site, { websiteKey: "definition-test" }); await ctx.db.patch("roles", ids.role, { capabilities: [] }); });
  await expect(author.run(ctx => loadAuthoringComposedRegistry(ctx, tree))).rejects.toThrow();
});
