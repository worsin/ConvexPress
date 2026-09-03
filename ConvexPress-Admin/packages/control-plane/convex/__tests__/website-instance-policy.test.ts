import { describe, expect, test } from "bun:test";

import { buildWebsiteInstancePatch } from "../websiteInstancePolicy";

const current = {
  label: "Production",
  deploymentOrigin: "http://127.0.0.1:4810",
  managementOrigin: "http://127.0.0.1:4811",
  siteOrigin: "https://shop.example.test",
  siteContractVersion: "1.0.0",
  schemaVersion: "2026.9.0",
  engineVersion: "1.0.0",
};

describe("website environment update policy", () => {
  test("normalizes origins and recomputes compatibility from the merged versions", () => {
    expect(
      buildWebsiteInstancePatch({
        current,
        input: {
          label: "  Local live  ",
          deploymentOrigin: "http://127.0.0.1:4820/",
          managementOrigin: "http://127.0.0.1:4821/",
          siteOrigin: "https://local.shop.example.test/",
          engineVersion: "2.0.0",
        },
        now: 42,
      }),
    ).toEqual({
      label: "Local live",
      deploymentOrigin: "http://127.0.0.1:4820",
      managementOrigin: "http://127.0.0.1:4821",
      siteOrigin: "https://local.shop.example.test",
      domain: "local.shop.example.test",
      engineVersion: "2.0.0",
      compatibility: "incompatible",
      lastCompatibilityAt: 42,
      lastCompatibilityError: "unsupported-engine-version",
      updatedAt: 42,
    });
  });

  test("can clear optional metadata without changing immutable identity", () => {
    expect(
      buildWebsiteInstancePatch({
        current,
        input: { label: null, deploymentName: null, projectRef: null },
        now: 99,
      }),
    ).toEqual({
      label: undefined,
      deploymentName: undefined,
      projectRef: undefined,
      updatedAt: 99,
    });
  });

  test("rejects empty, credential-bearing, or path-bearing updates", () => {
    expect(() =>
      buildWebsiteInstancePatch({ current, input: {}, now: 1 }),
    ).toThrow("at least one field");
    expect(() =>
      buildWebsiteInstancePatch({
        current,
        input: { deploymentOrigin: "https://user:secret@example.test" },
        now: 1,
      }),
    ).toThrow("deployment origin");
    expect(() =>
      buildWebsiteInstancePatch({
        current,
        input: { managementOrigin: "https://example.test/api" },
        now: 1,
      }),
    ).toThrow("management origin");
    expect(() =>
      buildWebsiteInstancePatch({
        current,
        input: { siteOrigin: "https://example.test/admin" },
        now: 1,
      }),
    ).toThrow("site origin");
  });
});
