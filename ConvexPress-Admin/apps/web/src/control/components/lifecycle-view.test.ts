import { describe, expect, test } from "bun:test";

import {
  canCancelOperation,
  canResumeOperation,
  expectedPromotionConfirmation,
  expectedRestoreConfirmation,
  formatByteCount,
  isPromotionConfirmationReady,
  isRestoreConfirmationReady,
  operationProgress,
  operationStateLabel,
} from "./lifecycle-view";

describe("lifecycle operation presentation", () => {
  test("only active component work can be cancelled", () => {
    expect(canCancelOperation("queued")).toBe(true);
    expect(canCancelOperation("running")).toBe(true);
    expect(canCancelOperation("waiting")).toBe(true);
    expect(canCancelOperation("resuming")).toBe(true);
    expect(canCancelOperation("interrupted")).toBe(false);
    expect(canCancelOperation("succeeded")).toBe(false);
    expect(canCancelOperation("failed")).toBe(false);
    expect(canCancelOperation("cancelled")).toBe(false);
  });

  test("only interrupted operations expose resume", () => {
    expect(canResumeOperation("interrupted")).toBe(true);
    expect(canResumeOperation("running")).toBe(false);
    expect(canResumeOperation("failed")).toBe(false);
  });

  test("reports durable step progress without overstating completion", () => {
    expect(
      operationProgress([
        { state: "succeeded" },
        { state: "running" },
        { state: "pending" },
        { state: "pending" },
      ]),
    ).toEqual({ completed: 1, total: 4, percent: 25 });
    expect(operationProgress([])).toEqual({ completed: 0, total: 0, percent: 0 });
  });

  test("uses human-readable state and byte labels", () => {
    expect(operationStateLabel("interrupted")).toBe("Needs attention");
    expect(operationStateLabel("succeeded")).toBe("Completed");
    expect(formatByteCount(0)).toBe("0 B");
    expect(formatByteCount(1536)).toBe("1.5 KB");
    expect(formatByteCount(2_621_440)).toBe("2.5 MB");
  });

  test("requires the exact target-bound phrase for restore", () => {
    expect(expectedRestoreConfirmation("northstar-staging")).toBe(
      "RESTORE northstar-staging",
    );
    expect(
      isRestoreConfirmationReady(
        "northstar-staging",
        "RESTORE northstar-staging",
      ),
    ).toBe(true);
    expect(
      isRestoreConfirmationReady("northstar-staging", "restore northstar-staging"),
    ).toBe(false);
  });

  test("requires the exact target-bound phrase for promotion", () => {
    expect(expectedPromotionConfirmation("agency:shop:live")).toBe(
      "PROMOTE TO agency:shop:live",
    );
    expect(
      isPromotionConfirmationReady(
        "agency:shop:live",
        "PROMOTE TO agency:shop:live",
      ),
    ).toBe(true);
    expect(
      isPromotionConfirmationReady(
        "agency:shop:live",
        "PROMOTE TO agency:shop:staging",
      ),
    ).toBe(false);
  });
});
