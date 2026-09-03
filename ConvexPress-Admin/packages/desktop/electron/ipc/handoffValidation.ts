import { createHash } from "node:crypto";

const MAX_HANDOFF_BYTES = 2_000_000;
const SECRET_KEY_FRAGMENTS = [
  "secret",
  "password",
  "passphrase",
  "token",
  "credential",
  "privatekey",
  "adminkey",
  "deploykey",
  "productionkey",
  "authorization",
  "cookie",
] as const;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

function assertSecretFree(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertSecretFree(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (SECRET_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
      throw new Error("Handoff package contains a protected credential field");
    }
    assertSecretFree(item);
  }
}

function normalizeFilename(value: string) {
  const withoutExtension = value.trim().replace(/\.json$/i, "");
  const safe = withoutExtension
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
  return `${safe || "convexpress-handoff"}.json`;
}

export function prepareHandoffSaveRequest(input: {
  suggestedFilename: string;
  packageJson: string;
}) {
  if (Buffer.byteLength(input.packageJson, "utf8") > MAX_HANDOFF_BYTES) {
    throw new Error("Handoff package is too large");
  }
  let bundle: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(input.packageJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("shape");
    }
    bundle = parsed as Record<string, unknown>;
  } catch {
    throw new Error("Handoff package is invalid");
  }
  if (
    bundle.format !== "convexpress-handoff" ||
    bundle.formatVersion !== "1.0.0" ||
    !bundle.manifest ||
    typeof bundle.manifest !== "object" ||
    Array.isArray(bundle.manifest) ||
    typeof bundle.manifestSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(bundle.manifestSha256)
  ) {
    throw new Error("Handoff package is invalid");
  }
  const checksum = createHash("sha256")
    .update(canonicalJson(bundle.manifest))
    .digest("hex");
  if (checksum !== bundle.manifestSha256) {
    throw new Error("Handoff package checksum is invalid");
  }
  assertSecretFree(bundle.manifest);
  return {
    suggestedFilename: normalizeFilename(input.suggestedFilename),
    packageJson: input.packageJson,
  };
}
