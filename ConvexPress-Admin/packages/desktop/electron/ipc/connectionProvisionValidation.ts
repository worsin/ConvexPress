export interface ConnectionProvisionRequest {
  instanceId: string;
  name: string;
  accountLabel?: string;
  authToken: string;
}

const ALLOWED_REQUEST_KEYS = new Set([
  "instanceId",
  "name",
  "accountLabel",
  "authToken",
]);

function requiredText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maximum) {
    throw new Error(`${label} is invalid`);
  }
  return cleaned;
}

export function validateConnectionProvisionRequest(
  value: unknown,
): ConnectionProvisionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Connection request is invalid");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !ALLOWED_REQUEST_KEYS.has(key))) {
    throw new Error("Connection request contains unsupported fields");
  }
  const authToken = requiredText(input.authToken, "Operator token", 24_000);
  if (authToken.length < 100 || authToken.split(".").length !== 3) {
    throw new Error("Operator token is invalid");
  }
  const accountLabel =
    input.accountLabel === undefined
      ? undefined
      : requiredText(input.accountLabel, "Account label", 160);
  return {
    instanceId: requiredText(input.instanceId, "Environment", 160),
    name: requiredText(input.name, "Connection name", 160),
    ...(accountLabel ? { accountLabel } : {}),
    authToken,
  };
}

export function validateDeploymentAdminKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Deployment credential is invalid");
  }
  const cleaned = value.trim();
  if (
    cleaned.length < 16 ||
    cleaned.length > 16_384 ||
    /\s/.test(cleaned)
  ) {
    throw new Error("Deployment credential is invalid");
  }
  return cleaned;
}
