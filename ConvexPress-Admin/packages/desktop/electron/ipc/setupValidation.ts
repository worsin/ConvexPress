export interface SetupValidationConfig {
  mode?: string;
  convexUrl?: string;
  convexSiteUrl?: string;
  adminKey?: string;
  adminName?: string;
  adminEmail?: string;
  adminPassword?: string;
  clientIdentifier?: string;
  clientPassword?: string;
}

export interface PendingAdminCredentials {
  displayName: string;
  email: string;
  password: string;
  setupToken?: string;
}

export interface PendingLoginCredentials {
  identifier: string;
  password: string;
}

export interface ValidatedSetupConfig {
  mode: "server" | "client";
  convexUrl: string;
  convexSiteUrl: string;
  pendingAdminCredentials: PendingAdminCredentials | null;
  pendingLoginCredentials: PendingLoginCredentials | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONVEX_CLOUD_URL_RE = /^https:\/\/[a-z0-9-]+\.convex\.cloud$/;
const DEPLOYMENT_NAME_RE = /^[a-z0-9-]+$/;
const MAX_CONVEX_URL_LENGTH = 128;
const MAX_DEPLOY_KEY_LENGTH = 4096;
const MAX_EMAIL_LENGTH = 254;
const MAX_DISPLAY_NAME_LENGTH = 128;
const MAX_PASSWORD_LENGTH = 256;
const MAX_IDENTIFIER_LENGTH = 254;

function cleanUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function requireTrimmed(
  value: string | undefined,
  label: string,
  options: { maxLength?: number } = {},
): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  if (options.maxLength && trimmed.length > options.maxLength) {
    throw new Error(`${label} must be ${options.maxLength} characters or fewer.`);
  }
  return trimmed;
}

function validateStringLength(value: string, label: string, maxLength: number) {
  if (value.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
}

export function deriveConvexSiteUrl(convexUrl: string): string {
  const cleaned = cleanUrl(convexUrl);
  try {
    const url = new URL(cleaned);
    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
      return cleanUrl(url.toString());
    }
  } catch {
    /* fall through to the original value */
  }
  return cleaned;
}

function validateSetupMode(mode: string | undefined): "server" | "client" {
  if (mode !== "server" && mode !== "client") {
    throw new Error("Setup mode must be either server or client.");
  }
  return mode;
}

export function normalizeConvexCloudUrl(value: string | undefined): string {
  const cleaned = requireTrimmed(value, "Convex URL", {
    maxLength: MAX_CONVEX_URL_LENGTH,
  }).replace(/\/+$/, "");
  if (!CONVEX_CLOUD_URL_RE.test(cleaned)) {
    throw new Error(
      "Convex URL must match https://your-app-123.convex.cloud.",
    );
  }
  return cleaned;
}

function getDeploymentNameFromConvexUrl(convexUrl: string): string {
  const normalizedUrl = normalizeConvexCloudUrl(convexUrl);
  const host = new URL(normalizedUrl).hostname;
  return host.replace(/\.convex\.cloud$/, "");
}

export function validateProductionDeployKey(
  value: string | undefined,
  convexUrl: string,
): { deployKey: string; deployment: string } {
  const deployKey = requireTrimmed(value, "Deploy key", {
    maxLength: MAX_DEPLOY_KEY_LENGTH,
  });
  const parts = deployKey.split("|");
  if (parts.length !== 2 || !parts[1]?.trim()) {
    throw new Error("Deploy key must include a deployment reference and token.");
  }

  const deployment = parts[0]!;
  if (!deployment.startsWith("prod:")) {
    throw new Error("Deploy key must start with a production deployment reference.");
  }

  const deploymentName = deployment.replace(/^prod:/, "");
  if (!DEPLOYMENT_NAME_RE.test(deploymentName)) {
    throw new Error("Deploy key is missing a valid deployment name.");
  }

  const expectedDeploymentName = getDeploymentNameFromConvexUrl(convexUrl);
  if (deploymentName !== expectedDeploymentName) {
    throw new Error("Deploy key deployment must match the Convex URL.");
  }

  return { deployKey, deployment };
}

function resolveConvexSiteUrl(
  convexUrl: string,
  explicitSiteUrl?: string,
): string {
  const derivedSiteUrl = deriveConvexSiteUrl(convexUrl);
  if (!explicitSiteUrl) return derivedSiteUrl;

  const cleanedSiteUrl = cleanUrl(explicitSiteUrl);
  if (cleanedSiteUrl !== derivedSiteUrl) {
    throw new Error("Convex site URL must match the deployment URL.");
  }
  return cleanedSiteUrl;
}

function validateServerAdminCredentials(
  config: SetupValidationConfig,
): PendingAdminCredentials {
  const displayName = requireTrimmed(config.adminName, "Admin name", {
    maxLength: MAX_DISPLAY_NAME_LENGTH,
  });
  const email = requireTrimmed(config.adminEmail, "Admin email", {
    maxLength: MAX_EMAIL_LENGTH,
  }).toLowerCase();
  const password = config.adminPassword;

  if (!EMAIL_RE.test(email)) {
    throw new Error("Admin email must be a valid email address.");
  }
  if (!password || password.length < 8) {
    throw new Error("Admin password must be at least 8 characters.");
  }
  validateStringLength(password, "Admin password", MAX_PASSWORD_LENGTH);

  return { displayName, email, password };
}

function validateClientLoginCredentials(
  config: SetupValidationConfig,
): PendingLoginCredentials {
  const identifier = requireTrimmed(
    config.clientIdentifier,
    "Client username or email",
    { maxLength: MAX_IDENTIFIER_LENGTH },
  );
  const password = config.clientPassword;

  if (!password) {
    throw new Error("Client password is required.");
  }
  validateStringLength(password, "Client password", MAX_PASSWORD_LENGTH);

  return { identifier, password };
}

export function validateSetupConfig(
  config: SetupValidationConfig,
): ValidatedSetupConfig {
  const mode = validateSetupMode(config.mode);
  const convexUrl = normalizeConvexCloudUrl(config.convexUrl);
  const convexSiteUrl = resolveConvexSiteUrl(
    convexUrl,
    config.convexSiteUrl,
  );

  if (mode === "server") {
    validateProductionDeployKey(config.adminKey, convexUrl);
  }

  return {
    mode,
    convexUrl,
    convexSiteUrl,
    pendingAdminCredentials:
      mode === "server" ? validateServerAdminCredentials(config) : null,
    pendingLoginCredentials:
      mode === "client" ? validateClientLoginCredentials(config) : null,
  };
}
