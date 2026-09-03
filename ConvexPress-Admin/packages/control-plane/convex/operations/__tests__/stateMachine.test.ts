import { describe, expect, test } from "bun:test";

import {
  assertOperationTransition,
  sanitizeOperationFailure,
} from "../stateMachine";

describe("durable site operation state machine", () => {
  test("allows only explicit resumable lifecycle transitions", () => {
    expect(
      assertOperationTransition({
        from: "queued",
        to: "running",
        operationCode: "site.backup.create",
      }),
    ).toBe("running");
    expect(
      assertOperationTransition({
        from: "running",
        to: "waiting",
        operationCode: "site.backup.create",
      }),
    ).toBe("waiting");
    expect(
      assertOperationTransition({
        from: "waiting",
        to: "interrupted",
        operationCode: "site.backup.create",
      }),
    ).toBe("interrupted");
    expect(
      assertOperationTransition({
        from: "interrupted",
        to: "resuming",
        operationCode: "site.backup.create",
      }),
    ).toBe("resuming");
    expect(
      assertOperationTransition({
        from: "resuming",
        to: "running",
        operationCode: "site.backup.create",
      }),
    ).toBe("running");
  });

  test("keeps terminal states immutable and refuses invalid resume paths", () => {
    expect(() =>
      assertOperationTransition({
        from: "succeeded",
        to: "running",
        operationCode: "site.backup.create",
      }),
    ).toThrow("terminal");
    expect(() =>
      assertOperationTransition({
        from: "failed",
        to: "resuming",
        operationCode: "site.backup.create",
      }),
    ).toThrow("terminal");
    expect(() =>
      assertOperationTransition({
        from: "queued",
        to: "resuming",
        operationCode: "site.backup.create",
      }),
    ).toThrow("Invalid operation transition");
  });

  test("requires verified pre-backup evidence before restore or promotion succeeds", () => {
    for (const operationCode of ["site.restore", "site.promote"] as const) {
      expect(() =>
        assertOperationTransition({
          from: "running",
          to: "succeeded",
          operationCode,
        }),
      ).toThrow("pre-backup");
      expect(
        assertOperationTransition({
          from: "running",
          to: "succeeded",
          operationCode,
          preBackupReceiptId: "receipt_prebackup_123",
        }),
      ).toBe("succeeded");
    }
  });

  test("never persists raw provider or credential-bearing failure text", () => {
    const failure = sanitizeOperationFailure(
      new Error("deployKey=secret token=abc connection refused"),
      "SITE_OPERATION_FAILED",
    );
    expect(failure).toEqual({
      code: "SITE_OPERATION_FAILED",
      message: "The site operation failed safely.",
    });
    expect(JSON.stringify(failure)).not.toContain("secret");
    expect(JSON.stringify(failure)).not.toContain("token");
  });
});
