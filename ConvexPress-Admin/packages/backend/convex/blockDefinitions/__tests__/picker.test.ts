import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
import { encodeComposedDefinition } from "../../canonicalDocuments/foundation/composedDefinitions";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/blockDefinitions/drafts.ts": () => import("../drafts"),
  "./convex/blockDefinitions/publication.ts": () => import("../publication"),
  "./convex/blockDefinitions/picker.ts": () => import("../picker"),
};
const list = ref<"query">("blockDefinitions/picker:list"), select = ref<"query">("blockDefinitions/picker:select");
const create = ref<"mutation">("blockDefinitions/drafts:create"), save = ref<"mutation">("blockDefinitions/drafts:save"), review = ref<"mutation">("blockDefinitions/publication:setVersionState");
const scope = { websiteKey: "picker-test", instanceKey: "staging", deploymentOrigin: "https://picker-test.convex.cloud" };
function definition(name = "composed/studio", version = 1) {
  return { spec: { name, version, title: `Approved studio ${version}`, description: "Picker fixture", category: "text", role: "content", keywords: [], ai: { useFor: "Studio", avoid: "Navigation" }, fields: [{ id: "title", type: "text", default: "Hello", max: 80 }], supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{title}", examples: [{}] }, composition: { version: 1, root: { el: "Heading", bind: "attrs.title" } } };
}
async function fixture() {
  const t = convexTest({ schema, modules });
  const capabilities = ["blocks.compose", "post.create", "post.update", "post.publish", "page.update"];
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Author", slug: "author", description: "Fixture", level: 10, type: "internal", isDefault: false, isProtected: false, capabilities, pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const data = { authSource: "local" as const, emailVerified: true, status: "active" as const, roleId: role, createdAt: 1, updatedAt: 1 };
    const author = await ctx.db.insert("users", { ...data, email: "definition@example.invalid" });
    const editor = await ctx.db.insert("users", { ...data, email: "editor@example.invalid" });
    const post = await ctx.db.insert("posts", { type: "page", title: "Picker document", slug: "picker",  status: "draft", visibility: "public", authorId: editor, commentStatus: "closed", blocksVersion: 2, blocksRevision: 7, blocks: [], createdAt: 1, updatedAt: 1 });
    const site = await ctx.db.insert("convexpress_siteIdentity", { ...scope, identityKey: "site-identity", environmentKind: "staging", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://picker-test.convex.site", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    return { author, editor, role, post, site };
  });
  const as = (id: string) => t.withIdentity({ subject: id, tokenIdentifier: `https://convexpress-admin.local|${id}` });
  const author = as(ids.author), editor = as(ids.editor);
  const made = await author.mutation(create, { definitionJson: JSON.stringify(definition()) });
  const base = { postId: ids.post, expectedRevision: 7, expectedScope: { websiteKey: scope.websiteKey, instanceKey: scope.instanceKey } };
  const request = { ...base, paginationOpts: { numItems: 8, cursor: null } };
  const selection = { ...base, id: made.id, version: 1, expectedDigest: made.digest };
  const approve = (version: number, generation: number, enabled = true) => author.mutation(review, { id: made.id, version, expectedGeneration: generation, expectedDigest: encodeComposedDefinition(definition("composed/studio", version)).digest, enabled });
  return { t, ids, author, editor, made, base, request, selection, approve, capabilities };
}

test("picker exposes only approved immutable metadata and preserves an older selected version after preference changes", async () => {
  const f = await fixture();
  expect((await f.editor.query(list, f.request)).page).toEqual([]);
  await expect(f.editor.query(select, f.selection)).rejects.toThrow("no longer approved");
  await f.approve(1, 1);
  await f.author.mutation(save, { id: f.made.id, expectedGeneration: 2, definitionJson: JSON.stringify(definition("composed/studio", 2)) });
  const page = await f.editor.query(list, f.request);
  expect(page.scope).toEqual(f.base.expectedScope); expect(page.isDone).toBe(true);
  expect(page.page).toEqual([{ id: f.made.id, name: "composed/studio", title: "Approved studio 1", version: 1, digest: f.made.digest }]);
  expect(JSON.stringify(page)).not.toContain("definitionJson");
  const first = await f.editor.query(select, f.selection); expect(first.scope).toEqual(scope);
  expect(first.definitions[0].definitionJson).toBe(encodeComposedDefinition(definition()).json);
  await f.approve(2, 3);
  expect((await f.editor.query(list, f.request)).page[0].version).toBe(2);
  expect(await f.editor.query(select, f.selection)).toEqual(first);
  await f.approve(1, 4, false);
  await expect(f.editor.query(select, f.selection)).rejects.toThrow("no longer approved");
  expect((await f.editor.query(list, f.request)).page[0].version).toBe(2);
});

test("approved block reuse survives removal of compose authority", async () => {
  const f = await fixture();
  await f.approve(1, 1);
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: f.capabilities.filter(cap => cap !== "blocks.compose") }));
  expect((await f.editor.query(list, f.request)).page[0].id).toBe(f.made.id);
  expect((await f.editor.query(select, f.selection)).definitions[0].digest).toBe(f.made.digest);
  await expect(f.approve(1, 2, false)).rejects.toThrow();
});

