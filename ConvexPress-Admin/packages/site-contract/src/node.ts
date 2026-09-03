import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";

import {
  getEnvelopeSigningPayload,
  hashCanonicalBody,
  signedManagementEnvelopeSchema,
  type SignedManagementEnvelope,
  type UnsignedManagementEnvelope,
} from "./envelope";
import {
  OPERATION_CAPABILITY,
  type ManagementCapabilityCode,
} from "./codes";

export interface ManagementKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

export function generateManagementKeyPair(): ManagementKeyPair {
  const pair = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };
}

export function signManagementEnvelope(
  envelope: UnsignedManagementEnvelope,
  privateKeyPem: string,
): SignedManagementEnvelope {
  const payload = getEnvelopeSigningPayload(envelope);
  const signature = sign(
    null,
    Buffer.from(payload, "utf8"),
    createPrivateKey(privateKeyPem),
  ).toString("base64url");

  return signedManagementEnvelopeSchema.parse({ ...envelope, signature });
}

export type EnvelopeVerificationFailure =
  | "invalid-envelope"
  | "key-revoked"
  | "audience-mismatch"
  | "not-yet-valid"
  | "expired"
  | "replay"
  | "body-hash-mismatch"
  | "capability-mismatch"
  | "invalid-signature";

export type EnvelopeVerificationResult =
  | { ok: true }
  | { ok: false; reason: EnvelopeVerificationFailure };

export function verifyManagementEnvelope(input: {
  envelope: SignedManagementEnvelope;
  body: unknown;
  publicKeyPem: string;
  now: number;
  expectedWebsiteKey: string;
  expectedInstanceKey: string;
  expectedCapability: ManagementCapabilityCode;
  usedNonces: ReadonlySet<string>;
  keyRevoked?: boolean;
}): EnvelopeVerificationResult {
  const parsed = signedManagementEnvelopeSchema.safeParse(input.envelope);
  if (!parsed.success) {
    return { ok: false, reason: "invalid-envelope" };
  }

  const envelope = parsed.data;
  if (input.keyRevoked === true) {
    return { ok: false, reason: "key-revoked" };
  }
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
  if (hashCanonicalBody(input.body) !== envelope.bodyHash) {
    return { ok: false, reason: "body-hash-mismatch" };
  }
  if (OPERATION_CAPABILITY[envelope.operationCode] !== input.expectedCapability) {
    return { ok: false, reason: "capability-mismatch" };
  }

  const { signature, ...unsigned } = envelope;
  try {
    const valid = verify(
      null,
      Buffer.from(getEnvelopeSigningPayload(unsigned), "utf8"),
      createPublicKey(input.publicKeyPem),
      Buffer.from(signature, "base64url"),
    );
    return valid
      ? { ok: true }
      : { ok: false, reason: "invalid-signature" };
  } catch {
    return { ok: false, reason: "invalid-signature" };
  }
}
