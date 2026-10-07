import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
import { encodeComposedDefinition } from "../../canonicalDocuments/foundation/composedDefinitions";
const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/blockDefinitions/drafts.ts": () => import("../drafts"),
  "./convex/blockDefinitions/preview.ts": () => import("../preview"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
const preview = ref<"query">("blockDefinitions/preview:get"), pages = ref<"query">("blockDefinitions/preview:pages");
function definition(version = 1) {
  return { spec: { name: "composed/studio", title: "Studio", description: "An editable studio block", category: "text", role: "content", version,
    keywords: [], ai: { useFor: "Introductions", avoid: "Navigation" }, fields: [{ id: "headline", type: "text", default: "A considered introduction", max: 120 }],
    supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{headline}", examples: [{}] },
    composition: { version: 1, root: { el: "Heading", bind: "attrs.headline" } } };
}
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Author", slug: "author", description: "Fixture", level: 10, type: "internal", isDefault: false, isProtected: false, capabilities: ["blocks.compose", "post.read", "post.create", "post.update", "page.update", "edit_pages"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { email: "preview@example.invalid", emailVerified: true, status: "active", authSource: "local", roleId: role, createdAt: 1, updatedAt: 1 });
    const other = await ctx.db.insert("users", { email: "other@example.invalid", emailVerified: true, status: "active", authSource: "local", roleId: role, createdAt: 1, updatedAt: 1 });
    const site = await ctx.db.insert("convexpress_siteIdentity", { identityKey: "site-identity", websiteKey: "preview", instanceKey: "staging", environmentKind: "staging", deploymentOrigin: "https://preview.convex.cloud", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://preview.convex.site", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { membershipEnabled: false }, updatedAt: 1, updatedBy: user });
    await ctx.db.insert("settings", { section: "appearance.template", values: { active: "journal", overrides: {}, variants: {}, settings: {} }, legacyAppearanceMigration: { version: 2, migratedAt: 1 }, updatedAt: 1, updatedBy: user });
    const base = { type: "page" as const, title: "Preview context", slug: "preview",   blocksVersion: 2, blocksRevision: 7, blocks: [], status: "draft" as const, visibility: "public" as const, authorId: user, commentStatus: "closed" as const, createdAt: 1, updatedAt: 1 };
    const post = await ctx.db.insert("posts", base), foreignPost = await ctx.db.insert("posts", { ...base, authorId: other, title: "Another author", slug: "other" });
    const target = await ctx.db.insert("posts", { ...base, title: "Live target title", status: "publish", slug: "live-target" });
    return { role, user, other, site, post, foreignPost, target };
  });
  const as = (id: string) => t.withIdentity({ subject: id, tokenIdentifier: `https://convexpress-admin.local|${id}` });
  const author = as(ids.user), made = await author.mutation(ref("blockDefinitions/drafts:create"), { definitionJson: encodeComposedDefinition(definition()).json });
  const args = { id: made.id, expectedGeneration: 1, version: 1, expectedDigest: made.digest, postId: ids.post, expectedRevision: 7, attrsJson: "{}" };
  const snapshot = () => t.run(async ctx => ({ post: await ctx.db.get("posts", ids.post), head: await ctx.db.get("blockDefinitions", made.id), versions: await ctx.db.query("blockDefinitionVersions").withIndex("by_definition_version", q => q.eq("definitionId", made.id)).take(5), revisions: await ctx.db.query("revisions").withIndex("by_parent_number", q => q.eq("parentId", ids.post)).take(5), approvals: await ctx.db.query("blockDefinitionApprovals").withIndex("by_definition_version", q => q.eq("definitionId", made.id)).take(5) }));
  return { t, ids, as, author, made, args, snapshot };
}

test("saved and unsaved composed previews use real page identity and never write page, definition, history or approval", async () => {
  const f = await fixture(), before = await f.snapshot();
  const saved = await f.author.query(preview, f.args);
  expect(saved.document.id).toBe(f.ids.post); expect(saved.document.revision).toBe(7); expect(saved.presentation.packId).toBe("journal");
  expect(saved.document.blocks[0].attrs.headline).toBe("A considered introduction");
  expect(saved.document.composedDefinitions.definitions[0].digest).toBe(f.made.digest);
  const next = definition(2);next.composition.root = { el: "Text", bind: "attrs.headline" };
  const unsaved = await f.author.query(preview, { ...f.args, definitionJson: encodeComposedDefinition(next).json, attrsJson: JSON.stringify({ headline: "Temporary sample" }) });
  expect(unsaved.document.blocks[0].version).toBe(2);expect(unsaved.document.blocks[0].attrs.headline).toBe("Temporary sample");
  expect(unsaved.document.digest).not.toBe(saved.document.digest);
  expect(unsaved.displayLease.expiresAt).toBeLessThanOrEqual(Date.now() + 60000);
  expect(await f.snapshot()).toEqual(before);
});

test("preview checks exact definition identity, generation, digest, version, page revision and author ownership", async () => {
  const f = await fixture();
  for (const changed of [{ expectedGeneration: 0 }, { expectedDigest: "a".repeat(64) }, { version: 2 }, { expectedRevision: 6 }, { expectedRevision: 7.5 }, { postId: f.ids.foreignPost }, { attrsJson: JSON.stringify({ headline: 5 }) }, { definitionJson: encodeComposedDefinition(definition(1)).json }, { definitionJson: encodeComposedDefinition({ ...definition(2), spec: { ...definition(2).spec, name: "composed/other" } }).json }])
    await expect(f.author.query(preview, { ...f.args, ...changed })).rejects.toThrow();
  await expect(f.t.query(preview, f.args)).rejects.toThrow();await expect(f.as(f.ids.other).query(preview, f.args)).rejects.toThrow();
  for (const key of ["websiteKey", "instanceKey", "deploymentOrigin"] as const) {
    const prior = await f.t.run(ctx => ctx.db.get("convexpress_siteIdentity", f.ids.site));
    await f.t.run(ctx => ctx.db.patch("convexpress_siteIdentity", f.ids.site, { [key]: key === "deploymentOrigin" ? "https://foreign.convex.cloud" : "foreign" }));
    await expect(f.author.query(preview, f.args)).rejects.toThrow();
    await f.t.run(ctx => ctx.db.patch("convexpress_siteIdentity", f.ids.site, { [key]: prior![key] }));
  }
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: ["post.read", "post.update", "page.update", "edit_pages"] }));
  await expect(f.author.query(preview, f.args)).rejects.toThrow();
});

