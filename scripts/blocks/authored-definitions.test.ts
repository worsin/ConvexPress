import { expect, test } from "bun:test";
import { encodeComposedDefinition } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/composedDefinitions";
import { parseAuthoredDefinitionContent } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/authoredDefinitions";
import { canonicalContentDigest } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/documentContracts";
import { authoringSourceDigest, prepareCanonicalInitialize, prepareCanonicalSave, prepareCanonicalRestore, prepareCanonicalPublication } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/documentState";
import catalog from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/catalog.json";

export const authoredScope = { websiteKey: "authored", instanceKey: "staging", deploymentOrigin: "https://authored.convex.cloud" };
export function authoredFixture(version = 1, copy = "Original") {
  const value = encodeComposedDefinition({
    spec: { name: "composed/welcome", title: "Welcome", description: "Authored introduction", category: "text", role: "content", version,
      keywords: [], ai: { useFor: "Introduction", avoid: "Navigation" }, fields: [{ id: "title", type: "text", default: copy, max: 80 }],
      supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{title}", examples: [{}] },
    composition: { version: 1, root: { el: "Heading", bind: "attrs.title" } },
  });
  return {
    title: "Page", blocks: [{ id: "welcome", name: "composed/welcome", version, attrs: {} }],
    composedDefinitions: { scope: authoredScope, definitions: [{ name: "composed/welcome", version, digest: value.digest, definitionJson: value.json }] },
  };
}

test("Library-only content and pre-composition source digests stay byte-compatible", () => {
  for (const block of catalog) {
    const blocks = [{ id: "block", name: block.name, version: block.version, attrs: block.examples[0] }];
    const parsed = parseAuthoredDefinitionContent({ title: "Library", blocks });
    expect(parsed.digest).toBe(canonicalContentDigest("Library", blocks));
    expect(parsed.composedDefinitions).toBeUndefined();
  }
  const legacy = { title: "Legacy", content: "", status: "draft", blocksRevision: 0 };
  // Fixed SHA-256 from the original twenty-two-field source encoding.
  expect(authoringSourceDigest(legacy)).toBe("041ca2b6a148e87f268b53220b37ab61836c82db2416cb25d79ae3920b46949d");
  expect(authoringSourceDigest({ ...legacy, composedDefinitions: undefined })).toBe(authoringSourceDigest(legacy));
  expect(authoringSourceDigest({ ...legacy, composedDefinitions: authoredFixture().composedDefinitions })).not.toBe(authoringSourceDigest(legacy));
});

test("authored snapshots bind definition content and installation identity, rejecting unused or missing definitions", () => {
  const one = authoredFixture(), parsed = parseAuthoredDefinitionContent(one, authoredScope);
  expect(parsed.blocks[0].attrs.title).toBe("Original");
  expect(parseAuthoredDefinitionContent(parsed, authoredScope).digest).toBe(parsed.digest);
  const changed = authoredFixture(1, "Different definition");
  // Explicit identical attrs isolate the definition's own digest contribution.
  const explicit = [{ ...one.blocks[0], attrs: { title: "Same authored text" } }];
  expect(parseAuthoredDefinitionContent({ ...one, blocks: explicit }, authoredScope).digest).not.toBe(parseAuthoredDefinitionContent({ ...changed, blocks: explicit }, authoredScope).digest);
  expect(() => parseAuthoredDefinitionContent(one)).toThrow("installation");
  expect(() => parseAuthoredDefinitionContent(one, { ...authoredScope, instanceKey: "production" })).toThrow("another site");
  expect(() => parseAuthoredDefinitionContent({ ...one, composedDefinitions: undefined }, authoredScope)).toThrow();
  expect(() => parseAuthoredDefinitionContent({ ...one, composedDefinitions: { ...one.composedDefinitions, definitions: [...one.composedDefinitions.definitions, ...authoredFixture(2).composedDefinitions.definitions] } }, authoredScope)).toThrow("exactly");
  expect(() => parseAuthoredDefinitionContent({ title: "No blocks", blocks: [], composedDefinitions: { scope: authoredScope, definitions: [] } }, authoredScope)).toThrow("Library-only");
});

test("version-aware saves preserve CAS and no-op semantics; removal clears the definition snapshot", () => {
  const one = authoredFixture(), two = authoredFixture(2, "New definition");
  const row = { _id: "post", ...one, contentMode: "blocks", blocksVersion: 2, blocksRevision: 9, status: "draft" };
  const context = { scope: authoredScope, definitions: one.composedDefinitions };
  expect(prepareCanonicalSave(row, { expectedRevision: 9, title: one.title, blocks: one.blocks }, context)).toMatchObject({ changed: false, revision: 9 });
  expect(() => prepareCanonicalSave(row, { expectedRevision: 8, title: one.title, blocks: one.blocks }, context)).toThrow("changed");
  expect(() => prepareCanonicalSave(row, { expectedRevision: 9, title: one.title, blocks: one.blocks })).toThrow("version-aware");
  const next = prepareCanonicalSave(row, { expectedRevision: 9, title: two.title, blocks: two.blocks }, { scope: authoredScope, definitions: two.composedDefinitions });
  expect(next).toMatchObject({ changed: true, revision: 10, composedDefinitions: two.composedDefinitions });
  expect(next.blocks[0].attrs.title).toBe("New definition");
  const removed = prepareCanonicalSave(row, { expectedRevision: 9, title: one.title, blocks: [] }, { scope: authoredScope });
  expect(removed.changed).toBe(true); expect(removed.composedDefinitions).toBeUndefined();
  expect(removed.digest).toBe(canonicalContentDigest(one.title, []));
});

test("restore uses the selected snapshot, advances the current revision, and publication retains its definition binding", () => {
  const one = authoredFixture(), two = authoredFixture(2, "New definition");
  const row = { _id: "post", ...two, contentMode: "blocks", blocksVersion: 2, blocksRevision: 10, status: "draft" };
  const snapshot = { parentId: "post", ...one, contentMode: "blocks", blocksVersion: 2, blocksRevision: 2 };
  const context = { scope: authoredScope, definitions: two.composedDefinitions };
  const restored = prepareCanonicalRestore(row, snapshot, { expectedRevision: 10, postId: "post" }, context);
  expect(restored).toMatchObject({ revision: 11, changed: true, composedDefinitions: one.composedDefinitions });
  expect(restored.blocks[0].attrs.title).toBe("Original");
  expect(() => prepareCanonicalRestore(row, { ...snapshot, parentId: "foreign" }, { expectedRevision: 10, postId: "post" }, context)).toThrow("another document");
  expect(() => prepareCanonicalRestore(row, snapshot, { expectedRevision: 10, postId: "post" })).toThrow("version-aware");
  const published = prepareCanonicalPublication(row, { expectedRevision: 10, status: "publish" }, 1000, context);
  expect(published.composedDefinitions).toEqual(two.composedDefinitions);
  expect(published.digest).toBe(parseAuthoredDefinitionContent(two, authoredScope).digest);
  expect(published.publication.publishedAt).toBe(1000);
  const empty = { _id: "post", title: "New", content: "", status: "draft" };
  const initialized = prepareCanonicalInitialize(empty, { expectedRevision: 0, expectedAuthoringDigest: authoringSourceDigest(empty), ...one }, { scope: authoredScope, definitions: one.composedDefinitions });
  expect(initialized.revision).toBe(1); expect(initialized.composedDefinitions).toEqual(one.composedDefinitions);
});
