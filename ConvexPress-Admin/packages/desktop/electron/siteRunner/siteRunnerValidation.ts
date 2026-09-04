/**
 * Site runner contracts and pure helpers.
 *
 * The site runner launches storefront processes from one ConvexPress-Website
 * checkout: one process per environment instance (Live, Staging, …), each on
 * its own loopback port and pointed at its own Convex deployment. Everything
 * in this module is side-effect free so it can be unit tested.
 */

export type SiteRunnerMode = "dev" | "preview";

export interface SiteRunnerTarget {
  /** Stable identity of the environment instance (control plane instanceKey). */
  instanceKey: string;
  /** Human label, e.g. "Northstar Shop — Live". */
  label: string;
  /** Convex deployment origin the storefront should talk to. */
  convexUrl: string;
  /** Convex HTTP-actions origin; derived from convexUrl when omitted. */
  convexSiteUrl?: string;
  /** The site address configured for this environment. */
  siteUrl?: string;
  /** Admin app origin surfaced in the storefront admin bar. */
  adminAppUrl?: string;
  clerkPublishableKey?: string;
  /**
   * `dev` obeys the site address (its loopback port becomes the server port);
   * `preview` always starts a local server on an allocated port.
   */
  mode?: SiteRunnerMode;
}

export type SiteProcessStatus =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "failed";

export interface SiteProcessState {
  key: string;
  instanceKey: string;
  label: string;
  mode: SiteRunnerMode;
  status: SiteProcessStatus;
  port: number;
  url: string;
  convexUrl: string;
  pid: number | null;
  startedAt: number | null;
  exitCode: number | null;
  error: string | null;
  lastLogLine: string | null;
}

export interface SiteRunnerConfig {
  websiteRepoPath: string | null;
  /** Ports remembered per process key so restarts reuse the same address. */
  ports: Record<string, number>;
}

export const SITE_RUNNER_PORT_RANGE = { start: 4200, end: 4399 } as const;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1", "0.0.0.0"]);

export function isLoopbackUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Port carried by a loopback site address, or null when not local. */
export function parseLoopbackPort(value: string | undefined | null): number | null {
  if (!isLoopbackUrl(value)) return null;
  try {
    const url = new URL(value as string);
    if (url.port) return Number(url.port);
    return url.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
}

export function deriveConvexSiteUrl(convexUrl: string): string | undefined {
  try {
    const url = new URL(convexUrl);
    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
      return url.origin;
    }
    if (url.port) {
      url.port = String(Number(url.port) + 1);
      return url.origin;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function assertHttpUrl(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${field} must be a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${field} must use http or https.`);
  }
  return url.origin;
}

function optionalHttpUrl(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return assertHttpUrl(value, field);
}

const INSTANCE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/;

export function assertSiteRunnerTarget(input: unknown): SiteRunnerTarget {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Site runner target must be an object.");
  }
  const raw = input as Record<string, unknown>;
  const instanceKey = typeof raw.instanceKey === "string" ? raw.instanceKey.trim() : "";
  if (!INSTANCE_KEY_PATTERN.test(instanceKey)) {
    throw new Error("instanceKey is required and may only contain letters, digits, ':', '.', '_' and '-'.");
  }
  const label =
    typeof raw.label === "string" && raw.label.trim() ? raw.label.trim().slice(0, 120) : instanceKey;
  const mode: SiteRunnerMode = raw.mode === "preview" ? "preview" : "dev";
  const convexUrl = assertHttpUrl(raw.convexUrl, "convexUrl");
  const clerkPublishableKey =
    typeof raw.clerkPublishableKey === "string" && raw.clerkPublishableKey.trim()
      ? raw.clerkPublishableKey.trim()
      : undefined;
  return {
    instanceKey,
    label,
    mode,
    convexUrl,
    convexSiteUrl: optionalHttpUrl(raw.convexSiteUrl, "convexSiteUrl") ?? deriveConvexSiteUrl(convexUrl),
    siteUrl: optionalHttpUrl(raw.siteUrl, "siteUrl"),
    adminAppUrl: optionalHttpUrl(raw.adminAppUrl, "adminAppUrl"),
    clerkPublishableKey,
  };
}

export function siteProcessKey(target: Pick<SiteRunnerTarget, "instanceKey" | "mode">): string {
  return target.mode === "preview" ? `${target.instanceKey}#preview` : target.instanceKey;
}

/**
 * Choose the port for a process. A loopback site address wins (the address is
 * the contract the user configured); otherwise reuse the remembered port,
 * otherwise take the first free port in the runner's range.
 */
export function choosePort(
  target: SiteRunnerTarget,
  options: { remembered: number | null; taken: Iterable<number> },
): number {
  const taken = new Set(options.taken);
  if (target.mode !== "preview") {
    const fromAddress = parseLoopbackPort(target.siteUrl);
    if (fromAddress && fromAddress > 0 && fromAddress < 65536) return fromAddress;
  }
  if (options.remembered && !taken.has(options.remembered)) return options.remembered;
  for (let port = SITE_RUNNER_PORT_RANGE.start; port <= SITE_RUNNER_PORT_RANGE.end; port += 1) {
    if (!taken.has(port)) return port;
  }
  throw new Error("No free port left for local storefronts (4200–4399).");
}

export function localSiteUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/** Environment passed to the storefront process. Mirrors apps/web/src/lib/site-runtime.ts. */
export function buildStorefrontEnv(
  target: SiteRunnerTarget,
  port: number,
  extras: { cacheDir: string; adminAppUrl?: string },
): Record<string, string> {
  const siteUrl = localSiteUrl(port);
  const convexSiteUrl = target.convexSiteUrl ?? deriveConvexSiteUrl(target.convexUrl) ?? "";
  const env: Record<string, string> = {
    PORT: String(port),
    CONVEXPRESS_PORT: String(port),
    CONVEXPRESS_INSTANCE_KEY: target.instanceKey,
    CONVEXPRESS_CONVEX_URL: target.convexUrl,
    CONVEXPRESS_CONVEX_SITE_URL: convexSiteUrl,
    CONVEXPRESS_SITE_URL: siteUrl,
    CONVEXPRESS_VITE_CACHE_DIR: extras.cacheDir,
    // VITE_* mirrors keep the dev server's build-time fallbacks consistent.
    VITE_CONVEX_URL: target.convexUrl,
    VITE_CONVEX_SITE_URL: convexSiteUrl,
    VITE_APP_URL: siteUrl,
  };
  const adminAppUrl = target.adminAppUrl ?? extras.adminAppUrl;
  if (adminAppUrl) {
    env.CONVEXPRESS_ADMIN_APP_URL = adminAppUrl;
    env.VITE_ADMIN_APP_URL = adminAppUrl;
  }
  if (target.clerkPublishableKey) {
    env.CONVEXPRESS_CLERK_PUBLISHABLE_KEY = target.clerkPublishableKey;
    env.VITE_CLERK_PUBLISHABLE_KEY = target.clerkPublishableKey;
  }
  return env;
}

/** Turn a process key into a filesystem-safe cache directory name. */
export function cacheDirName(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]+/g, "_");
}

export function assertProcessKey(input: unknown): string {
  if (typeof input !== "string" || !input.trim() || input.length > 240) {
    throw new Error("Process key is required.");
  }
  return input;
}

export function assertWebsiteRepoPathInput(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input !== "string" || input.length > 4096) {
    throw new Error("websiteRepoPath must be a path string.");
  }
  return input.trim();
}
