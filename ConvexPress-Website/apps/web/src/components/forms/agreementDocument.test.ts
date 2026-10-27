import { describe, expect, test } from "bun:test";

import { documentHref, formDocument } from "./agreementDocument";

describe("agreement documents", () => {
  test("an agreement names a page on this site and what to call it", () => {
    expect(formDocument({ document: { page: "/terms", label: " Terms of Service " } })).toEqual({ page: "/terms", label: "Terms of Service" });
    expect(documentHref("/terms")).toBe("/page/terms");
    expect(documentHref("/legal/privacy")).toBe("/page/legal/privacy");
  });

  test("anything that isn't a page on this site is ignored", () => {
    for (const page of ["https://elsewhere.example/terms", "//elsewhere.example/terms", "terms", "/terms of service", ""]) {
      expect(formDocument({ document: { page, label: "Terms" } })).toBeNull();
    }
    expect(formDocument({ document: { page: "/terms", label: " " } })).toBeNull();
    expect(formDocument({})).toBeNull();
    expect(formDocument(null)).toBeNull();
  });
});
