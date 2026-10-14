/**
 * Field help with clickable links (upstream PR 034).
 * Run: `bun test apps/web/src/components/forms/HelpText.test.ts`
 *
 * Matcher discipline: only `.toBe` / `.toEqual` (web bun:test shim).
 */
import { expect, test } from "bun:test";

import { helpTextParts } from "./FormFieldRenderer";

test("site paths and http(s) URLs become links; everything else stays text", () => {
  expect(helpTextParts("Read the Terms of Service at /terms.")).toEqual([
    { kind: "text", value: "Read the Terms of Service at " },
    { kind: "link", value: "/terms" },
    { kind: "text", value: "." },
  ]);
  expect(helpTextParts("See https://example.com/privacy, then continue.")).toEqual([
    { kind: "text", value: "See " },
    { kind: "link", value: "https://example.com/privacy" },
    { kind: "text", value: ", then continue." },
  ]);
  expect(helpTextParts("Open 24/7 and/or by appointment")).toEqual([{ kind: "text", value: "Open 24/7 and/or by appointment" }]);
  expect(helpTextParts("<b>/x</b> javascript:alert(1)")).toEqual([{ kind: "text", value: "<b>/x</b> javascript:alert(1)" }]);
});