test("dynamic previews use the authorized live resolver and cannot widen installed policy", async () => {
  const f = await fixture();
  const source = definition(2);
  const dynamic = { ...source, spec: { ...source.spec, fields: [{ id: "page", type: "reference", of: "page", storage: "id", allowEmpty: true, default: "" }], data: { resolver: "content.page", args: { page: "attrs.page" } }, preview: "{page}" }, composition: { version: 1, root: { el: "Heading", bind: "data.page.title" } } };
  const args = { ...f.args, definitionJson: encodeComposedDefinition(dynamic).json, attrsJson: JSON.stringify({ page: f.ids.target }) };
  const first = await f.author.query(preview, args);
  expect(first.data.dataByBlock["definition-preview"].data.page.title).toBe("Live target title");
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.target, { title: "Changed live title" }));
  const next = await f.author.query(preview, args);
  expect(next.data.dataByBlock["definition-preview"].data.page.title).toBe("Changed live title");
  expect(next.document.digest).toBe(first.document.digest);
  const forbidden = { ...dynamic, spec: { ...dynamic.spec, data: { resolver: "admin.secrets", args: {} } } };
  await expect(f.author.query(preview, { ...args, definitionJson: encodeComposedDefinition(forbidden).json })).rejects.toThrow();
  await f.t.run(ctx => ctx.db.insert("settings", { section: "blocks", values: { disabledBlockNames: ["composed/studio"] }, updatedAt: 2, updatedBy: f.ids.user }));
  await expect(f.author.query(preview, args)).rejects.toThrow();
});

test("page context discovery is bounded, owner-filtered and independent of definition draft generation", async () => {
  const f = await fixture();
  const result = await f.author.query(pages, { id: f.made.id, paginationOpts: { numItems: 5, cursor: null } });
  expect(result.page.map((page: { id: string }) => page.id).sort()).toEqual([f.ids.post, f.ids.target].sort());
  expect(JSON.stringify(result)).not.toContain("blocks");expect(result.isDone).toBe(true);
  for (const count of [0,6,1.5]) await expect(f.author.query(pages, { id: f.made.id, paginationOpts: { numItems: count, cursor: null } })).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("blockDefinitions", f.made.id, { generation: 2 }));
  expect((await f.author.query(pages, { id: f.made.id, paginationOpts: { numItems: 5, cursor: null } })).page.length).toBe(2);
  await expect(f.author.query(preview, f.args)).rejects.toThrow();
});
