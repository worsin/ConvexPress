"use node";

import {
  type RuntimeManagementCapabilityCode,
  type RuntimeSignedManagementEnvelope,
  type RuntimeSiteIdentity,
} from "@convexpress/site-contract/runtime-protocol";
import {
  verifyRuntimeManagementEnvelope,
  type RuntimeEnvelopeVerificationFailure,
} from "@convexpress/site-contract/runtime-node";

export interface StoredManagementAuthority {
  controllerId: string;
  keyId: string;
  publicKeyPem: string;
  websiteKey: string;
  instanceKey: string;
  capabilities: readonly string[];
  status: "active" | "revoked";
  capabilityRevision: number;
  notBefore: number;
  expiresAt?: number;
}

export type StoredAuthorityFailure =
  | "authority-not-found"
  | "authority-revoked"
  | "authority-audience-mismatch"
  | "contract-version-mismatch"
  | "authority-not-yet-valid"
  | "authority-expired"
  | "capability-not-granted"
  | RuntimeEnvelopeVerificationFailure;

export type StoredAuthorityVerificationResult =
  | { ok: true }
  | { ok: false; reason: StoredAuthorityFailure };

export function verifyStoredManagementEnvelope(input: {
  identity: RuntimeSiteIdentity;
  authority: StoredManagementAuthority | null;
  envelope: RuntimeSignedManagementEnvelope;
  body: unknown;
  now: number;
  expectedCapability: RuntimeManagementCapabilityCode;
  usedNonces: ReadonlySet<string>;
}): StoredAuthorityVerificationResult {
  const authority = input.authority;
  if (!authority) return { ok: false, reason: "authority-not-found" };
  if (authority.status !== "active") {
    return { ok: false, reason: "authority-revoked" };
  }
  if (
    authority.controllerId !== input.envelope.controllerId ||
    authority.keyId !== input.envelope.keyId ||
    authority.websiteKey !== input.identity.websiteKey ||
    authority.instanceKey !== input.identity.instanceKey
  ) {
    return { ok: false, reason: "authority-audience-mismatch" };
  }
  if (input.envelope.contractVersion !== input.identity.siteContractVersion) {
    return { ok: false, reason: "contract-version-mismatch" };
  }
  if (input.now < authority.notBefore) {
    return { ok: false, reason: "authority-not-yet-valid" };
  }
  if (authority.expiresAt !== undefined && input.now >= authority.expiresAt) {
    return { ok: false, reason: "authority-expired" };
  }
  if (!authority.capabilities.includes(input.expectedCapability)) {
    return { ok: false, reason: "capability-not-granted" };
  }
  if (!input.identity.managementCapabilities.includes(input.expectedCapability)) {
    return { ok: false, reason: "capability-not-granted" };
  }

  return verifyRuntimeManagementEnvelope({
    envelope: input.envelope,
    body: input.body,
    publicKeyPem: authority.publicKeyPem,
    now: input.now,
    expectedWebsiteKey: input.identity.websiteKey,
    expectedInstanceKey: input.identity.instanceKey,
    expectedCapability: input.expectedCapability,
    usedNonces: input.usedNonces,
  });
}
