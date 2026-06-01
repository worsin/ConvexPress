import { expect, test } from "bun:test";

import {
  buildSubmitSecurityEnvelope,
  captchaConfigProblem,
  captchaIsRequired,
  type PublicFormSecurity,
} from "./security";

const base: PublicFormSecurity = {
  honeypotEnabled: true,
  honeypotFieldName: "website_url",
  captchaEnabled: false,
  captchaProvider: "none",
  captchaSiteKey: null,
};

test("captchaIsRequired only when enabled with a real provider", () => {
  expect(captchaIsRequired(base)).toBe(false);
  expect(captchaIsRequired({ ...base, captchaEnabled: true })).toBe(false);
  expect(
    captchaIsRequired({
      ...base,
      captchaEnabled: true,
      captchaProvider: "turnstile",
    }),
  ).toBe(true);
});

test("captchaConfigProblem catches enabled providers without a public key", () => {
  expect(
    captchaConfigProblem({
      ...base,
      captchaEnabled: true,
      captchaProvider: "turnstile",
      captchaSiteKey: "",
    }),
  ).toBe("This form's CAPTCHA is not configured.");
  expect(
    captchaConfigProblem({
      ...base,
      captchaEnabled: true,
      captchaProvider: "turnstile",
      captchaSiteKey: "site-key",
    }),
  ).toBe(null);
});

test("draft autosaves carry honeypot/time-trap but never require CAPTCHA", () => {
  expect(
    buildSubmitSecurityEnvelope({
      security: {
        ...base,
        captchaEnabled: true,
        captchaProvider: "turnstile",
        captchaSiteKey: "site-key",
      },
      honeypotValue: "",
      captchaToken: "token",
      startedAt: 123,
      isComplete: false,
    }),
  ).toEqual({ honeypot: "", startedAt: 123 });
});

test("complete submissions include CAPTCHA token when CAPTCHA is enabled", () => {
  expect(
    buildSubmitSecurityEnvelope({
      security: {
        ...base,
        captchaEnabled: true,
        captchaProvider: "turnstile",
        captchaSiteKey: "site-key",
      },
      honeypotValue: "bot",
      captchaToken: "token",
      startedAt: 456,
      isComplete: true,
    }),
  ).toEqual({ honeypot: "bot", startedAt: 456, captchaToken: "token" });
});
