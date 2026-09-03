import { describe, expect, test } from "bun:test";

import { prepareControlIdentity } from "./auth-client";

describe("outer operator invitation claim", () => {
  test("normalizes the exact provisioned email and requires a usable name", () => {
    expect(prepareControlIdentity(" Operator@Example.COM ", "  Taylor Smith ")).toEqual({
      email: "operator@example.com",
      name: "Taylor Smith",
    });
    expect(prepareControlIdentity("operator@example.com", "")).toEqual({
      email: "operator@example.com",
      name: "operator",
    });
  });
});
