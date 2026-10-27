/**
 * Site runtime configuration.
 *
 * One storefront codebase serves any number of ConvexPress sites. Each running
 * process is told which site it serves through environment variables at boot,
 * and the server injects that configuration into every HTML document as
 * `window.__CONVEXPRESS_SITE__`. The client reads the injected object, so the
 * same build (or the same dev checkout) can be started as many times as there
 * are sites, each on its own port and pointed at its own Convex deployment.
 *
 * Resolution order
 *   server:  CONVEXPRESS_* env → VITE_* env (dev convenience)
 *   client:  window.__CONVEXPRESS_SITE__ → import.meta.env (dev fallback)
 *
 * A website running next to its backend (the same machine or private network)
 * can also set CONVEXPRESS_CONVEX_SERVER_URL: the same deployment at a private
 * address, for the server's own requests (see readServerConvexOrigins). It is
 * never part of the configuration sent to the browser.
 */

export interface SiteRuntimeConfig {
  /** Convex deployment origin, e.g. http://127.0.0.1:14820 */
  convexUrl: string;
  /** Convex HTTP-actions origin (".convex.site" or port + 1 when self-hosted). */
  convexSiteUrl?: string;
  /** Public URL this process serves, e.g. http://127.0.0.1:4201 */
  siteUrl?: string;
  /** Admin app origin used by the front-end admin bar. */
  adminAppUrl?: string;
  /** Control-plane instance key, purely informational. */
  instanceKey?: string;
  /** Clerk publishable key; empty when the site runs the Clerk shim. */
  clerkPublishableKey?: string;
}

declare global {
  interface Window {
    __CONVEXPRESS_SITE__?: SiteRuntimeConfig;
  }
}

export const SITE_RUNTIME_GLOBAL = "__CONVEXPRESS_SITE__";

function firstEnv(...names: string[]): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * Best-effort HTTP-actions origin for a Convex deployment origin.
 * Cloud deployments swap the TLD; self-hosted deployments use port + 1.
 */
export function deriveConvexSiteUrl(convexUrl: string | undefined): string | undefined {
  if (!convexUrl) return undefined;
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

/** Read the configuration this server process was started with. */
export function readServerSiteRuntime(): SiteRuntimeConfig {
  const convexUrl = firstEnv("CONVEXPRESS_CONVEX_URL", "VITE_CONVEX_URL") ?? "";
  const convexSiteUrl =
    firstEnv("CONVEXPRESS_CONVEX_SITE_URL", "VITE_CONVEX_SITE_URL") ??
    deriveConvexSiteUrl(convexUrl);
  return {
    convexUrl,
    convexSiteUrl,
    siteUrl: firstEnv("CONVEXPRESS_SITE_URL", "VITE_APP_URL", "VITE_PUBLIC_APP_URL"),
    adminAppUrl: firstEnv("CONVEXPRESS_ADMIN_APP_URL", "VITE_ADMIN_APP_URL"),
    instanceKey: firstEnv("CONVEXPRESS_INSTANCE_KEY"),
    clerkPublishableKey: firstEnv(
      "CONVEXPRESS_CLERK_PUBLISHABLE_KEY",
      "VITE_CLERK_PUBLISHABLE_KEY",
    ),
  };
}

/** The Convex origins for the server's own requests. */
export interface ServerConvexOrigins {
  /** Deployment origin for queries, mutations and storage. */
  convexUrl: string;
  /** HTTP-actions origin. */
  convexSiteUrl?: string;
}

/**
 * Where this server process sends its own requests to the backend: server
 * rendering, redirect lookups, feeds, sitemaps and file downloads. With
 * CONVEXPRESS_CONVEX_SERVER_URL set (and CONVEXPRESS_CONVEX_SERVER_SITE_URL,
 * else derived from it) that is the private address, so a server render
 * doesn't go out to the public edge and back for each query. Otherwise it is
 * the public address the browser uses.
 */
export function readServerConvexOrigins(): ServerConvexOrigins {
  const privateUrl = firstEnv("CONVEXPRESS_CONVEX_SERVER_URL");
  if (privateUrl) {
    return {
      convexUrl: privateUrl,
      convexSiteUrl: firstEnv("CONVEXPRESS_CONVEX_SERVER_SITE_URL") ?? deriveConvexSiteUrl(privateUrl),
    };
  }
  const { convexUrl, convexSiteUrl } = getSiteRuntime();
  return { convexUrl, convexSiteUrl };
}

/** The deployment URL for a request made from here: the server's own origin on the server, the public one in the browser. */
export function getRequestConvexUrl(): string {
  return typeof window === "undefined" ? readServerConvexOrigins().convexUrl : getSiteRuntime().convexUrl;
}

function readBuildTimeFallback(): SiteRuntimeConfig {
  // Vite types `import.meta.env`; it is absent outside a Vite/Bun runtime.
  const env: Partial<Record<string, string>> = import.meta.env ?? {};
  const convexUrl = env.VITE_CONVEX_URL ?? "";
  return {
    convexUrl,
    convexSiteUrl: env.VITE_CONVEX_SITE_URL ?? deriveConvexSiteUrl(convexUrl),
    siteUrl: env.VITE_APP_URL ?? env.VITE_PUBLIC_APP_URL,
    adminAppUrl: env.VITE_ADMIN_APP_URL,
    clerkPublishableKey: env.VITE_CLERK_PUBLISHABLE_KEY,
  };
}

/**
 * The active site configuration, on either side of the SSR boundary.
 * Safe to call during render: it never throws and never touches the network.
 */
export function getSiteRuntime(): SiteRuntimeConfig {
  if (typeof window !== "undefined") {
    return window[SITE_RUNTIME_GLOBAL] ?? readBuildTimeFallback();
  }
  const server = readServerSiteRuntime();
  return server.convexUrl ? server : readBuildTimeFallback();
}

/** Inline script that publishes the configuration to the client. */
export function siteRuntimeBootstrapScript(config: SiteRuntimeConfig): string {
  const json = JSON.stringify(config).replace(/</g, "\\u003c");
  return `window.${SITE_RUNTIME_GLOBAL}=${json};`;
}
