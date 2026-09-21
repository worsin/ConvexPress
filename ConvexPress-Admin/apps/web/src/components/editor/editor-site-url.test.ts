import { expect, test } from "bun:test";
import { editorContentUrl, resolveEditorSiteUrl } from "./editor-site-url";

test("published links use the selected Website and preserve nested page paths", () => {
  expect(editorContentUrl("http://127.0.0.1:4322", { type: "page", slug: "child", path: "/parent/child" })).toBe("http://127.0.0.1:4322/parent/child");
  expect(editorContentUrl("https://live.example", { type: "post", slug: "hello world" })).toBe("https://live.example/blog/hello%20world");
  expect(editorContentUrl(undefined, { type: "page", slug: "child" })).toBeUndefined();
  for (const path of ["//foreign.example", "/\\foreign.example", "https://foreign.example", "/page?token=value", "/page#fragment", "/\n/foreign.example"])
    expect(editorContentUrl("https://live.example", { type: "page", slug: "child", path })).toBeUndefined();
});

test("editor permalink uses the selected environment before a copied site's settings", () => {
  expect(
    resolveEditorSiteUrl("https://aster-house-staging.h5s.workers.dev", {
      values: { siteUrl: "https://production.example", homeUrl: "https://production.example" },
    }),
  ).toBe("https://aster-house-staging.h5s.workers.dev");
});
test("single-site editor reads public URLs from the actual raw settings document", () => {
  expect(
    resolveEditorSiteUrl(undefined, {
      values: { siteUrl: "https://backend.example", homeUrl: "https://public.example/" },
    }),
  ).toBe("https://public.example");
  expect(resolveEditorSiteUrl(undefined, { values: { siteUrl: "http://localhost:4701/" } })).toBe(
    "http://localhost:4701",
  );
  expect(resolveEditorSiteUrl(undefined, null)).toBeUndefined();
  expect(resolveEditorSiteUrl(undefined, {})).toBeUndefined();
});
test("invalid selected identity never falls back to another environment's URL", () => {
  for (const invalid of [
    "javascript:alert(1)",
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com?token=secret",
    "not a URL",
    "",
  ])
    expect(
      resolveEditorSiteUrl(invalid, { values: { siteUrl: "https://production.example" } }),
    ).toBeUndefined();
});
