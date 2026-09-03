import { describe, expect, test } from "bun:test";

import { siteSessionRole } from "./site-session-role";

describe("outer role to isolated-site session role", () => {
  test("waits for live authorization before opening a privileged site session", () => {
    expect(
      siteSessionRole({
        platformRole: "manager",
        environmentKind: "live",
        liveOperateAllowed: undefined,
      }),
    ).toBe(null);
  });

  test("downgrades live access to read-only when live operation is denied", () => {
    expect(
      siteSessionRole({
        platformRole: "manager",
        environmentKind: "live",
        liveOperateAllowed: false,
      }),
    ).toBe("subscriber");
    expect(
      siteSessionRole({
        platformRole: "member",
        environmentKind: "live",
        liveOperateAllowed: false,
      }),
    ).toBe("subscriber");
  });

  test("preserves full roles for non-live or authorized live environments", () => {
    expect(
      siteSessionRole({
        platformRole: "manager",
        environmentKind: "staging",
        liveOperateAllowed: false,
      }),
    ).toBe("administrator");
    expect(
      siteSessionRole({
        platformRole: "member",
        environmentKind: "staging",
        liveOperateAllowed: false,
      }),
    ).toBe("editor");
    expect(
      siteSessionRole({
        platformRole: "admin",
        environmentKind: "live",
        liveOperateAllowed: true,
      }),
    ).toBe("administrator");
    expect(
      siteSessionRole({
        platformRole: "viewer",
        environmentKind: "live",
        liveOperateAllowed: undefined,
      }),
    ).toBe("subscriber");
  });
});
