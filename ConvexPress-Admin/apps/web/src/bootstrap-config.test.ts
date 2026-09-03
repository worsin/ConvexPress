import { describe, expect, test } from "bun:test";

import { resolveControlPlaneEndpoints } from "./bootstrap-config";

describe("standalone control-plane bootstrap", () => {
  test("Electron's installed controller overrides the development controller", () => {
    expect(
      resolveControlPlaneEndpoints({
        isElectron: true,
        standaloneEnabled: false,
        configuredConvexUrl: "http://127.0.0.1:4920",
        configuredConvexSiteUrl: "http://127.0.0.1:4921",
        environmentControlPlaneUrl: "http://127.0.0.1:4720",
        environmentControlPlaneSiteUrl: "http://127.0.0.1:4721",
      }),
    ).toEqual({
      controlPlaneUrl: "http://127.0.0.1:4920",
      controlPlaneSiteUrl: "http://127.0.0.1:4921",
    });
  });

  test("browser development continues to use its explicit controller", () => {
    expect(
      resolveControlPlaneEndpoints({
        isElectron: false,
        standaloneEnabled: true,
        configuredConvexUrl: "http://127.0.0.1:4920",
        configuredConvexSiteUrl: "http://127.0.0.1:4921",
        environmentControlPlaneUrl: "http://127.0.0.1:4720",
        environmentControlPlaneSiteUrl: "http://127.0.0.1:4721",
      }),
    ).toEqual({
      controlPlaneUrl: "http://127.0.0.1:4720",
      controlPlaneSiteUrl: "http://127.0.0.1:4721",
    });
  });
});
