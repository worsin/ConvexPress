import { describe, expect, test } from "bun:test";

import { deriveConvexSiteUrl, validateSetupConfig } from "./setupValidation";

describe("setup validation", () => {
  test("derives a Convex site URL from a cloud deployment URL", () => {
    expect(
      deriveConvexSiteUrl("https://affable-herring-441.convex.cloud/"),
    ).toBe("https://affable-herring-441.convex.site");
  });

  test("normalizes server setup and pending first-admin credentials", () => {
    expect(
      validateSetupConfig({
        mode: "server",
        convexUrl: " https://affable-herring-441.convex.cloud/ ",
        convexSiteUrl: "https://affable-herring-441.convex.site/",
        adminName: " First Admin ",
        adminEmail: " FIRST.ADMIN@Example.COM ",
        adminPassword: "CorrectHorseBatteryStaple42!",
      }),
    ).toEqual({
      mode: "server",
      convexUrl: "https://affable-herring-441.convex.cloud",
      convexSiteUrl: "https://affable-herring-441.convex.site",
      pendingAdminCredentials: {
        displayName: "First Admin",
        email: "first.admin@example.com",
        password: "CorrectHorseBatteryStaple42!",
      },
      pendingLoginCredentials: null,
    });
  });

  test("normalizes client setup and pending login credentials", () => {
    expect(
      validateSetupConfig({
        mode: "client",
        convexUrl: "https://affable-herring-441.convex.cloud",
        clientIdentifier: " admin@example.com ",
        clientPassword: "CorrectHorseBatteryStaple42!",
      }),
    ).toEqual({
      mode: "client",
      convexUrl: "https://affable-herring-441.convex.cloud",
      convexSiteUrl: "https://affable-herring-441.convex.site",
      pendingAdminCredentials: null,
      pendingLoginCredentials: {
        identifier: "admin@example.com",
        password: "CorrectHorseBatteryStaple42!",
      },
    });
  });

  test("rejects malformed setup payloads before they can be saved", () => {
    expect(() => validateSetupConfig({ mode: "server" })).toThrow(
      "Convex URL is required.",
    );
    expect(() =>
      validateSetupConfig({
        mode: "server",
        convexUrl: "https://affable-herring-441.convex.site",
      }),
    ).toThrow("Convex URL must match https://your-app-123.convex.cloud.");
    expect(() =>
      validateSetupConfig({
        mode: "server",
        convexUrl: "https://affable-herring-441.convex.cloud",
        convexSiteUrl: "https://other-site.convex.site",
      }),
    ).toThrow("Convex site URL must match the deployment URL.");
    expect(() =>
      validateSetupConfig({
        mode: "server",
        convexUrl: "https://affable-herring-441.convex.cloud",
        adminEmail: "admin@example.com",
        adminPassword: "CorrectHorseBatteryStaple42!",
      }),
    ).toThrow("Admin name is required.");
    expect(() =>
      validateSetupConfig({
        mode: "server",
        convexUrl: "https://affable-herring-441.convex.cloud",
        adminName: "First Admin",
        adminEmail: "not-an-email",
        adminPassword: "CorrectHorseBatteryStaple42!",
      }),
    ).toThrow("Admin email must be a valid email address.");
    expect(() =>
      validateSetupConfig({
        mode: "server",
        convexUrl: "https://affable-herring-441.convex.cloud",
        adminName: "First Admin",
        adminEmail: "admin@example.com",
        adminPassword: "short",
      }),
    ).toThrow("Admin password must be at least 8 characters.");
    expect(() =>
      validateSetupConfig({
        mode: "client",
        convexUrl: "https://affable-herring-441.convex.cloud",
        clientPassword: "CorrectHorseBatteryStaple42!",
      }),
    ).toThrow("Client username or email is required.");
    expect(() =>
      validateSetupConfig({
        mode: "client",
        convexUrl: "https://affable-herring-441.convex.cloud",
        clientIdentifier: "admin@example.com",
      }),
    ).toThrow("Client password is required.");
    expect(() =>
      validateSetupConfig({
        mode: "demo",
        convexUrl: "https://affable-herring-441.convex.cloud",
      }),
    ).toThrow("Setup mode must be either server or client.");
  });
});
