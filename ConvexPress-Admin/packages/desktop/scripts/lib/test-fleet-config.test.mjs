import { describe, expect, test } from "bun:test";

import { loadTestFleetConfig } from "./test-fleet-config.mjs";

const remoteEnvironment = {
  CONVEXPRESS_ACCEPTANCE_CONTROL_ORIGIN: "http://192.168.1.246:4720",
  CONVEXPRESS_ACCEPTANCE_CONTROL_SITE_ORIGIN: "http://192.168.1.246:4721",
  CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_ORIGIN: "http://192.168.1.246:4820",
  CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_SITE_ORIGIN: "http://192.168.1.246:4821",
  CONVEXPRESS_ACCEPTANCE_SITE_BETA_ORIGIN: "http://192.168.1.246:4830",
  CONVEXPRESS_ACCEPTANCE_SITE_BETA_SITE_ORIGIN: "http://192.168.1.246:4831",
  CONVEXPRESS_ACCEPTANCE_SITE_GAMMA_ORIGIN: "http://192.168.1.246:4840",
  CONVEXPRESS_ACCEPTANCE_SITE_GAMMA_SITE_ORIGIN: "http://192.168.1.246:4841",
};

describe("remote acceptance fleet configuration", () => {
  test("requires all four isolated deployments and keeps the renderer local", () => {
    const config = loadTestFleetConfig(remoteEnvironment);
    expect(config.control.deploymentOrigin).toBe("http://192.168.1.246:4720");
    expect(config.sites.map((site) => site.key)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(config.rendererOrigin).toBe("http://127.0.0.1:4105");
  });

  test("refuses missing, duplicate, and local database targets", () => {
    expect(() => loadTestFleetConfig({})).toThrow("CONTROL_ORIGIN");
    expect(() =>
      loadTestFleetConfig({
        ...remoteEnvironment,
        CONVEXPRESS_ACCEPTANCE_SITE_BETA_ORIGIN:
          remoteEnvironment.CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_ORIGIN,
      }),
    ).toThrow("distinct");
    expect(() =>
      loadTestFleetConfig({
        ...remoteEnvironment,
        CONVEXPRESS_ACCEPTANCE_CONTROL_ORIGIN: "http://127.0.0.1:4720",
      }),
    ).toThrow("local database");
  });
});
