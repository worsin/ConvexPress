export const FIRST_ADMIN_SETUP_ROUTE = "/setup";
export const SETUP_CREDENTIAL_HANDOFF_TTL_MS = 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SETUP_TOKEN_RE = /^[A-Za-z0-9_-]{32,256}$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 256;

type PendingCredentialHandoff = {
  email?: unknown;
  password?: unknown;
  setupToken?: unknown;
  expiresAt?: unknown;
};

export function normalizeInitialRoute(route?: string | null): string | undefined {
  const trimmed = route?.trim();
  if (!trimmed) return undefined;

  const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  return withoutHash.startsWith("/") ? withoutHash : `/${withoutHash}`;
}

export function getInitialRouteForLaunch(config: {
  pendingAdminCredentials?: unknown | null;
}): string | undefined {
  return isPendingAdminHandoffUsable(config.pendingAdminCredentials)
    ? FIRST_ADMIN_SETUP_ROUTE
    : undefined;
}

export function addHashRouteToUrl(url: string, route?: string | null): string {
  const normalizedRoute = normalizeInitialRoute(route);
  if (!normalizedRoute) return url;

  const parsed = new URL(url);
  parsed.hash = normalizedRoute;
  return parsed.toString();
}

export function isPendingAdminHandoffUsable(
  value: unknown,
  now = Date.now(),
): boolean {
  if (!value || typeof value !== "object") return false;
  const credentials = value as PendingCredentialHandoff;
  return (
    typeof credentials.email === "string" &&
    credentials.email.trim().length <= MAX_EMAIL_LENGTH &&
    EMAIL_RE.test(credentials.email.trim().toLowerCase()) &&
    typeof credentials.password === "string" &&
    credentials.password.length >= 8 &&
    credentials.password.length <= MAX_PASSWORD_LENGTH &&
    typeof credentials.setupToken === "string" &&
    SETUP_TOKEN_RE.test(credentials.setupToken) &&
    typeof credentials.expiresAt === "number" &&
    Number.isFinite(credentials.expiresAt) &&
    credentials.expiresAt > now
  );
}
