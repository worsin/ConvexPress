import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { prepareBlocks } from "./model";
import list from "../../../../../../../blocks/core/list/render";
import group from "../../../../../../../blocks/core/group/render";
import paragraph from "../../../../../../../blocks/core/paragraph/render";
import heading from "../../../../../../../blocks/core/heading/render";
import code from "../../../../../../../blocks/core/code/render";
import divider from "../../../../../../../blocks/core/divider/render";
import { migrateLegacyDocument } from "../../../../../../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/legacyDocumentMigration";

const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text, marks: [{ type: "italic" }] }] });
const item = (...content: unknown[]) => ({ type: "listItem", content });
const source = { type: "doc", content: [{ type: "bulletList", content: [
  item(p("Parent"), { type: "orderedList", content: [item(p("Nested"))] }, p("After nested list")),
  item(p("Sibling")),
] }] };
const registry = { [list.blockName]: list, [group.blockName]: group, [paragraph.blockName]: paragraph };
const policy = { enabledPlugins: [], capabilities: ["tree.children"], disabledBlocks: [] };

test("converted nested list renders semantic list-item hierarchy and marked prose without flattening", () => {
  const blocks = migrateLegacyDocument({ postId: "nested-list", content: JSON.stringify(source) });
  const html = renderToStaticMarkup(prepareBlocks(blocks, registry, policy));
  const dom = new JSDOM(html);
  try {
    const outer = dom.window.document.querySelector("ul.cp-block-list")!;
    expect(outer.children.length).toBe(2);
    expect([...outer.children].every(child => child.tagName === "LI")).toBe(true);
    expect(outer.children[0].querySelectorAll("ol.cp-block-list > li").length).toBe(1);
    expect(outer.children[0].querySelector("ol em")?.textContent).toBe("Nested");
    expect(outer.children[0].textContent).toBe("ParentNestedAfter nested list");
    expect(outer.children[1].textContent).toBe("Sibling");
    expect(outer.querySelectorAll("em").length).toBe(4);
    expect(dom.window.document.querySelectorAll("ul,ol").length).toBe(2);
  } finally { dom.window.close(); }
});

test("mixed article blocks use prose flow while an explicit spacing choice remains authoritative", () => {
  const source = { type: "doc", content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A field note" }] },
    p("Introduction"),
    { type: "bulletList", content: [item(p("One"))] },
    { type: "codeBlock", content: [{ type: "text", text: "const saved = true;" }] },
    { type: "horizontalRule" },
  ] };
  const blocks = migrateLegacyDocument({ postId: "article-flow", content: JSON.stringify(source) });
  const renderers = { ...registry, [heading.blockName]: heading, [code.blockName]: code, [divider.blockName]: divider };
  const render = (nodes: unknown[]) => new JSDOM(renderToStaticMarkup(prepareBlocks(nodes, renderers, policy)));
  const dom = render(blocks);
  try {
    expect(dom.window.document.querySelectorAll("body > .cp-article-flow").length).toBe(5);
    expect([...dom.window.document.querySelectorAll("section[data-block-id]")].map(n => n.getAttribute("data-spacing"))).toEqual(Array(5).fill("none"));
  } finally { dom.window.close(); }
  const explicit = render(blocks.map(block => ({ ...block, layout: { spacing: "spacious" } })));
  try {
    expect(explicit.window.document.querySelectorAll(".cp-article-flow").length).toBe(0);
    expect([...explicit.window.document.querySelectorAll("section[data-block-id]")].map(n => n.getAttribute("data-spacing"))).toEqual(Array(5).fill("spacious"));
  } finally { explicit.window.close(); }
});

test("existing version-2 flat lists keep their items and completion states; empty child slots add no markers", () => {
  const attrs = { style: "task", items: [{ text: { type: "doc", content: [p("Done")] }, done: true }, { text: { type: "doc", content: [p("Open")] }, done: false }] };
  const existing = { id: "flat", name: "core/list", version: 2, attrs };
  const before = JSON.stringify(existing);
  const html = renderToStaticMarkup(prepareBlocks([existing], registry, policy));
  expect(html).toContain('aria-label="Completed"');
  expect(html).toContain('aria-label="Not completed"');
  const dom = new JSDOM(html);
  try { expect(dom.window.document.querySelectorAll("ul > li").length).toBe(2); } finally { dom.window.close(); }
  expect(JSON.stringify(existing)).toBe(before);
  expect(renderToStaticMarkup(<list.View attrs={{ style: "bullet", items: [] }} resources={{ media: {} }}>{[null, false, undefined]}</list.View>)).not.toContain("<li");
});
