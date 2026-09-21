import { test, expect } from "bun:test";
import { blockPageHref, blockPageRequestSchema, parseBlockPageSearch, postGridArgsSchema, postGridResultSchema, postGridMatchesArgs } from "./postGridContracts";

const card = { id: "post-1", title: "A journal entry", href: "/blog/entry", excerpt: null, publishedAt: 100, author: null, image: null };
test("Post Grid keeps saved filters closed and rejects arbitrary private-query arguments", () => {
  expect(postGridArgsSchema.parse({})).toEqual({ query: {}, limit: 6, showExcerpt: true, cursor: null });
  for (const input of [{ limit: 0 }, { limit: 49 }, { limit: 1.5 }, { query: { status: "draft" } }, { query: { author: "" } }, { functionName: "users:list" }])
    expect(postGridArgsSchema.safeParse(input).success).toBe(false);
  expect(postGridArgsSchema.parse({ query: { category: "category-id", tag: "tag-id", author: "user-id" } }).query)
    .toEqual({ category: "category-id", tag: "tag-id", author: "user-id" });
});
test("Post Grid responses reject unsafe cards, stalled pagination and mismatched request state", () => {
  const result = { items: [card], cursor: null, nextCursor: "next" };
  expect(postGridResultSchema.parse(result)).toEqual(result);
  for (const candidate of [
    { ...result, items: [card, card] },
    { ...result, items: [card, { ...card, id: "post-2", publishedAt: 101 }] },
    { ...result, items: [{ ...card, content: "Private source" }] },
    { ...result, items: [{ ...card, href: "//outside.invalid" }] },
    { ...result, cursor: "next" },
  ]) expect(postGridResultSchema.safeParse(candidate).success).toBe(false);
  expect(postGridMatchesArgs(postGridArgsSchema.parse({}), result)).toBe(true);
  expect(postGridMatchesArgs(postGridArgsSchema.parse({ cursor: "another" }), result)).toBe(false);
  expect(postGridMatchesArgs(postGridArgsSchema.parse({ showExcerpt: false }), { ...result, items: [{ ...card, excerpt: "Hidden" }] })).toBe(false);
});
test("independent grid links preserve other grid positions, route filters, and anchors", () => {
  const first = blockPageHref("/page/journal/?template=journal#stories", "grid-a", "opaque+/=&?");
  const second = blockPageHref(first, "grid-b", "other");
  const url = new URL(second, "https://site.invalid");
  expect(url.pathname).toBe("/page/journal/"); expect(url.searchParams.get("template")).toBe("journal"); expect(url.hash).toBe("#stories");
  expect(parseBlockPageSearch(url.searchParams.get("blockPages"))).toEqual({ "grid-a": "opaque+/=&?", "grid-b": "other" });
  const reset = new URL(blockPageHref(second, "grid-a", null), url);
  expect(parseBlockPageSearch(reset.searchParams.get("blockPages"))).toEqual({ "grid-b": "other" });
  expect(blockPageHref(blockPageHref(second, "grid-a", null), "grid-b", null)).toBe("/page/journal/?template=journal#stories");
});
test("pagination input is bounded and cannot carry injected arguments or prototype properties", () => {
  for (const value of ["null", "[]", '{"grid":{"status":"draft"}}', '{"__proto__":"cursor"}', '{"constructor":"cursor"}', JSON.stringify({ grid: "x".repeat(4097) }), JSON.stringify(Object.fromEntries(Array.from({ length: 9 }, (_, i) => ["grid" + i, "cursor"])))])
    expect(() => parseBlockPageSearch(value)).toThrow();
  for (const href of ["//outside.invalid", "https://outside.invalid", "/\\outside.invalid"])
    expect(() => blockPageHref(href, "grid", "cursor")).toThrow();
  expect(() => blockPageHref("/page/journal/", "__proto__", "cursor")).toThrow();
  expect(blockPageRequestSchema.parse({})).toEqual({});
});
