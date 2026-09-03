import { describe, expect, test } from "bun:test";

import { environmentIdentityLabel } from "./EnvironmentBar";

describe("standalone environment identity", () => {
  test("combines the website and environment so the active database is unambiguous", () => {
    expect(
      environmentIdentityLabel("Northstar Shop", {
        instanceKey: "acceptance:northstar:shop:staging",
        kind: "staging",
        label: "Staging",
      }),
    ).toBe("Northstar Shop — Staging");
    expect(
      environmentIdentityLabel(null, {
        instanceKey: "acceptance:northstar:journal:live",
        kind: "live",
        label: null,
      }),
    ).toBe("acceptance:northstar:journal:live");
  });
});
