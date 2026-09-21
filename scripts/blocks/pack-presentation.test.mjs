import { expect, test } from "bun:test";
import { parsePackPresentation } from "./pack-presentation.mjs";
import { parsePattern } from "./patterns.mjs";
import { discoverBlocks } from "./discovery.mjs";
import { fileURLToPath } from "node:url";
const { blocks } = await discoverBlocks(fileURLToPath(new URL("../../", import.meta.url)));
const base = { blocks: { styles: { "core/cta-band": ["default", "inset"] }, hidden: ["core/heading"], renderers: { "core/cta-band": "./blocks/core/cta-band.tsx" } } };
test("pack vocabulary validates known style-enabled blocks, finite names and owned renderers", () => {
  expect(parsePackPresentation(base, blocks, "study")).toEqual({ styles: base.blocks.styles, hidden: ["core/heading"] });
  for (const change of [
    { styles: [] }, { styles: { "unknown/block": ["inset"] } },
    { styles: { "core/cta-band": ["inset", "inset"] } },
    { styles: { "core/cta-band": ["bg-red-500 hover:scale"] } },
    { styles: { "core/cta-band": Array.from({ length: 17 }, (_, i) => `style-${i}`) } },
    { styles: { "core/cta-band": ["inset"] }, renderers: {} },
    { hidden: ["core/heading", "core/heading"] }, { hidden: ["unknown/block"] }, { hidden: "core/heading" },
  ]) expect(() => parsePackPresentation({ blocks: { ...base.blocks, ...change } }, blocks, "study")).toThrow();
});
test("starter patterns cannot offer a hidden block or unavailable style, including children", () => {
  const pack = { id: "study", ...parsePackPresentation(base, blocks, "study") };
  const pattern = { id: "test", title: "Test", description: "A section", category: "contact", blocks: [{ id: "cta", name: "core/cta-band", version: 2, attrs: {}, style: "inset" }] };
  expect(parsePattern(pattern, blocks, pack).blocks[0].style).toBe("inset");
  expect(() => parsePattern({ ...pattern, blocks: [{ ...pattern.blocks[0], style: "outline" }] }, blocks, pack)).toThrow("style");
  expect(() => parsePattern({ ...pattern, blocks: [{ id: "section", name: "core/section", version: 1, attrs: {}, children: [{ id: "heading", name: "core/heading", version: 2, attrs: {} }] }] }, blocks, pack)).toThrow("hidden");
});
