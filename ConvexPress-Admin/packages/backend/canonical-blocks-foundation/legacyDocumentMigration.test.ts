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
    { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [paragraph(text("a")), paragraph(text("b"))] }] },
    { type: "paragraph", attrs: { textAlign: "center" }, content: [text("Aligned")] },
    { type: "image", attrs: { src: "https://example.org/photo.png" } },
    { type: "table", content: [] },
    { type: "blockquote", content: [paragraph(text("Quote"))] },
  ]) expect(() => migrate(doc(paragraph(text("Keep")), node))).toThrow();
  try { migrate(doc(paragraph(text("Keep")), { type: "table" })); } catch (error) { expect((error as { path: unknown }).path).toEqual(["content", 1]); }
  expect(() => migrate(doc(paragraph({ type: "text", text: "Unsafe", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] })))).toThrow();
  const maximumParagraph = doc(paragraph(text("x".repeat(20000))));
  expect(migrate(maximumParagraph)[0].attrs).toMatchObject({ body: maximumParagraph });
  expect(() => migrate(doc(paragraph(text("x".repeat(20001)))))).toThrow();
  expect(() => migrate(doc(...Array.from({ length: 81 }, () => paragraph(text("x")))))).toThrow();
  expect(() => migrateLegacyDocument({ postId: "post", content: "<p>HTML</p>" })).toThrow();
});

test("nested and multi-paragraph list items retain hierarchy, marks, blank paragraphs and stable identities", () => {
  const marked = { type: "text", text: "Parent", marks: [{ type: "italic" }] };
  const nested = { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [paragraph(text("Nested"))] }] };
  const original = doc({ type: "bulletList", content: [
    { type: "listItem", content: [paragraph(marked), nested, paragraph(), paragraph(text("After"))] },
    { type: "listItem", content: [paragraph(text("Sibling"))] },
  ] });
  const before = JSON.stringify(original);
  const result = migrate(original);
  expect(result[0].attrs).toEqual({ style: "bullet", items: [] });
  expect(result[0].children?.map(item => item.name)).toEqual(["core/group", "core/group"]);
  const body = result[0].children![0].children!;
  expect(body.map(node => node.name)).toEqual(["core/paragraph", "core/list", "core/paragraph", "core/paragraph"]);
  expect(body[0].attrs).toEqual({ body: doc(paragraph(marked)) });
  expect(body[1].attrs).toEqual({ style: "ordered", items: [{ text: doc(paragraph(text("Nested"))) }] });
  expect(body[2].attrs).toEqual({ body: doc(paragraph()) });
  expect(body[3].attrs).toEqual({ body: doc(paragraph(text("After"))) });
  expect(result[0].children![1].children![0].attrs).toEqual({ body: doc(paragraph(text("Sibling"))) });
  expect(migrate(original)).toEqual(result);
  expect(JSON.stringify(original)).toBe(before);
});

test("nested conversion refuses unknown descendants and expanded canonical budgets before any write", () => {
  const item = (...content: unknown[]) => ({ type: "listItem", content });
  const list = (...content: unknown[]) => ({ type: "bulletList", content });
  expect(() => migrate(doc(list(item(paragraph(text("Keep")), { type: "image", attrs: { src: "/unrepresented.png" } }))))).toThrow();
  expect(() => migrate(doc(list(item(paragraph(text("Keep")), { type: "orderedList", attrs: { start: 9 }, content: [] }))))).toThrow();
  expect(() => migrate(doc(list(...Array.from({ length: 27 }, () => item(paragraph(text("First")), paragraph(text("Second")))))))).toThrow();
  let nested: unknown = list(item(paragraph(text("Leaf"))));
  for (let i = 0; i < 100; i++) nested = list(item(paragraph(text("Parent")), nested));
  expect(() => migrate(doc(nested))).toThrow("budget");
});
