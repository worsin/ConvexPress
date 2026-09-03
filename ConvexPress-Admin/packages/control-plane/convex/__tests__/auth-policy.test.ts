import { describe, expect, test } from "bun:test";

import { decideAuthUserClaim } from "../authPolicy";
import {
  PACKAGED_CONVEXPRESS_APP_ORIGIN,
  resolveAuthRuntimeConfig,
  resolveAuthTrustedOrigins,
} from "../authOrigins";

const NOW = Date.parse("2026-09-02T18:00:00.000Z");

describe("outer operator signup policy", () => {
  test("allows the first owner only through a live matching reservation", () => {
    expect(
      decideAuthUserClaim({
        now: NOW,
        normalizedEmail: "owner@example.com",
        anyUserExists: false,
        reservation: {
          ownerEmail: "owner@example.com",
          status: "reserved",
          expiresAt: NOW + 60_000,
        },
      }),
    ).toEqual({ kind: "create-owner" });

    expect(() =>
      decideAuthUserClaim({
        now: NOW,
        normalizedEmail: "wrong@example.com",
        anyUserExists: false,
        reservation: {
          ownerEmail: "owner@example.com",
          status: "reserved",
          expiresAt: NOW + 60_000,
        },
      }),
    ).toThrow("reservation");
  });

  test("allows later signup only to claim an active pre-provisioned row", () => {
    expect(
      decideAuthUserClaim({
        now: NOW,
        normalizedEmail: "operator@example.com",
        anyUserExists: true,
        provisionedUser: {
          email: "operator@example.com",
          isActive: true,
        },
      }),
    ).toEqual({ kind: "claim-provisioned-user" });

    expect(() =>
      decideAuthUserClaim({
        now: NOW,
        normalizedEmail: "operator@example.com",
        anyUserExists: true,
      }),
    ).toThrow("provisioned");
    expect(() =>
      decideAuthUserClaim({
        now: NOW,
        normalizedEmail: "operator@example.com",
        anyUserExists: true,
        provisionedUser: {
          email: "operator@example.com",
          isActive: false,
        },
      }),
    ).toThrow("inactive");
    expect(() =>
      decideAuthUserClaim({
        now: NOW,
        normalizedEmail: "operator@example.com",
        anyUserExists: true,
        provisionedUser: {
          email: "operator@example.com",
          isActive: true,
          authUserId: "already-claimed",
        },
      }),
    ).toThrow("already has a login");
  });
});

describe("outer auth origin policy", () => {
  test("allows the packaged protocol and exact development renderer only in their modes", () => {
    expect(
      resolveAuthTrustedOrigins({
        siteUrl: "https://control.example.convex.site",
        mode: "packaged",
      }),
    ).toContain(PACKAGED_CONVEXPRESS_APP_ORIGIN);
    expect(
      resolveAuthTrustedOrigins({
        siteUrl: "https://control.example.convex.site",
        mode: "development",
      }),
    ).toContain("http://localhost:4105");
  });

  test("hosted production rejects null, localhost, insecure, and wildcard origins", () => {
    expect(() =>
      resolveAuthTrustedOrigins({
        siteUrl: "https://control.example.convex.site",
        mode: "hosted",
        additionalOrigins: [
          "null",
          "http://localhost:4105",
          "http://admin.example.com",
          "https://*.example.com",
        ],
      }),
    ).toThrow("hosted origin");
  });

  test("requires an explicit mode for non-local deployments", () => {
    expect(
      resolveAuthRuntimeConfig({
        siteUrl: "http://127.0.0.1:4721",
      }),
    ).toEqual({
      mode: "development",
      siteUrl: "http://127.0.0.1:4721",
      trustedOrigins: [
        "http://127.0.0.1:4721",
        "http://localhost:4105",
        "http://127.0.0.1:4105",
      ],
    });

    expect(() =>
      resolveAuthRuntimeConfig({
        siteUrl: "https://control.example.convex.site",
      }),
    ).toThrow("CONVEXPRESS_AUTH_MODE");

    expect(
      resolveAuthRuntimeConfig({
        siteUrl: "https://control.example.convex.site",
        configuredMode: "hosted",
        additionalOrigins: "https://admin.example.com",
      }),
    ).toEqual({
      mode: "hosted",
      siteUrl: "https://control.example.convex.site",
      trustedOrigins: [
        "https://control.example.convex.site",
        "https://admin.example.com",
      ],
    });
  });
});
