import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useDisplayInstallation } from "./use-display-installation";
import { readInstalledPageData } from "./installed-page-data";
import { resolveSyncedOccurrencesSnapshot } from "./portable/syncedOccurrences";
import { createSyncedDisplay, projectSyncedDisplay } from "./portable/syncedDisplay";
import { syncedContentDigest } from "./portable/syncedContent";
import { canonicalContentDigest, resolveDocumentDisplayTree, parseCanonicalDocumentRead, type CanonicalDocumentDto } from "./portable/documentContracts";
import { validateCanonicalTree } from "./portable/generated/instances";
import { resolveCanonicalData } from "./portable/resolve";
import { canonicalPreviewCodec } from "../block-preview/document-codec";

async function fixture(revision = 1, omitSecond = false) {
  const scope = { websiteKey: "preview", instanceKey: "staging", deploymentOrigin: "https://preview.convex.cloud" };
  const blocks = validateCanonicalTree([{ id: "featured", name: "core/featured-page", version: 1, attrs: { page: "about" } }]), title = "Reusable feature";
  const root = ["first", "second"].map(id => ({ id, name: "core/synced", version: 1, attrs: { syncedBlock: "source", revisionPolicy: "latest" } }));
  const plan = resolveSyncedOccurrencesSnapshot(root, scope, () => ({ id: "source", revision, blocks, title, digest: syncedContentDigest(title, blocks), scope, published: true }));
  const visible = new Set(plan.byId.keys());
  if (omitSecond) visible.delete(plan.roots[1]!.children[0]!.id);
  const projected = omitSecond ? projectSyncedDisplay(plan, visible) : null;
  const policy = { enabledPlugins: [], capabilities: ["tree.children", "reference.targetResolution"], disabledBlocks: [] };
  const dataScope = { websiteKey: scope.websiteKey, instanceKey: scope.instanceKey };
  const data = await resolveCanonicalData(projected?.resolverTree ?? plan.resolverTree, dataScope, policy, async () => ({ page: null }));
  const document = parseCanonicalDocumentRead({ contract: "canonical-document-v1", scope: dataScope, policy, document: { id: "page", type: "page", title: "Saved page", status: "draft", path: "/preview", blocksVersion: 2, revision: 1, digest: canonicalContentDigest("Saved page", root), blocks: plan.resolution.blocks }, presentation: { packId: "core", revision: "a".repeat(64) }, synced: projected?.synced ?? createSyncedDisplay(plan), data, resources: { media: {} } });
  if (!document || document.contract !== "canonical-document-v1") throw Error("Invalid fixture");
  return document;
}
test("SSR installs the expanded data identities and refuses using that grant with the unexpanded authoring tree", async () => {
  const document = await fixture();
  function Probe({ source }: { source: CanonicalDocumentDto }) {
    const installed = useDisplayInstallation(source, "fixture-viewer"), tree = resolveDocumentDisplayTree(source);
    const data = readInstalledPageData(installed.data, tree, source.policy);
    expect(Object.keys(data.dataByBlock)).toEqual(tree.map(node => node.id));
    expect(Object.keys(data.dataByBlock)).toHaveLength(2);
    expect(() => readInstalledPageData(installed.data, source.document.blocks, source.policy)).toThrow("does not match");
    return <span>{Object.keys(data.dataByBlock).length} reusable placements</span>;
  }
  expect(renderToStaticMarkup(<Probe source={document} />)).toBe("<span>2 reusable placements</span>");
});
test("SSR installation grants data only to the authorized reusable placement and rejects data from omitted copies", async () => {
  const full = await fixture(), filtered = await fixture(1, true);
  function Probe() {
    const tree = resolveDocumentDisplayTree(filtered), installed = useDisplayInstallation(filtered, "fixture-viewer");
    const data = readInstalledPageData(installed.data, tree, filtered.policy);
    expect(Object.keys(data.dataByBlock)).toEqual([resolveDocumentDisplayTree(full)[0]!.id]);
    expect(() => readInstalledPageData(installed.data, resolveDocumentDisplayTree(full), filtered.policy)).toThrow("does not match");
    return <span>{tree.length} authorized placement</span>;
  }
  expect(renderToStaticMarkup(<Probe />)).toBe("<span>1 authorized placement</span>");
  expect(() => parseCanonicalDocumentRead({ ...filtered, data: full.data })).toThrow();
});
test("the real preview codec changes its binding digest for source-only republication", async () => {
  const before = canonicalPreviewCodec.decode({ document: await fixture(1), viewerGeneration: "fixture_generation_0001" });
  const after = canonicalPreviewCodec.decode({ document: await fixture(2), viewerGeneration: "fixture_generation_0001" });
  expect(canonicalPreviewCodec.binding(before)).toEqual(canonicalPreviewCodec.binding(after));
  expect(canonicalPreviewCodec.digest(before)).not.toBe(canonicalPreviewCodec.digest(after));
  const bad = structuredClone(after);bad.document.synced!.selections = [];
  expect(() => canonicalPreviewCodec.decode(bad)).toThrow();
});

test("authenticated reusable previews install the filtered expansion while retaining unrelated hidden authored roots", async () => {
  const { canonicalPreviewDocument, canonicalDocumentDisplayRoots } = await import("./portable/documentContracts");
  const source = await fixture(1, true);
  const authored = validateCanonicalTree([...source.document.blocks, { id: "authored-secret", name: "core/paragraph", version: 2, attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "HIDDEN_PAGE_COPY" }] }] } } }]);
  const read = parseCanonicalDocumentRead({ ...source, document: { ...source.document, blocks: authored, digest: canonicalContentDigest(source.document.title, authored) }, displayBlocks: source.document.blocks, displayLease: { evaluatedAt: 1, expiresAt: 1000 } });
  if (!read || read.contract !== "canonical-document-v1") throw Error("Invalid fixture");
  const verified = read;
  function Probe() {
    const installed = useDisplayInstallation(verified, "native-author");
    const tree = resolveDocumentDisplayTree(verified), data = readInstalledPageData(installed.data, tree, verified.policy);
    expect(tree).toHaveLength(1);expect(Object.keys(data.dataByBlock)).toHaveLength(1);expect(canonicalDocumentDisplayRoots(verified)).toHaveLength(2);
    return <span>Shared preview</span>;
  }
  expect(renderToStaticMarkup(<Probe />)).toBe("<span>Shared preview</span>");
  const preview = canonicalPreviewDocument(read);expect(JSON.stringify(preview)).not.toContain("HIDDEN_PAGE_COPY");expect(read.document.blocks).toHaveLength(3);
  const decoded = canonicalPreviewCodec.decode({ document: preview, viewerGeneration: "native_generation_0001" });
  expect(resolveDocumentDisplayTree(decoded.document)).toEqual(resolveDocumentDisplayTree(read));
  expect(() => parseCanonicalDocumentRead({ ...read, displayBlocks: [source.document.blocks[0]] })).toThrow();
});
