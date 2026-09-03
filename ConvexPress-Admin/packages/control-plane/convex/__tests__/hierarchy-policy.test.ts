import { describe, expect, test } from "bun:test";

import {
  chooseDefaultId,
  normalizeDomain,
  normalizeEntityName,
  normalizeSlug,
  requireActiveParent,
} from "../hierarchyPolicy";

describe("standalone hierarchy policy", () => {
  test("normalizes names, slugs, and domains deterministically", () => {
    expect(normalizeEntityName("  Acme   Holdings  ")).toBe("Acme Holdings");
    expect(normalizeSlug(" Acme Holdings ")).toBe("acme-holdings");
    expect(normalizeDomain("HTTPS://WWW.Example.COM/path?q=1")).toBe(
      "www.example.com",
    );
  });

  test("rejects unusable identifiers and inactive parents", () => {
    expect(() => normalizeSlug("---")).toThrow("slug");
    expect(() => normalizeDomain("http://")).toThrow("domain");
    expect(() => requireActiveParent(null, "Organization")).toThrow("not found");
    expect(() =>
      requireActiveParent({ isActive: false }, "Business"),
    ).toThrow("inactive");
  });

  test("repairs a default to the first active child only", () => {
    expect(
      chooseDefaultId({
        currentDefaultId: "business-archived",
        children: [
          { id: "business-archived", isActive: false, order: 0 },
          { id: "business-two", isActive: true, order: 2 },
          { id: "business-one", isActive: true, order: 1 },
        ],
      }),
    ).toBe("business-one");
    expect(
      chooseDefaultId({
        currentDefaultId: "business-two",
        children: [
          { id: "business-two", isActive: true, order: 2 },
          { id: "business-one", isActive: true, order: 1 },
        ],
      }),
    ).toBe("business-two");
    expect(
      chooseDefaultId({
        currentDefaultId: undefined,
        children: [{ id: "business-one", isActive: false, order: 1 }],
      }),
    ).toBeNull();
  });
});
