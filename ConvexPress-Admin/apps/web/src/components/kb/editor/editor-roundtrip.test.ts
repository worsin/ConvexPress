import { expect, test } from "bun:test";
import { createRequire } from "node:module";

import type { Editor as EditorType, JSONContent } from "@tiptap/core";

import { normalizeKbDoc } from "@backend/convex/kb/content/normalize";
import { renderKbDoc } from "@backend/convex/kb/content/render";

const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");

const GLOBALS = ["window", "document", "navigator", "HTMLElement", "Node", "Element", "getComputedStyle", "MutationObserver", "DOMParser", "ClipboardEvent", "DragEvent", "KeyboardEvent"] as const;

/** Run with a jsdom window installed, restoring the globals afterwards (bun shares them across files). */
async function withDom(run: (lib: { Editor: typeof EditorType; kbEditorExtensions: typeof import("./extensions").kbEditorExtensions }) => void) {
  const dom = new JSDOM("<!doctype html><div id='mount'></div>", { pretendToBeVisual: true });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const name of GLOBALS) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    const value = name === "window" ? dom.window : (dom.window as unknown as Record<string, unknown>)[name];
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  try {
    const { Editor } = await import("@tiptap/core");
    const { kbEditorExtensions } = await import("./extensions");
    run({ Editor, kbEditorExtensions });
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    }
  }
}

const MEDIA = "jd7f3k2m9x8w6v5t4s3r2q1p0n9m8l7k";
const ARTICLE = "kb7f3k2m9x8w6v5t4s3r2q1p0n9m8l7k";
const text = (value: string, ...marks: unknown[]) => ({ type: "text", text: value, ...(marks.length ? { marks } : {}) });
const paragraph = (...content: unknown[]) => ({ type: "paragraph", content });

/** Every KbDoc node and mark, as the server stores them. */
const EVERYTHING = normalizeKbDoc({
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2, id: "getting-started" }, content: [text("Getting started")] },
    paragraph(
      text("Open "),
      text("Cases", { type: "ui" }),
      text(", press "),
      text("N", { type: "kbd" }),
      text(" or read "),
      text("billing", { type: "link", attrs: { articleId: ARTICLE, anchor: "refunds" } }),
      text(" and "),
      text("the site", { type: "link", attrs: { href: "https://example.com/" } }),
      text(". "),
      text("Bold", { type: "bold" }),
      text(" "),
      text("italic", { type: "italic" }),
      text(" "),
      text("under", { type: "underline" }),
      text(" "),
      text("struck", { type: "strike" }),
      text(" "),
      text("code()", { type: "code" }),
      { type: "hardBreak" },
      text("next line"),
    ),
    { type: "heading", attrs: { level: 3, id: "steps" }, content: [text("Steps")] },
    { type: "orderedList", attrs: { start: 1, kind: "steps" }, content: [{ type: "listItem", content: [paragraph(text("First"))] }, { type: "listItem", content: [paragraph(text("Second")), { type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("Nested"))] }] }] }] },
    { type: "orderedList", attrs: { start: 3, kind: "list" }, content: [{ type: "listItem", content: [paragraph(text("Third"))] }] },
    { type: "callout", attrs: { tone: "warning", title: "Careful" }, content: [paragraph(text("Don't share passwords."))] },
    { type: "figure", attrs: { mediaId: MEDIA, alt: "The cases list", caption: "Filters above the table", size: "wide", frame: "screenshot" } },
    { type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", attrs: { colspan: 1, rowspan: 1 }, content: [paragraph(text("Column"))] }, { type: "tableHeader", attrs: { colspan: 1, rowspan: 1 }, content: [paragraph(text("Meaning"))] }] }, { type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [paragraph(text("Status"))] }, { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [paragraph(text("Where it is"))] }] }] },
    { type: "details", attrs: { summary: "Can I undo this?", open: false }, content: [paragraph(text("Yes, from History."))] },
    { type: "codeBlock", attrs: { language: "ts" }, content: [text("const a = 1;")] },
    { type: "blockquote", content: [paragraph(text("Quoted"))] },
    { type: "horizontalRule" },
  ],
});

type Lib = Parameters<Parameters<typeof withDom>[0]>[0];
function editorWith({ Editor, kbEditorExtensions }: Lib, content: unknown): EditorType {
  return new Editor({
    element: document.getElementById("mount")!,
    extensions: kbEditorExtensions({ placeholder: "", onSlashMenu: () => {}, slashKey: { current: null } }),
    content: content as JSONContent,
  });
}

test("every KbDoc node and mark survives a trip through the editor unchanged", () => withDom((lib) => {
  const editor = editorWith(lib, EVERYTHING);
  const back = normalizeKbDoc(editor.getJSON());
  expect(back).toEqual(EVERYTHING);
  expect(renderKbDoc(back, { media: () => ({ url: "/m.png" }), articleHref: () => "/help/a/b" })).toBe(renderKbDoc(EVERYTHING, { media: () => ({ url: "/m.png" }), articleHref: () => "/help/a/b" }));
  editor.destroy();
}));

test("editor commands produce KbDoc blocks", () => withDom((lib) => {
  const editor = editorWith(lib, { type: "doc", content: [paragraph(text("Do this"))] });
  editor.chain().setTextSelection(2).toggleSteps().run();
  expect(normalizeKbDoc(editor.getJSON()).content[0]).toMatchObject({ type: "orderedList", attrs: { kind: "steps" } });
  editor.chain().toggleSteps().run();
  expect(normalizeKbDoc(editor.getJSON()).content[0]).toMatchObject({ type: "orderedList", attrs: { kind: "list" } });

  editor.commands.setContent({ type: "doc", content: [paragraph(text("Heads up"))] } as JSONContent);
  editor.chain().setTextSelection(2).setCallout("tip").run();
  expect(normalizeKbDoc(editor.getJSON()).content[0]).toMatchObject({ type: "callout", attrs: { tone: "tip" } });

  editor.commands.setContent({ type: "doc", content: [paragraph(text("Before"))] } as JSONContent);
  editor.chain().setTextSelection(7).insertFigure({ mediaId: MEDIA }).run();
  expect(normalizeKbDoc(editor.getJSON()).content.find((block) => block.type === "figure")).toMatchObject({ attrs: { mediaId: MEDIA, frame: "screenshot" } });

  editor.commands.setContent({ type: "doc", content: [paragraph(text("see refunds"))] } as JSONContent);
  editor.chain().setTextSelection({ from: 5, to: 12 }).setMark("link", { href: null, articleId: ARTICLE, anchor: null }).run();
  const linked = normalizeKbDoc(editor.getJSON()).content[0] as { content: Array<{ marks?: unknown[] }> };
  expect(linked.content[1]!.marks).toEqual([{ type: "link", attrs: { href: null, articleId: ARTICLE, anchor: null } }]);
  editor.destroy();
}));
