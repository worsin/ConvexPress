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
  | { kind: "bundled"; convexUrl: string }
  /** Ask the operator for the deployment key in the protected credential window. */
  | { kind: "prompt"; deploymentOrigin: string }
  /** Fleet site: the main process fetches the sealed admin key from the control plane. */
  | { kind: "control-plane"; connectionId: string; authToken: string };

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
      !host.includes(".") || // single-label intranet names (docker / LAN aliases)
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
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
  } else if (raw.credential.kind === "prompt") {
    credential = { kind: "prompt", deploymentOrigin: parseDeploymentOrigin(raw.credential.deploymentOrigin) };
  } else if (raw.credential.kind === "control-plane") {
    const authToken = cleanText(raw.credential.authToken, "operator token", 24_000);
    if (authToken.length < 100 || authToken.split(".").length !== 3) throw new Error("Operator token is invalid");
    credential = {
      kind: "control-plane",
      connectionId: cleanText(raw.credential.connectionId, "connection", 160),
      authToken,
    };
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
    if (!secret || secret.length < 8) continue;
    out = out.split(secret).join("••••");
    // Multi-line secrets (PEM keys) can be echoed one line at a time by a
    // child process; scrub every fragment, not only the whole value.
    for (const fragment of secret.split(/\r?\n/)) {
      const piece = fragment.trim();
      if (piece.length >= 16) out = out.split(piece).join("••••");
    }
  }
  return out
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[private key redacted]")
    .replace(/-----(?:BEGIN|END) [A-Z ]*PRIVATE KEY-----/g, "[private key redacted]")
    .replace(/(sk_(?:test|live)_)[A-Za-z0-9]+/g, "$1••••")
    .replace(/(whsec_)[A-Za-z0-9+/=_-]+/g, "$1••••");
}

// ─── Initialize a fresh deployment as a ConvexPress site ────────────────────

export type SiteEnvironmentKind =
  | "live"
  | "staging"
  | "beta"
  | "preview"
  | "development"
  | "local"
  | "custom";

const ENVIRONMENT_KINDS = new Set<SiteEnvironmentKind>([
  "live",
  "staging",
  "beta",
  "preview",
  "development",
  "local",
  "custom",
]);

export interface SiteInitializeRequest {
  /** Control-plane environment record to connect once the site is initialized. */
  instanceId: string;
  websiteKey: string;
  instanceKey: string;
  environmentKind: SiteEnvironmentKind;
  deploymentOrigin: string;
  managementOrigin: string;
  siteOrigin: string;
  siteTitle: string;
  connectionName: string;
  accountLabel?: string;
  /** Operator token for the control-plane connection call. */
  authToken: string;
  /** Extra browser origins allowed to call the site's local admin auth routes. */
  adminOrigins: string[];
}

// Mirrors @convexpress/site-contract portableKeySchema (8–128 chars, letters,
// digits, dot, underscore, colon, dash; e.g. "business:site:live").
const PORTABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function assertSiteInitializeRequest(raw: unknown): SiteInitializeRequest {
  if (!isRecord(raw)) throw new Error("Invalid initialize request");
  const websiteKey = cleanText(raw.websiteKey, "website key", 128);
  const instanceKey = cleanText(raw.instanceKey, "environment key", 128);
  if (!PORTABLE_KEY.test(websiteKey) || !PORTABLE_KEY.test(instanceKey)) {
    throw new Error("Website and environment keys must be portable keys (8-128 chars: letters, digits, . _ : -)");
  }
  const environmentKind = String(raw.environmentKind ?? "") as SiteEnvironmentKind;
  if (!ENVIRONMENT_KINDS.has(environmentKind)) throw new Error("Unknown environment kind");
  const authToken = cleanText(raw.authToken, "operator token", 24_000);
  if (authToken.length < 100 || authToken.split(".").length !== 3) throw new Error("Operator token is invalid");
  const adminOrigins = Array.isArray(raw.adminOrigins)
    ? raw.adminOrigins.map((origin) => parseDeploymentOrigin(origin))
    : [];
  if (adminOrigins.length > 8) throw new Error("Too many admin origins");
  return {
    instanceId: cleanText(raw.instanceId, "environment", 160),
    websiteKey,
    instanceKey,
    environmentKind,
    deploymentOrigin: parseDeploymentOrigin(raw.deploymentOrigin),
    managementOrigin: parseDeploymentOrigin(raw.managementOrigin),
    siteOrigin: parseDeploymentOrigin(raw.siteOrigin),
    siteTitle: cleanText(raw.siteTitle, "site title", 160),
    connectionName: cleanText(raw.connectionName, "connection name", 160),
    ...(typeof raw.accountLabel === "string" && raw.accountLabel.trim()
      ? { accountLabel: cleanText(raw.accountLabel, "account label", 160) }
      : {}),
    authToken,
    adminOrigins,
  };
}
