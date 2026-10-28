import { describe, expect, test } from "bun:test";

import { kbDocFromHtml } from "../fromHtml";
import { prepareKbContent, readKbDoc, renderKbDoc } from "../index";
import type { KbDoc } from "../model";
import { normalizeKbDoc, safeKbHref } from "../normalize";

const MEDIA = "jd7f3k2m9x8w6v5t4s3r2q1p0n9m8l7k";
const ARTICLE = "kb7f3k2m9x8w6v5t4s3r2q1p0n9m8l7k";

function doc(...content: unknown[]) {
  return normalizeKbDoc({ type: "doc", content });
}
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const t = (text: string, ...marks: unknown[]) => ({ type: "text", text, ...(marks.length ? { marks } : {}) });

describe("rendering escapes everything an author can type", () => {
  test("text, alt and caption are escaped", () => {
    const html = renderKbDoc(
      doc(p(t('<script>alert("x")</script> & "quoted"')), { type: "figure", attrs: { mediaId: MEDIA, alt: '"><img src=x onerror=alert(1)>', caption: "<b>cap</b>" } }),
      { media: () => ({ url: "https://cdn.example.com/a.png?x=1&y=2", width: 800, height: 450 }) },
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>cap</b>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;quoted&quot;");
    expect(html).toContain('src="https://cdn.example.com/a.png?x=1&amp;y=2"');
    expect(html).toContain('alt="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
  });

  test("unsafe link targets lose the link but keep the text", () => {
    for (const href of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " data:text/html,x", "//evil.example", "vbscript:x", "/\\evil", "java\nscript:x"]) {
      const html = renderKbDoc(doc(p(t("click", { type: "link", attrs: { href } }))));
      expect(html).toBe("<p>click</p>");
    }
  });

  test("safe link targets", () => {
    expect(safeKbHref("https://example.com/a b")).toBe("https://example.com/a%20b");
    expect(safeKbHref("/help/billing")).toBe("/help/billing");
    expect(safeKbHref("#step-2")).toBe("#step-2");
    expect(safeKbHref("mailto:help@example.com")).toBe("mailto:help@example.com");
    expect(safeKbHref("tel:+17025550100")).toBe("tel:+17025550100");
    const html = renderKbDoc(doc(p(t("docs", { type: "link", attrs: { href: "https://example.com" } }))));
    expect(html).toBe('<p><a href="https://example.com/" rel="noopener noreferrer" target="_blank">docs</a></p>');
  });

  test("links to other articles resolve through the caller, or render as text", () => {
    const content = doc(p(t("see billing", { type: "link", attrs: { articleId: ARTICLE, anchor: "refunds" } })));
    expect(renderKbDoc(content)).toBe("<p>see billing</p>");
    expect(renderKbDoc(content, { articleHref: (id, anchor) => `/help/account/billing#${anchor}` })).toBe(
      `<p><a href="/help/account/billing#refunds" data-kb-article="${ARTICLE}" data-kb-anchor="refunds">see billing</a></p>`,
    );
  });

  test("a figure whose media is missing is left out; video media plays", () => {
    const content = doc({ type: "figure", attrs: { mediaId: MEDIA, alt: "Demo" } });
    expect(renderKbDoc(content, { media: () => null })).toBe("");
    expect(renderKbDoc(content, { media: () => ({ url: "/m/v.mp4", mimeType: "video/mp4" }) })).toContain('<video src="/m/v.mp4" controls');
  });
});

describe("normalization", () => {
  test("legacy TipTap: image nodes, level-1 headings, unknown wrappers, duplicate anchors", () => {
    const result = normalizeKbDoc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [t("Getting started")] },
        { type: "customWrapper", content: [p(t("inside"))] },
        { type: "image", attrs: { src: "https://cdn.example.com/s.png", alt: "Screen" } },
        { type: "heading", attrs: { level: 2 }, content: [t("Getting started")] },
        { type: "heading", attrs: { level: 6 }, content: [t("Deep")] },
      ],
    });
    expect(result.content.map((block) => block.type)).toEqual(["heading", "paragraph", "figure", "heading", "heading"]);
    expect(result.content[0]).toMatchObject({ attrs: { level: 2, id: "getting-started" } });
    expect(result.content[3]).toMatchObject({ attrs: { level: 2, id: "getting-started-2" } });
    expect(result.content[4]).toMatchObject({ attrs: { level: 4 } });
    expect(result.content[2]).toMatchObject({ attrs: { src: "https://cdn.example.com/s.png", mediaId: null } });
  });

  test("figures need a media id or a safe image source", () => {
    expect(doc({ type: "figure", attrs: { src: "http://insecure.example/a.png" } }).content).toEqual([]);
    expect(doc({ type: "figure", attrs: { src: "javascript:x" } }).content).toEqual([]);
    expect(doc({ type: "figure", attrs: { mediaId: "not an id" } }).content).toEqual([]);
    expect(doc({ type: "figure", attrs: { mediaId: MEDIA, frame: "screenshot", size: "wide" } }).content[0]).toMatchObject({ attrs: { frame: "screenshot", size: "wide" } });
  });

  test("marks are deduplicated and ordered; code text carries no formatting", () => {
    const result = doc(p(t("x", { type: "italic" }, { type: "bold" }, { type: "bold" }), t("y", { type: "code" }, { type: "bold" })));
    const [first, second] = (result.content[0] as { content: Array<{ marks?: Array<{ type: string }> }> }).content;
    expect(first!.marks!.map((mark) => mark.type)).toEqual(["bold", "italic"]);
    expect(second!.marks!.map((mark) => mark.type)).toEqual(["code"]);
  });

  test("loose inline content becomes paragraphs; empty blocks disappear", () => {
    const result = normalizeKbDoc({ type: "doc", content: [t("loose"), p(), p(t("   ")), { type: "bulletList", content: [] }] });
    expect(result.content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "loose" }] }]);
  });

  test("limits are enforced", () => {
    const many = Array.from({ length: 21_000 }, () => p(t("x")));
    expect(() => normalizeKbDoc({ type: "doc", content: many })).toThrow();
    let deep: unknown = p(t("x"));
    for (let i = 0; i < 40; i++) deep = { type: "blockquote", content: [deep] };
    expect(() => normalizeKbDoc({ type: "doc", content: [deep] })).toThrow();
    expect(() => normalizeKbDoc({ type: "paragraph" })).toThrow();
  });
});

