import { describe, expect, test } from "bun:test";

import {
  countSiteManagerQueries,
  siteManagerQueryPlan,
} from "./site-manager-query-plan";

describe("site manager query plan", () => {
  test("subscribes only to data required by the active tab", () => {
    expect(siteManagerQueryPlan("portfolio")).toEqual({
      scopedProfile: false,
      rbacAccess: false,
      operators: false,
      hierarchyAccess: true,
      businessAccess: true,
      websiteAccess: true,
      connectionAccess: false,
      liveAccess: false,
      connections: false,
    });
    const environment = siteManagerQueryPlan("environment");
    expect({
      websiteAccess: environment.websiteAccess,
      liveAccess: environment.liveAccess,
      connections: environment.connections,
    }).toEqual({ websiteAccess: true, liveAccess: true, connections: false });
    const authority = siteManagerQueryPlan("authority");
    expect({
      connectionAccess: authority.connectionAccess,
      liveAccess: authority.liveAccess,
      connections: authority.connections,
    }).toEqual({ connectionAccess: true, liveAccess: true, connections: true });
    const people = siteManagerQueryPlan("people");
    expect({
      scopedProfile: people.scopedProfile,
      rbacAccess: people.rbacAccess,
      operators: people.operators,
    }).toEqual({ scopedProfile: true, rbacAccess: true, operators: true });
  });

  test("keeps every tab safely below the eight-query self-hosted limit", () => {
    for (const tab of [
      "portfolio",
      "environment",
      "authority",
      "people",
    ] as const) {
      const nestedQueries = tab === "authority" ? 1 : 0;
      const alwaysMountedShellQueries = 2;
      expect(
        countSiteManagerQueries(siteManagerQueryPlan(tab)) +
          nestedQueries +
          alwaysMountedShellQueries <
          8,
      ).toBe(true);
    }
  });
});
