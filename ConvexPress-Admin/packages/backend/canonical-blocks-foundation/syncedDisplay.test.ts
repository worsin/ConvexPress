import { expect, test } from "bun:test";
import { createSyncedDisplay, resolveSyncedDisplay } from "./syncedDisplay";
import { resolveSyncedOccurrences, resolveSyncedOccurrencesSnapshot } from "./syncedOccurrences";
import { syncedContentDigest } from "./syncedContent";
import { publicCanonicalTree } from "./publicTree";
import { canonicalContentDigest, canonicalDisplayDigest, parseCanonicalDocumentRead, resolveDocumentDisplayTree } from "./documentContracts";
import { parsePublicCanonicalDocument } from "./publicDocumentContracts";
import { resolveCanonicalData } from "./resolve";
import { validateCanonicalTree } from "./generated/instances";
const scope = { websiteKey: "studio", instanceKey: "staging", deploymentOrigin: "https://studio.convex.cloud" };
const dataScope = { websiteKey: scope.websiteKey, instanceKey: scope.instanceKey };
const policy = { enabledPlugins: [], capabilities: ["tree.children", "reference.targetResolution"], disabledBlocks: [] };
const paragraph = { id: "copy", name: "core/paragraph", version: 2, attrs: {} };
const reference = (id: string, syncedBlock: string, revision?: number) => ({ id, name: "core/synced", version: 1, attrs: { syncedBlock, revisionPolicy: revision === undefined ? "latest" : "pinned", ...(revision === undefined ? {} : { revision }) } });
function source(id: string, blocks: unknown = [paragraph], revision = 1) {
  const title = `Published ${id}`;
  return { id, title, revision, blocks: validateCanonicalTree(blocks), digest: syncedContentDigest(title, blocks), scope, published: true as const };
}
async function fixture() {
  const shared = source("shared", [{ id: "photo", name: "core/image", version: 2, attrs: { mediaId: "photo", alt: "Studio" } }, { id: "feature", name: "core/featured-page", version: 1, attrs: { page: "about" } }]);
  const root = [reference("first", "shared"), reference("second", "shared")];
  const plan = await resolveSyncedOccurrences(root, scope, async () => shared), synced = createSyncedDisplay(plan);
  let reads = 0;
  const data = await resolveCanonicalData(plan.resolverTree, dataScope, policy, async () => { reads++;return { page: null }; });
  const dto = { contract: "canonical-document-v1", scope: dataScope, document: { id: "page", type: "page", title: "Studio", status: "draft", path: "/studio", blocksVersion: 2, revision: 1, digest: canonicalContentDigest("Studio", root), blocks: plan.resolution.blocks }, presentation: { packId: "core", revision: "a".repeat(64) }, policy, synced, data, resources: { media: { photo: { src: "/studio.jpg", alt: "Studio" } } } };
  return { shared, plan, synced, dto, reads };
}
test("synchronous display and asynchronous server walkers preserve identical nested identities and limits", async () => {
  const root = [reference("first", "outer"), reference("second", "outer", 2)];
  const read = ({ id }: { id: string }) => id === "outer" ? source("outer", [reference("inner", "leaf", 1)], 2) : source("leaf");
  const asyncPlan = await resolveSyncedOccurrences(root, scope, async request => read(request));
  const syncPlan = resolveSyncedOccurrencesSnapshot(root, scope, read);
  expect(syncPlan).toEqual(asyncPlan);
  const display = createSyncedDisplay(asyncPlan);
  const rebuilt = resolveSyncedDisplay(display, asyncPlan.resolution.blocks, scope);
  expect(rebuilt.resolverTree).toEqual(asyncPlan.resolverTree);
  expect(rebuilt.roots.map(node => node.children[0]!.reference?.revision)).toEqual([1, 1]);
  expect(display.selections).toHaveLength(3);expect(display.revisions).toHaveLength(2);
});
test("reusable display removes private authoring fields and never exports original private-content digests", async () => {
  const contact = { id: "contact", name: "core/contact-form", version: 2, lock: { edit: false }, attrs: { recipientEmail: "PRIVATE_RECIPIENT@example.invalid", fields: [{ name: "email", label: "Email", type: "email", required: true }] } };
  const shared = source("private", [contact]);
  const root = [{ ...reference("placement", "private"), lock: { move: false } }];
  const plan = await resolveSyncedOccurrences(root, scope, async () => shared), display = createSyncedDisplay(plan, { publicRoot: true });
  const serialized = JSON.stringify(display);
  expect(serialized).not.toContain("PRIVATE_RECIPIENT");expect(serialized).not.toContain('"lock"');expect(serialized).not.toContain(shared.digest);
  expect(display.revisions[0]!.displayDigest).not.toBe(shared.digest);
  const publicRoot = publicCanonicalTree(plan.resolution.blocks);
  expect(resolveSyncedDisplay(display, publicRoot, scope).resolverTree[0]!.attrs.recipientEmail).toBe("");
  expect(plan.resolution.revisions[0]!.blocks[0]!.attrs.recipientEmail).toBe("PRIVATE_RECIPIENT@example.invalid");
  const bad = structuredClone(display);bad.revisions[0]!.blocks[0]!.attrs.recipientEmail = "LEAK@example.invalid";
  bad.revisions[0]!.displayDigest = syncedContentDigest(bad.revisions[0]!.title, bad.revisions[0]!.blocks);
  bad.selections[0]!.target!.displayDigest = bad.revisions[0]!.displayDigest;
  expect(() => resolveSyncedDisplay(bad, publicRoot, scope)).toThrow("Private authoring");
});
test("complete document codecs bind reused data and exact media to occurrence IDs", async () => {
  const f = await fixture();expect(f.reads).toBe(1);
  const parsed = parseCanonicalDocumentRead(f.dto);
  expect(parsed).toEqual(f.dto);
  expect(resolveDocumentDisplayTree(f.dto)).toEqual(f.plan.resolverTree);
  expect(Object.keys(f.dto.data.dataByBlock)).toEqual(f.plan.resolverTree.filter(node => node.name === "core/featured-page").map(node => node.id));
  for (const mutate of [
    (dto: typeof f.dto) => { delete (dto as Partial<typeof f.dto>).synced; },
    (dto: typeof f.dto) => { dto.data.dataByBlock = {}; },
    (dto: typeof f.dto) => { dto.resources.media = {} as typeof dto.resources.media; },
    (dto: typeof f.dto) => { (dto.resources.media as Record<string, unknown>).extra = { src: "/secret.jpg", alt: "Unbound" }; },
    (dto: typeof f.dto) => { const entries = Object.values(dto.data.dataByBlock);dto.data.dataByBlock = { feature: entries[0]! }; },
    (dto: typeof f.dto) => { dto.policy = { ...policy, disabledBlocks: ["core/synced"] }; },
    (dto: typeof f.dto) => { dto.policy = { ...policy, capabilities: [] }; },
  ]) {
    const bad = structuredClone(f.dto);mutate(bad);expect(() => parseCanonicalDocumentRead(bad)).toThrow();
  }
});
test("source-only publication changes invalidate preview digests while document authoring revision stays unchanged", async () => {
  const f = await fixture();
  const next = await resolveSyncedOccurrences(f.plan.resolution.blocks, scope, async () => ({ ...f.shared, revision: 2 }));
  const changed = { ...f.dto, synced: createSyncedDisplay(next) };
  expect(changed.document.digest).toBe(f.dto.document.digest);
  expect(canonicalDisplayDigest(changed)).not.toBe(canonicalDisplayDigest(f.dto));
  expect(resolveDocumentDisplayTree(changed).map(node => node.id)).toEqual(f.plan.resolverTree.map(node => node.id));
  expect(canonicalDisplayDigest({ document: { digest: "normal" } })).toBe("normal");
});
test("closed sidecar rejects missing, duplicate, unreferenced, substituted and cross-installation bindings", async () => {
  const f = await fixture();
  const reject = (mutate: (value: typeof f.synced) => void) => { const bad = structuredClone(f.synced);mutate(bad);expect(() => resolveSyncedDisplay(bad, f.plan.resolution.blocks, scope)).toThrow(); };
  reject(value => { value.selections = []; });
  reject(value => { value.revisions = []; });
  reject(value => { value.selections.push(value.selections[0]!); });
  reject(value => { value.revisions.push(value.revisions[0]!); });
  reject(value => { value.selections.push({ request: { id: "extra", revisionPolicy: "latest" }, target: null }); });
  reject(value => { value.revisions.push({ ...value.revisions[0]!, id: "extra" }); });
  reject(value => { value.selections[0]!.target!.revision++; });
  reject(value => { value.selections[0]!.request = { id: "shared", revisionPolicy: "pinned", revision: 1 }; });
  reject(value => { value.revisions[0]!.blocks[0]!.attrs.alt = "Changed"; });
  reject(value => { value.scope.instanceKey = "other"; });
  reject(value => { value.scope.deploymentOrigin = "https://other.convex.cloud"; });
  expect(() => resolveSyncedDisplay({ ...f.synced, secret: "extra" }, f.plan.resolution.blocks, scope)).toThrow();
  const root = structuredClone(f.plan.resolution.blocks);root[0]!.id = "moved";
  expect(() => resolveSyncedDisplay(f.synced, root, scope)).toThrow("different authored");
});
test("unavailable selections carry no hidden source bodies and published pins remain exact", async () => {
  const root = [reference("gone", "withdrawn"), reference("pin", "shared", 1)];
  const plan = await resolveSyncedOccurrences(root, scope, async request => request.id === "shared" ? source("shared") : null);
  const display = createSyncedDisplay(plan), checked = resolveSyncedDisplay(display, plan.resolution.blocks, scope);
  expect(display.revisions).toHaveLength(1);expect(checked.roots[0]!.children).toEqual([]);expect(checked.roots[1]!.reference?.revision).toBe(1);
  const bad = structuredClone(display);bad.selections[1]!.target!.revision = 2;bad.revisions[0]!.revision = 2;
  expect(() => resolveSyncedDisplay(bad, plan.resolution.blocks, scope)).toThrow("requested published revision");
});
test("a self-consistent forged sidecar still cannot bypass graph cycles or the shared byte budget", async () => {
  const f = await fixture(), bad = structuredClone(f.synced);
  bad.revisions[0]!.blocks = validateCanonicalTree([reference("loop", "shared")]);
  bad.revisions[0]!.displayDigest = syncedContentDigest(bad.revisions[0]!.title, bad.revisions[0]!.blocks);
  bad.selections[0]!.target!.displayDigest = bad.revisions[0]!.displayDigest;
  expect(() => resolveSyncedDisplay(bad, f.plan.resolution.blocks, scope)).toThrow("circular revision");
  expect(() => resolveSyncedDisplay({ ...f.synced, ignored: "x".repeat(512 * 1024) }, f.plan.resolution.blocks, scope)).toThrow("transport budget");
});
test("public document parsing accepts a complete sidecar and refuses private fields in the root", async () => {
  const f = await fixture();
  const { status: _status, ...document } = f.dto.document;
  const dto = { ...f.dto, document, contract: "canonical-public-document-v1", state: "ready", viewerSubject: null, accessLease: null };
  expect(parsePublicCanonicalDocument(dto)).toEqual(dto);
  const tree = validateCanonicalTree([{ id: "contact", name: "core/contact-form", version: 2, attrs: { recipientEmail: "PRIVATE@example.invalid", fields: [{ name: "email", label: "Email", type: "email", required: true }] } }]);
  // The public-tree gate itself covers recipient fields independently of the
  // contact resolver fixture; no hash supplied by a client can authorize them.
  const publicTree = publicCanonicalTree(tree);
  expect(publicTree[0]!.attrs.recipientEmail).toBe("");
  const bad = structuredClone(dto);bad.document.blocks[0]!.lock = { edit: false };
  bad.document.digest = canonicalContentDigest(bad.document.title, bad.document.blocks);
  expect(() => parsePublicCanonicalDocument(bad)).toThrow();
});
