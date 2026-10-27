import { describe, expect, test } from "bun:test";

import { helpPageTitle, helpRouteOwnsBreadcrumbs, helpTrail, slugWords } from "./help-trail";

describe("help trail", () => {
  test("pages below the help home own their trail; the home and other pages don't", () => {
    expect(helpRouteOwnsBreadcrumbs("/help/start-here")).toBe(true);
    expect(helpRouteOwnsBreadcrumbs("/help/start-here/signing-up")).toBe(true);
    expect(helpRouteOwnsBreadcrumbs("/help/search")).toBe(true);
    expect(helpRouteOwnsBreadcrumbs("/help/collections/onboarding")).toBe(true);
    expect(helpRouteOwnsBreadcrumbs("/help")).toBe(false);
    expect(helpRouteOwnsBreadcrumbs("/help/")).toBe(false);
    expect(helpRouteOwnsBreadcrumbs("/helpful")).toBe(false);
    expect(helpRouteOwnsBreadcrumbs("/pricing")).toBe(false);
  });

  test("starts at Home and the help center, then the page's own names", () => {
    expect(helpTrail({ label: "Getting started", to: "/help/start-here" }, { label: "Signing up for CaseMedix" })).toEqual([
      { label: "Home", to: "/" },
      { label: "Help center", to: "/help" },
      { label: "Getting started", to: "/help/start-here" },
      { label: "Signing up for CaseMedix" },
    ]);
  });

  test("titles pages by their content, falling back to the slug's words", () => {
    expect(helpPageTitle("Signing up for CaseMedix", "signing-up")).toContain("Signing up for CaseMedix - Help Center");
    expect(helpPageTitle(null, "signing-up")).toContain("Signing Up - Help Center");
    expect(helpPageTitle("  ", "two-step-verification")).toContain("Two Step Verification - Help Center");
    expect(helpPageTitle("Onboarding", "onboarding", "Collections")).toContain("Onboarding - Collections - Help Center");
    expect(slugWords("account-and-billing")).toBe("Account And Billing");
  });
});
