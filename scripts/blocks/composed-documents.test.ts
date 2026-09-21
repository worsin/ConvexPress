import { expect, test } from "bun:test";
import { encodeComposedDefinition } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/composedDefinitions";
import { createComposedRegistry } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/composedRegistry";
import { parseAuthoredDefinitionContent } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/authoredDefinitions";
import { canonicalContentDigest, canonicalPreviewDocument, documentComposedContext, parseCanonicalDocumentRead, collectCanonicalMediaIds, resolveDocumentDisplayTree, type CanonicalDocumentDto } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/documentContracts";
import { parsePublicCanonicalDocument } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/publicDocumentContracts";
import { resolveCanonicalDataWithDefinitions } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/resolve";
import { canonicalPreviewCodec } from "../../ConvexPress-Website/apps/web/src/templates/sdk/block-preview/document-codec";

const scope = { websiteKey: "composed-document", instanceKey: "staging" };
const installation = { ...scope, deploymentOrigin: "https://composed-document.convex.cloud" };
const policy = { enabledPlugins: [], capabilities: [], disabledBlocks: [] };
function definition(slug: string, version = 1) {
  const encoded = encodeComposedDefinition({
    spec: { name: `composed/${slug}`, title: slug, description: `Definition copy for ${slug}`, category: "text", role: "content", version,
      keywords: [], ai: { useFor: "Intro", avoid: "Navigation" }, fields: [{ id: "title", type: "text", default: "Hello", max: 100 }, { id: "photo", type: "media", storage: "id" }],
      supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: { resolver: "site.info", args: {} }, preview: "{title}", examples: [{}] },
    composition: { version: 1, root: { el: "Heading", bind: "data.name" } },
  });
  return { name: encoded.definition.spec.name, version, digest: encoded.digest, definitionJson: encoded.json };
}
async function fixture(visible: "all" | "one" | "none" = "all") {
  const definitions = { scope: installation, definitions: [definition("public-card"), definition("private-card", 2)] };
  const registry = createComposedRegistry(definitions, installation);
  const authored = parseAuthoredDefinitionContent({ title: "Versioned page", blocks: [
    { id: "visible", name: "composed/public-card", version: 1, attrs: { title: "Visible", photo: "public-photo" } },
    { id: "hidden", name: "composed/private-card", version: 2, attrs: { title: "PRIVATE_AUTHORED_COPY", photo: "private-photo" } },
  ], composedDefinitions: definitions }, installation);
  const displayBlocks = visible === "all" ? authored.blocks : visible === "one" ? authored.blocks.slice(0, 1) : [];
  const displayDefinitions = registry.snapshotFor(displayBlocks);
  const composed = displayDefinitions.definitions.length ? { scope: installation, definitions: displayDefinitions } : undefined;
  const data = await resolveCanonicalDataWithDefinitions(displayBlocks, scope, policy, { readNavigation: async () => ({ name: "Live fixture site", tagline: null, logo: null }) }, composed);
  const resources = { media: Object.fromEntries(collectCanonicalMediaIds(displayBlocks, composed).map(id => [id, { src: `/${id}.webp`, alt: id }])) };
  return parseCanonicalDocumentRead({ contract: "canonical-document-v1", scope, policy, data, resources,
    presentation: { packId: "core", revision: "b".repeat(64) }, displayBlocks, displayLease: { evaluatedAt: 1000, expiresAt: 61000 },
    document: { ...authored, id: "page", type: "page", status: "draft", path: "/page", blocksVersion: 2, revision: 4 },
  }) as CanonicalDocumentDto;
}

test("saved composed documents bind exact versions, scope, schema, digest, data and media", async () => {
  const document = await fixture();
  expect(document.document.blocks.map(node => node.version)).toEqual([1, 2]);
  const composed = documentComposedContext(document)!;
  expect(document.document.digest).toBe(canonicalContentDigest(document.document.title, document.document.blocks, composed));
  expect(collectCanonicalMediaIds(document.document.blocks, composed)).toEqual(["public-photo", "private-photo"]);
  const changed = (update: (value: CanonicalDocumentDto) => void) => { const value = structuredClone(document); update(value); return value; };
  for (const bad of [
    changed(value => { delete value.document.composedDefinitions; }),
    changed(value => { value.document.blocks[0].version = 2; }),
    changed(value => { value.document.blocks[0].attrs = { arbitrary: true }; }),
    changed(value => { value.document.composedDefinitions!.scope.instanceKey = "another-site"; }),
    changed(value => { value.document.composedDefinitions!.scope.deploymentOrigin = "https://other.convex.cloud"; }),
    changed(value => { value.document.composedDefinitions!.definitions.push(definition("unused")); }),
    changed(value => { value.document.composedDefinitions!.definitions[0].digest = "0".repeat(64); }),
    changed(value => { delete value.data.definitionsDigest; }),
    changed(value => { value.resources.media.extra = { src: "/extra.webp", alt: "extra" }; }),
  ]) expect(() => parseCanonicalDocumentRead(bad)).toThrow();
});

test("preview/public projection drops hidden definitions and media while preserving the authored snapshot", async () => {
  const document = await fixture("one"), before = JSON.stringify(document);
  const preview = canonicalPreviewDocument(document);
  expect(preview.document.blocks).toHaveLength(1);
  expect(preview.document.composedDefinitions!.definitions.map(value => value.name)).toEqual(["composed/public-card"]);
  expect(JSON.stringify(preview)).not.toContain("PRIVATE_AUTHORED_COPY");
  expect(JSON.stringify(preview)).not.toContain("private-card");
  expect(JSON.stringify(preview)).not.toContain("private-photo");
  expect(JSON.stringify(document)).toBe(before);
  expect(canonicalPreviewCodec.decode({ document: preview, viewerGeneration: "a".repeat(24) }).document).toEqual(preview);
  const { status: _status, scheduledAt: _scheduledAt, ...publicDocument } = preview.document;
  const { displayLease: _lease, ...rest } = preview;
  const value = parsePublicCanonicalDocument({ ...rest, contract: "canonical-public-document-v1", state: "ready", viewerSubject: null, accessLease: null, document: publicDocument });
  expect(value?.state).toBe("ready");
  expect(resolveDocumentDisplayTree(preview)).toEqual(preview.document.blocks);
});

test("an entirely hidden custom tree removes all definition and data bindings from the preview", async () => {
  const document = await fixture("none"), preview = canonicalPreviewDocument(document);
  expect(preview.document.blocks).toEqual([]);
  expect(preview.document.composedDefinitions).toBeUndefined();
  expect(preview.data.definitionsDigest).toBeUndefined();
  expect(preview.resources.media).toEqual({});
  expect(preview.document.digest).toBe(canonicalContentDigest(preview.document.title, []));
  expect(document.document.composedDefinitions!.definitions).toHaveLength(2);
});

test("display projections cannot change, reorder, introduce or move custom nodes", async () => {
  const source = await fixture("one");
  const forged = (nodes: CanonicalDocumentDto["document"]["blocks"]) => ({ ...source, displayBlocks: nodes });
  for (const blocks of [
    [{ ...source.document.blocks[0], attrs: { title: "Altered", photo: "public-photo" } }],
    [...source.document.blocks].reverse(),
    [{ ...source.document.blocks[0], id: "invented" }],
  ]) expect(() => parseCanonicalDocumentRead(forged(blocks))).toThrow();
});
