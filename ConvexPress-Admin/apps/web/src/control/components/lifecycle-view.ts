export type LifecycleOperationState =
  | "queued"
  | "running"
  | "waiting"
  | "interrupted"
  | "resuming"
  | "succeeded"
  | "failed"
  | "cancelled";

const ACTIVE_STATES = new Set<LifecycleOperationState>([
  "queued",
  "running",
  "waiting",
  "resuming",
]);

export function canCancelOperation(state: LifecycleOperationState) {
  return ACTIVE_STATES.has(state);
}

export function canResumeOperation(state: LifecycleOperationState) {
  return state === "interrupted";
}

export function operationStateLabel(state: LifecycleOperationState) {
  switch (state) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "waiting":
      return "Waiting";
    case "interrupted":
      return "Needs attention";
    case "resuming":
      return "Resuming";
    case "succeeded":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

export function operationProgress(steps: ReadonlyArray<{ state: string }>) {
  const total = steps.length;
  const completed = steps.filter((step) => step.state === "succeeded").length;
  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export function formatByteCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const amount = value / 1024 ** exponent;
  const digits = amount >= 10 || exponent === 0 ? 0 : 1;
  return `${amount.toFixed(digits)} ${units[exponent]}`;
}

export function expectedRestoreConfirmation(instanceKey: string) {
  return `RESTORE ${instanceKey}`;
}

export function isRestoreConfirmationReady(
  instanceKey: string,
  confirmation: string,
) {
  return confirmation === expectedRestoreConfirmation(instanceKey);
}

export function expectedPromotionConfirmation(instanceKey: string) {
  return `PROMOTE TO ${instanceKey}`;
}

export function isPromotionConfirmationReady(
  instanceKey: string,
  confirmation: string,
) {
  return confirmation === expectedPromotionConfirmation(instanceKey);
}
