import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
import { loadAuthoringComposedRegistry } from "../../blockDefinitions/registry";
import { createPublicSearchSourceReader } from "../publicSource";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { readSearch } from "../../canonicalDocuments/search";

const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/blockDefinitions/drafts.ts": () => import("../../blockDefinitions/drafts"),
  "./convex/blockDefinitions/publication.ts": () => import("../../blockDefinitions/publication"),
  "./convex/search/internals.ts": () => import("../internals"),
  "./convex/search/queries.ts": () => import("../queries"),
  "./convex/search/candidates.ts": () => import("../candidates"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
const scope = { websiteKey: "composed-search", instanceKey: "staging" };
const paragraph = (id: string, text: string) => ({ id, name: "core/paragraph", version: 2,
  attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } } });
const definition = {
  spec: { name: "composed/search-copy", title: "Search copy", description: "Conditional authored prose", category: "text", role: "content", version: 1,
    keywords: [], ai: { useFor: "Editorial copy", avoid: "Navigation" },
    fields: [{ id: "heading", type: "text", default: "Orchidheading", max: 80 },
      { id: "alternative", type: "text", default: "Hiddenalternative", max: 80 },
      { id: "privateSetting", type: "text", default: "Neverindexsetting", max: 80 },
      { id: "showAlternative", type: "boolean", default: false }],
    searchText: [["heading"], ["alternative"]],
    supports: { children: true, styles: false, layout: [], anchor: true, visibility: false },
    data: null, preview: "{heading}", examples: [{}] },
  composition: { version: 1, root: { el: "Stack", children: [
    { el: "Heading", bind: "attrs.heading" }, { el: "Text", if: "attrs.showAlternative", bind: "attrs.alternative" },
    { el: "Slot", props: { name: "children" } },
  ] } },
  packTreatments: { journal: { version: 1, root: { el: "Stack", children: [
    { el: "Heading", bind: "attrs.alternative" }, { el: "Slot", props: { name: "children" } },
  ] } } },
};
async function fixture(customDefinition: unknown = definition) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Publisher", slug: "publisher", description: "Fixture", level: 10, type: "internal", isDefault: false, isProtected: false,
      capabilities: ["blocks.compose", "post.create", "post.read", "post.update", "post.publish"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { authSource: "local", email: "composed-search@example.invalid", emailVerified: true, status: "active", roleId: role, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("convexpress_siteIdentity", { ...scope, identityKey: "site-identity", environmentKind: "staging", deploymentOrigin: "https://composed-search.convex.cloud", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://composed-search.convex.site", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    const plugins = await ctx.db.insert("settings", { section: "plugins", values: { membershipEnabled: true }, updatedAt: 1, updatedBy: user });
    const appearance = await ctx.db.insert("settings", { section: "appearance.template", values: { active: "core", overrides: {}, variants: {}, settings: {} }, legacyAppearanceMigration: { version: 2, migratedAt: 1 }, updatedAt: 1, updatedBy: user });
    const post = await ctx.db.insert("posts", { type: "page", title: "An editorial page", slug: "editorial", status: "publish", visibility: "public", authorId: user, commentStatus: "closed", blocksVersion: 2, createdAt: 1, updatedAt: 1 });
    return { user, plugins, appearance, post };
  });
  const author = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  const draft = await author.mutation(ref<"mutation">("blockDefinitions/drafts:create"), { definitionJson: JSON.stringify(customDefinition) });
  const tree = [{ id: "custom", name: "composed/search-copy", version: 1, attrs: {}, children: [paragraph("child", "Childorchid")] }];
  const loaded = await author.run(async ctx => { const value = await loadAuthoringComposedRegistry(ctx, tree); return { blocks: value.blocks, snapshot: value.snapshot }; });
  await t.run(ctx => ctx.db.patch("posts", ids.post, { blocks: loaded.blocks, composedDefinitions: loaded.snapshot }));
  const reindex = () => t.mutation(ref<"mutation">("search/internals:onContentChanged"), { contentType: "page", contentId: ids.post, action: "upsert" });
  const approve = (enabled: boolean, expectedGeneration: number) => author.mutation(ref<"mutation">("blockDefinitions/publication:setVersionState"), { id: draft.id, version: 1, expectedDigest: draft.digest, expectedGeneration, enabled });
  const search = (query: string) => t.run(ctx => readSearch(ctx, { query }, scope, "host"));
  const source = () => t.run(ctx => createPublicSearchSourceReader(ctx)({ contentType: "page", contentId: ids.post }));
  return { t, ids, author, draft, tree: loaded.blocks, approve, reindex, search, source };
}

test("approved custom prose and slotted children are searchable, while hidden alternatives and settings are not", async () => {
  const f = await fixture(); await f.reindex();
  expect((await f.search("Orchidheading")).items).toEqual([]);
  await f.approve(true, 1);
  // The saved candidate corpus already includes declared copy; approval needs no page edit.
  expect((await f.search("Orchidheading")).items.map(row => row.id)).toEqual([f.ids.post]);
  expect((await f.search("Childorchid")).items.map(row => row.id)).toEqual([f.ids.post]);
  expect((await f.search("Hiddenalternative")).items).toEqual([]);
  expect((await f.search("Neverindexsetting")).items).toEqual([]);
  expect((await f.source())?.content).toBe("Orchidheading Childorchid");
  await f.approve(false, 2);
  expect((await f.search("Orchidheading")).items).toEqual([]);
  expect((await f.search("Childorchid")).items).toEqual([]);
});

test("current pack and authored conditions govern stale custom candidates without reindexing", async () => {
  const f = await fixture(); await f.approve(true, 1); await f.reindex();
  await f.t.run(ctx => ctx.db.patch("settings", f.ids.appearance, { values: { active: "journal", overrides: {}, variants: {}, settings: {} } }));
  expect((await f.search("Orchidheading")).items).toEqual([]);
  expect((await f.search("Hiddenalternative")).items.map(row => row.id)).toEqual([f.ids.post]);
  await f.t.run(async ctx => {
    await ctx.db.patch("settings", f.ids.appearance, { values: { active: "core", overrides: {}, variants: {}, settings: {} } });
    await ctx.db.patch("posts", f.ids.post, { blocks: [{ ...f.tree[0], attrs: { ...f.tree[0].attrs, showAlternative: true } }] });
  });
  expect((await f.search("Hiddenalternative")).items.map(row => row.id)).toEqual([f.ids.post]);
});

test("denied custom ancestors prune declared copy and slotted children before approval reads", async () => {
  const f = await fixture(); await f.approve(true, 1); await f.reindex();
  await f.t.run(ctx => ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: "custom", ruleMode: "allow_only", planIds: [], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 }));
  await f.approve(false, 2);
  expect((await f.source())?.content).toBe("");
  expect((await f.search("Childorchid")).items).toEqual([]);
});


