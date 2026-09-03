import { z } from "zod";

import { operationCodeSchema } from "./codes";
import { canonicalJson, fingerprintCanonicalJson } from "./fingerprints";
import { portableKeySchema } from "./schemas";

const instantSchema = z.string().datetime({ offset: true });

export const unsignedManagementEnvelopeSchema = z
  .object({
    contractVersion: z.string().min(1).max(64),
    controllerId: portableKeySchema,
    keyId: portableKeySchema,
    websiteKey: portableKeySchema,
    instanceKey: portableKeySchema,
    operationCode: operationCodeSchema,
    bodyHash: z.string().regex(/^[a-f0-9]{64}$/),
    nonce: portableKeySchema,
    issuedAt: instantSchema,
    expiresAt: instantSchema,
    idempotencyKey: portableKeySchema.optional(),
  })
  .strict()
  .superRefine((envelope, context) => {
    if (Date.parse(envelope.expiresAt) <= Date.parse(envelope.issuedAt)) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "expiresAt must be later than issuedAt",
      });
    }
  });

export const signedManagementEnvelopeSchema = unsignedManagementEnvelopeSchema
  .safeExtend({
    signature: z.string().regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

export type UnsignedManagementEnvelope = z.infer<
  typeof unsignedManagementEnvelopeSchema
>;
export type SignedManagementEnvelope = z.infer<
  typeof signedManagementEnvelopeSchema
>;

export function hashCanonicalBody(body: unknown): string {
  return fingerprintCanonicalJson(body);
}

export function createUnsignedManagementEnvelope(input: Omit<
  UnsignedManagementEnvelope,
  "bodyHash"
> & { body: unknown }): UnsignedManagementEnvelope {
  const { body, ...envelope } = input;
  return unsignedManagementEnvelopeSchema.parse({
    ...envelope,
    bodyHash: hashCanonicalBody(body),
  });
}

export function getEnvelopeSigningPayload(
  envelope: UnsignedManagementEnvelope,
): string {
  return canonicalJson(unsignedManagementEnvelopeSchema.parse(envelope));
}
