import { describe, expect, test } from "bun:test";

import { operatorProfilePlan } from "../operatorProfile";

describe("outer operator provisioning profiles", () => {
  test.each([
    ["administrator", "admin", "platform", null],
    ["business-manager", "manager", "business", "manage"],
    ["site-operator", "manager", "website", "manage"],
    ["member", "member", "website", "use"],
    ["viewer", "viewer", "website", "use"],
  ] as const)(
    "%s maps to its compatibility role and direct-scope grant",
    (profile, platformRole, scope, level) => {
      expect(operatorProfilePlan(profile)).toEqual({
        profile,
        platformRole,
        scope,
        level,
      });
    },
  );
});
