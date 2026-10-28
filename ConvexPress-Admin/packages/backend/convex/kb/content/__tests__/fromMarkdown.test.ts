import { describe, expect, test } from "bun:test";

import { kbDocFromMarkdown } from "../fromMarkdown";
import { renderKbDoc } from "../render";

const MEDIA = "jd7f3k2m9x8w6v5t4s3r2q1p0n9m8l7k";
const ARTICLE = "kb7f3k2m9x8w6v5t4s3r2q1p0n9m8l7k";
const resolve = {
  article: (ref: string) => (ref === "case-statuses" ? ARTICLE : null),
  media: (ref: string) => (ref === "case-overview" ? MEDIA : null),
};

describe("kbDocFromMarkdown", () => {
  test("headings, paragraphs and inline marks", () => {
    const doc = kbDocFromMarkdown(
      [
        "# Starting a case",
        "",
        "Choose {{Create New Case}}, then press ++Enter++.",
        "It takes **about *two* minutes** with `File #`.",
        "",
        "### Then",
      ].join("\n"),
    );
    expect(doc.content).toEqual([
      { type: "heading", attrs: { level: 2, id: "starting-a-case" }, content: [{ type: "text", text: "Starting a case" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Choose " },
          { type: "text", text: "Create New Case", marks: [{ type: "ui" }] },
          { type: "text", text: ", then press " },
          { type: "text", text: "Enter", marks: [{ type: "kbd" }] },
          { type: "text", text: ". It takes " },
          { type: "text", text: "about ", marks: [{ type: "bold" }] },
          { type: "text", text: "two", marks: [{ type: "bold" }, { type: "italic" }] },
          { type: "text", text: " minutes", marks: [{ type: "bold" }] },
          { type: "text", text: " with " },
          { type: "text", text: "File #", marks: [{ type: "code" }] },
          { type: "text", text: "." },
        ],
      },
      { type: "heading", attrs: { level: 3, id: "then" }, content: [{ type: "text", text: "Then" }] },
    ]);
  });

  test("links resolve articles by reference and keep the text of ones that don't", () => {
    const doc = kbDocFromMarkdown("See [statuses](article:case-statuses#lien-status), [later](article:not-yet) and [the site](https://casemedix.com).", resolve);
    const html = renderKbDoc(doc, { articleHref: (id, anchor) => `#kb-article/${id}/${anchor}` });
    expect(html).toContain(`href="#kb-article/${ARTICLE}/lien-status"`);
    expect(html).toContain("later and ");
    expect(html).not.toContain("not-yet");
    expect(html).toContain('href="https://casemedix.com/"');
  });

  test("lists, steps, continuation lines and blank lines between items", () => {
    const doc = kbDocFromMarkdown(
      ["- one", "  continued", "", "- two", "", "::: steps", "1. Open the case.", "2. Choose {{Archive Case}}.", ":::", "", "3. Third", "4. Fourth"].join("\n"),
    );
    const [bullets, steps, numbered] = doc.content;
    expect(bullets).toMatchObject({ type: "bulletList", content: [{ content: [{ content: [{ text: "one continued" }] }] }, { content: [{ content: [{ text: "two" }] }] }] });
    expect(steps).toMatchObject({ type: "orderedList", attrs: { start: 1, kind: "steps" } });
    expect(numbered).toMatchObject({ type: "orderedList", attrs: { start: 3, kind: "list" } });
  });

  test("callouts, details, figures, tables and rules", () => {
    const doc = kbDocFromMarkdown(
      [
        "::: warning Before you archive",
        "Archived cases stop deadline tracking.",
        ":::",
        "",
        "::: details What about legacy cases?",
        "They can't be enforced.",
        ":::",
        "",
        '![The case overview](media:case-overview "Your case at a glance"){wide}',
        "![Missing](media:not-uploaded)",
        "",
        "| Status | Who sets it |",
        "|---|---|",
        "| Patient Treating | You |",
        "| Demand Sent | CaseMedix |",
        "",
        "---",
      ].join("\n"),
      resolve,
    );
    expect(doc.content.map((block) => block.type)).toEqual(["callout", "details", "figure", "table", "horizontalRule"]);
    expect(doc.content[0]).toMatchObject({ attrs: { tone: "warning", title: "Before you archive" } });
    expect(doc.content[1]).toMatchObject({ attrs: { summary: "What about legacy cases?", open: false } });
    expect(doc.content[2]).toMatchObject({ attrs: { mediaId: MEDIA, alt: "The case overview", caption: "Your case at a glance", size: "wide", frame: "screenshot" } });
    expect(doc.content[3]).toMatchObject({ type: "table", content: [{ content: [{ type: "tableHeader" }, { type: "tableHeader" }] }, {}, {}] });
  });
});
