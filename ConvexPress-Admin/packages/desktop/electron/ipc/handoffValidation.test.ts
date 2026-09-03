import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

import { prepareHandoffSaveRequest } from "./handoffValidation";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

function validPackageJson() {
  const manifest = {
    environments: [],
    handoffId: "handoff_test",
    sourceControllerId: "controller_test",
    website: { websiteKey: "client:shop" },
  };
  return JSON.stringify({
    format: "convexpress-handoff",
    formatVersion: "1.0.0",
    manifest,
    manifestSha256: createHash("sha256")
      .update(canonicalJson(manifest))
      .digest("hex"),
  });
}

describe("Electron handoff save validation", () => {
  test("accepts a checksum-matching package and normalizes its suggested name", () => {
    const packageJson = validPackageJson();
    expect(
      prepareHandoffSaveRequest({
        suggestedFilename: "Northstar Shop handoff.json",
        packageJson,
      }),
    ).toEqual({
      suggestedFilename: "Northstar-Shop-handoff.json",
      packageJson,
    });
  });

  test("rejects tampering, protected fields, and oversized input", () => {
    const tampered = JSON.parse(validPackageJson());
    tampered.manifest.website.websiteKey = "other:site";
    expect(readFailure(() => prepareHandoffSaveRequest({
      suggestedFilename: "handoff.json",
      packageJson: JSON.stringify(tampered),
    }))).toBe("Handoff package checksum is invalid");

    const protectedPackage = JSON.parse(validPackageJson());
    protectedPackage.manifest.privateKeyPem = "secret";
    protectedPackage.manifestSha256 = createHash("sha256")
      .update(canonicalJson(protectedPackage.manifest))
      .digest("hex");
    expect(readFailure(() => prepareHandoffSaveRequest({
      suggestedFilename: "handoff.json",
      packageJson: JSON.stringify(protectedPackage),
    }))).toBe("Handoff package contains a protected credential field");

    expect(readFailure(() => prepareHandoffSaveRequest({
      suggestedFilename: "handoff.json",
      packageJson: "x".repeat(2_000_001),
    }))).toBe("Handoff package is too large");
  });
});

function readFailure(work: () => unknown) {
  try {
    work();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
