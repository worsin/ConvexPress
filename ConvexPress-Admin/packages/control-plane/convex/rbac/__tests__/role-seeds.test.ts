import { describe, expect, test } from "bun:test";

import { MVP_ROLE_DEFINITIONS } from "../roleSeeds";

describe("standalone outer role seeds", () => {
  test("keeps the six required outer roles separate from site-customer roles", () => {
    expect(MVP_ROLE_DEFINITIONS.map((role) => role.slug)).toEqual([
      "owner",
      "admin",
      "business-manager",
      "site-operator",
      "member",
      "viewer",
    ]);
    expect(MVP_ROLE_DEFINITIONS.every((role) => role.sourceApp === "convexpress-control-plane")).toBe(true);
    expect(
      MVP_ROLE_DEFINITIONS.some((role) =>
        role.capabilities.some((capability) => capability.startsWith("customer.")),
      ),
    ).toBe(false);
  });

  test("reserves live lifecycle operations for explicit production capability", () => {
    const owner = MVP_ROLE_DEFINITIONS.find((role) => role.slug === "owner")!;
    const admin = MVP_ROLE_DEFINITIONS.find((role) => role.slug === "admin")!;
    const businessManager = MVP_ROLE_DEFINITIONS.find(
      (role) => role.slug === "business-manager",
    )!;
    expect(owner.capabilities).toContain("environment.live.operate");
    expect(admin.capabilities).toContain("environment.live.operate");
    expect(businessManager.capabilities).not.toContain("environment.live.operate");
  });
});
