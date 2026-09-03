import { describe, expect, test } from "bun:test";

import { directAccessRoleSlug } from "../directAccessRole";

describe("direct scope access role mapping", () => {
  test("manage grants use the manager role for their scope", () => {
    expect(directAccessRoleSlug("manager", "business", "manage")).toBe(
      "business-manager",
    );
    expect(directAccessRoleSlug("manager", "website", "manage")).toBe(
      "site-operator",
    );
  });

  test("a website-scoped member retains member content capabilities", () => {
    expect(directAccessRoleSlug("member", "website", "use")).toBe("member");
  });

  test("read-only direct grants remain viewer grants", () => {
    expect(directAccessRoleSlug("viewer", "website", "use")).toBe("viewer");
    expect(directAccessRoleSlug("member", "business", "use")).toBe("viewer");
  });
});
