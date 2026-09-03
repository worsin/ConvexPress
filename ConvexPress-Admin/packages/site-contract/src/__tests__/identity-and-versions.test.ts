import { describe, expect, test } from "bun:test";

import {
  CURRENT_ENGINE_VERSION,
  CURRENT_SCHEMA_VERSION,
  CURRENT_SITE_CONTRACT_VERSION,
  assessRuntimeCompatibility,
  getContractCompatibility,
  parseContractVersion,
} from "../versions";
import {
  normalizeDeploymentOrigin,
  normalizeSiteOrigin,
  portableKeySchema,
  siteHealthResponseSchema,
  siteIdentitySchema,
  siteSessionExchangeResponseSchema,
} from "../schemas";

describe("portable site identity", () => {
  test("keeps stable opaque keys case-sensitive", () => {
    expect(portableKeySchema.parse("Site_Acme:Prod-01")).toBe(
      "Site_Acme:Prod-01",
    );
    expect(() => portableKeySchema.parse("contains spaces")).toThrow();
    expect(() => portableKeySchema.parse("https://not-an-id.example")).toThrow();
  });

  test("normalizes an exact deployment origin and rejects URL-shaped ambiguity", () => {
    expect(normalizeDeploymentOrigin("HTTPS://Example.COM:443/")).toBe(
      "https://example.com",
    );
    expect(normalizeDeploymentOrigin("http://localhost:3210/")).toBe(
      "http://localhost:3210",
    );
    expect(() => normalizeDeploymentOrigin("https://example.com/admin")).toThrow();
    expect(() => normalizeDeploymentOrigin("https://user@example.com")).toThrow();
    expect(() => normalizeDeploymentOrigin("https://example.com?q=1")).toThrow();
  });

  test("normalizes the public site origin independently from its deployment", () => {
    expect(normalizeSiteOrigin("https://SHOP.Example.com/")).toBe(
      "https://shop.example.com",
    );
    expect(() => normalizeSiteOrigin("file:///tmp/site.html")).toThrow();
  });

  test("describes one deployment-scoped site runtime without outer content stamps", () => {
    const identity = siteIdentitySchema.parse({
      websiteKey: "website_acme",
      instanceKey: "instance_prod",
      environmentKind: "live",
      deploymentOrigin: "https://acme-live.convex.cloud/",
      managementOrigin: "https://acme-live.convex.site/",
      siteOrigin: "https://shop.example.com/",
      siteContractVersion: CURRENT_SITE_CONTRACT_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      engineVersion: CURRENT_ENGINE_VERSION,
      managementCapabilities: ["health.read", "backup.create"],
    });

    expect(identity.deploymentOrigin).toBe("https://acme-live.convex.cloud");
    expect(identity.managementOrigin).toBe("https://acme-live.convex.site");
    expect(identity.siteOrigin).toBe("https://shop.example.com");
    expect(identity).not.toHaveProperty("siteId");
    expect(identity).not.toHaveProperty("businessId");
    expect(identity).not.toHaveProperty("organizationId");
  });

  test("accepts every planned environment kind and rejects obsolete aliases", () => {
    for (const environmentKind of [
      "live",
      "staging",
      "beta",
      "preview",
      "development",
      "local",
      "custom",
    ]) {
      expect(
        siteIdentitySchema.safeParse({
          websiteKey: "website_acme",
          instanceKey: `instance_${environmentKind}`,
          environmentKind,
          deploymentOrigin: "https://example.convex.cloud",
          managementOrigin: "https://example.convex.site",
          siteOrigin: "https://example.com",
          siteContractVersion: CURRENT_SITE_CONTRACT_VERSION,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          engineVersion: CURRENT_ENGINE_VERSION,
          managementCapabilities: ["health.read"],
        }).success,
      ).toBe(true);
    }

    expect(
      siteIdentitySchema.safeParse({
        websiteKey: "website_acme",
        instanceKey: "instance_prod",
        environmentKind: "production",
        deploymentOrigin: "https://example.convex.cloud",
        managementOrigin: "https://example.convex.site",
        siteOrigin: "https://example.com",
        siteContractVersion: CURRENT_SITE_CONTRACT_VERSION,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        engineVersion: CURRENT_ENGINE_VERSION,
        managementCapabilities: ["health.read"],
      }).success,
    ).toBe(false);
  });

  test("health responses are strict and cannot carry deploy or admin credentials", () => {
    const safe = {
      status: "healthy",
      checkedAt: "2026-09-02T18:00:00.000Z",
      websiteKey: "website_acme",
      instanceKey: "instance_prod",
      siteContractVersion: CURRENT_SITE_CONTRACT_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      engineVersion: CURRENT_ENGINE_VERSION,
      storageStatus: "healthy",
      authStatus: "healthy",
    };
    expect(siteHealthResponseSchema.parse(safe)).toEqual(safe);
    expect(
      siteHealthResponseSchema.safeParse({ ...safe, adminKey: "plaintext" })
        .success,
    ).toBe(false);
    expect(
      siteHealthResponseSchema.safeParse({ ...safe, deployCredential: "plaintext" })
        .success,
    ).toBe(false);
  });

  test("accepts only a bounded site-issued management session response", () => {
    const safe = {
      token: `${"a".repeat(32)}.${"b".repeat(32)}.${"c".repeat(32)}`,
      controllerId: "controller_standalone",
      syntheticOperatorId: "controller:controller_standalone:key_primary_2026",
      capabilities: ["health.read"],
      siteRole: "subscriber",
      siteCapabilities: ["dashboard.view", "post.read"],
      expiresAt: 1_788_390_900_000,
    };
    expect(siteSessionExchangeResponseSchema.parse(safe)).toEqual(safe);
    expect(
      siteSessionExchangeResponseSchema.safeParse({
        ...safe,
        deploymentAdminKey: "must-not-leak",
      }).success,
    ).toBe(false);
  });
});

describe("contract compatibility", () => {
  test("accepts contract versions in the same major line", () => {
    expect(parseContractVersion("1.12.3")).toEqual({
      major: 1,
      minor: 12,
      patch: 3,
    });
    expect(
      getContractCompatibility({
        controllerVersion: "1.3.0",
        siteVersion: "1.1.9",
      }),
    ).toEqual({ compatible: true, reason: "same-major" });
  });

  test("rejects a different major or malformed version", () => {
    expect(
      getContractCompatibility({
        controllerVersion: "2.0.0",
        siteVersion: "1.9.0",
      }),
    ).toEqual({ compatible: false, reason: "major-mismatch" });
    expect(() => parseContractVersion("v1")).toThrow();
  });

  test("reports protocol, schema, and engine incompatibility separately", () => {
    expect(
      assessRuntimeCompatibility({
        siteContractVersion: CURRENT_SITE_CONTRACT_VERSION,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        engineVersion: CURRENT_ENGINE_VERSION,
      }),
    ).toEqual({ compatible: true, issues: [] });

    expect(
      assessRuntimeCompatibility({
        siteContractVersion: "2.0.0",
        schemaVersion: "2025.1.0",
        engineVersion: "2.0.0",
      }),
    ).toEqual({
      compatible: false,
      issues: [
        "unsupported-contract-version",
        "unsupported-schema-version",
        "unsupported-engine-version",
      ],
    });
  });
});
