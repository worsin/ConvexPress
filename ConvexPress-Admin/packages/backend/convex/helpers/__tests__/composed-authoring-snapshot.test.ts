import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { authoringSnapshot, restoredAuthoring } from "../authoringSnapshot";
import { encodeComposedDefinition } from "../../canonicalDocuments/foundation/composedDefinitions";
import { parseAuthoredDefinitionContent, assertAuthoredActions } from "../../canonicalDocuments/foundation/authoredDefinitions";
import { prepareCanonicalRestore } from "../../canonicalDocuments/foundation/documentState";

const scope = { websiteKey: "snapshot", instanceKey: "staging", deploymentOrigin: "https://snapshot.convex.cloud" };
function content(version: number) {
  const name = "composed/snapshot";
  const encoded = encodeComposedDefinition({
    spec: { name, title: "Snapshot", description: "Revision fixture", category: "text", role: "content", version,
      keywords: [], ai: { useFor: "Introduction", avoid: "Navigation" }, fields: [{ id: "title", type: "text", default: `Version ${version}`, max: 80 }],
      supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{title}", examples: [{}] },
    composition: { version: 1, root: { el: "Heading", bind: "attrs.title" } },
  });
  return parseAuthoredDefinitionContent({ title: "Page", blocks: [{ id: "intro", name, version, attrs: {} }],
    composedDefinitions: { scope, definitions: [{ name, version, digest: encoded.digest, definitionJson: encoded.json }] } }, scope);
}

test("schema roundtrip retains exact revision definitions after the current page changes", async () => {
  const t = convexTest({ schema, modules: { "./convex/_generated/server.js": () => import("../../_generated/server.js") } });
  const one = content(1), two = content(2);
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { email: "snapshot@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const post = await ctx.db.insert("posts", { type: "page", title: one.title, slug: "snapshot", status: "draft", visibility: "public",
      authorId: user, commentStatus: "closed", contentMode: "blocks", blocksVersion: 2, blocksRevision: 1,
      blocks: one.blocks, composedDefinitions: one.composedDefinitions, createdAt: 1, updatedAt: 1 });
    const row = (await ctx.db.get("posts", post))!;
    const revision = await ctx.db.insert("revisions", { ...authoringSnapshot(row), content: row.content ?? "", parentId: post,
      parentType: "page", snapshotVersion: 2, type: "manual", revisionNumber: 1, authorId: String(user), changedFields: ["blocks"], contentLength: 0, createdAt: 1 });
    await ctx.db.patch("posts", post, { blocks: two.blocks, composedDefinitions: two.composedDefinitions, blocksRevision: 2 });
    return { post, revision };
  });
  await t.run(async ctx => {
    const page = (await ctx.db.get("posts", ids.post))!;
    const revision = (await ctx.db.get("revisions", ids.revision))!;
    expect(page.composedDefinitions).toEqual(two.composedDefinitions);
    expect(revision.composedDefinitions).toEqual(one.composedDefinitions);
    expect(restoredAuthoring(revision).composedDefinitions).toEqual(one.composedDefinitions);
    const restored = prepareCanonicalRestore(page, revision, { postId: ids.post, expectedRevision: 2 }, { scope, definitions: two.composedDefinitions });
    expect(restored.blocks[0].attrs.title).toBe("Version 1");
    expect(restored.digest).toBe(one.digest);
    expect(restored.revision).toBe(3);
    await ctx.db.patch("posts", ids.post, { blocks: restored.blocks, composedDefinitions: restored.composedDefinitions, blocksRevision: restored.revision });
    expect(parseAuthoredDefinitionContent((await ctx.db.get("posts", ids.post))!, scope).digest).toBe(one.digest);
    // Removing the last custom block must explicitly clear the optional field.
    await ctx.db.patch("posts", ids.post, { blocks: [], composedDefinitions: undefined });
    expect((await ctx.db.get("posts", ids.post))!.composedDefinitions).toBeUndefined();
  });
});

test("historical article and serialized-block recovery clear current definition bindings", () => {
  // These fixtures model historical rows; absent fields are deliberate.
  const common = { title: "Earlier", content: "Earlier article", changedFields: ["content"] };
  for (const revision of [common, { ...common, snapshotVersion: 2 },
    { ...common, changedFields: ["blocks"], content: JSON.stringify([{ id: "old", name: "core/paragraph", version: 1, attrs: {} }]) }]) {
    const restored = restoredAuthoring(revision as Parameters<typeof restoredAuthoring>[0]);
    expect(Object.hasOwn(restored, "composedDefinitions")).toBe(true);
    expect(restored.composedDefinitions).toBeUndefined();
  }
});

 test("custom icon choice rules preserve historical snapshots but reject new authored content", () => {
  const name = "composed/badge";
  const encoded = encodeComposedDefinition({
    spec: { name, title: "Badge", description: "Choice boundary fixture", category: "marketing", role: "content", version: 1,
      keywords: [], ai: { useFor: "A labeled mark", avoid: "Unverified claims" }, fields: [{ id: "title", type: "text", default: "Sample", authoringNonblank: true }, { id: "icon", type: "icon", options: ["heart", "check"], optionsMode: "authoring" }],
      supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{title}", examples: [{}] },
    composition: { version: 1, root: { el: "Heading", bind: "attrs.title" } },
  });
  const definitions = { scope, definitions: [{ name, version: 1, digest: encoded.digest, definitionJson: encoded.json }] };
  const old = parseAuthoredDefinitionContent({ title: "Page", blocks: [{ id: "badge", name, version: 1, attrs: { icon: "old-provider-mark" } }], composedDefinitions: definitions }, scope);
  expect(old.blocks[0].attrs.icon).toBe("old-provider-mark");
  expect(() => assertAuthoredActions(old, scope)).toThrow("Choose a supported icon");
  const corrected = parseAuthoredDefinitionContent({ ...old, blocks: [{ ...old.blocks[0], attrs: { ...old.blocks[0].attrs, icon: "heart" } }] }, scope);
  expect(() => assertAuthoredActions(corrected, scope)).not.toThrow();
  const blank = parseAuthoredDefinitionContent({ ...corrected, blocks: [{ ...corrected.blocks[0], attrs: { title: " ", icon: "heart" } }] }, scope);
  expect(blank.blocks[0].attrs.title).toBe(" ");
  expect(() => assertAuthoredActions(blank, scope)).toThrow("Enter visible text");
  expect(old.blocks[0].attrs.icon).toBe("old-provider-mark");
});
