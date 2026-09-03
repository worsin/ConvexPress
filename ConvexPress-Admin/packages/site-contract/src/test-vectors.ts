import type { SignedManagementEnvelope } from "./envelope";

/**
 * Public, non-secret fixture for validating contract implementations in both
 * standalone ConvexPress and VirtualOverseer. The signing key is intentionally
 * not shipped; consumers only need the request body, envelope, and public key.
 */
export const STANDALONE_VO_INTEROP_VECTOR = {
  body: { includeStorage: true },
  envelope: {
    contractVersion: "1.0.0",
    controllerId: "controller_vector",
    keyId: "key_vector_2026",
    websiteKey: "website_vector",
    instanceKey: "instance_vector",
    operationCode: "site.backup.create",
    bodyHash:
      "bb01c1d2630ddb610e0f148f8aab2a1570090b500f93a05fb64c024a47bdacbb",
    nonce: "nonce_vector_0001",
    issuedAt: "2026-09-02T18:00:00.000Z",
    expiresAt: "2026-09-02T18:05:00.000Z",
    idempotencyKey: "backup-vector-0001",
    signature:
      "08JDjvZDpSg3J8AvWPVgKFWEWXmGB9IS_LOMoEk6infCwdwQYE6AEKZh2_r9f62OQ4j6-G8Ve_aFDWqEup_3CA",
  } satisfies SignedManagementEnvelope,
  publicKeyPem:
    "-----BEGIN PUBLIC KEY-----\n" +
    "MCowBQYDK2VwAyEAROd/SBzHDNwiTqLdFyfomm4OW7t9vBvXPVMkeapYyuo=\n" +
    "-----END PUBLIC KEY-----\n",
} as const;
