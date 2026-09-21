import { expect, test } from "bun:test";
import { migrateLegacyDocument } from "./legacyDocumentMigration";
const text = (value: string) => ({ type: "text", text: value });
const paragraph = (...content: unknown[]) => ({ type: "paragraph", content });
const doc = (...content: unknown[]) => ({ type: "doc", content });
const migrate = (value: unknown) => migrateLegacyDocument({ postId: "persisted-post", content: JSON.stringify(value) });

test("article conversion preserves paragraph boundaries, blank paragraphs, inline marks and hard breaks", () => {
  const original = doc(paragraph(text("First"), { type: "hardBreak" }, { type: "text", text: "Linked", marks: [{ type: "bold" }, { type: "underline" }, { type: "link", attrs: { href: "/notes", target: "_blank" } }] }), paragraph(), paragraph(text("Last")));
  const blocks = migrate(original);
  expect(blocks.map(block => block.name)).toEqual(["core/paragraph", "core/paragraph", "core/paragraph"]);
  expect(blocks.map(block => (block.attrs as { body: unknown }).body)).toEqual(original.content.map(node => doc(node)));
  expect(migrate(original)).toEqual(blocks);
  expect(migrateLegacyDocument({ postId: "different-post", content: JSON.stringify(original) })[0].id).not.toBe(blocks[0].id);
});

test("headings, flat ordered/task lists, code and horizontal rules retain exact structured content", () => {
  const bold = { type: "text", text: "Marked", marks: [{ type: "bold" }] };
  const input = doc({ type: "heading", attrs: { level: 3 }, content: [bold] }, { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [paragraph(bold)] }] }, { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [paragraph(text("Open"))] }, { type: "taskItem", attrs: { checked: true }, content: [paragraph(text("Done"))] }] }, { type: "codeBlock", attrs: { language: "typescript" }, content: [text("const x = 1;\n"), text("\n// exact\n")] }, { type: "horizontalRule" });
  const result = migrate(input);
  expect(result.map(block => block.name)).toEqual(["core/heading", "core/list", "core/list", "core/code", "core/divider"]);
  expect(result[0].attrs).toMatchObject({ level: 3, text: doc(paragraph(bold)) });
  expect(result[1].attrs).toMatchObject({ style: "ordered", items: [{ text: doc(paragraph(bold)) }] });
  expect(result[2].attrs).toMatchObject({ style: "task", items: [{ text: doc(paragraph(text("Open"))), done: false }, { text: doc(paragraph(text("Done"))), done: true }] });
  expect(result[3].attrs).toMatchObject({ language: "typescript", code: "const x = 1;\n\n// exact\n" });
});

test("unrepresented semantics fail at an exact path without returning a partial converted tree", () => {
  for (const node of [
    { type: "orderedList", attrs: { start: 7 }, content: [] },
    { type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("a")), paragraph(text("b"))] }] },
    { type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("a")), { type: "bulletList", content: [] }] }] },
    { type: "paragraph", attrs: { textAlign: "center" }, content: [text("Aligned")] },
    { type: "image", attrs: { src: "https://example.org/photo.png" } },
    { type: "table", content: [] },
    { type: "blockquote", content: [paragraph(text("Quote"))] },
  ]) expect(() => migrate(doc(paragraph(text("Keep")), node))).toThrow();
  try { migrate(doc(paragraph(text("Keep")), { type: "table" })); } catch (error) { expect((error as { path: unknown }).path).toEqual(["content", 1]); }
  expect(() => migrate(doc(paragraph({ type: "text", text: "Unsafe", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] })))).toThrow();
  expect(() => migrate(doc(paragraph(text("x".repeat(2001)))))).toThrow();
  expect(() => migrate(doc(...Array.from({ length: 81 }, () => paragraph(text("x")))))).toThrow();
  expect(() => migrateLegacyDocument({ postId: "post", content: "<p>HTML</p>" })).toThrow();
});
