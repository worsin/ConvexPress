import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { attrsSchema, parseBlockSpec } from "../../../../scripts/blocks/schema.mjs";
const spec = parseBlockSpec(JSON.parse(readFileSync(new URL("../block.json", import.meta.url), "utf8")));
test("recently viewed preserves v1 title/limit and refuses saved visitor history or authority", () => {
  const attrs = attrsSchema(spec.fields);
  expect(attrs.parse({ title: "Take another look", limit: 48 })).toEqual({ title: "Take another look", limit: 48 });
  for (const input of [{limit:49},{limit:0},{limit:1.5},{recentlyViewedIds:["private"]},{productIds:["private"]},{viewerKey:"another-account"},{mode:"manual"}]) expect(attrs.safeParse(input).success).toBe(false);
});
