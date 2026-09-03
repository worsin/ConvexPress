import { describe, expect, test } from "bun:test";

import {
  expectedHandoffRevocation,
  formatHandoffFilename,
  handoffCanBeDownloaded,
  parseHandoffPackageText,
} from "./handoff-view";

describe("portable website handoff presentation", () => {
  test("accepts only a complete ConvexPress handoff package", () => {
    const packageText = JSON.stringify({
      format: "convexpress-handoff",
      formatVersion: "1.0.0",
      manifest: { handoffId: "handoff_example" },
      manifestSha256: "a".repeat(64),
    });

    expect(parseHandoffPackageText(packageText)).toEqual({
      handoffId: "handoff_example",
      packageJson: packageText,
      websiteKey: null,
      environmentCount: 0,
    });
    expect(readFailure(() => parseHandoffPackageText("not json"))).toBe(
      "Choose a valid ConvexPress handoff package",
    );
    expect(
      readFailure(() =>
        parseHandoffPackageText(JSON.stringify({ format: "something-else" })),
      ),
    ).toBe("Choose a valid ConvexPress handoff package");
  });

  test("uses stable, filesystem-safe download names", () => {
    expect(formatHandoffFilename("client:shop", "handoff_123")).toBe(
      "client-shop-handoff-handoff_123.json",
    );
  });

  test("requires exact revocation text and downloadable state", () => {
    expect(expectedHandoffRevocation("handoff_123")).toBe(
      "REVOKE HANDOFF handoff_123",
    );
    expect(handoffCanBeDownloaded("ready", Date.now() + 1_000, Date.now())).toBe(
      true,
    );
    expect(
      handoffCanBeDownloaded("downloaded", Date.now() + 1_000, Date.now()),
    ).toBe(true);
    expect(handoffCanBeDownloaded("revoked", Date.now() + 1_000, Date.now())).toBe(
      false,
    );
    expect(handoffCanBeDownloaded("ready", Date.now() - 1, Date.now())).toBe(
      false,
    );
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
