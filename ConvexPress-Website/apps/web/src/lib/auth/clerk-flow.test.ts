import { describe, expect, test } from "bun:test";

import { defaultAuthCapabilities } from "./capabilities";
import { codePromptCopy, nextSignInStep, nextSignUpStep, normalizeIdentifier } from "./clerk-flow";

const caps = defaultAuthCapabilities();

describe("nextSignUpStep", () => {
  test("complete", () => {
    expect(nextSignUpStep({ status: "complete", createdSessionId: "sess_1" }, caps)).toEqual({ kind: "complete", sessionId: "sess_1" });
  });

  test("email verification uses the strategy Clerk allows", () => {
    expect(nextSignUpStep({ status: "missing_requirements", unverifiedFields: ["email_address"] }, caps)).toEqual({
      kind: "verify_email",
      strategy: "email_code",
    });
    const linkOnly = { ...caps, attributes: { ...caps.attributes, emailAddress: { ...caps.attributes.emailAddress, verifications: ["email_link" as const] } } };
    expect(nextSignUpStep({ status: "missing_requirements", unverifiedFields: ["email_address"] }, linkOnly)).toEqual({
      kind: "verify_email",
      strategy: "email_link",
    });
  });

  test("missing fields come before verification, mapped to our names", () => {
    expect(
      nextSignUpStep({ status: "missing_requirements", missingFields: ["username", "phone_number"], unverifiedFields: ["email_address"] }, caps),
    ).toEqual({ kind: "collect", fields: ["username", "phoneNumber"], unknown: [] });
  });

  test("consent, captcha, phone, restricted, abandoned", () => {
    expect(nextSignUpStep({ status: "missing_requirements", missingFields: ["legal_accepted"] }, caps)).toEqual({ kind: "legal_consent" });
    expect(nextSignUpStep({ status: "missing_requirements", missingFields: ["captcha_token"] }, caps)).toEqual({ kind: "captcha" });
    expect(nextSignUpStep({ status: "missing_requirements", unverifiedFields: ["phone_number"] }, caps)).toEqual({ kind: "verify_phone" });
    const restricted = { ...caps, signUp: { ...caps.signUp, mode: "restricted" as const } };
    expect(nextSignUpStep({ status: "missing_requirements" }, restricted)).toEqual({ kind: "restricted" });
    expect(nextSignUpStep({ status: "abandoned" }, caps)).toEqual({ kind: "abandoned" });
  });
});

describe("nextSignInStep", () => {
  const emailFactor = { strategy: "email_code", emailAddressId: "idn_1", safeIdentifier: "t***@example.com" };
  const totp = { strategy: "totp" };
  const phone2 = { strategy: "phone_code", phoneNumberId: "idn_2" };

  test("asks for a password when Clerk offers it and none was sent", () => {
    expect(
      nextSignInStep(
        { status: "needs_first_factor", supportedFirstFactors: [{ strategy: "password" }, emailFactor] },
        { passwordEntered: false, preferOtp: false },
      ),
    ).toEqual({ kind: "password" });
  });

  test("falls back to a code when the password was already tried or OTP is preferred", () => {
    const signIn = { status: "needs_first_factor", supportedFirstFactors: [{ strategy: "password" }, emailFactor] };
    expect(nextSignInStep(signIn, { passwordEntered: true, preferOtp: false })).toEqual({ kind: "first_code", strategy: "email_code", factor: emailFactor });
    expect(nextSignInStep(signIn, { passwordEntered: false, preferOtp: true })).toEqual({ kind: "first_code", strategy: "email_code", factor: emailFactor });
  });

  test("second factors prefer TOTP, then SMS, then backup codes", () => {
    expect(nextSignInStep({ status: "needs_second_factor", supportedSecondFactors: [phone2, totp] }, { passwordEntered: true, preferOtp: false })).toEqual({
      kind: "second_code",
      strategy: "totp",
      factor: totp,
      alternatives: ["phone_code"],
    });
  });

  test("new password, identifier, unsupported, complete", () => {
    const opts = { passwordEntered: false, preferOtp: false };
    expect(nextSignInStep({ status: "needs_new_password" }, opts)).toEqual({ kind: "new_password" });
    expect(nextSignInStep({ status: "needs_identifier" }, opts)).toEqual({ kind: "needs_identifier" });
    expect(nextSignInStep({ status: "needs_first_factor", supportedFirstFactors: [{ strategy: "passkey" }] }, opts)).toEqual({
      kind: "unsupported",
      strategies: ["passkey"],
    });
    expect(nextSignInStep({ status: "complete", createdSessionId: "sess" }, opts)).toEqual({ kind: "complete", sessionId: "sess" });
  });
});

describe("helpers", () => {
  test("code prompt copy", () => {
    expect(codePromptCopy("email_code", "a@b.c").body).toContain("a@b.c");
    expect(codePromptCopy("totp").title).toBe("Two-step verification");
  });
  test("normalizeIdentifier strips phone formatting only", () => {
    expect(normalizeIdentifier(" +1 (555) 123-4567 ")).toBe("+15551234567");
    expect(normalizeIdentifier(" Jane@Example.com ")).toBe("Jane@Example.com");
    expect(normalizeIdentifier("jane_doe")).toBe("jane_doe");
  });
});
