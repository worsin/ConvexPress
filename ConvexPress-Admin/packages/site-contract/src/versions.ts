import { z } from "zod";

export const CURRENT_SITE_CONTRACT_VERSION = "1.0.0" as const;
export const CURRENT_SCHEMA_VERSION = "2026.9.0" as const;
export const CURRENT_ENGINE_VERSION = "1.0.0" as const;

const contractVersionSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);

export interface ParsedContractVersion {
  major: number;
  minor: number;
  patch: number;
}

export function parseContractVersion(version: string): ParsedContractVersion {
  const parsed = contractVersionSchema.parse(version);
  const [major, minor, patch] = parsed.split(".").map(Number);

  if (major === undefined || minor === undefined || patch === undefined) {
    throw new Error(`Invalid contract version: ${version}`);
  }

  return { major, minor, patch };
}

export type ContractCompatibility =
  | { compatible: true; reason: "same-major" }
  | { compatible: false; reason: "major-mismatch" };

export function getContractCompatibility(input: {
  controllerVersion: string;
  siteVersion: string;
}): ContractCompatibility {
  const controller = parseContractVersion(input.controllerVersion);
  const site = parseContractVersion(input.siteVersion);

  return controller.major === site.major
    ? { compatible: true, reason: "same-major" }
    : { compatible: false, reason: "major-mismatch" };
}

export type RuntimeCompatibilityIssue =
  | "unsupported-contract-version"
  | "unsupported-schema-version"
  | "unsupported-engine-version";

export type RuntimeCompatibility =
  | { compatible: true; issues: [] }
  | { compatible: false; issues: RuntimeCompatibilityIssue[] };

export function assessRuntimeCompatibility(input: {
  siteContractVersion: string;
  schemaVersion: string;
  engineVersion: string;
}): RuntimeCompatibility {
  const issues: RuntimeCompatibilityIssue[] = [];

  const checks: ReadonlyArray<{
    actual: string;
    supported: string;
    issue: RuntimeCompatibilityIssue;
  }> = [
    {
      actual: input.siteContractVersion,
      supported: CURRENT_SITE_CONTRACT_VERSION,
      issue: "unsupported-contract-version",
    },
    {
      actual: input.schemaVersion,
      supported: CURRENT_SCHEMA_VERSION,
      issue: "unsupported-schema-version",
    },
    {
      actual: input.engineVersion,
      supported: CURRENT_ENGINE_VERSION,
      issue: "unsupported-engine-version",
    },
  ];

  for (const check of checks) {
    try {
      if (
        parseContractVersion(check.actual).major !==
        parseContractVersion(check.supported).major
      ) {
        issues.push(check.issue);
      }
    } catch {
      issues.push(check.issue);
    }
  }

  return issues.length === 0
    ? { compatible: true, issues: [] }
    : { compatible: false, issues };
}
