import type { OperationCode } from "@convexpress/site-contract";

export const OPERATION_STATES = [
  "queued",
  "running",
  "waiting",
  "interrupted",
  "resuming",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type OperationState = (typeof OPERATION_STATES)[number];

const TERMINAL_STATES = new Set<OperationState>([
  "succeeded",
  "failed",
  "cancelled",
]);

const ALLOWED_TRANSITIONS: Readonly<
  Record<OperationState, readonly OperationState[]>
> = {
  queued: ["running", "cancelled", "interrupted"],
  running: ["waiting", "succeeded", "failed", "cancelled", "interrupted"],
  waiting: ["running", "failed", "cancelled", "interrupted"],
  interrupted: ["resuming", "cancelled"],
  resuming: ["running", "failed", "interrupted"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function assertOperationTransition(input: {
  from: OperationState;
  to: OperationState;
  operationCode: OperationCode;
  preBackupReceiptId?: string;
}): OperationState {
  if (TERMINAL_STATES.has(input.from)) {
    throw new Error(`Operation state ${input.from} is terminal`);
  }
  if (!ALLOWED_TRANSITIONS[input.from].includes(input.to)) {
    throw new Error(`Invalid operation transition: ${input.from} -> ${input.to}`);
  }
  if (
    input.to === "succeeded" &&
    (input.operationCode === "site.restore" ||
      input.operationCode === "site.promote") &&
    !input.preBackupReceiptId
  ) {
    throw new Error("A verified pre-backup receipt is required");
  }
  return input.to;
}

export function sanitizeOperationFailure(
  _failure: unknown,
  requestedCode: string,
): { code: string; message: string } {
  const code = /^[A-Z][A-Z0-9_]{2,79}$/.test(requestedCode)
    ? requestedCode
    : "SITE_OPERATION_FAILED";
  return {
    code,
    message: "The site operation failed safely.",
  };
}
