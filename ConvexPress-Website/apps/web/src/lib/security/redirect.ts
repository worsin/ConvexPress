const PRODUCTION_HOSTS = [
  "convexpress.com",
  "www.convexpress.com",
  "admin.convexpress.com",
];

// Only allow localhost in development
const DEV_HOSTS = import.meta.env.DEV ? ["localhost", "127.0.0.1"] : [];

const DEFAULT_ALLOWED_REDIRECT_HOSTS = [...PRODUCTION_HOSTS, ...DEV_HOSTS];

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

function parseAllowedHosts(rawValue?: string): string[] {
  if (!rawValue) return [];
  return rawValue
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\./, "");
}

export function getAllowedRedirectHosts(extraHosts: string[] = []): string[] {
  const envHosts = parseAllowedHosts(
    (import.meta.env.VITE_ALLOWED_REDIRECT_HOSTS as string | undefined) ?? "",
  );

  return [...DEFAULT_ALLOWED_REDIRECT_HOSTS, ...envHosts, ...extraHosts]
    .map(normalizeHost)
    .filter(Boolean);
}

export function isRedirectHostAllowed(
  hostname: string,
  allowedHosts: string[] = getAllowedRedirectHosts(),
): boolean {
  const normalizedHost = normalizeHost(hostname);
  return allowedHosts.some((allowed) => {
    const normalizedAllowed = normalizeHost(allowed);
    return (
      normalizedHost === normalizedAllowed ||
      normalizedHost.endsWith(`.${normalizedAllowed}`)
    );
  });
}

interface SanitizeRedirectOptions {
  baseOrigin?: string;
  fallbackPath?: string;
  allowedHosts?: string[];
}

export function sanitizeRedirectUrl(
  redirectUrl: string | null | undefined,
  options: SanitizeRedirectOptions = {},
): string {
  const fallbackPath = options.fallbackPath ?? "/dashboard";
  if (!redirectUrl) return fallbackPath;

  const trimmed = redirectUrl.trim();
  if (!trimmed) return fallbackPath;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  try {
    const url = new URL(
      trimmed,
      options.baseOrigin || "https://convexpress.com",
    );

    if (!SAFE_PROTOCOLS.has(url.protocol)) {
      return fallbackPath;
    }

    const allowedHosts = options.allowedHosts || getAllowedRedirectHosts();
    if (!isRedirectHostAllowed(url.hostname, allowedHosts)) {
      return fallbackPath;
    }

    if (options.baseOrigin) {
      const base = new URL(options.baseOrigin);
      if (url.origin === base.origin) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
    }

    return url.toString();
  } catch {
    return fallbackPath;
  }
}
