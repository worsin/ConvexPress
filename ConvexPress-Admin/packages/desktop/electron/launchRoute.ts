export const FIRST_ADMIN_SETUP_ROUTE = "/setup";

export function normalizeInitialRoute(route?: string | null): string | undefined {
  const trimmed = route?.trim();
  if (!trimmed) return undefined;

  const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  return withoutHash.startsWith("/") ? withoutHash : `/${withoutHash}`;
}

export function getInitialRouteForLaunch(config: {
  pendingAdminCredentials?: unknown | null;
}): string | undefined {
  return config.pendingAdminCredentials ? FIRST_ADMIN_SETUP_ROUTE : undefined;
}

export function addHashRouteToUrl(url: string, route?: string | null): string {
  const normalizedRoute = normalizeInitialRoute(route);
  if (!normalizedRoute) return url;

  const parsed = new URL(url);
  parsed.hash = normalizedRoute;
  return parsed.toString();
}
