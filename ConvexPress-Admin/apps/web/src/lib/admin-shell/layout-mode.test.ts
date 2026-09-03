import { describe, expect, test } from "bun:test";

import { adminShellPositionClass } from "./layout-mode";

describe("admin shell layout mode", () => {
  test("embeds inside the standalone control shell even without a build-time control URL", () => {
    expect(
      adminShellPositionClass({
        standaloneControlPlane: true,
        controlPlaneUrl: undefined,
      }),
    ).toBe("absolute inset-0 flex h-full overflow-hidden");
    expect(
      adminShellPositionClass({
        standaloneControlPlane: false,
        controlPlaneUrl: undefined,
      }),
    ).toBe("fixed inset-0 flex h-svh overflow-hidden");
  });
});
