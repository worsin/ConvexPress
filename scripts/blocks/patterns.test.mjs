import { test, expect } from "bun:test";
import { fileURLToPath } from "node:url";
import { discoverBlocks } from "./discovery.mjs";
import { parsePattern } from "./patterns.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const { blocks } = await discoverBlocks(root);
const pack = { id: "study", styles: {}, hidden: [], treatments: {} };
const base = { id: "test", title: "Test section", description: "A portable section.", category: "story", blocks: [{ id: "heading", name: "core/heading", version: 2, attrs: {} }] };
test("patterns reject duplicate IDs, stale versions, injected fields and noncanonical layout", () => {
  for (const tree of [
    [base.blocks[0], base.blocks[0]],
    [{ ...base.blocks[0], version: 1 }],
    [{ ...base.blocks[0], resolvedData: { customer: "private" } }],
    [{ ...base.blocks[0], layout: { columns: 5 } }],
  ]) expect(() => parsePattern({ ...base, blocks: tree }, blocks, pack)).toThrow();
});
test("patterns reject site-owned resources including nested product IDs and media", () => {
  for (const node of [
    { id: "hero", name: "core/hero", version: 2, attrs: { mediaId: "customer-asset" } },
    { id: "products", name: "blocks/product-collection", version: 2, attrs: { productIds: ["private-product"] } },
    { id: "posts", name: "core/post-grid", version: 1, attrs: { query: { author: "private-author" } } },
  ]) expect(() => parsePattern({ ...base, blocks: [node] }, blocks, pack)).toThrow("site-owned");
});
test("patterns keep site-local dynamic queries without carrying fixture records", () => {
  const result = parsePattern({ ...base, blocks: [{ id: "posts", name: "core/post-grid", version: 1, attrs: { limit: 6 } }] }, blocks, pack);
  expect(result.blocks[0].attrs.limit).toBe(6);
});
