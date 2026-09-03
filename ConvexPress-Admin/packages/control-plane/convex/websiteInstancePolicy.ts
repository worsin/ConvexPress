import {
  assessRuntimeCompatibility,
  deploymentOriginSchema,
} from "@convexpress/site-contract";

export interface WebsiteInstanceVersionState {
  label?: string;
  deploymentOrigin: string;
  managementOrigin: string;
  siteOrigin: string;
  deploymentName?: string;
  projectRef?: string;
  siteContractVersion?: string;
  schemaVersion?: string;
  engineVersion?: string;
}

export interface WebsiteInstanceUpdateInput {
  label?: string | null;
  deploymentOrigin?: string;
  managementOrigin?: string;
  siteOrigin?: string;
  deploymentName?: string | null;
  projectRef?: string | null;
  siteContractVersion?: string | null;
  schemaVersion?: string | null;
  engineVersion?: string | null;
}

export interface WebsiteInstancePatch {
  label?: string;
  deploymentOrigin?: string;
  managementOrigin?: string;
  siteOrigin?: string;
  domain?: string;
  deploymentName?: string;
  projectRef?: string;
  siteContractVersion?: string;
  schemaVersion?: string;
  engineVersion?: string;
  compatibility?: "unknown" | "compatible" | "incompatible";
  lastCompatibilityAt?: number;
  lastCompatibilityError?: string;
  updatedAt: number;
}

const editableFields = [
  "label",
  "deploymentOrigin",
  "managementOrigin",
  "siteOrigin",
  "deploymentName",
  "projectRef",
  "siteContractVersion",
  "schemaVersion",
  "engineVersion",
] as const;

function owns(value: object, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function cleanOptionalText(
  value: string | null,
  label: string,
  maxLength: number,
) {
  if (value === null) return undefined;
  const cleaned = value.trim();
  if (!cleaned) return undefined;
  if (cleaned.length > maxLength || /[\u0000-\u001f\u007f]/u.test(cleaned)) {
    throw new Error(`Invalid ${label}`);
  }
  return cleaned;
}

function parseOrigin(value: string, label: string) {
  const parsed = deploymentOriginSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid ${label} origin`);
  return parsed.data;
}

export function buildWebsiteInstancePatch(input: {
  current: WebsiteInstanceVersionState;
  input: WebsiteInstanceUpdateInput;
  now: number;
}): WebsiteInstancePatch {
  if (!editableFields.some((field) => owns(input.input, field))) {
    throw new Error("Update at least one field");
  }

  const patch: WebsiteInstancePatch = { updatedAt: input.now };
  if (owns(input.input, "label")) {
    patch.label = cleanOptionalText(input.input.label ?? null, "environment label", 160);
  }
  if (owns(input.input, "deploymentName")) {
    patch.deploymentName = cleanOptionalText(
      input.input.deploymentName ?? null,
      "deployment name",
      160,
    );
  }
  if (owns(input.input, "projectRef")) {
    patch.projectRef = cleanOptionalText(input.input.projectRef ?? null, "project reference", 240);
  }
  if (owns(input.input, "deploymentOrigin")) {
    patch.deploymentOrigin = parseOrigin(
      input.input.deploymentOrigin!,
      "deployment",
    );
  }
  if (owns(input.input, "managementOrigin")) {
    patch.managementOrigin = parseOrigin(
      input.input.managementOrigin!,
      "management",
    );
  }
  if (owns(input.input, "siteOrigin")) {
    const siteOrigin = parseOrigin(input.input.siteOrigin!, "site");
    patch.siteOrigin = siteOrigin;
    patch.domain = new URL(siteOrigin).hostname;
  }

  for (const field of [
    "siteContractVersion",
    "schemaVersion",
    "engineVersion",
  ] as const) {
    if (owns(input.input, field)) {
      patch[field] = cleanOptionalText(
        input.input[field] ?? null,
        field,
        64,
      );
    }
  }

  const versionsChanged = [
    "siteContractVersion",
    "schemaVersion",
    "engineVersion",
  ].some((field) => owns(input.input, field));
  if (versionsChanged) {
    const siteContractVersion = owns(input.input, "siteContractVersion")
      ? patch.siteContractVersion
      : input.current.siteContractVersion;
    const schemaVersion = owns(input.input, "schemaVersion")
      ? patch.schemaVersion
      : input.current.schemaVersion;
    const engineVersion = owns(input.input, "engineVersion")
      ? patch.engineVersion
      : input.current.engineVersion;
    if (siteContractVersion && schemaVersion && engineVersion) {
      const compatibility = assessRuntimeCompatibility({
        siteContractVersion,
        schemaVersion,
        engineVersion,
      });
      patch.compatibility = compatibility.compatible
        ? "compatible"
        : "incompatible";
      patch.lastCompatibilityAt = input.now;
      patch.lastCompatibilityError = compatibility.compatible
        ? undefined
        : compatibility.issues.join(",");
    } else {
      patch.compatibility = "unknown";
      patch.lastCompatibilityAt = input.now;
      patch.lastCompatibilityError = "VERSION_METADATA_INCOMPLETE";
    }
  }

  return patch;
}
