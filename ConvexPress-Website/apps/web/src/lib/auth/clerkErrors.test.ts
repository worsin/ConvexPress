import { describe, expect, test } from "bun:test";

import { clerkErrorMessage } from "./clerk";

describe("clerkErrorMessage", () => {
  test("explains a password sign-in on an account that only uses Google, Apple or Microsoft", () => {
    const error = {
      errors: [{ code: "strategy_for_user_invalid", message: "The verification strategy is not valid for this account" }],
    };
    expect(clerkErrorMessage(error, "Sign in failed")).toContain("doesn't have a password");
  });

  test("keeps Clerk's own long message for other errors, then the fallback", () => {
    expect(clerkErrorMessage({ errors: [{ code: "form_password_incorrect", longMessage: "Password is incorrect. Try again." }] }, "x"))
      .toBe("Password is incorrect. Try again.");
    expect(clerkErrorMessage(null, "Sign in failed")).toBe("Sign in failed");
  });
});
