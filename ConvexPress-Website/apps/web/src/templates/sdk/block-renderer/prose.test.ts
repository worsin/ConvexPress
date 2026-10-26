import { describe, expect, test } from "bun:test";

import { proseText } from "../block-data/portable/searchText";
import { proseRuns } from "./presentation";

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
});
