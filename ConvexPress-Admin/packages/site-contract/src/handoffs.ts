import { z } from "zod";

import { canonicalJson, sha256Hex } from "./fingerprints";
import { assertSecretFree } from "./receipts";
import {
  deploymentOriginSchema,
  environmentKindSchema,
  portableKeySchema,
} from "./schemas";

export const HANDOFF_FORMAT = "convexpress-handoff" as const;
export const HANDOFF_FORMAT_VERSION = "1.0.0" as const;

const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/);
const versionSchema = z.string().trim().min(1).max(64);
const isoDateSchema = z.string().datetime({ offset: true });

export const handoffSnapshotSchema = z
  .object({
    snapshotId: portableKeySchema,
    checksumSha256: checksumSchema,
    sizeBytes: z.number().int().nonnegative(),
    tableCount: z.number().int().nonnegative(),
    storageObjectCount: z.number().int().nonnegative(),
    createdAt: isoDateSchema,
  })
  .strict();

export const handoffEnvironmentSchema = z
  .object({
    instanceKey: portableKeySchema,
    environmentKind: environmentKindSchema,
    label: z.string().trim().min(1).max(160).nullable(),
    deploymentOrigin: deploymentOriginSchema,
    managementOrigin: deploymentOriginSchema,
    siteOrigin: deploymentOriginSchema,
    siteContractVersion: versionSchema,
    schemaVersion: versionSchema,
    engineVersion: versionSchema,
    snapshot: handoffSnapshotSchema.optional(),
  })
  .strict();

export const handoffManifestSchema = z
  .object({
    handoffId: portableKeySchema,
    sourceControllerId: portableKeySchema,
    exportedAt: isoDateSchema,
    expiresAt: isoDateSchema,
    website: z
      .object({
        websiteKey: portableKeySchema,
        title: z.string().trim().min(1).max(200),
        primaryDomain: z.string().trim().min(1).max(253),
      })
      .strict(),
    environments: z.array(handoffEnvironmentSchema).min(1).max(100),
    runbook: z
      .object({
        version: versionSchema,
        steps: z.array(z.string().trim().min(1).max(500)).min(1).max(32),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const instanceKeys = new Set<string>();
    let liveCount = 0;
    for (const [index, environment] of manifest.environments.entries()) {
      if (
        environment.instanceKey !== manifest.website.websiteKey &&
        !environment.instanceKey.startsWith(`${manifest.website.websiteKey}:`)
      ) {
        context.addIssue({
          code: "custom",
          path: ["environments", index, "instanceKey"],
          message: "Environment instance key does not belong to the website key",
        });
      }
      if (instanceKeys.has(environment.instanceKey)) {
        context.addIssue({
          code: "custom",
          path: ["environments", index, "instanceKey"],
          message: "Environment instance keys must be unique",
        });
      }
      instanceKeys.add(environment.instanceKey);
      if (environment.environmentKind === "live") liveCount += 1;
    }
    if (liveCount > 1) {
      context.addIssue({
        code: "custom",
        path: ["environments"],
        message: "A handoff package may contain only one live environment",
      });
    }
    if (Date.parse(manifest.expiresAt) <= Date.parse(manifest.exportedAt)) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Handoff expiration must follow its export time",
      });
    }
    try {
      assertSecretFree(manifest, "$handoff");
      canonicalJson(manifest);
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: [],
        message:
          error instanceof Error
            ? error.message
            : "Handoff manifest must be secret-free JSON",
      });
    }
  });

export type HandoffManifest = z.infer<typeof handoffManifestSchema>;

export const handoffBundleSchema = z
  .object({
    format: z.literal(HANDOFF_FORMAT),
    formatVersion: z.literal(HANDOFF_FORMAT_VERSION),
    manifest: handoffManifestSchema,
    manifestSha256: checksumSchema,
  })
  .strict()
  .superRefine((bundle, context) => {
    const expected = sha256Hex(canonicalJson(bundle.manifest));
    if (expected !== bundle.manifestSha256) {
      context.addIssue({
        code: "custom",
        path: ["manifestSha256"],
        message: "Handoff manifest checksum does not match its contents",
      });
    }
  });

export type HandoffBundle = z.infer<typeof handoffBundleSchema>;

export function createHandoffBundle(input: unknown): HandoffBundle {
  const manifest = handoffManifestSchema.parse(input);
  return handoffBundleSchema.parse({
    format: HANDOFF_FORMAT,
    formatVersion: HANDOFF_FORMAT_VERSION,
    manifest,
    manifestSha256: sha256Hex(canonicalJson(manifest)),
  });
}

export function parseHandoffBundle(input: unknown): HandoffBundle {
  let value = input;
  if (typeof input === "string") {
    if (input.length > 2_000_000) {
      throw new Error("Handoff package is too large");
    }
    value = JSON.parse(input) as unknown;
  }
  return handoffBundleSchema.parse(value);
}