test("custom data is current and authorized without resolving unrelated nested search blocks", async () => {
  const dynamic = structuredClone(definition) as any;
  dynamic.spec.fields.push({ id: "page", type: "reference", of: "page", allowEmpty: true, default: "" });
  dynamic.spec.data = { resolver: "content.page", args: { page: "attrs.page" } };
  dynamic.composition.root.children.splice(1, 0, { el: "Text", bind: "data.page.title" });
  const f = await fixture(dynamic);
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { blocks: [{ ...f.tree[0], attrs: { ...f.tree[0].attrs, page: f.ids.post },
    children: [...f.tree[0].children!, { id: "nested-search", name: "core/search-results", version: 1, attrs: {} }] }] }));
  await f.approve(true, 1); await f.reindex();
  expect((await f.source())?.content).toBe("Orchidheading An editorial page Childorchid");
  expect((await f.search("Orchidheading")).items.map(row => row.id)).toEqual([f.ids.post]);
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { title: "Current title" }));
  expect((await f.source())?.content).toContain("Current title");
});

test("custom media withdrawal and definition integrity fail closed; shared read exhaustion propagates", async () => {
  const mediaDefinition = structuredClone(definition) as any;
  mediaDefinition.spec.fields.push({ id: "photo", type: "media", storage: "id" });
  const f = await fixture(mediaDefinition);
  const media = await f.t.run(ctx => ctx.db.insert("media", { fileName: "fixture.png", slug: "fixture", mediaType: "image", mimeType: "image/png", fileSize: 12,
    url: "https://example.invalid/fixture.png", title: "Fixture", altText: "PRIVATE_METADATA", status: "active", uploadedBy: f.ids.user, createdAt: 1, updatedAt: 1 }));
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { blocks: [{ ...f.tree[0], attrs: { ...f.tree[0].attrs, photo: media } }] }));
  await f.approve(true, 1); await f.reindex();
  expect((await f.search("Orchidheading")).items.map(row => row.id)).toEqual([f.ids.post]);
  expect((await f.source())?.content).not.toContain("PRIVATE_METADATA");
  const budget = new RequestReadLedger({ queries: 1, documents: 2048, bytes: 8 * 1024 * 1024, documentBytes: 512 * 1024 });
  await expect(f.t.run(ctx => createPublicSearchSourceReader(ctx, Date.now(), budget)({ contentType: "page", contentId: f.ids.post }))).rejects.toThrow("CANONICAL_READ_BUDGET");
  await f.t.run(ctx => ctx.db.patch("media", media, { status: "trashed" }));
  expect((await f.search("Orchidheading")).items).toEqual([]);
  await f.t.run(async ctx => {
    await ctx.db.patch("media", media, { status: "active" });
    const approval = await ctx.db.query("blockDefinitionApprovals").withIndex("by_definition_version", q => q.eq("definitionId", f.draft.id).eq("version", 1)).unique();
    await ctx.db.patch("blockDefinitionApprovals", approval!._id, { digest: "0".repeat(64) });
  });
  expect((await f.search("Orchidheading")).items).toEqual([]);
});