describe("legacy HTML import", () => {
  test("help-article HTML maps onto KbDoc", () => {
    const html = `
      <p>The cases list is the <strong>most-visited</strong> screen. Read <a href="/help/cases">more</a>.</p>
      <h2>Useful filters</h2>
      <ul><li><strong>Status: Treating</strong> — still being seen.</li><li>Type: CME</li></ul>
      <ol class="steps"><li>Open <em>Cases</em></li><li>Click <kbd>New</kbd></li></ol>
      <div class="callout warning"><p>Never share your password.</p></div>
      <figure><img src="https://cdn.example.com/list.png" alt="The cases list"><figcaption>Filters sit above the table.</figcaption></figure>
      <table><thead><tr><th>Column</th><th>Meaning</th></tr></thead><tbody><tr><td>Status</td><td>Where it is</td></tr></tbody></table>
      <script>alert(1)</script><iframe src="https://evil.example"></iframe>
      <p onclick="steal()">Safe <a href="javascript:alert(1)">text</a></p>`;
    const result = kbDocFromHtml(html);
    expect(result.content.map((block) => block.type)).toEqual(["paragraph", "heading", "bulletList", "orderedList", "callout", "figure", "table", "paragraph"]);
    expect(result.content[3]).toMatchObject({ attrs: { kind: "steps" } });
    expect(result.content[4]).toMatchObject({ attrs: { tone: "warning" } });
    expect(result.content[5]).toMatchObject({ attrs: { src: "https://cdn.example.com/list.png", alt: "The cases list", caption: "Filters sit above the table." } });
    const rendered = renderKbDoc(result);
    expect(rendered).not.toMatch(/script|iframe|onclick|javascript/i);
    expect(rendered).toContain('<a href="/help/cases">more</a>');
    expect(rendered).toContain('<ol class="kb-steps"><li>Open <em>Cases</em></li><li>Click <kbd class="kb-kbd">New</kbd></li></ol>');
    expect(rendered).toContain('<thead><tr><th scope="col">Column</th><th scope="col">Meaning</th></tr></thead>');
    expect(rendered).toContain("<p>Safe text</p>");
  });

  test("entities are decoded once and re-escaped once", () => {
    expect(renderKbDoc(kbDocFromHtml("<p>AT&amp;T &lt;b&gt;</p>"))).toBe("<p>AT&amp;T &lt;b&gt;</p>");
  });
});

describe("prepareKbContent derives every field from the document", () => {
  test("plain text, outline, excerpt, reading time, references", () => {
    const prepared = prepareKbContent({
      type: "doc",
      attrs: { version: 1 },
      content: [
        p(t("Start a case from the Cases screen.")),
        { type: "heading", attrs: { level: 2, id: "before-you-start" }, content: [t("Before you start")] },
        { type: "callout", attrs: { tone: "tip", title: "Shortcut" }, content: [p(t("Press "), t("N", { type: "kbd" }))] },
        { type: "figure", attrs: { mediaId: MEDIA, alt: "New case button", caption: "Top right of the list" } },
        p(t("See ", { type: "link", attrs: { articleId: ARTICLE } })),
      ],
    } as KbDoc);
    expect(prepared.contentPlainText).toBe(
      ["Start a case from the Cases screen.", "Before you start", "Shortcut", "Press N", "New case button", "Top right of the list", "See"].join("\n"),
    );
    expect(prepared.outline).toEqual([{ id: "before-you-start", level: 2, text: "Before you start" }]);
    expect(prepared.excerpt).toBe("Start a case from the Cases screen.");
    expect(prepared.mediaIds).toEqual([MEDIA]);
    expect(prepared.linkedArticleIds).toEqual([ARTICLE]);
    expect(prepared.readingTimeMinutes).toBe(1);
    expect(JSON.parse(prepared.content)).toEqual(prepared.doc);
  });

  test("HTML and plain text are converted; the stored content is always a document", () => {
    expect(prepareKbContent("<p>Hello <b>world</b></p>").contentPlainText).toBe("Hello world");
    expect(prepareKbContent("Line one\nline two\n\nNext").doc.content).toHaveLength(2);
    expect(prepareKbContent("").content).toBe('{"type":"doc","attrs":{"version":1},"content":[]}');
  });

  test("readKbDoc never throws", () => {
    for (const raw of ["{not json", '{"type":"doc","content":"x"}', "<p", "\u0000", "{\"type\":\"paragraph\"}"]) {
      expect(() => readKbDoc(raw)).not.toThrow();
    }
  });
});
