import { describe, expect, test } from "bun:test";

import {
  coerceAuthConfig,
  defaultAuthCapabilities,
  identifierLabel,
  passwordPolicyErrors,
  preferredEmailVerification,
  signInIdentifierKinds,
  signUpFields,
  socialProviders,
} from "./capabilities";

describe("capabilities", () => {
  test("default sign-up fields are names, email, password", () => {
    expect(signUpFields(defaultAuthCapabilities()).map((field) => `${field.name}:${field.required}`)).toEqual([
      "firstName:false",
      "lastName:false",
      "emailAddress:true",
      "password:true",
    ]);
  });

  test("fields follow Clerk flags", () => {
    const caps = defaultAuthCapabilities();
    caps.attributes.firstName.enabled = false;
    caps.attributes.lastName.enabled = false;
    caps.attributes.username = { enabled: true, required: true, verifications: [], usedForFirstFactor: true, usedForSecondFactor: false };
    caps.attributes.phoneNumber = { enabled: true, required: false, verifications: ["phone_code"], usedForFirstFactor: true, usedForSecondFactor: true };
    expect(signUpFields(caps).map((field) => field.name)).toEqual(["emailAddress", "phoneNumber", "username", "password"]);
    expect(signInIdentifierKinds(caps)).toEqual(["email", "username", "phone"]);
    expect(identifierLabel(signInIdentifierKinds(caps))).toBe("Email, Username or Phone");
  });

  test("password policy", () => {
    const policy = { ...defaultAuthCapabilities().password, minLength: 10, requireNumbers: true, requireSpecialChar: true, allowedSpecialCharacters: "!@#" };
    expect(passwordPolicyErrors("short", policy)).toEqual(["Use at least 10 characters.", "Include a number.", "Include a special character."]);
    expect(passwordPolicyErrors("longenough1!", policy)).toEqual([]);
    expect(passwordPolicyErrors("", policy)).toEqual(["Enter a password."]);
  });

  test("social providers get labels", () => {
    const caps = defaultAuthCapabilities();
    caps.social = ["oauth_google", "oauth_microsoft", "oauth_custom_thing"];
    expect(socialProviders(caps).map((provider) => provider.label)).toEqual(["Google", "Microsoft", "Custom Thing"]);
  });

  test("email verification preference and coercion", () => {
    const caps = defaultAuthCapabilities();
    expect(preferredEmailVerification(caps)).toBe("email_code");
    caps.attributes.emailAddress.verifications = ["email_link"];
    expect(preferredEmailVerification(caps)).toBe("email_link");
    expect(coerceAuthConfig(null).provider).toBe("none");
    expect(coerceAuthConfig({ provider: "clerk", publishableKey: "pk_test_x", capabilities: caps }).publishableKey).toBe("pk_test_x");
    expect(coerceAuthConfig({ provider: "clerk", capabilities: { version: 2 } }).capabilities.version).toBe(1);
  });
});
