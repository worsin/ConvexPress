export const FIRST_ADMIN_SETUP_ROUTE = "/setup";
export const SETUP_CREDENTIAL_HANDOFF_TTL_MS = 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PendingCredentialHandoff = {
  email?: unknown;
  password?: unknown;
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
    EMAIL_RE.test(credentials.email.trim().toLowerCase()) &&
    typeof credentials.password === "string" &&
    credentials.password.length >= 8 &&
    typeof credentials.expiresAt === "number" &&
    Number.isFinite(credentials.expiresAt) &&
    credentials.expiresAt > now
  );
}
