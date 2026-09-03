import { z } from "zod";

import {
  managementCapabilityCodeSchema,
  OPERATION_CODES,
  OPERATION_CODE_VALUES,
  operationCodeSchema,
  type OperationCode,
} from "./codes";
import { canonicalJson } from "./fingerprints";
import {
  deploymentOriginSchema,
  environmentKindSchema,
  portableKeySchema,
} from "./schemas";

export { OPERATION_CODES } from "./codes";

export const MUTATING_OPERATION_CODES = OPERATION_CODE_VALUES.filter(
  (code) =>
    code !== OPERATION_CODES.healthCheck &&
    code !== OPERATION_CODES.compatibilityCheck &&
    code !== OPERATION_CODES.select,
) as readonly OperationCode[];

const mutatingOperationCodes = new Set<OperationCode>(MUTATING_OPERATION_CODES);

const emptyParametersSchema = z.object({}).strict();
const versionParametersSchema = z
  .object({
    siteContractVersion: z.string().min(1).max(64),
    schemaVersion: z.string().min(1).max(64),
    engineVersion: z.string().min(1).max(64),
  })
  .strict();

const operationParameterSchemas: Readonly<
  Record<OperationCode, z.ZodType<unknown>>
> = {
  [OPERATION_CODES.healthCheck]: emptyParametersSchema,
  [OPERATION_CODES.compatibilityCheck]: versionParametersSchema,
  [OPERATION_CODES.register]: z
    .object({
      deploymentOrigin: deploymentOriginSchema,
      managementOrigin: deploymentOriginSchema,
      siteOrigin: deploymentOriginSchema,
      environmentKind: environmentKindSchema,
    })
    .strict(),
  [OPERATION_CODES.attach]: z
    .object({
      deploymentOrigin: deploymentOriginSchema,
      managementOrigin: deploymentOriginSchema,
      siteOrigin: deploymentOriginSchema,
      environmentKind: environmentKindSchema,
      connectionRef: portableKeySchema,
    })
    .strict(),
  [OPERATION_CODES.deploy]: z
    .object({ targetEngineVersion: z.string().min(1).max(64) })
    .strict(),
  [OPERATION_CODES.select]: emptyParametersSchema,
  [OPERATION_CODES.sessionExchange]: z
    .object({
      requestedCapabilities: z
        .array(managementCapabilityCodeSchema)
        .min(1)
        .max(64),
    })
    .strict(),
  [OPERATION_CODES.backupCreate]: z
    .object({ includeStorage: z.boolean() })
    .strict(),
  [OPERATION_CODES.clone]: z
    .object({ destinationInstanceKey: portableKeySchema })
    .strict(),
  [OPERATION_CODES.promote]: z
    .object({
      sourceInstanceKey: portableKeySchema,
      confirmation: z.string().min(4).max(128),
    })
    .strict(),
  [OPERATION_CODES.restore]: z
    .object({
      snapshotId: portableKeySchema,
      confirmation: z.string().min(4).max(128),
    })
    .strict(),
  [OPERATION_CODES.credentialRotate]: z
    .object({ connectionRef: portableKeySchema })
    .strict(),
  [OPERATION_CODES.authorityGrant]: z
    .object({
      controllerId: portableKeySchema,
      keyId: portableKeySchema,
      publicKeyPem: z.string().min(64).max(4096),
      capabilities: z.array(managementCapabilityCodeSchema).min(1).max(64),
    })
    .strict(),
  [OPERATION_CODES.authorityRevoke]: z
    .object({
      controllerId: portableKeySchema,
      keyId: portableKeySchema,
    })
    .strict(),
  [OPERATION_CODES.operationResume]: z
    .object({ operationId: portableKeySchema })
    .strict(),
  [OPERATION_CODES.handoffExport]: z
    .object({
      includeRunbook: z.boolean(),
      includeSnapshots: z.boolean(),
    })
    .strict(),
};

export const operationRequestSchema = z
  .object({
    websiteKey: portableKeySchema,
    instanceKey: portableKeySchema,
    operationCode: operationCodeSchema,
    idempotencyKey: portableKeySchema.optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
    parameters: z.unknown(),
  })
  .strict()
  .superRefine((request, context) => {
    if (
      mutatingOperationCodes.has(request.operationCode) &&
      request.idempotencyKey === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["idempotencyKey"],
        message: `idempotencyKey is required for ${request.operationCode}`,
      });
    }

    try {
      canonicalJson(request.parameters);
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["parameters"],
        message:
          error instanceof Error
            ? error.message
            : "Operation parameters must be JSON-compatible",
      });
    }

    const parametersResult = operationParameterSchemas[
      request.operationCode
    ].safeParse(request.parameters);
    if (!parametersResult.success) {
      context.addIssue({
        code: "custom",
        path: ["parameters"],
        message: `parameters are invalid for ${request.operationCode}`,
      });
    }
  });

export type OperationRequest = z.infer<typeof operationRequestSchema>;

export function parseOperationRequest(value: unknown): OperationRequest {
  return operationRequestSchema.parse(value);
}
