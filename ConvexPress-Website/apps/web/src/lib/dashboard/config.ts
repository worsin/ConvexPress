/**
 * Dashboard configuration + path helpers (pure, unit-tested).
 *
 * The dashboard base path is a site setting (`dashboardConfig.basePath`), so
 * nothing in the dashboard may hardcode "/dashboard". Components build hrefs
 * with `useDashboardPath()` (hooks/useDashboardConfig.ts), which wraps
 * `buildDashboardPath` below. Menu items resolved by the backend already carry
 * the base path (and any per-item path override), so they are used verbatim.
 */

import type { DashboardConfig } from "@/lib/layout/types";

/** Mirrors DASHBOARD_DEFAULTS in the admin backend settings/defaults.ts. */
export const DASHBOARD_CONFIG_DEFAULTS: DashboardConfig = {
  basePath: "/dashboard",
  layout: "sidebar",
  sidebarLocation: "dashboard-sidebar",
  topbarLocation: "dashboard-topbar",
  profileLocation: "dashboard-profile",
  sidebarCollapsedByDefault: false,
  sidebarWidth: 264,
  showThemeToggle: true,
  showNotificationBell: true,
  showSearch: false,
  brandMark: "site",
  customLogoUrl: "",
  landingPage: "home",
  footerVariant: "minimal",
  membersCanEditHome: true,
  welcomeHeadline: "Welcome back, {name}",
};

/** The legacy, always-supported base path. `/dashboard/*` redirects to the configured one. */
export const LEGACY_DASHBOARD_BASE_PATH = "/dashboard";

const SIDEBAR_WIDTH_MIN = 200;
const SIDEBAR_WIDTH_MAX = 360;

/**
 * Normalizes a base path to the form "/segment[/segment]": leading slash,
 * no trailing slash, no duplicate slashes, no query/hash. Empty or root
 * input falls back to the default.
 */
export function normalizeBasePath(input: unknown): string {
  if (typeof input !== "string") return DASHBOARD_CONFIG_DEFAULTS.basePath;
  const cleaned = input.trim().split(/[?#]/)[0] ?? "";
  const segments = cleaned.split("/").filter(Boolean);
  if (segments.length === 0) return DASHBOARD_CONFIG_DEFAULTS.basePath;
  return `/${segments.join("/")}`;
}

/** Merges a partial public config over the defaults and sanitizes each field. */
export function resolveDashboardConfig(
  raw: Partial<DashboardConfig> | Record<string, unknown> | null | undefined,
): DashboardConfig {
  const source = (raw ?? {}) as Record<string, unknown>;
  const pick = <K extends keyof DashboardConfig>(key: K, allowed?: readonly DashboardConfig[K][]): DashboardConfig[K] => {
    const value = source[key];
    const fallback = DASHBOARD_CONFIG_DEFAULTS[key];
    if (value === undefined || value === null) return fallback;
    if (typeof value !== typeof fallback) return fallback;
    if (allowed && !allowed.includes(value as DashboardConfig[K])) return fallback;
    return value as DashboardConfig[K];
  };
  const sidebarWidth = pick("sidebarWidth");
  return {
    basePath: normalizeBasePath(source.basePath),
    layout: pick("layout", ["sidebar", "topbar", "both"] as const),
    sidebarLocation: pick("sidebarLocation").trim(),
    topbarLocation: pick("topbarLocation").trim(),
    profileLocation: pick("profileLocation").trim(),
    sidebarCollapsedByDefault: pick("sidebarCollapsedByDefault"),
    sidebarWidth: Number.isFinite(sidebarWidth)
      ? Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(sidebarWidth)))
      : DASHBOARD_CONFIG_DEFAULTS.sidebarWidth,
    showThemeToggle: pick("showThemeToggle"),
    showNotificationBell: pick("showNotificationBell"),
    showSearch: pick("showSearch"),
    brandMark: pick("brandMark", ["site", "custom", "none"] as const),
    customLogoUrl: pick("customLogoUrl").trim(),
    landingPage: pick("landingPage").trim() || DASHBOARD_CONFIG_DEFAULTS.landingPage,
    footerVariant: pick("footerVariant", ["minimal", "full", "none"] as const),
    membersCanEditHome: pick("membersCanEditHome"),
    welcomeHeadline: pick("welcomeHeadline"),
  };
}

/**
 * Builds an href under the base path. `path` is a registry page path ("",
 * "/orders", "/orders/123") or already-absolute dashboard-relative path.
 * Returns the base path itself for "" or "/".
 */
export function buildDashboardPath(basePath: string, path: string = ""): string {
  const base = normalizeBasePath(basePath);
  const rest = path.trim();
  if (!rest || rest === "/") return base;
  const [pathname, suffix] = splitSuffix(rest);
  const segments = pathname.split("/").filter(Boolean);
  const joined = segments.length ? `${base}/${segments.join("/")}` : base;
  return `${joined}${suffix}`;
}

function splitSuffix(path: string): [string, string] {
  const index = path.search(/[?#]/);
  if (index === -1) return [path, ""];
  return [path.slice(0, index), path.slice(index)];
}

/** True when `pathname` is the base path or nested under it. */
export function isUnderBasePath(pathname: string, basePath: string): boolean {
  const base = normalizeBasePath(basePath);
  const path = stripTrailingSlash(pathname);
  return path === base || path.startsWith(`${base}/`);
}

/**
 * Returns the remainder after the base path ("" for the base path itself,
 * "/orders/123" for nested pages), or null when the path is not under it.
 */
export function stripBasePath(pathname: string, basePath: string): string | null {
  const base = normalizeBasePath(basePath);
  const path = stripTrailingSlash(pathname);
  if (path === base) return "";
  if (path.startsWith(`${base}/`)) return path.slice(base.length);
  return null;
}

function stripTrailingSlash(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length ? `/${segments.join("/")}` : "/";
}

/**
 * Where a legacy `/dashboard/...` URL should go when the configured base path
 * differs. Returns null when no redirect is needed.
 */
export function legacyDashboardRedirect(
  pathname: string,
  basePath: string,
  search: string = "",
): string | null {
  const base = normalizeBasePath(basePath);
  if (base === LEGACY_DASHBOARD_BASE_PATH) return null;
  const remainder = stripBasePath(pathname, LEGACY_DASHBOARD_BASE_PATH);
  if (remainder === null) return null;
  return `${buildDashboardPath(base, remainder)}${search}`;
}

/** Replaces `{name}` in the welcome headline; trims dangling punctuation when the name is blank. */
export function renderWelcomeHeadline(template: string, name: string | null | undefined): string {
  const safeName = (name ?? "").trim();
  if (!template.includes("{name}")) return template;
  if (!safeName) {
    return template
      .replace(/[,\s]*\{name\}[,\s]*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return template.replace(/\{name\}/g, safeName);
}
