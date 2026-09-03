export const PACKAGED_CONVEXPRESS_APP_ORIGIN = "convexpress-app://shell";
export const CONVEXPRESS_DEV_RENDERER_ORIGINS = [
  "http://localhost:4105",
  "http://127.0.0.1:4105",
] as const;

export type AuthRuntimeMode = "development" | "packaged" | "hosted";

export interface AuthRuntimeConfig {
  mode: AuthRuntimeMode;
  siteUrl: string;
  trustedOrigins: string[];
}

function normalizeHttpOrigin(value: string): string | undefined {
  const trimmed = value.trim().replace(/\/+$/u, "");
  if (!trimmed || trimmed === "null" || trimmed.includes("*")) return undefined;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return undefined;
    if (parsed.pathname !== "/" && parsed.pathname !== "") return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function isLocalHostname(origin: string): boolean {
  const hostname = new URL(origin).hostname.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  );
}

function parseRuntimeMode(value: string | undefined): AuthRuntimeMode | undefined {
  const mode = value?.trim();
  if (!mode) return undefined;
  if (mode === "development" || mode === "packaged" || mode === "hosted") {
    return mode;
  }
  throw new Error(
    "CONVEXPRESS_AUTH_MODE must be development, packaged, or hosted",
  );
}

function parseAdditionalOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function resolveAuthTrustedOrigins(input: {
  siteUrl: string;
  mode: AuthRuntimeMode;
  additionalOrigins?: readonly string[];
}): string[] {
  const siteUrl = normalizeHttpOrigin(input.siteUrl);
  if (!siteUrl) {
    throw new Error("The control-plane site URL must be an exact http(s) origin");
  }
  if (
    input.mode === "hosted" &&
    (new URL(siteUrl).protocol !== "https:" || isLocalHostname(siteUrl))
  ) {
    throw new Error("A hosted origin must be non-local HTTPS");
  }

  const origins = [siteUrl];
  if (input.mode === "development") {
    origins.push(...CONVEXPRESS_DEV_RENDERER_ORIGINS);
  }
  if (input.mode === "packaged") {
    origins.push(PACKAGED_CONVEXPRESS_APP_ORIGIN);
  }

  for (const candidate of input.additionalOrigins ?? []) {
    const origin = normalizeHttpOrigin(candidate);
    const allowedHosted =
      origin !== undefined &&
      new URL(origin).protocol === "https:" &&
      !isLocalHostname(origin);
    if (input.mode === "hosted" && !allowedHosted) {
      throw new Error(`Invalid hosted origin: ${candidate}`);
    }
    if (!origin) {
      throw new Error(`Invalid trusted origin: ${candidate}`);
    }
    origins.push(origin);
  }

  return [...new Set(origins)];
}

/**
 * Resolve the complete Better Auth runtime boundary.
 *
 * Local deployments may safely default to development. Every reachable
 * non-local deployment must declare its mode so a missing production setting
 * can never silently widen the trusted-origin list.
 */
export function resolveAuthRuntimeConfig(input: {
  siteUrl: string;
  configuredMode?: string;
  additionalOrigins?: string;
}): AuthRuntimeConfig {
  const siteUrl = normalizeHttpOrigin(input.siteUrl);
  if (!siteUrl) {
    throw new Error("CONVEX_SITE_URL must be an exact http(s) origin");
  }

  const configuredMode = parseRuntimeMode(input.configuredMode);
  const mode = configuredMode ?? (isLocalHostname(siteUrl) ? "development" : undefined);
  if (!mode) {
    throw new Error(
      "CONVEXPRESS_AUTH_MODE is required for every non-local deployment",
    );
  }

  return {
    mode,
    siteUrl,
    trustedOrigins: resolveAuthTrustedOrigins({
      siteUrl,
      mode,
      additionalOrigins: parseAdditionalOrigins(input.additionalOrigins),
    }),
  };
}
