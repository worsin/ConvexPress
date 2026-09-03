import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";

import {
  hashRuntimeCanonicalBody,
  parseRuntimeSignedEnvelope,
  RUNTIME_OPERATION_CAPABILITY,
  runtimeEnvelopeSigningPayload,
  type RuntimeManagementCapabilityCode,
  type RuntimeSignedManagementEnvelope,
  type RuntimeUnsignedManagementEnvelope,
} from "./runtime-protocol";

export interface RuntimeManagementKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

export type RuntimeEnvelopeVerificationFailure =
  | "invalid-envelope"
  | "key-revoked"
  | "audience-mismatch"
  | "not-yet-valid"
  | "expired"
  | "replay"
  | "body-hash-mismatch"
  | "capability-mismatch"
  | "invalid-signature";

export type RuntimeEnvelopeVerificationResult =
  | { ok: true }
  | { ok: false; reason: RuntimeEnvelopeVerificationFailure };

export function generateRuntimeManagementKeyPair(): RuntimeManagementKeyPair {
  const pair = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };
}

export function signRuntimeManagementEnvelope(
  envelope: RuntimeUnsignedManagementEnvelope,
  privateKeyPem: string,
): RuntimeSignedManagementEnvelope {
  const signature = sign(
    null,
    Buffer.from(runtimeEnvelopeSigningPayload(envelope), "utf8"),
    createPrivateKey(privateKeyPem),
  ).toString("base64url");
  return parseRuntimeSignedEnvelope({ ...envelope, signature });
}

export function verifyRuntimeManagementEnvelope(input: {
  envelope: RuntimeSignedManagementEnvelope;
  body: unknown;
  publicKeyPem: string;
  now: number;
  expectedWebsiteKey: string;
  expectedInstanceKey: string;
  expectedCapability: RuntimeManagementCapabilityCode;
  usedNonces: ReadonlySet<string>;
  keyRevoked?: boolean;
}): RuntimeEnvelopeVerificationResult {
  let envelope: RuntimeSignedManagementEnvelope;
  try {
    envelope = parseRuntimeSignedEnvelope(input.envelope);
  } catch {
    return { ok: false, reason: "invalid-envelope" };
  }
  if (input.keyRevoked === true) return { ok: false, reason: "key-revoked" };
  if (
    envelope.websiteKey !== input.expectedWebsiteKey ||
    envelope.instanceKey !== input.expectedInstanceKey
  ) {
    return { ok: false, reason: "audience-mismatch" };
  }
  if (input.now < Date.parse(envelope.issuedAt)) {
    return { ok: false, reason: "not-yet-valid" };
  }
  if (input.now >= Date.parse(envelope.expiresAt)) {
    return { ok: false, reason: "expired" };
  }
  if (input.usedNonces.has(envelope.nonce)) {
    return { ok: false, reason: "replay" };
  }
  if (hashRuntimeCanonicalBody(input.body) !== envelope.bodyHash) {
    return { ok: false, reason: "body-hash-mismatch" };
  }
  if (RUNTIME_OPERATION_CAPABILITY[envelope.operationCode] !== input.expectedCapability) {
    return { ok: false, reason: "capability-mismatch" };
  }
  const { signature, ...unsigned } = envelope;
  try {
    return verify(
      null,
      Buffer.from(runtimeEnvelopeSigningPayload(unsigned), "utf8"),
      createPublicKey(input.publicKeyPem),
      Buffer.from(signature, "base64url"),
    )
      ? { ok: true }
      : { ok: false, reason: "invalid-signature" };
  } catch {
    return { ok: false, reason: "invalid-signature" };
  }
}
