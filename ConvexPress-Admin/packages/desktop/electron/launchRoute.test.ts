import { describe, expect, test } from "bun:test";

import {
  FIRST_ADMIN_SETUP_ROUTE,
  addHashRouteToUrl,
  getInitialRouteForLaunch,
  isPendingAdminHandoffUsable,
  normalizeInitialRoute,
} from "./launchRoute";

describe("desktop launch route", () => {
  test("launches first-admin setup directly to the setup checklist", () => {
    const now = Date.now();
    expect(
      getInitialRouteForLaunch({
        pendingAdminCredentials: {
          email: "admin@example.com",
          password: "password123",
          displayName: "Admin",
          expiresAt: now + 60_000,
        },
      }),
    ).toBe(FIRST_ADMIN_SETUP_ROUTE);
  });

  test("does not override normal launches when no fresh first-admin handoff is pending", () => {
    const now = Date.now();
    expect(getInitialRouteForLaunch({ pendingAdminCredentials: null })).toBe(
      undefined,
    );
    expect(getInitialRouteForLaunch({})).toBe(undefined);
    expect(
      getInitialRouteForLaunch({
        pendingAdminCredentials: {
          email: "admin@example.com",
          password: "password123",
          displayName: "Admin",
        },
      }),
    ).toBe(undefined);
    expect(
      getInitialRouteForLaunch({
        pendingAdminCredentials: {
          email: "admin@example.com",
          password: "password123",
          displayName: "Admin",
          expiresAt: now - 1,
        },
      }),
    ).toBe(undefined);
  });

  test("validates first-admin handoff shape and expiry", () => {
    expect(
      isPendingAdminHandoffUsable({
        email: "admin@example.com",
        password: "password123",
        expiresAt: 2000,
      }, 1000),
    ).toBe(true);
    expect(
      isPendingAdminHandoffUsable({
        email: "not-an-email",
        password: "password123",
        expiresAt: 2000,
      }, 1000),
    ).toBe(false);
    expect(
      isPendingAdminHandoffUsable({
        email: "admin@example.com",
        password: "",
        expiresAt: 2000,
      }, 1000),
    ).toBe(false);
    expect(
      isPendingAdminHandoffUsable({
        email: "admin@example.com",
        password: "password123",
        expiresAt: 1000,
      }, 1000),
    ).toBe(false);
  });

  test("normalizes hash routes for dev and packaged renderer loading", () => {
    expect(normalizeInitialRoute("setup")).toBe("/setup");
    expect(normalizeInitialRoute("#/setup")).toBe("/setup");
    expect(addHashRouteToUrl("http://localhost:4105", "/setup")).toBe(
      "http://localhost:4105/#/setup",
    );
  });
});
