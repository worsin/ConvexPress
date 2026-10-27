import { describe, expect, test } from "bun:test";

import { proseText } from "../block-data/portable/searchText";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Prose, proseRuns } from "./presentation";

describe("prose", () => {
  test("blank lines separate paragraphs", () => {
    expect(proseRuns("First paragraph.\n\nSecond paragraph.")).toEqual([
      { kind: "text", text: "First paragraph." },
      { kind: "text", text: "Second paragraph." },
    ]);
  });

  test('consecutive "- " lines are a list, with the lines around them kept as text', () => {
    expect(proseRuns("Every package includes:\n- Lien documents\n- Payment tracking\nAnd more.")).toEqual([
      { kind: "text", text: "Every package includes:" },
      { kind: "list", items: ["Lien documents", "Payment tracking"] },
      { kind: "text", text: "And more." },
    ]);
  });

  test("a hyphen inside a line, or without a space after it, stays text", () => {
    expect(proseRuns("Mid-sentence - dash\n-not an item")).toEqual([
      { kind: "text", text: "Mid-sentence - dash\n-not an item" },
    ]);
  });

  test("search text drops the list markers the reader never sees", () => {
    expect(proseText("Includes:\n- **Lien** documents\n- Payment tracking")).toBe(
      "Includes:\nLien documents\nPayment tracking",
    );
  });

  test("a link may be absolute or site-relative; a protocol-relative one stays text", () => {
    const html = renderToStaticMarkup(createElement(Prose, { text: "Sign up on [the sign-up page](/get-started) or read [the guide](https://example.com/guide). Not [this](//evil.example)." }));
    expect(html).toContain('href="/get-started"');
    expect(html).toContain('href="https://example.com/guide"');
    expect(html).not.toContain("evil.example\"");
    expect(html).toContain("[this](//evil.example)");
    expect(proseText("See [the sign-up page](/get-started).")).toBe("See the sign-up page.");
    expect(proseText("Not [this](//evil.example).")).toBe("Not [this](//evil.example).");
  });
});
