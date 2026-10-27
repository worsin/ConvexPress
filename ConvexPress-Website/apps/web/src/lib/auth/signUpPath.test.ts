import { expect, test } from "bun:test";

import { REGISTER_PATH, siteSignUpPath } from "./signUpPath";

test("people without an account start on the site's sign-up page", () => {
  expect(siteSignUpPath("/get-started")).toBe("/get-started");
  expect(siteSignUpPath("  /forms/doctor-signup ")).toBe("/forms/doctor-signup");
});

test("anything but a plain path on this site falls back to the registration form", () => {
  for (const value of [undefined, null, "", "  ", "get-started", "//evil.example", "/\\evil", "https://evil.example", "/a b", "/signup?plan=pro"]) {
    expect(siteSignUpPath(value)).toBe(REGISTER_PATH);
  }
});
