// @ts-expect-error Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  cleanGeneratedLessonText,
  normalizeOutline,
  outlineStats,
  parseJsonObject,
} from "../ai/helpers";

describe("LMS AI generation helpers", () => {
  test("repairs common JSON wrapper noise before normalizing outlines", () => {
    const parsed = parseJsonObject(`\`\`\`json
      {
        "topics": [
          {
            "title": "Foundations",
            "summary": "Start here",
            "lessons": [
              { "title": "Welcome", "brief": "Set expectations", "outcomes": ["Orient"] },
            ]
          }
        ],
      }
    \`\`\``);

    const outline = normalizeOutline(parsed);

    expect(outlineStats(outline)).toEqual({ topicCount: 1, lessonCount: 1 });
    expect(outline.topics[0].lessons[0].outcomes).toEqual(["Orient"]);
  });

  test("cleans fenced lesson bodies and rejects empty drafts", () => {
    expect(cleanGeneratedLessonText("```markdown\nA useful lesson body.\n```")).toBe(
      "A useful lesson body.",
    );
    expect(() => cleanGeneratedLessonText("   ")).toThrow("empty lesson draft");
  });
});
