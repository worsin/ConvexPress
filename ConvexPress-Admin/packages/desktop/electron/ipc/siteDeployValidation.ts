/**
 * Site deploy IPC — input validation (pure, unit-tested).
 */

export interface SiteDeployEnvChange {
  name: string;
  value: string | null;
}

export type SiteDeployCredential =
  | { kind: "admin-key"; deploymentOrigin: string; adminKey: string }
  | { kind: "deploy-key"; deployKey: string; deployment: string }
  /** Single-site desktop installs: the bundled backend's own deploy key, read by the main process. */
  | { kind: "bundled"; convexUrl: string };

export interface SiteDeployRequest {
  /** Human label shown in progress + logs. */
  label: string;
  credential: SiteDeployCredential;
  /** Variables written before the deploy (site auth only). */
  envChanges: SiteDeployEnvChange[];
  /** Skip the code push (env vars only). */
  envOnly?: boolean;
}

const ENV_NAMES = new Set([
  "CLERK_JWT_ISSUER_DOMAIN",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "CLERK_PUBLISHABLE_KEY",
  "SITE_URL",
]);

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw new Error(`Missing ${label}`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || CONTROL_CHARS.test(trimmed)) {
    throw new Error(`Invalid ${label}`);
  }
  return trimmed;
}

export function parseDeploymentOrigin(value: unknown): string {
  const text = cleanText(value, "deployment origin", 300);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error("Invalid deployment origin");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Invalid deployment origin");
  if (url.protocol === "http:") {
    const host = url.hostname;
    const privateHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]" ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (!privateHost) throw new Error("Plain-http deployments must be on a private network");
  }
  return url.origin;
}

export function assertSiteDeployRequest(raw: unknown): SiteDeployRequest {
  if (!isRecord(raw)) throw new Error("Invalid deploy request");
  const label = cleanText(raw.label, "label", 160);
  if (!isRecord(raw.credential)) throw new Error("Missing deployment credential");
  let credential: SiteDeployCredential;
  if (raw.credential.kind === "admin-key") {
    credential = {
      kind: "admin-key",
      deploymentOrigin: parseDeploymentOrigin(raw.credential.deploymentOrigin),
      adminKey: cleanText(raw.credential.adminKey, "admin key", 16_384),
    };
    if (credential.adminKey.length < 16) throw new Error("Invalid admin key");
  } else if (raw.credential.kind === "bundled") {
    credential = { kind: "bundled", convexUrl: parseDeploymentOrigin(raw.credential.convexUrl) };
  } else if (raw.credential.kind === "deploy-key") {
    credential = {
      kind: "deploy-key",
      deployKey: cleanText(raw.credential.deployKey, "deploy key", 4_096),
      deployment: cleanText(raw.credential.deployment, "deployment name", 200),
    };
  } else {
    throw new Error("Unknown deployment credential kind");
  }
  const rawChanges = Array.isArray(raw.envChanges) ? raw.envChanges : [];
  if (rawChanges.length > 8) throw new Error("Too many environment changes");
  const seen = new Set<string>();
  const envChanges = rawChanges.map((change): SiteDeployEnvChange => {
    if (!isRecord(change)) throw new Error("Invalid environment change");
    const name = cleanText(change.name, "variable name", 64);
    if (!ENV_NAMES.has(name)) throw new Error(`${name} is not a site auth variable`);
    if (seen.has(name)) throw new Error(`${name} is listed twice`);
    seen.add(name);
    if (change.value === null) return { name, value: null };
    return { name, value: cleanText(change.value, name, 8_192) };
  });
  const envOnly = raw.envOnly === true;
  if (envOnly && envChanges.length === 0) throw new Error("Nothing to apply");
  return { label, credential, envChanges, envOnly };
}

/** Scrub secrets from a log line before it reaches the renderer or console. */
export function redactDeployLog(line: string, secrets: string[]): string {
  let out = line;
  for (const secret of secrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join("••••");
  }
  return out
    .replace(/(sk_(?:test|live)_)[A-Za-z0-9]+/g, "$1••••")
    .replace(/(whsec_)[A-Za-z0-9+/=_-]+/g, "$1••••");
}
