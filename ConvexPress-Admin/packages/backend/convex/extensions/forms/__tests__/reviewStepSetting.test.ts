/**
 * The review step setting (upstream PR 064): a boolean the public form read
 * exposes to the website; anything else is refused when the form is saved.
 */
import { expect, test } from "bun:test";

import { normalizeSettings, publicFormSettingsJson } from "../builderCore";

test("the public form read carries the review step setting", () => {
  expect(JSON.parse(publicFormSettingsJson({ reviewStep: true, requireAccountToSubmit: true, notificationRefs: ["private"] }))).toEqual({
    requireAccountToSubmit: true,
    reviewStep: true,
  });
  expect(JSON.parse(publicFormSettingsJson({ reviewStep: false }))).toEqual({ reviewStep: false });
  expect(JSON.parse(publicFormSettingsJson({}))).toEqual({});
});

test("only a boolean is accepted", () => {
  expect(normalizeSettings(JSON.stringify({ reviewStep: true })).ok).toBe(true);
  expect(normalizeSettings(JSON.stringify({ reviewStep: "yes" }))).toEqual({ ok: false, error: "Form settings.reviewStep must be a boolean." });
});
