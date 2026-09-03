import { describe, expect, test } from "bun:test";

import {
  authorizeSessionRequestShape,
  outerCapabilityForSiteCapability,
  outerCapabilityForSiteRole,
} from "../policy";

describe("outer-to-site session policy", () => {
  test("maps every site management grant to an explicit outer capability", () => {
    expect(outerCapabilityForSiteCapability("health.read")).toBe("site.read");
    expect(outerCapabilityForSiteCapability("backup.create")).toBe(
      "site.backup.create",
    );
    expect(outerCapabilityForSiteCapability("site.restore")).toBe(
      "site.restore",
    );
    expect(outerCapabilityForSiteCapability("authority.revoke")).toBe(
      "connection.manage",
    );
  });

  test("maps site role profiles to the outer RBAC namespace", () => {
    expect(outerCapabilityForSiteRole("administrator")).toBe(
      "site.administer",
    );
    expect(outerCapabilityForSiteRole("editor")).toBe("site.content.manage");
    expect(outerCapabilityForSiteRole("subscriber")).toBe("site.read");
    expect(() => outerCapabilityForSiteRole("owner")).toThrow("invalid");
  });

  test("normalizes a unique bounded request and rejects unknown or duplicate grants", () => {
    expect(
      authorizeSessionRequestShape(["compatibility.read", "health.read"]),
    ).toEqual(["compatibility.read", "health.read"]);
    expect(() => authorizeSessionRequestShape([])).toThrow("invalid");
    expect(() =>
      authorizeSessionRequestShape(["health.read", "health.read"]),
    ).toThrow("invalid");
    expect(() => authorizeSessionRequestShape(["content.delete"])).toThrow(
      "invalid",
    );
  });
});
