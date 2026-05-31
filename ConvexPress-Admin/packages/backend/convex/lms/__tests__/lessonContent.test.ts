// @ts-expect-error Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  docToText,
  normalizeLessonText,
  normalizeOptionalUrl,
  textToDoc,
} from "../lessons/helpers";

describe("LMS lesson content helpers", () => {
  test("round-trips structured lesson authoring text", () => {
    const source = [
      "## Lesson overview",
      "",
      "This paragraph has **bold**, _italic_, `code`, and [a link](https://example.com).",
      "",
      "- First point",
      "- Second point",
      "",
      "1. Step one",
      "2. Step two",
      "",
      "> Remember the important constraint.",
      "",
      "---",
      "",
      "```",
      "const ready = true;",
      "```",
    ].join("\n");

    const doc = textToDoc(source) as {
      content: Array<{ type: string; attrs?: { level?: number }; content?: unknown[] }>;
    };

    expect(doc.content.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "bulletList",
      "orderedList",
      "blockquote",
      "horizontalRule",
      "codeBlock",
    ]);
    expect(doc.content[0].attrs?.level).toBe(2);
    expect(docToText(doc)).toContain("## Lesson overview");
    expect(docToText(doc)).toContain("**bold**");
    expect(docToText(doc)).toContain("- First point");
    expect(docToText(doc)).toContain("1. Step one");
    expect(docToText(doc)).toContain("> Remember");
  });

  test("normalizes whitespace and rejects unsafe video URL schemes", () => {
    expect(normalizeLessonText(" One  \r\n\r\n\r\n\r\nTwo \t\n")).toBe("One\n\n\nTwo");
    expect(normalizeOptionalUrl(" https://example.com/watch?v=1 ")).toBe(
      "https://example.com/watch?v=1",
    );
    expect(normalizeOptionalUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeOptionalUrl("not a url")).toBeUndefined();
  });
});
