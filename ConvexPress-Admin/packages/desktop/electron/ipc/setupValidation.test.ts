import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  deriveConvexSiteUrl,
  normalizeConvexCloudUrl,
  validateAuthPrivateKey,
  validateProductionDeployKey,
  validateSetupConfig,
} from "./setupValidation";
import {
  getTrustedDevRendererOrigin,
  isAppRendererSender,
  isExactWizardSender,
  isTrustedDesktopSender,
  isWizardSender,
} from "./setupSender";

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

  test("accepts only P-256 PKCS8 private keys for local admin JWT signing", () => {
    const { privateKey: ecPrivateKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const p256Pkcs8 = ecPrivateKey.export({
      type: "pkcs8",
      format: "pem",
    }) as string;

    expect(validateAuthPrivateKey(`\n${p256Pkcs8}\n`)).toBe(
      p256Pkcs8.trim(),
    );

    const { privateKey: rsaPrivateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const rsaPkcs8 = rsaPrivateKey.export({
      type: "pkcs8",
      format: "pem",
    }) as string;

    expect(() => validateAuthPrivateKey(rsaPkcs8)).toThrow(
      "AUTH_PRIVATE_KEY must be a PEM-encoded P-256 PKCS8 private key for ES256 local admin auth.",
    );
    expect(() => validateAuthPrivateKey("not-a-private-key")).toThrow(
      "AUTH_PRIVATE_KEY must be a PEM-encoded P-256 PKCS8 private key for ES256 local admin auth.",
    );
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
        mode: "server",
        convexUrl: "https://affable-herring-441.convex.cloud",
        adminKey: DEPLOY_KEY,
        adminName: "A".repeat(129),
        adminEmail: "admin@example.com",
        adminPassword: "CorrectHorseBatteryStaple42!",
      }),
    ).toThrow("Admin name must be 128 characters or fewer.");
    expect(() =>
      validateSetupConfig({
        mode: "server",
        convexUrl: "https://affable-herring-441.convex.cloud",
        adminKey: DEPLOY_KEY,
        adminName: "First Admin",
        adminEmail: "admin@example.com",
        adminPassword: "A".repeat(257),
      }),
    ).toThrow("Admin password must be 256 characters or fewer.");
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
        mode: "client",
        convexUrl: "https://affable-herring-441.convex.cloud",
        clientIdentifier: "admin@example.com",
        clientPassword: "A".repeat(257),
      }),
    ).toThrow("Client password must be 256 characters or fewer.");
    expect(() =>
      validateSetupConfig({
        mode: "demo",
        convexUrl: "https://affable-herring-441.convex.cloud",
      }),
    ).toThrow("Setup mode must be either server or client.");
  });

  test("allows setup completion only from the wizard document", () => {
    expect(
      isWizardSender(
        "file:///Applications/ConvexPress.app/Contents/Resources/dist-electron/wizard/index.html",
      ),
    ).toBe(true);
    expect(
      isWizardSender(
        "file:///Applications/ConvexPress.app/Contents/Resources/dist-electron/index.html",
      ),
    ).toBe(false);
    expect(isWizardSender("http://127.0.0.1:4105/dashboard")).toBe(false);
    expect(isWizardSender("https://evil.example/wizard/index.html")).toBe(
      false,
    );
  });

  test("trusts only the configured app renderer for main app IPC", () => {
    expect(getTrustedDevRendererOrigin()).toBe("http://localhost:4105");
    expect(isAppRendererSender("http://localhost:4105/dashboard")).toBe(true);
    expect(isAppRendererSender("http://localhost:4106/dashboard")).toBe(false);
    expect(isAppRendererSender("http://127.0.0.1:4105/dashboard")).toBe(false);
    expect(
      isAppRendererSender("http://127.0.0.1:4105/dashboard", {
        devRendererUrl: "http://127.0.0.1:4105",
      }),
    ).toBe(true);

    const rendererIndexPath = path.join(
      "/Applications/ConvexPress.app/Contents/Resources/app.asar",
      "packages/desktop/dist/index.html",
    );
    const rendererUrl = pathToFileURL(rendererIndexPath).href;

    expect(
      isAppRendererSender(`${rendererUrl}#/setup`, { rendererIndexPath }),
    ).toBe(true);
    expect(
      isAppRendererSender(
        "file:///Applications/ConvexPress.app/Contents/Resources/app.asar/packages/desktop/dist/other.html",
        { rendererIndexPath },
      ),
    ).toBe(false);
  });

  test("trusts setup helper IPC only from app or wizard documents", () => {
    const wizardIndexPath = path.join(
      "/Applications/ConvexPress.app/Contents/Resources/app.asar",
      "packages/desktop/dist-electron/wizard/index.html",
    );
    const wizardUrl = pathToFileURL(wizardIndexPath).href;

    expect(isExactWizardSender(wizardUrl, wizardIndexPath)).toBe(true);
    expect(
      isTrustedDesktopSender(wizardUrl, { wizardIndexPath }),
    ).toBe(true);
    expect(
      isTrustedDesktopSender("http://localhost:4105/setup", {
        wizardIndexPath,
      }),
    ).toBe(true);
    expect(
      isTrustedDesktopSender("https://evil.example/wizard/index.html", {
        wizardIndexPath,
      }),
    ).toBe(false);
  });
});
