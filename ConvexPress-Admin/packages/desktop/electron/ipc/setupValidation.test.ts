import { describe, expect, test } from "bun:test";

import {
  deriveConvexSiteUrl,
  normalizeConvexCloudUrl,
  validateProductionDeployKey,
  validateSetupConfig,
} from "./setupValidation";

const DEPLOY_KEY = "prod:affable-herring-441|test-deploy-token";

describe("setup validation", () => {
  test("derives a Convex site URL from a cloud deployment URL", () => {
    expect(
      deriveConvexSiteUrl("https://affable-herring-441.convex.cloud/"),
    ).toBe("https://affable-herring-441.convex.site");
  });

  test("normalizes only Convex cloud deployment URLs for connection tests", () => {
    expect(
      normalizeConvexCloudUrl(" https://affable-herring-441.convex.cloud/ "),
    ).toBe("https://affable-herring-441.convex.cloud");

    expect(() =>
      normalizeConvexCloudUrl("http://127.0.0.1:4105"),
    ).toThrow("Convex URL must match https://your-app-123.convex.cloud.");
    expect(() =>
      normalizeConvexCloudUrl("https://169.254.169.254/latest/meta-data"),
    ).toThrow("Convex URL must match https://your-app-123.convex.cloud.");
    expect(() =>
      normalizeConvexCloudUrl(
        "https://affable-herring-441.convex.cloud.evil.example.com",
      ),
    ).toThrow("Convex URL must match https://your-app-123.convex.cloud.");
  });

  test("requires the production deploy key to match the Convex URL", () => {
    expect(
      validateProductionDeployKey(
        " prod:affable-herring-441|test-deploy-token ",
        "https://affable-herring-441.convex.cloud/",
      ),
    ).toEqual({
      deployKey: "prod:affable-herring-441|test-deploy-token",
      deployment: "prod:affable-herring-441",
    });

    expect(() =>
      validateProductionDeployKey(
        "prod:other-herring-441|test-deploy-token",
        "https://affable-herring-441.convex.cloud",
      ),
    ).toThrow("Deploy key deployment must match the Convex URL.");
    expect(() =>
      validateProductionDeployKey(
        "dev:affable-herring-441|test-deploy-token",
        "https://affable-herring-441.convex.cloud",
      ),
    ).toThrow("Deploy key must start with a production deployment reference.");
    expect(() =>
      validateProductionDeployKey(
        "prod:affable-herring-441",
        "https://affable-herring-441.convex.cloud",
      ),
    ).toThrow("Deploy key must include a deployment reference and token.");
  });

  test("normalizes server setup and pending first-admin credentials", () => {
    expect(
      validateSetupConfig({
        mode: "server",
        convexUrl: " https://affable-herring-441.convex.cloud/ ",
        convexSiteUrl: "https://affable-herring-441.convex.site/",
        adminKey: DEPLOY_KEY,
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
        adminKey: DEPLOY_KEY,
        convexSiteUrl: "https://other-site.convex.site",
      }),
    ).toThrow("Convex site URL must match the deployment URL.");
    expect(() =>
      validateSetupConfig({
        mode: "server",
        convexUrl: "https://affable-herring-441.convex.cloud",
        adminName: "First Admin",
        adminEmail: "admin@example.com",
        adminPassword: "CorrectHorseBatteryStaple42!",
      }),
    ).toThrow("Deploy key is required.");
    expect(() =>
      validateSetupConfig({
        mode: "server",
        convexUrl: "https://affable-herring-441.convex.cloud",
        adminKey: DEPLOY_KEY,
        adminEmail: "admin@example.com",
        adminPassword: "CorrectHorseBatteryStaple42!",
      }),
    ).toThrow("Admin name is required.");
    expect(() =>
      validateSetupConfig({
        mode: "server",
        convexUrl: "https://affable-herring-441.convex.cloud",
        adminKey: DEPLOY_KEY,
        adminName: "First Admin",
        adminEmail: "not-an-email",
        adminPassword: "CorrectHorseBatteryStaple42!",
      }),
    ).toThrow("Admin email must be a valid email address.");
    expect(() =>
      validateSetupConfig({
        mode: "server",
        convexUrl: "https://affable-herring-441.convex.cloud",
        adminKey: DEPLOY_KEY,
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