test("picker refuses anonymous, inactive, unauthorized document and stale revision requests", async () => {
  const f = await fixture(); await f.approve(1, 1);
  for (const [endpoint, request] of [[list, f.request], [select, f.selection]] as const) {
    await expect(f.t.query(endpoint, request)).rejects.toThrow();
    await expect(f.author.query(endpoint, request)).rejects.toThrow("cannot edit");
    await expect(f.editor.query(endpoint, { ...request, expectedRevision: 6 })).rejects.toThrow("document changed");
    await expect(f.editor.query(endpoint, { ...request, expectedRevision: 7.5 })).rejects.toThrow("document changed");
  }
  await f.t.run(ctx => ctx.db.patch("users", f.ids.editor, { status: "inactive" }));
  await expect(f.editor.query(list, f.request)).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("users", f.ids.editor, { status: "active" }));
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: f.capabilities.filter(c => c !== "post.update") }));
  await expect(f.editor.query(select, f.selection)).rejects.toThrow();
});

test("foreign installation axes, promoted heads, digest substitutions and missing approvals never grant insertion", async () => {
  const f = await fixture(); await f.approve(1, 1);
  for (const key of ["websiteKey", "instanceKey", "deploymentOrigin"] as const) {
    await f.t.run(ctx => ctx.db.patch("blockDefinitions", f.made.id, { [key]: key === "deploymentOrigin" ? "https://foreign.convex.cloud" : "foreign" }));
    expect((await f.editor.query(list, f.request)).page).toEqual([]);
    await expect(f.editor.query(select, f.selection)).rejects.toThrow("unavailable");
    await f.t.run(ctx => ctx.db.patch("blockDefinitions", f.made.id, { [key]: scope[key] }));
  }
  await expect(f.editor.query(list, { ...f.request, expectedScope: { ...f.base.expectedScope, instanceKey: "live" } })).rejects.toThrow("environment changed");
  await expect(f.editor.query(select, { ...f.selection, expectedDigest: "0".repeat(64) })).rejects.toThrow("no longer approved");
  await f.t.run(ctx => ctx.db.patch("blockDefinitions", f.made.id, { status: "promoted" }));
  expect((await f.editor.query(list, f.request)).page).toEqual([]);
  await expect(f.editor.query(select, f.selection)).rejects.toThrow("unavailable");
  await f.t.run(ctx => ctx.db.patch("blockDefinitions", f.made.id, { status: "active" }));
  const approval = await f.t.run(ctx => ctx.db.query("blockDefinitionApprovals").withIndex("by_definition_version", q => q.eq("definitionId", f.made.id).eq("version", 1)).unique());
  await f.t.run(ctx => ctx.db.delete("blockDefinitionApprovals", approval!._id));
  expect((await f.editor.query(list, f.request)).page).toEqual([]);
  await expect(f.editor.query(select, f.selection)).rejects.toThrow("no longer approved");
});

test("catalog remains bounded and paginates past draft-only pages without leaking draft titles", async () => {
  const f = await fixture(); await f.approve(1, 1);
  for (const name of ["a", "b", "c"]) await f.author.mutation(create, { definitionJson: JSON.stringify(definition(`composed/${name}`)) });
  const one = await f.editor.query(list, { ...f.request, paginationOpts: { numItems: 2, cursor: null } });
  expect(one.page).toEqual([]); expect(one.isDone).toBe(false);
  const two = await f.editor.query(list, { ...f.request, paginationOpts: { numItems: 2, cursor: one.continueCursor } });
  expect(two.page).toHaveLength(1); expect(two.page[0].name).toBe("composed/studio");
  for (const size of [0, 9, 1.5]) await expect(f.editor.query(list, { ...f.request, paginationOpts: { numItems: size, cursor: null } })).rejects.toThrow("between 1 and 8");
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { status: "trash" }));
  await expect(f.editor.query(list, f.request)).rejects.toThrow("supported block document");
});
