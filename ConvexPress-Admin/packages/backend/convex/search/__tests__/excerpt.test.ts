import { expect, test } from "bun:test";
import { plainSearchExcerpt } from "../excerpt";

test("search cards keep short authored copy and literal text without HTML injection", () => {
  expect(plainSearchExcerpt("  A <garden> & a\n workshop. ", "garden")).toBe("A <garden> & a workshop.");
  expect(plainSearchExcerpt("", "garden")).toBe("");
});
test("long body excerpts show the matching context within a compact word boundary", () => {
  const text = "Earlier background. ".repeat(100) + "Sunflower workshop for visitors. " + "More details follow. ".repeat(100);
  const excerpt = plainSearchExcerpt(text, "SUNFLOWER");
  expect(excerpt).toContain("Sunflower workshop for visitors.");
  expect(excerpt.length).toBeLessThanOrEqual(242);
  expect(excerpt.startsWith("…")).toBe(true);
  expect(excerpt.endsWith("…")).toBe(true);
});
test("title-only matches and long tokens remain bounded without cutting emoji in half", () => {
  expect(plainSearchExcerpt("A visible sentence. ".repeat(80), "title-only").length).toBeLessThanOrEqual(241);
  const excerpt = plainSearchExcerpt("x" + "🌻".repeat(200), "");
  expect(excerpt.length).toBeLessThanOrEqual(241);
  expect(excerpt).not.toMatch(/[\uD800-\uDBFF]…$/u);
});
