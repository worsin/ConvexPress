import { z } from "zod";

import { environmentKindSchema, portableKeySchema } from "./schemas";

export const backupManifestSchema = z
  .object({
    snapshotId: portableKeySchema,
    websiteKey: portableKeySchema,
    instanceKey: portableKeySchema,
    environmentKind: environmentKindSchema,
    siteContractVersion: z.string().min(1).max(64),
    schemaVersion: z.string().min(1).max(64),
    engineVersion: z.string().min(1).max(64),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().nonnegative(),
    tableCount: z.number().int().nonnegative(),
    storageObjectCount: z.number().int().nonnegative(),
    createdByControllerId: portableKeySchema,
    verificationStatus: z.enum(["pending", "verified", "failed"]),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type BackupManifest = z.infer<typeof backupManifestSchema>;