test("ten composed editorial pages remain discoverable within the ordinary search read budget", async () => {
  const f = await fixture(); await f.approve(true, 1); await f.reindex();
  const pages = [f.ids.post];
  for (let i = 0; i < 9; i++) {
    const id = await f.t.run(async ctx => { const { _id, _creationTime, ...post } = (await ctx.db.get("posts", f.ids.post))!;
      return ctx.db.insert("posts", { ...post, slug: `copy-${i}` }); });
    pages.push(id);
    await f.t.mutation(ref<"mutation">("search/internals:onContentChanged"), { contentType: "page", contentId: id, action: "upsert" });
  }
  const result = await f.t.query(ref<"query">("search/queries:search"), { q: "Orchidheading", perPage: 20 });
  expect(new Set(result.results.map((row: { contentId: string }) => row.contentId))).toEqual(new Set(pages));
});


test("a composed navigation resolver uses the complete approved document definition context", async () => {
  const f = await fixture(); await f.approve(true, 1);
  const navigation = structuredClone(definition) as any;
  navigation.spec.name = "composed/navigation-copy";
  navigation.spec.data = { resolver: "content.headings", args: {} };
  navigation.composition.root.children.splice(1, 0, { el: "Stack", each: "data.items", as: "item", children: [{ el: "Text", bind: "item.label" }] });
  const draft = await f.author.mutation(ref<"mutation">("blockDefinitions/drafts:create"), { definitionJson: JSON.stringify(navigation) });
  await f.author.mutation(ref<"mutation">("blockDefinitions/publication:setVersionState"), { id: draft.id, version: 1, expectedGeneration: 1, expectedDigest: draft.digest, enabled: true });
  const tree = [...f.tree, { id: "navigator", name: navigation.spec.name, version: 1, attrs: {} },
    { id: "heading", name: "core/heading", version: 2, attrs: { text: paragraph("unused", "Navigationtarget").attrs.body, level: 2 } }];
  const loaded = await f.author.run(async ctx => { const value = await loadAuthoringComposedRegistry(ctx, tree); return { blocks: value.blocks, snapshot: value.snapshot }; });
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { blocks: loaded.blocks, composedDefinitions: loaded.snapshot }));
  await f.reindex();
  expect((await f.source())?.content).toContain("Orchidheading");
  expect((await f.search("Navigationtarget")).items.map(row => row.id)).toEqual([f.ids.post]);
});

test("search-driven compositions retain independent authored prose and slots without indexing their result loop", async () => {
  const searchDefinition = structuredClone(definition) as any;
  searchDefinition.spec.data = { resolver: "content.search", args: {} };
  searchDefinition.composition.root.children.splice(1, 0, { el: "Stack", each: "data.items", as: "result", children: [
    { el: "Heading", bind: "result.title" }, { el: "Text", bind: "attrs.alternative" },
  ] });
  const f = await fixture(searchDefinition); await f.approve(true, 1); await f.reindex();
  expect((await f.source())?.content).toBe("Orchidheading Childorchid");
  expect((await f.search("Orchidheading")).items.map(row => row.id)).toEqual([f.ids.post]);
  expect((await f.search("Childorchid")).items.map(row => row.id)).toEqual([f.ids.post]);
  expect((await f.search("Hiddenalternative")).items).toEqual([]);
});

test("an unbound custom reference cannot contribute text that the actual renderer refuses", async () => {
  const invalid = structuredClone(definition) as any;
  invalid.spec.fields.push({ id: "page", type: "reference", of: "page", allowEmpty: true, default: "" });
  const f = await fixture(invalid);
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { blocks: [{ ...f.tree[0], attrs: { ...f.tree[0].attrs, page: f.ids.post } }] }));
  await f.approve(true, 1); await f.reindex();
  expect((await f.search("Orchidheading")).items).toEqual([]);
});
