import { expect, test } from "bun:test";
import { defaultParseSearch, defaultStringifySearch } from "@tanstack/react-router";
import { helpCategoryParams, helpSearchParams } from "./help-search-params";

test("native search continuation survives the router's JSON parsing", () => {
  const cursor = JSON.stringify({ query: "workshop", category: "fieldnotes", cursor: "opaque-backend-cursor" });
  const query = "?" + new URLSearchParams({ q: "workshop", category: "fieldnotes", cursor });
  expect(typeof (defaultParseSearch(query) as Record<string, unknown>).cursor).toBe("object");
  expect(helpSearchParams.parse(defaultParseSearch(query))).toEqual({ q: "workshop", category: "fieldnotes", cursor });
  expect(helpCategoryParams.parse(defaultParseSearch("?" + new URLSearchParams({ cursor })))).toEqual({ cursor });
  expect(helpSearchParams.parse(defaultParseSearch(defaultStringifySearch({ q: "workshop", cursor })))).toEqual({ q: "workshop", cursor });
});
test("native numeric and JSON-like search phrases remain text and URL limits still apply", () => {
  for (const q of ["123", "true", "null", '["setup"]', '{"setup":1}'])
    expect(helpSearchParams.parse(defaultParseSearch("?" + new URLSearchParams({ q }))).q).toBe(q);
  expect(helpSearchParams.parse(defaultParseSearch("?category=123")).category).toBe("123");
  expect(helpSearchParams.safeParse({ cursor: "x".repeat(4097) }).success).toBe(false);
  expect(helpSearchParams.safeParse({ q: "x".repeat(501) }).success).toBe(false);
  expect(helpSearchParams.safeParse({ category: "" }).success).toBe(false);
});
