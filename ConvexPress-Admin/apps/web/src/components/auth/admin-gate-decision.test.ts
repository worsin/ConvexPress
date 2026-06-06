import { describe, expect, test } from "bun:test";

import { getAdminGateDecision } from "./admin-gate-decision";

const base = {
  authLoading: false,
  isAuthenticated: false,
  signupComplete: false,
  loginComplete: false,
  hasAdmin: true,
  mode: undefined,
  hasPendingCredentials: false,
  hasPendingLoginCredentials: false,
  hasAutoSignupError: false,
} as const;

describe("AdminGate decision", () => {
  test("renders the app immediately after setup or login completes", () => {
    expect(
      getAdminGateDecision({
        ...base,
        signupComplete: true,
        authLoading: true,
      }),
    ).toBe("children");
    expect(
      getAdminGateDecision({
        ...base,
        loginComplete: true,
        authLoading: true,
      }),
    ).toBe("children");
  });

  test("waits for local auth before checking first-admin state", () => {
    expect(
      getAdminGateDecision({
        ...base,
        authLoading: true,
        hasPendingCredentials: true,
        mode: "server",
      }),
    ).toBe("spinner");
  });

  test("auto-creates the first admin from server setup credentials", () => {
    expect(
      getAdminGateDecision({
        ...base,
        hasAdmin: undefined,
        hasPendingCredentials: true,
        mode: "server",
      }),
    ).toBe("auto-signup");
  });

  test("falls back to manual setup after auto-signup failure when no admin exists", () => {
    expect(
      getAdminGateDecision({
        ...base,
        hasAdmin: false,
        hasPendingCredentials: false,
        hasAutoSignupError: true,
        mode: "server",
      }),
    ).toBe("manual-signup");
  });

  test("shows the manual first-admin form only outside client mode", () => {
    expect(
      getAdminGateDecision({
        ...base,
        hasAdmin: false,
      }),
    ).toBe("manual-signup");
    expect(
      getAdminGateDecision({
        ...base,
        hasAdmin: false,
        mode: "client",
      }),
    ).toBe("waiting-for-server");
  });

  test("auto-signs in a configured client once an admin exists", () => {
    expect(
      getAdminGateDecision({
        ...base,
        mode: "client",
        hasPendingLoginCredentials: true,
      }),
    ).toBe("auto-login");
  });

  test("lets the normal auth route render when an admin exists and no setup is pending", () => {
    expect(getAdminGateDecision(base)).toBe("children");
  });
});
