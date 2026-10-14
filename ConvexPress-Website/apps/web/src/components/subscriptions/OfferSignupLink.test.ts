/**
 * Where a pricing card's button leads (upstream PR 033).
 * Run: `bun test apps/web/src/components/subscriptions/OfferSignupLink.test.ts`
 *
 * Matcher discipline: only `.toBe` / `.toEqual` (web bun:test shim).
 */
import { expect, test } from "bun:test";

import { offerSignupHref } from "./OfferSignupLink";

test("into the signup form with the plan chosen, the form alone, or the plain signup page", () => {
  expect(offerSignupHref({ _id: "offer_1", signup: { formSlug: "doctor-signup", param: "plan", value: "launch" } })).toBe(
    "/forms/doctor-signup?plan=launch",
  );
  expect(offerSignupHref({ _id: "offer_1", signup: { formSlug: "doctor-signup" } })).toBe("/forms/doctor-signup");
  expect(offerSignupHref({ _id: "offer 1", signup: null })).toBe("/signup/offer%201");
  expect(offerSignupHref({ _id: "o", signup: { formSlug: "a b", param: "plan", value: "x&y" } })).toBe("/forms/a%20b?plan=x%26y");
});
