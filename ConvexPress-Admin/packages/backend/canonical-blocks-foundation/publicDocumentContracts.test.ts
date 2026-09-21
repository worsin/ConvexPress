import { expect, test } from "bun:test";
import { parsePublicCanonicalDocument } from "./publicDocumentContracts";
import { canonicalContentDigest } from "./documentContracts";
import { validateCanonicalTree } from "./generated/instances";
import { resolveCanonicalData } from "./resolve";
const scope = { websiteKey: "fixture", instanceKey: "fixture-stage" };
const policy = { enabledPlugins: [], capabilities: [], disabledBlocks: [] };
async function ready() {
  const blocks = validateCanonicalTree([{ id: "copy", name: "core/paragraph", version: 2, attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Public copy" }] }] } } }]);
  return { contract: "canonical-public-document-v1", state: "ready", viewerSubject: null, accessLease: null, scope, document: { id: "post", type: "page", title: "Page", path: "/page", blocksVersion: 2, revision: 1, digest: canonicalContentDigest("Page", blocks), blocks }, presentation: { packId: "core", revision: "a".repeat(64) }, policy, data: await resolveCanonicalData(blocks, scope, policy, async () => ({ page: null })), resources: { media: {} } };
}
test("public envelopes are closed and retain the complete tree/data/scope trust checks", async () => {
  const value = await ready();
  expect(parsePublicCanonicalDocument(value)).toEqual(value);
  expect(() => parsePublicCanonicalDocument({ ...value, document: { ...value.document, title: "Changed" } })).toThrow();
  expect(() => parsePublicCanonicalDocument({ ...value, scope: { ...scope, instanceKey: "other" } })).toThrow();
  expect(() => parsePublicCanonicalDocument({ ...value, document: { ...value.document, status: "draft" } })).toThrow();
  expect(() => parsePublicCanonicalDocument({ ...value, document: { ...value.document, scheduledAt: 123 } })).toThrow();
  const locked = structuredClone(value);
  (locked.document.blocks[0] as { lock?: unknown }).lock = { edit: false };
  locked.document.digest = canonicalContentDigest(locked.document.title, locked.document.blocks);
  locked.data = await resolveCanonicalData(locked.document.blocks, scope, policy, async () => ({ page: null }));
  expect(() => parsePublicCanonicalDocument(locked)).toThrow();
});
test("restricted envelopes cannot carry ready resources, unsupported teaser size, or an invented restriction", () => {
  const gate = { contract: "canonical-public-document-v1", state: "restricted", viewerSubject: null, accessLease: null, document: { id: "post", type: "page", title: "Page", path: "/page", excerpt: null }, restriction: { password: true, membership: false } };
  expect(parsePublicCanonicalDocument(gate)).toEqual(gate);
  for (const extra of [{ resources: { media: {} } }, { data: {} }, { token: "no" }, { scope }]) expect(() => parsePublicCanonicalDocument({ ...gate, ...extra })).toThrow();
  expect(() => parsePublicCanonicalDocument({ ...gate, restriction: { password: false, membership: false } })).toThrow();
  expect(() => parsePublicCanonicalDocument({ ...gate, document: { ...gate.document, excerpt: "x".repeat(4001) } })).toThrow();
  expect(parsePublicCanonicalDocument(null)).toBeNull();
});

test("public authority leases are required for identified viewers and cannot be missing, malformed or unbounded", async () => {
  const value = await ready();
  const { accessLease: _lease, ...missing } = value;
  expect(() => parsePublicCanonicalDocument(missing)).toThrow();
  expect(() => parsePublicCanonicalDocument({ ...value, viewerSubject: "member" })).toThrow();
  for (const accessLease of [{ evaluatedAt: 1000, expiresAt: 1000 }, { evaluatedAt: 1000, expiresAt: 61001 }, { evaluatedAt: -1, expiresAt: 5000 }, { evaluatedAt: 1000, expiresAt: Infinity }])
    expect(() => parsePublicCanonicalDocument({ ...value, accessLease })).toThrow();
  const leased = { ...value, viewerSubject: "member", accessLease: { evaluatedAt: 1000, expiresAt: 61000 } };
  expect(parsePublicCanonicalDocument(leased)).toEqual(leased);
});
