import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { attrsSchema, parseBlockSpec } from "../../../../scripts/blocks/schema.mjs";
const spec = parseBlockSpec(JSON.parse(readFileSync(new URL("../block.json", import.meta.url), "utf8")));
test("sale countdown retains v1 authored deadline/title and the full 48-product limit", () => {
  const attrs = attrsSchema(spec.fields);
  expect(attrs.parse({ title: "Summer sale", target: "2040-06-01T18:00:00Z", limit: 48 })).toEqual({ title: "Summer sale", target: "2040-06-01T18:00:00Z", limit: 48 });
  for (const input of [{limit:49},{limit:0},{limit:1.5},{target:"not-a-date"},{productIds:["private"]},{mode:"manual"}]) expect(attrs.safeParse(input).success).toBe(false);
});
