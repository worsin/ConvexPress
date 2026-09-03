import { describe, expect, test } from "bun:test";

import {
  decideSessionGrant,
  getSessionExpiration,
  parseRequestedSiteRole,
} from "../sessionPolicy";

const NOW = Date.parse("2026-09-02T18:00:00.000Z");

describe("management session policy", () => {
  test("grants only the requested intersection of site and authority capabilities", () => {
    expect(
      decideSessionGrant({
        requestedCapabilities: ["health.read", "backup.create"],
        siteCapabilities: [
          "health.read",
          "session.exchange",
          "backup.create",
        ],
        authorityCapabilities: [
          "health.read",
          "session.exchange",
          "backup.create",
        ],
      }),
    ).toEqual({
      allowed: true,
      capabilities: ["backup.create", "health.read"],
    });
  });

  test("rejects empty, duplicate, unknown, and ungranted requests", () => {
    for (const requestedCapabilities of [
      [],
      ["health.read", "health.read"],
      ["totally.unknown"],
      ["site.restore"],
    ]) {
      expect(
        decideSessionGrant({
          requestedCapabilities,
          siteCapabilities: ["health.read", "session.exchange", "site.restore"],
          authorityCapabilities: ["health.read", "session.exchange"],
        }),
      ).toEqual({ allowed: false, capabilities: [] });
    }
  });

  test("never creates a session beyond the signed envelope or configured lifetime", () => {
    expect(
      getSessionExpiration({
        now: NOW,
        envelopeExpiresAt: NOW + 60_000,
        maximumLifetimeMs: 15 * 60_000,
      }),
    ).toBe(NOW + 60_000);
    expect(
      getSessionExpiration({
        now: NOW,
        envelopeExpiresAt: NOW + 60 * 60_000,
        maximumLifetimeMs: 15 * 60_000,
      }),
    ).toBe(NOW + 15 * 60_000);
    expect(() =>
      getSessionExpiration({
        now: NOW,
        envelopeExpiresAt: NOW,
        maximumLifetimeMs: 15 * 60_000,
      }),
    ).toThrow("Session envelope is already expired");
  });

  test("accepts only the five portable site role profiles", () => {
    for (const role of [
      "administrator",
      "editor",
      "author",
      "contributor",
      "subscriber",
    ]) {
      expect(parseRequestedSiteRole(role)).toBe(role);
    }
    expect(() => parseRequestedSiteRole("owner")).toThrow(
      "Site session role is invalid",
    );
    expect(() => parseRequestedSiteRole("administrator ")).toThrow(
      "Site session role is invalid",
    );
  });
});
