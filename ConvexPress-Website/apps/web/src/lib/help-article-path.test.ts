import { expect, test } from "bun:test";

import { helpArticlePath } from "./help-trail";

test("a help article's address is under its category, or 'uncategorized' without one", () => {
  expect(helpArticlePath({ slug: "signing-up", category: { slug: "start-here" } })).toBe("/help/start-here/signing-up");
  expect(helpArticlePath({ slug: "orphan", category: null })).toBe("/help/uncategorized/orphan");
});
