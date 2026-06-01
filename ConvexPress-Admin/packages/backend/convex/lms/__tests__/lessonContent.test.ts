// @ts-expect-error Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  detectVideoProvider,
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
      "![Diagram](media:kg123abc \"Course diagram\")",
      "",
      "![External diagram](https://example.com/diagram.png \"External caption\")",
      "",
      "{{embed:https://www.youtube.com/watch?v=dQw4w9WgXcQ|Walkthrough}}",
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
      "image",
      "image",
      "embed",
      "horizontalRule",
      "codeBlock",
    ]);
    expect(doc.content[0].attrs?.level).toBe(2);
    expect(docToText(doc)).toContain("## Lesson overview");
    expect(docToText(doc)).toContain("**bold**");
    expect(docToText(doc)).toContain("- First point");
    expect(docToText(doc)).toContain("1. Step one");
    expect(docToText(doc)).toContain("> Remember");
    expect(docToText(doc)).toContain('![Diagram](media:kg123abc "Course diagram")');
    expect(docToText(doc)).toContain(
      '![External diagram](https://example.com/diagram.png "External caption")',
    );
    expect(docToText(doc)).toContain(
      "{{embed:https://www.youtube.com/watch?v=dQw4w9WgXcQ|Walkthrough}}",
    );
  });

  test("normalizes whitespace and rejects unsafe video URL schemes", () => {
    expect(normalizeLessonText(" One  \r\n\r\n\r\n\r\nTwo \t\n")).toBe("One\n\n\nTwo");
    expect(normalizeOptionalUrl(" https://example.com/watch?v=1 ")).toBe(
      "https://example.com/watch?v=1",
    );
    expect(normalizeOptionalUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeOptionalUrl("not a url")).toBeUndefined();
  });

  test("detects video providers from trusted hostnames only", () => {
    expect(detectVideoProvider("https://youtube.com/watch?v=abc123")).toBe("youtube");
    expect(detectVideoProvider("https://player.vimeo.com/video/123456")).toBe("vimeo");
    expect(detectVideoProvider("https://training.b-cdn.net/lesson.mp4")).toBe("bunny");
    expect(detectVideoProvider("https://evil.example/watch?next=youtube.com/watch?v=abc123")).toBe(
      "other",
    );
  });

  test("keeps unsafe inline link schemes as plain text", () => {
    const doc = textToDoc(
      "[safe](https://example.com) and [bad](javascript:alert(1))",
    ) as {
      content: Array<{
        content?: Array<{
          text?: string;
          marks?: Array<{ attrs?: Record<string, unknown> }>;
        }>;
      }>;
    };

    const paragraph = doc.content[0]?.content ?? [];

    expect(paragraph.find((node) => node.text === "safe")?.marks?.[0]?.attrs?.href).toBe(
      "https://example.com/",
    );
    expect(paragraph.find((node) => node.text === "bad")?.marks).toBeUndefined();
    expect(docToText(doc)).toContain("[safe](https://example.com/)");
    expect(docToText(doc)).toContain("bad");
    expect(docToText(doc)).not.toContain("javascript:");
  });

  test("does not convert unsafe image or embed syntax into renderable nodes", () => {
    const doc = textToDoc(
      [
        '![Unsafe](javascript:alert(1) "Bad")',
        "",
        "{{embed:javascript:alert(1)|Bad}}",
      ].join("\n"),
    ) as { content: Array<{ type: string }> };

    expect(doc.content.map((node) => node.type)).toEqual(["paragraph", "paragraph"]);
    expect(docToText(doc)).toContain("javascript:alert(1)");
  });
});
