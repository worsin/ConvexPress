import { describe, expect, test } from "bun:test";

import { matchesPageAccess, pageAccessCandidates } from "./page-access";

describe("page access route matching", () => {
  test("normalizes public admin routes to their stored /admin route keys", () => {
    expect(pageAccessCandidates("/setup")).toEqual(["/setup", "/admin/setup"]);
    expect(pageAccessCandidates("/settings/email")).toEqual([
      "/settings/email",
      "/admin/settings/email",
    ]);
    expect(pageAccessCandidates("/admin/setup")).toEqual(["/admin/setup"]);
  });

  test("does not let /admin grant every child admin page", () => {
    expect(matchesPageAccess("/admin", "/admin")).toBe(true);
    expect(matchesPageAccess("/admin/setup", "/admin")).toBe(false);
    expect(matchesPageAccess("/admin/settings/email", "/admin")).toBe(false);
  });

  test("allows explicit setup access and explicit wildcards", () => {
    expect(matchesPageAccess("/admin/setup", "/admin/setup")).toBe(true);
    expect(matchesPageAccess("/admin/kb/articles", "/admin/kb/*")).toBe(true);
    expect(matchesPageAccess("/admin/settings/email", "/admin/kb/*")).toBe(false);
  });
});
