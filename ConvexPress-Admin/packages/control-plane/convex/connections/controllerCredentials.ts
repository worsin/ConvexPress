import {
  MANAGEMENT_CAPABILITY_CODES,
  portableKeySchema,
  type ManagementCapabilityCode,
} from "@convexpress/site-contract";

export interface SiteControllerCredentialV1 {
  kind: "convexpress-site-controller-v1";
  controllerId: string;
  keyId: string;
  privateKeyPem: string;
  deploymentAdminKey: string;
  capabilities: ManagementCapabilityCode[];
}

const knownCapabilities = new Set<string>(MANAGEMENT_CAPABILITY_CODES);
const exactFields = new Set([
  "kind",
  "controllerId",
  "keyId",
  "privateKeyPem",
  "deploymentAdminKey",
  "capabilities",
]);

function invalid(): never {
  throw new Error("Site controller credential is invalid");
}

export function parseControllerCredential(
  value: unknown,
): SiteControllerCredentialV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const source = value as Record<string, unknown>;
  if (
    Object.keys(source).some((field) => !exactFields.has(field)) ||
    source.kind !== "convexpress-site-controller-v1"
  ) {
    invalid();
  }
  const controller = portableKeySchema.safeParse(source.controllerId);
  const key = portableKeySchema.safeParse(source.keyId);
  const privateKeyPem = source.privateKeyPem;
  const deploymentAdminKey = source.deploymentAdminKey;
  const capabilities = source.capabilities;
  if (
    !controller.success ||
    !key.success ||
    typeof privateKeyPem !== "string" ||
    privateKeyPem.length < 64 ||
    privateKeyPem.length > 8_192 ||
    !privateKeyPem.startsWith("-----BEGIN PRIVATE KEY-----\n") ||
    !privateKeyPem.includes("\n-----END PRIVATE KEY-----") ||
    privateKeyPem.includes("PUBLIC KEY") ||
    typeof deploymentAdminKey !== "string" ||
    deploymentAdminKey.length < 16 ||
    deploymentAdminKey.length > 16_384 ||
    !Array.isArray(capabilities) ||
    capabilities.length === 0 ||
    capabilities.length > MANAGEMENT_CAPABILITY_CODES.length ||
    new Set(capabilities).size !== capabilities.length ||
    capabilities.some(
      (capability) =>
        typeof capability !== "string" || !knownCapabilities.has(capability),
    )
  ) {
    invalid();
  }
  return {
    kind: "convexpress-site-controller-v1",
    controllerId: controller.data,
    keyId: key.data,
    privateKeyPem,
    deploymentAdminKey,
    capabilities: [...capabilities] as ManagementCapabilityCode[],
  };
}

export function createControllerCredential(input: {
  controllerId: string;
  keyId: string;
  privateKeyPem: string;
  deploymentAdminKey: string;
  capabilities: readonly string[];
}): SiteControllerCredentialV1 {
  return parseControllerCredential({
    kind: "convexpress-site-controller-v1",
    ...input,
    capabilities: [...input.capabilities],
  });
}
