// @ts-ignore The local bun:test shim omits afterAll.
import { afterAll, expect, test } from "bun:test";
import { loadStaged } from "../schema-editor/test-harness";
const loaded = await loadStaged("../canonical-editor/document-adapter.ts");
const instance = await loadStaged("../canonical-editor/patterns.ts");
afterAll(async () => { await loaded.cleanup(); await instance.cleanup(); });
const { canonicalEditorAdapter, checkedDraft } = loaded.module;
const policy = { enabledPlugins: ["commerce"], capabilities: ["tree.children", "reference.targetResolution"], disabledBlocks: [] };
const flatten = (nodes: any[]): any[] => nodes.flatMap(node => [node, ...flatten(node.children ?? [])]);
test("all starter sections can be inserted twice and saved without sharing IDs or mutable content", () => {
  for (const pack of ["core", "journal", "depot", "aster-house"]) {
    const adapter = canonicalEditorAdapter(policy, pack);
    expect(adapter.availablePatterns.length).toBe(8);
    for (const pattern of adapter.availablePatterns) {
      const first = adapter.createPattern(pattern.id), second = adapter.createPattern(pattern.id);
      const all = flatten([...first, ...second]);
      expect(new Set(all.map(node => node.id)).size).toBe(all.length);
      const draft = { title: "Section study", blocks: [...first, ...second] };
      expect(adapter.validate(draft)).toBeNull();
      expect(checkedDraft(draft).blocks).toEqual(draft.blocks);
      const originalAttrs = structuredClone(second[0].attrs);
      first[0].attrs.injected = "unsaved change";
      expect(adapter.createPattern(pattern.id)[0].attrs).toEqual(originalAttrs);
    }
  }
});
test("pattern discovery follows current pack, plugin, capability and disabled-block policy", () => {
  const core = canonicalEditorAdapter(policy, "core");
  expect(core.availablePatterns.every((p: any) => p.id.startsWith("core/"))).toBe(true);
  expect(() => core.createPattern("journal/welcome")).toThrow();
  expect(canonicalEditorAdapter(policy, "missing").availablePatterns).toEqual([]);
  expect(canonicalEditorAdapter({ ...policy, enabledPlugins: [] }, "depot").availablePatterns.some((p: any) => p.id === "depot/explore")).toBe(false);
  expect(canonicalEditorAdapter({ ...policy, disabledBlocks: ["core/heading"] }, "core").availablePatterns.some((p: any) => p.id === "core/welcome")).toBe(false);
  expect(canonicalEditorAdapter({ ...policy, capabilities: [] }, "core").availablePatterns.length).toBe(0);
});
test("repeated patterns remap authored anchors and both link types while preserving ordinary text", () => {
  const input = [
    { id: "title", name: "core/heading", version: 2, anchor: "section", attrs: { anchor: "details" } },
    { id: "hero", name: "core/hero", version: 2, attrs: { title: "#details", primaryCtaUrl: "#details", secondaryCtaUrl: "https://example.com/#details" } },
    { id: "paragraph", name: "core/paragraph", version: 2, attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Read more", marks: [{ type: "link", attrs: { href: "#section" } }] }] }] } } },
  ];
  const first = instance.module.instantiatePattern(input), second = instance.module.instantiatePattern(input);
  expect(first[0].attrs.anchor).not.toBe(second[0].attrs.anchor);
  expect(first[1].attrs.primaryCtaUrl).toBe("#" + first[0].attrs.anchor);
  expect(first[1].attrs.secondaryCtaUrl).toBe("https://example.com/#details");
  expect(first[1].attrs.title).toBe("#details");
  expect(first[2].attrs.body.content[0].content[0].marks[0].attrs.href).toBe("#" + first[0].anchor);
  expect(input[0].attrs.anchor).toBe("details");
  expect(() => checkedDraft({ title: "Anchors", blocks: [...first, ...second] })).not.toThrow();
});
