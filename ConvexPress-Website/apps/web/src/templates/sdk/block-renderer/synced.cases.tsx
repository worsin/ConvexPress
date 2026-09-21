import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import synced from "../../../../../../../blocks/core/synced/render";
import paragraph from "../../../../../../../blocks/core/paragraph/render";
import featured from "../../../../../../../blocks/core/featured-page/render";
import { prepareBlocks } from "./model";
import { resolveSyncedOccurrencesSnapshot } from "../block-data/portable/syncedOccurrences";
import { projectSyncedDisplay } from "../block-data/portable/syncedDisplay";
import { syncedContentDigest } from "../block-data/portable/syncedContent";
import { resolveCanonicalData } from "../block-data/portable/resolve";
import { createDemoContentPageHost } from "../block-data/demo-channel";

const scope = { websiteKey: "renderer", instanceKey: "staging" };
const installation = { ...scope, deploymentOrigin: "https://renderer.convex.cloud" };
const policy = { enabledPlugins: [], capabilities: ["tree.children", "reference.targetResolution"], disabledBlocks: [] };
const registry = { "core/synced": synced, "core/paragraph": paragraph, "core/featured-page": featured };
const root = ["first", "second"].map(id => ({ id, name: "core/synced", version: 1, attrs: { syncedBlock: "shared", revisionPolicy: "latest" }, anchor: `${id}-section` }));
async function fixture(hidden = false, unavailable = false) {
  const blocks = [
    { id: "copy", name: "core/paragraph", version: 2, attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Shared studio copy" }] }] } } },
    { id: "feature", name: "core/featured-page", version: 1, attrs: { page: "about" } },
  ];
  const title = "Shared composition", plan = resolveSyncedOccurrencesSnapshot(root, installation, () => unavailable ? null : ({ id: "shared", revision: 1, blocks, title, digest: syncedContentDigest(title, blocks), scope: installation, published: true }));
  const visible = new Set(plan.byId.keys());
  if (hidden) for (const node of plan.byId.values()) if (node.path[0] === "second" && node.owner) visible.delete(node.id);
  const projected = projectSyncedDisplay(plan, visible);
  const envelope = await resolveCanonicalData(projected.resolverTree, scope, policy, async () => ({ page: null }));
  const current = { scope, documentKey: "page", revision: "1", viewerKey: "guest" };
  const host = createDemoContentPageHost(), grant = host.install({ tree: projected.resolverTree, policy, context: current, envelope });
  const render = () => renderToStaticMarkup(prepareBlocks(projected.blocks, registry, policy, { media: {} }, { grant, current }, "core", { source: projected.synced, scope }));
  return { plan, projected, current, grant, host, render };
}
test("reusable renderer preserves wrappers and anchors while repeated data uses exact placement identities", async () => {
  const f = await fixture(), before = JSON.stringify(f.projected.blocks), html = f.render();
  expect(html.match(/Shared studio copy/g)).toHaveLength(2);
  expect(html.match(/Featured page unavailable/g)).toHaveLength(2);
  for (const node of f.plan.byId.values()) expect(html).toContain(`data-block-id="${node.id}"`);
  expect(html).toContain('id="first-section"');expect(html).toContain('id="second-section"');
  expect(JSON.stringify(f.projected.blocks)).toBe(before);
  expect(f.projected.blocks.every(node => !node.children)).toBe(true);
  f.host.invalidate();expect(f.render).toThrow();
});
test("reusable renderer omits restricted copies and removes withdrawn source bodies", async () => {
  const hidden = await fixture(true), html = hidden.render();
  expect(html.match(/Shared studio copy/g)).toHaveLength(1);
  expect(html.match(/Featured page unavailable/g)).toHaveLength(1);
  expect(html).not.toContain("Reusable content unavailable");
  const withdrawn = await fixture(false, true), gone = withdrawn.render();
  expect(gone).not.toContain("Shared studio copy");expect(gone).not.toContain("Featured page unavailable");
  expect(gone.match(/Reusable content unavailable/g)).toHaveLength(2);
});
test("raw references, forged expansion, foreign scope, changed bodies and disabled wrappers cannot bypass renderer checks", async () => {
  const f = await fixture();
  expect(() => prepareBlocks(root, registry, policy)).toThrow();
  const display = { source: f.projected.synced, scope };
  expect(() => prepareBlocks([{ ...root[0], children: [{ id: "fake", name: "core/paragraph", version: 2, attrs: {} }] }], registry, policy, { media: {} }, undefined, "core", display)).toThrow();
  expect(() => prepareBlocks(root, registry, policy, { media: {} }, undefined, "core", { ...display, scope: { ...scope, instanceKey: "foreign" } })).toThrow();
  const changed = structuredClone(display);changed.source.revisions[0]!.title = "Changed body";
  expect(() => prepareBlocks(root, registry, policy, { media: {} }, undefined, "core", changed)).toThrow();
  expect(() => prepareBlocks(root, registry, { ...policy, disabledBlocks: ["core/synced"] }, { media: {} }, undefined, "core", display)).toThrow();
});
