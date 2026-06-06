import { describe, expect, test } from "bun:test";

import {
  FIRST_ADMIN_SETUP_ROUTE,
  addHashRouteToUrl,
  getInitialRouteForLaunch,
  normalizeInitialRoute,
} from "./launchRoute";

describe("desktop launch route", () => {
  test("launches first-admin setup directly to the setup checklist", () => {
    expect(
      getInitialRouteForLaunch({
        pendingAdminCredentials: {
          email: "admin@example.com",
          password: "password123",
          displayName: "Admin",
        },
      }),
    ).toBe(FIRST_ADMIN_SETUP_ROUTE);
  });

  test("does not override normal launches when no first-admin handoff is pending", () => {
    expect(getInitialRouteForLaunch({ pendingAdminCredentials: null })).toBe(
      undefined,
    );
    expect(getInitialRouteForLaunch({})).toBe(undefined);
  });

  test("normalizes hash routes for dev and packaged renderer loading", () => {
    expect(normalizeInitialRoute("setup")).toBe("/setup");
    expect(normalizeInitialRoute("#/setup")).toBe("/setup");
    expect(addHashRouteToUrl("http://localhost:4105", "/setup")).toBe(
      "http://localhost:4105/#/setup",
    );
  });
});
