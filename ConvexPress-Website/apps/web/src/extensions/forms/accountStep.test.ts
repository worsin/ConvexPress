/**
 * Forms that ask for an account at the end (upstream PR 032): when the
 * wizard adds its account step, what that step is prefilled with, and the
 * server's ACCOUNT_REQUIRED code coming back from a submit.
 * Run: `bun test apps/web/src/extensions/forms/accountStep.test.ts`
 *
 * Matcher discipline: only `.toBe` / `.toEqual` (web bun:test shim).
 */

import { expect, test } from "bun:test";

import { parseSubmitError } from "@/components/forms/FormRenderer";
import { accountPrefillFrom } from "./FormWizard";
import { publicFormRequiresAccountToSubmit } from "./StateNotices";

test("the account step applies only when the form asks for it and does not require sign-in up front", () => {
  expect(publicFormRequiresAccountToSubmit({}, { open: true, accountRequiredToSubmit: true })).toBe(true);
  expect(publicFormRequiresAccountToSubmit({ requireAccountToSubmit: true }, { open: true })).toBe(true);
  expect(publicFormRequiresAccountToSubmit({ requireAccountToSubmit: true, requireLogin: true }, { open: true })).toBe(false);
  expect(publicFormRequiresAccountToSubmit({}, { open: true, loginRequired: true, accountRequiredToSubmit: true })).toBe(false);
  expect(publicFormRequiresAccountToSubmit({}, { open: true })).toBe(false);
});

test("the account step starts from the form's email and name answers", () => {
  const fields = [
    { key: "doctor_signup_first_name", type: "text" },
    { key: "doctor_signup_last_name", type: "text" },
    { key: "contact", type: "email" },
    { key: "practice", type: "text" },
  ];
  expect(
    accountPrefillFrom(fields, {
      doctor_signup_first_name: " Avery ",
      doctor_signup_last_name: "Quinn",
      contact: "avery@example.com",
      practice: "Quinn Chiropractic",
    }),
  ).toEqual({ emailAddress: "avery@example.com", firstName: "Avery", lastName: "Quinn" });
  expect(accountPrefillFrom(fields, {})).toEqual({ emailAddress: undefined, firstName: undefined, lastName: undefined });
});

test("a submit refused for want of an account carries its code; field errors are kept, malformed ones dropped", () => {
  const refused = parseSubmitError({ data: { code: "ACCOUNT_REQUIRED", message: "Create an account or sign in to finish." } });
  expect(refused.code).toBe("ACCOUNT_REQUIRED");
  expect(refused.message).toBe("Create an account or sign in to finish.");
  const invalid = parseSubmitError({
    data: { message: "Fix these", errors: [{ fieldKey: "practice", label: "Practice", error: "Required" }, { fieldKey: 3 }] },
  });
  expect(invalid.serverFieldErrors).toEqual([{ fieldKey: "practice", label: "Practice", error: "Required" }]);
  expect(parseSubmitError(new Error("Network down")).message).toBe("Network down");
});
