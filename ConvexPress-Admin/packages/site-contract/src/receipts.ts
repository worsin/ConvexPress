import { z } from "zod";

import { operationCodeSchema } from "./codes";
import { canonicalJson, type JsonValue } from "./fingerprints";
import { portableKeySchema } from "./schemas";

const SECRET_KEY_FRAGMENTS = [
  "secret",
  "password",
  "passphrase",
  "token",
  "credential",
  "privatekey",
  "adminkey",
  "deploykey",
  "productionkey",
  "authorization",
  "cookie",
] as const;

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSecretBearingKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return SECRET_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function assertSecretFree(value: unknown, path = "$receipt"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSecretFree(item, `${path}[${index}]`));
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (isSecretBearingKey(key)) {
      throw new Error(`${path}.${key} is a secret-bearing field`);
    }
    assertSecretFree(item, `${path}.${key}`);
  }
}

function sanitizeValue(value: unknown): JsonValue {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (typeof value === "object" && value !== null) {
    const sanitized: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (!isSecretBearingKey(key) && item !== undefined) {
        sanitized[key] = sanitizeValue(item);
      }
    }
    return sanitized;
  }
  throw new TypeError("Receipt summaries must be JSON-compatible");
}

export function sanitizeReceiptSummary(value: unknown): JsonValue {
  const sanitized = sanitizeValue(value);
  canonicalJson(sanitized);
  return sanitized;
}

export const operationReceiptSchema = z
  .object({
    receiptId: portableKeySchema,
    operationCode: operationCodeSchema,
    websiteKey: portableKeySchema,
    instanceKey: portableKeySchema,
    status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }).optional(),
    preBackupSnapshotId: portableKeySchema.optional(),
    preBackupReceiptId: portableKeySchema.optional(),
    summary: z.unknown().optional(),
  })
  .strict()
  .superRefine((receipt, context) => {
    if (
      receipt.status === "succeeded" &&
      (receipt.operationCode === "site.restore" ||
        receipt.operationCode === "site.promote") &&
      receipt.preBackupReceiptId === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["preBackupReceiptId"],
        message: "preBackupReceiptId is required for successful restore or promotion",
      });
    }

    try {
      assertSecretFree(receipt);
      canonicalJson(receipt);
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["summary"],
        message:
          error instanceof Error
            ? error.message
            : "Receipt must be JSON-compatible and secret-free",
      });
    }
  });

export type OperationReceipt = z.infer<typeof operationReceiptSchema>;
