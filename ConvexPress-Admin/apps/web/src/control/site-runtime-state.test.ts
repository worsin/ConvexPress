import { describe, expect, test } from "bun:test";

import { isSiteRuntimeSwitching } from "./SiteRuntimeProvider";

describe("site runtime render isolation", () => {
  test("fails closed during the render before a new target effect runs", () => {
    const target = {
      connectionId: "connection-b",
      instanceKey: "site-b-live",
      deploymentOrigin: "http://192.168.1.246:4830",
      siteOrigin: "http://192.168.1.246:4831",
    };

    expect(
      isSiteRuntimeSwitching(target, {
        status: "ready",
        instanceKey: "site-a-live",
      }),
    ).toBe(true);
    expect(
      isSiteRuntimeSwitching(target, {
        status: "ready",
        instanceKey: "site-b-live",
      }),
    ).toBe(false);
  });

  test("treats idle and explicit switching snapshots as switching", () => {
    const target = {
      connectionId: "connection-a",
      instanceKey: "site-a-live",
      deploymentOrigin: "http://192.168.1.246:4820",
      siteOrigin: "http://192.168.1.246:4821",
    };

    expect(
      isSiteRuntimeSwitching(target, { status: "idle", instanceKey: null }),
    ).toBe(true);
    expect(
      isSiteRuntimeSwitching(target, {
        status: "switching",
        instanceKey: "site-a-live",
      }),
    ).toBe(true);
  });
});
