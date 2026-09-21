// @ts-ignore The local bun:test shim omits afterAll.
import { afterAll, expect, test } from "bun:test";
import { loadStaged } from "../schema-editor/test-harness";
const loaded = await loadStaged("../canonical-editor/presentation.fixture.ts");
afterAll(() => loaded.cleanup());
const { canonicalEditorAdapter, checkedDraft, packBlockPresentation } = loaded.module;
const policy = { enabledPlugins: [], capabilities: ["tree.children", "reference.targetResolution"], disabledBlocks: [] };
test("block layout edits retain content, survive template changes, reset by omission and refuse unsupported input", () => {
	const adapter = canonicalEditorAdapter(policy, "core");
	for (const name of [
		"core/heading",
		"core/paragraph",
		"core/divider",
		"core/spacer",
	]) {
		const original = adapter.createBlock(name);
		let edited = original;
		for (const [field, choices] of Object.entries<readonly string[]>(
			adapter.layoutOptions(original),
		)) {
			for (const choice of choices) {
				edited = adapter.withLayout(edited, field, choice);
				expect(adapter.layoutValue(edited, field)).toBe(choice);
				expect(
					checkedDraft({ title: "Layout", blocks: [edited] }).blocks[0].layout[
						field
					],
				).toBe(choice);
				expect(
					canonicalEditorAdapter(policy, "journal").layoutValue(edited, field),
				).toBe(choice);
				expect(edited.attrs).toEqual(original.attrs);
			}
			edited = adapter.withLayout(edited, field, "");
			expect(edited.layout).toBeUndefined();
		}
		expect(original.layout).toBeUndefined();
		expect(() => adapter.withLayout(original, "spacing", "42px")).toThrow();
		expect(() => adapter.withLayout(original, "position", "fixed")).toThrow();
		const anchored = adapter.withAnchor(original, "chapter-two");
		expect(
			checkedDraft({ title: "Anchored", blocks: [anchored] }).blocks[0].anchor,
		).toBe("chapter-two");
		expect(adapter.withAnchor(anchored, "").anchor).toBeUndefined();
		expect(() =>
			checkedDraft({
				title: "Invalid",
				blocks: [adapter.withAnchor(original, "1 invalid")],
			}),
		).toThrow();
		expect(() =>
			checkedDraft({
				title: "Duplicate",
				blocks: [anchored, { ...anchored, id: "second" }],
			}),
		).toThrow();
	}
});
test("editor offers pack styles while preserving unsupported saved choices across template switches", () => {
  const journal = canonicalEditorAdapter(policy, "journal"), core = canonicalEditorAdapter(policy, "core");
  const node = journal.createBlock("core/cta-band");
  expect(journal.styleOptions(node)).toEqual(["default", "inset"]);
  const styled = journal.withStyle(node, "inset");
  expect(core.styleOptions(styled)).toEqual(["default"]);
  expect(core.styleValue(styled)).toBe("inset");
  expect(core.validate({ title: "Story", blocks: [styled] })).toBeNull();
  expect(checkedDraft({ title: "Story", blocks: [styled] }).blocks[0].style).toBe("inset");
  expect(() => core.withStyle(styled, "inset")).toThrow("unavailable");
  expect(core.withStyle(styled, "default").style).toBe("default");
});
test("hidden blocks are excluded from new choices and nested patterns but existing content remains editable", () => {
  const before = canonicalEditorAdapter(policy, "journal"), heading = before.createBlock("core/heading");
  const hidden = packBlockPresentation.journal.hidden;
  hidden.push("core/heading");
  try {
    const adapter = canonicalEditorAdapter(policy, "journal");
    expect(adapter.availableBlocks.some((entry: any) => entry.name === "core/heading")).toBe(false);
    expect(() => adapter.createBlock("core/heading")).toThrow("unavailable");
    expect(adapter.availablePatterns.some((entry: any) => entry.id === "journal/welcome")).toBe(false);
    expect(adapter.validate({ title: "Existing", blocks: [heading] })).toBeNull();
  } finally { hidden.length = 0; }
});

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("style control DOM runs with isolated browser event globals", () => {
  const result = spawnSync(process.execPath, ["test", fileURLToPath(new URL("./presentation.cases.jsx", import.meta.url))], { encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) throw Error(result.stdout + result.stderr);
  expect(result.status).toBe(0);
});
