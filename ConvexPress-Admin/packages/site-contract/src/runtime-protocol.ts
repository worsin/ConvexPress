import { canonicalJson, sha256Hex } from "./fingerprints";

export { sha256Hex } from "./fingerprints";

/**
 * Schema-free protocol surface for very large Convex data models. Keep this
 * module dependency-free (apart from the small fingerprint implementation) so
 * importing the portable protocol cannot pull Zod's type graph into Convex's
 * generated DataModel.
 */
export const RUNTIME_MANAGEMENT_CAPABILITY_CODES = [
  "health.read",
  "compatibility.read",
  "site.register",
  "site.attach",
  "site.deploy",
  "site.select",
  "session.exchange",
  "backup.create",
  "site.clone",
  "site.promote",
  "site.restore",
  "credential.rotate",
  "authority.grant",
  "authority.revoke",
  "operation.resume",
  "handoff.export",
] as const;

export type RuntimeManagementCapabilityCode =
  (typeof RUNTIME_MANAGEMENT_CAPABILITY_CODES)[number];

export const RUNTIME_SITE_SESSION_ROLE_SLUGS = [
  "administrator",
  "editor",
  "author",
  "contributor",
  "subscriber",
] as const;

export type RuntimeSiteSessionRoleSlug =
  (typeof RUNTIME_SITE_SESSION_ROLE_SLUGS)[number];

export const RUNTIME_OPERATION_CODES = {
  healthCheck: "site.health.check",
  compatibilityCheck: "site.compatibility.check",
  register: "site.register",
  attach: "site.attach",
  deploy: "site.engine.deploy",
  select: "site.select",
  sessionExchange: "site.session.exchange",
  backupCreate: "site.backup.create",
  clone: "site.clone",
  promote: "site.promote",
  restore: "site.restore",
  credentialRotate: "site.credential.rotate",
  authorityGrant: "site.authority.grant",
  authorityRevoke: "site.authority.revoke",
  operationResume: "site.operation.resume",
  handoffExport: "site.handoff.export",
} as const;

export type RuntimeOperationCode =
  (typeof RUNTIME_OPERATION_CODES)[keyof typeof RUNTIME_OPERATION_CODES];

export const RUNTIME_OPERATION_CAPABILITY: Readonly<
  Record<RuntimeOperationCode, RuntimeManagementCapabilityCode>
> = {
  [RUNTIME_OPERATION_CODES.healthCheck]: "health.read",
  [RUNTIME_OPERATION_CODES.compatibilityCheck]: "compatibility.read",
  [RUNTIME_OPERATION_CODES.register]: "site.register",
  [RUNTIME_OPERATION_CODES.attach]: "site.attach",
  [RUNTIME_OPERATION_CODES.deploy]: "site.deploy",
  [RUNTIME_OPERATION_CODES.select]: "site.select",
  [RUNTIME_OPERATION_CODES.sessionExchange]: "session.exchange",
  [RUNTIME_OPERATION_CODES.backupCreate]: "backup.create",
  [RUNTIME_OPERATION_CODES.clone]: "site.clone",
  [RUNTIME_OPERATION_CODES.promote]: "site.promote",
  [RUNTIME_OPERATION_CODES.restore]: "site.restore",
  [RUNTIME_OPERATION_CODES.credentialRotate]: "credential.rotate",
  [RUNTIME_OPERATION_CODES.authorityGrant]: "authority.grant",
  [RUNTIME_OPERATION_CODES.authorityRevoke]: "authority.revoke",
  [RUNTIME_OPERATION_CODES.operationResume]: "operation.resume",
  [RUNTIME_OPERATION_CODES.handoffExport]: "handoff.export",
};

export const RUNTIME_ENVIRONMENT_KINDS = [
  "live",
  "staging",
  "beta",
  "preview",
  "development",
  "local",
  "custom",
] as const;

export type RuntimeEnvironmentKind = (typeof RUNTIME_ENVIRONMENT_KINDS)[number];

export interface RuntimeSiteIdentity {
  websiteKey: string;
  instanceKey: string;
  environmentKind: RuntimeEnvironmentKind;
  deploymentOrigin: string;
  managementOrigin: string;
  siteOrigin: string;
  siteContractVersion: string;
  schemaVersion: string;
  engineVersion: string;
  managementCapabilities: RuntimeManagementCapabilityCode[];
}

export interface RuntimeUnsignedManagementEnvelope {
  contractVersion: string;
  controllerId: string;
  keyId: string;
  websiteKey: string;
  instanceKey: string;
  operationCode: RuntimeOperationCode;
  bodyHash: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  idempotencyKey?: string;
}

export interface RuntimeSignedManagementEnvelope
  extends RuntimeUnsignedManagementEnvelope {
  signature: string;
}

const CAPABILITIES = new Set<string>(RUNTIME_MANAGEMENT_CAPABILITY_CODES);
const OPERATIONS = new Set<string>(Object.values(RUNTIME_OPERATION_CODES));
const ENVIRONMENT_KINDS = new Set<string>(RUNTIME_ENVIRONMENT_KINDS);
const PORTABLE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Protocol value must be an object");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allow = new Set(allowed);
  if (Object.keys(value).some((key) => !allow.has(key))) {
    throw new Error("Protocol value contains an unknown field");
  }
}

