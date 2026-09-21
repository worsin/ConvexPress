import { describe, expect, test } from "bun:test";

import { isSiteRuntimeSwitching, siteRuntimeSelectionKey } from "./SiteRuntimeProvider";

describe("site runtime render isolation", () => {
  test("selection identity includes same-instance connection, origin, operator and retry changes", () => {
    const target = { connectionId: "a", instanceKey: "staging", deploymentOrigin: "https://one.convex.cloud", siteOrigin: "https://one.example" };
    const key = siteRuntimeSelectionKey(target, "operator", 1, 0);
    for (const next of [{...target,connectionId:"b"},{...target,deploymentOrigin:"https://two.convex.cloud"},{...target,siteOrigin:"https://two.example"}]) expect(siteRuntimeSelectionKey(next,"operator",1,0)).not.toBe(key);
    expect(siteRuntimeSelectionKey(target,"other",1,0)).not.toBe(key);
    expect(siteRuntimeSelectionKey(target,"operator",2,0)).not.toBe(key);
    expect(siteRuntimeSelectionKey(target,"operator",1,1)).not.toBe(key);
    expect(siteRuntimeSelectionKey({...target,sessionRoleKey:"subscriber"},"operator",1,0)).not.toBe(key);
    expect(siteRuntimeSelectionKey(null,"operator",1,0)).not.toBe(key);
  });
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
