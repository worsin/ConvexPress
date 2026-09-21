import { expect, test } from "bun:test";
import { parseBlockSpec } from "./schema.mjs";
import paragraph from "../../blocks/core/paragraph/block.json";
import { authoredBlockSearchText } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/searchText";

test("search declarations reject guessed fields, duplicates, structural IDs and non-text values", () => {
  for (const searchText of [[ ["missing"] ], [["body"], ["body"]], [["body", "content", "*"]]])
    expect(() => parseBlockSpec({ ...paragraph, searchText })).toThrow();
  for (const field of [
    { type: "text", format: "resource-id" }, { type: "text", domId: true },
    { type: "media", storage: "id" }, { type: "reference", of: "post" },
    { type: "link", storage: "href" }, { type: "boolean" },
  ]) expect(() => parseBlockSpec({ ...paragraph, fields: [{ id: "secret", ...field }], searchText: [["secret"]], examples: [{}] })).toThrow();
});

test("rich text preserves marked word runs while excluding links, marks and attributes", () => {
  expect(authoredBlockSearchText("core/paragraph", { body: { type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Sun" }, { type: "text", text: "flower", marks: [{ type: "link", attrs: { href: "https://private.example.invalid/secretword" } }] }] },
    { type: "paragraph", content: [{ type: "text", text: "meadow" }, { type: "hardBreak" }, { type: "text", text: "blooms" }] },
  ] } })).toBe("Sunflower meadow blooms");
});

test("nested editorial repeaters are searchable without their destinations", () => {
  const text = authoredBlockSearchText("core/pricing-cards", { eyebrow: "", heading: "Plans", body: "", plans: [{ name: "Studio", price: "$10", description: "For makers", features: ["Fast", "Private"], ctaLabel: "Secret control", ctaUrl: "https://private.example.invalid" }] });
  expect(text).toBe("Plans Studio $10 For makers Fast Private");
  expect(authoredBlockSearchText("core/table", { columns: ["Column"], rows: [["Nested"]], caption: "Table" })).toBe("Column Nested Table");
});

test("undeclared data and private form configuration produce no candidate text", () => {
  expect(authoredBlockSearchText("core/contact-form", { recipientEmail: "secret@example.invalid" })).toBe("");
  expect(authoredBlockSearchText("core/search-results", { emptyMessage: "No recursive candidates" })).toBe("");
  expect(() => authoredBlockSearchText("unknown/private", { body: "secret" })).toThrow();
  expect(() => authoredBlockSearchText("core/paragraph", { body: { type: "doc", content: [{ type: "script", text: "bad" }] } })).toThrow();
});

test("prose follows rendered inline copy without indexing markdown link destinations", () => {
  expect(authoredBlockSearchText("core/hero", { eyebrow: "", title: "Intro", body: "A **bright** [garden](https://example.invalid/Invisiblelinkneedle) with *flowers*." })).toBe("Intro A bright garden with flowers.");
  // The same syntax in a literal heading remains visible literal text.
  expect(authoredBlockSearchText("core/hero", { eyebrow: "", title: "[Garden](https://example.invalid/literal)", body: "" })).toBe("[Garden](https://example.invalid/literal)");
  expect(authoredBlockSearchText("core/hero", { eyebrow: "", title: "Intro", body: "**First\n\nsecond** [relative](/visible-literal)" })).toBe("Intro **First second** [relative](/visible-literal)");
  expect(() => parseBlockSpec({ ...paragraph, searchText: [{ path: ["body"], format: "prose" }] })).toThrow("plain text field");
});