function boundedString(
  value: unknown,
  name: string,
  minimum = 1,
  maximum = 128,
): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

export function parseRuntimePortableKey(value: unknown): string {
  const parsed = boundedString(value, "Portable key", 8, 128).trim();
  if (!PORTABLE_KEY_PATTERN.test(parsed)) {
    throw new Error("Portable key is invalid");
  }
  return parsed;
}

export function normalizeRuntimeOrigin(value: unknown): string {
  const url = new URL(boundedString(value, "Origin", 1, 2_048));
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Origin is invalid");
  }
  return url.origin;
}

export function parseRuntimeSiteIdentity(value: unknown): RuntimeSiteIdentity {
  const source = record(value);
  exactKeys(source, [
    "websiteKey",
    "instanceKey",
    "environmentKind",
    "deploymentOrigin",
    "managementOrigin",
    "siteOrigin",
    "siteContractVersion",
    "schemaVersion",
    "engineVersion",
    "managementCapabilities",
  ]);
  if (
    typeof source.environmentKind !== "string" ||
    !ENVIRONMENT_KINDS.has(source.environmentKind)
  ) {
    throw new Error("Environment kind is invalid");
  }
  if (
    !Array.isArray(source.managementCapabilities) ||
    source.managementCapabilities.length === 0 ||
    source.managementCapabilities.length > 64 ||
    source.managementCapabilities.some(
      (capability) =>
        typeof capability !== "string" || !CAPABILITIES.has(capability),
    )
  ) {
    throw new Error("Management capabilities are invalid");
  }
  return {
    websiteKey: parseRuntimePortableKey(source.websiteKey),
    instanceKey: parseRuntimePortableKey(source.instanceKey),
    environmentKind: source.environmentKind as RuntimeEnvironmentKind,
    deploymentOrigin: normalizeRuntimeOrigin(source.deploymentOrigin),
    managementOrigin: normalizeRuntimeOrigin(source.managementOrigin),
    siteOrigin: normalizeRuntimeOrigin(source.siteOrigin),
    siteContractVersion: boundedString(
      source.siteContractVersion,
      "Site contract version",
      1,
      64,
    ),
    schemaVersion: boundedString(source.schemaVersion, "Schema version", 1, 64),
    engineVersion: boundedString(source.engineVersion, "Engine version", 1, 64),
    managementCapabilities: [
      ...source.managementCapabilities,
    ] as RuntimeManagementCapabilityCode[],
  };
}

function parseInstant(value: unknown, name: string): string {
  const parsed = boundedString(value, name, 20, 64);
  if (
    !/T/.test(parsed) ||
    !/(?:Z|[+-]\d\d:\d\d)$/.test(parsed) ||
    !Number.isFinite(Date.parse(parsed))
  ) {
    throw new Error(`${name} is invalid`);
  }
  return parsed;
}

export function parseRuntimeSignedEnvelope(
  value: unknown,
): RuntimeSignedManagementEnvelope {
  const source = record(value);
  exactKeys(source, [
    "contractVersion",
    "controllerId",
    "keyId",
    "websiteKey",
    "instanceKey",
    "operationCode",
    "bodyHash",
    "nonce",
    "issuedAt",
    "expiresAt",
    "idempotencyKey",
    "signature",
  ]);
  if (
    typeof source.operationCode !== "string" ||
    !OPERATIONS.has(source.operationCode)
  ) {
    throw new Error("Operation code is invalid");
  }
  const issuedAt = parseInstant(source.issuedAt, "Issued time");
  const expiresAt = parseInstant(source.expiresAt, "Expiry time");
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new Error("Envelope expiry is invalid");
  }
  const bodyHash = boundedString(source.bodyHash, "Body hash", 64, 64);
  const signature = boundedString(source.signature, "Signature", 1, 256);
  if (!/^[a-f0-9]{64}$/.test(bodyHash) || !/^[A-Za-z0-9_-]+$/.test(signature)) {
    throw new Error("Envelope cryptographic material is invalid");
  }
  return {
    contractVersion: boundedString(source.contractVersion, "Contract version", 1, 64),
    controllerId: parseRuntimePortableKey(source.controllerId),
    keyId: parseRuntimePortableKey(source.keyId),
    websiteKey: parseRuntimePortableKey(source.websiteKey),
    instanceKey: parseRuntimePortableKey(source.instanceKey),
    operationCode: source.operationCode as RuntimeOperationCode,
    bodyHash,
    nonce: parseRuntimePortableKey(source.nonce),
    issuedAt,
    expiresAt,
    ...(source.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: parseRuntimePortableKey(source.idempotencyKey) }),
    signature,
  };
}

export function hashRuntimeCanonicalBody(body: unknown): string {
  return sha256Hex(canonicalJson(body));
}

export function runtimeEnvelopeSigningPayload(
  envelope: RuntimeUnsignedManagementEnvelope,
): string {
  return canonicalJson({
    contractVersion: envelope.contractVersion,
    controllerId: envelope.controllerId,
    keyId: envelope.keyId,
    websiteKey: envelope.websiteKey,
    instanceKey: envelope.instanceKey,
    operationCode: envelope.operationCode,
    bodyHash: envelope.bodyHash,
    nonce: envelope.nonce,
    issuedAt: envelope.issuedAt,
    expiresAt: envelope.expiresAt,
    ...(envelope.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: envelope.idempotencyKey }),
  });
}
