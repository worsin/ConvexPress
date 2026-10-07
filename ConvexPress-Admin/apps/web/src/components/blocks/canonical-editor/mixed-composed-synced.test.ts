// @ts-ignore The local bun:test shim omits the supported afterAll lifecycle hook.
import { afterAll, expect, test } from "bun:test";
import { loadStaged } from "../schema-editor/test-harness";
const loaded = await loadStaged("../canonical-editor/workspace.fixture.ts");
afterAll(loaded.cleanup);
const { canonicalEditorAdapter, encodeComposedDefinition } = loaded.module;
const policy = { disabledBlocks: [], enabledPlugins: [], capabilities: ["tree.children", "reference.targetResolution"] };
const scope = { websiteKey: "mixed", instanceKey: "staging", deploymentOrigin: "https://mixed.convex.cloud" };
const encoded = encodeComposedDefinition({
  spec: { name: "composed/page-card", title: "Page card", description: "Selected page with authored children", category: "site", role: "content", version: 1,
    keywords: [], ai: { useFor: "Page reference", avoid: "Private data" },
    fields: [{ id: "page", type: "reference", of: "page", max: 256 }],
    supports: { children: true, styles: false, layout: [], anchor: true, visibility: true },
    data: { resolver: "content.page", args: { page: "attrs.page" } }, preview: "{page}", examples: [{page:"selected-page"}] },
  composition: { version: 1, root: { el: "Stack", children: [{ el: "Text", bind: "data.page.title" }, { el: "Slot", props: { name: "children" } }] } },
});
const definitions = { scope, definitions: [{ name: "composed/page-card", version: 1, digest: encoded.digest, definitionJson: encoded.json }] };
const reusable = () => ({ id: "reusable", name: "core/synced", version: 1, attrs: { syncedBlock: "saved-source", revisionPolicy: "pinned", revision: 2 } });
const custom = () => ({ id: "custom", name: "composed/page-card", version: 1, attrs: { page: "selected-page" }, children: [{ id: "text", name: "core/paragraph", version: 2, attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Nested authored content" }] }] } } }] });
function draft(nested = false): any {
 const node = custom();
 return { title: "Mixed content", composedDefinitions: definitions, blocks: nested ? [{ ...node, children: [reusable()] }] : [reusable(), node] };
}
test("a composed resolver and child slot can coexist with pinned reusable content without rewriting the saved tree", () => {
 const adapter = canonicalEditorAdapter(policy, "core", definitions);
 for (const nested of [false, true]) {
  const value = draft(nested), before = structuredClone(value);
  expect(adapter.validate(value)).toBeNull();
  expect(adapter.prepareSave(value)).toEqual(before);
  expect(value).toEqual(before);
 }
});
test("mixed preflight retains required resource, reusable policy and aggregate resolver limits", () => {
 const adapter = canonicalEditorAdapter(policy, "core", definitions);
 const invalid = draft(); invalid.blocks[1].attrs.page = "";
 expect(adapter.validate(invalid)).not.toBeNull();
 expect(canonicalEditorAdapter({ ...policy, disabledBlocks: ["core/synced"] }, "core", definitions).validate(draft(true))).toContain("unavailable");
 expect(canonicalEditorAdapter({ ...policy, capabilities: [] }, "core", definitions).validate(draft())).not.toBeNull();
 const crowded = draft(); crowded.blocks = [reusable(), ...Array.from({length:9},(_,i)=>({...custom(),id:`card-${i}`,attrs:{page:`page-${i}`},children:[]}))];
 expect(adapter.validate(crowded)).toContain("distinct data sources");
});
