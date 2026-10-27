#!/usr/bin/env bun
// ============================================================================
// Self-hosted website runtime (Bun)
// ============================================================================
// Serves a built website (`bun run build` in apps/web) from one long-running
// process: client assets from apps/web/dist/client, every other request through
// the TanStack Start server handler. One process serves one site; the site's
// configuration is read from the environment when the process starts (see
// apps/web/src/lib/site-runtime.ts). Bun loads `.env`, `.env.production` and
// `.env.local` from the working directory.
//
//   PORT=4051 bun scripts/serve.mjs        # from the website workspace root
//
// Environment:
//   PORT (3000), HOST (127.0.0.1)
//   CONVEXPRESS_CONVEX_URL, CONVEXPRESS_SITE_URL, CONVEXPRESS_INSTANCE_KEY   required
//   CONVEXPRESS_CONVEX_SITE_URL, CONVEXPRESS_CLERK_PUBLISHABLE_KEY          optional
//   CONVEXPRESS_FRAME_ANCESTORS   origins allowed to frame the site (admin previews); default none
//   CONVEXPRESS_CSP_EXTRA         extra CSP sources, as "directive source …; directive source …"
//   CONVEXPRESS_CSP_ENFORCE       "true" enforces the full policy; otherwise it is report-only
//                                 (frame-ancestors, base-uri and object-src are always enforced)
//   plus whatever the site declares under "start" in apps/web/site-env.json
//
// GET /healthz answers 200 without touching the backend.
// ============================================================================

import { existsSync, statSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { readSiteEnvSpec, siteEnvProblems } from "../apps/web/required-env.mjs";

const ROOT = resolve(import.meta.dir, "..");
const APP_DIR = join(ROOT, "apps/web");
const CLIENT_DIR = join(ROOT, "apps/web/dist/client");
const SERVER_ENTRY = join(ROOT, "apps/web/dist/server/server.js");

/** The site's own "start" environment (apps/web/site-env.json); a broken file is a problem too. */
export function siteStartProblems(env = process.env, appDir = APP_DIR) {
  try {
    return siteEnvProblems(readSiteEnvSpec(appDir), "start", env);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

/** Parse and check the configuration; exit before listening when it is wrong. */
export function readConfig(env = process.env, appDir = APP_DIR) {
  const problems = [...siteStartProblems(env, appDir)];
  const url = (name, { required }) => {
    const raw = env[name];
    if (!raw) {
      if (required) problems.push(`${name} is required`);
      return undefined;
    }
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("scheme");
      return parsed;
    } catch {
      problems.push(`${name} must be an http(s) URL`);
      return undefined;
    }
  };
  const convexUrl = url("CONVEXPRESS_CONVEX_URL", { required: true });
  const siteUrl = url("CONVEXPRESS_SITE_URL", { required: true });
  const convexSiteUrl = url("CONVEXPRESS_CONVEX_SITE_URL", { required: false });
  const instanceKey = env.CONVEXPRESS_INSTANCE_KEY ?? "";
  if (!/^[-a-zA-Z0-9_:]{1,160}$/.test(instanceKey)) problems.push("CONVEXPRESS_INSTANCE_KEY is required (letters, digits, - _ :)");
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push("PORT must be a port number");
  const frameAncestors = (env.CONVEXPRESS_FRAME_ANCESTORS ?? "").split(/\s+/).filter(Boolean);
  for (const origin of frameAncestors) {
    if (!/^(https?:\/\/[^\s/]+|[a-z][a-z0-9+.-]*:(\/\/[^\s/]+)?)$/.test(origin)) problems.push(`CONVEXPRESS_FRAME_ANCESTORS: "${origin}" is not an origin`);
  }
  return {
    problems,
    host: env.HOST ?? "127.0.0.1",
    port,
    convexUrl,
    convexSiteUrl,
    siteUrl,
    clerkPublishableKey: env.CONVEXPRESS_CLERK_PUBLISHABLE_KEY ?? env.VITE_CLERK_PUBLISHABLE_KEY,
    frameAncestors,
    cspExtra: env.CONVEXPRESS_CSP_EXTRA ?? "",
    cspEnforce: env.CONVEXPRESS_CSP_ENFORCE === "true",
  };
}

/** The Clerk Frontend API host encoded in a publishable key (pk_test_/pk_live_ + base64 "host$"). */
export function clerkFrontendApi(publishableKey) {
  const match = /^pk_(test|live)_([A-Za-z0-9+/=_-]+)$/.exec(publishableKey ?? "");
  if (!match) return undefined;
  try {
    const decoded = Buffer.from(match[2], "base64").toString("utf8");
    const host = decoded.endsWith("$") ? decoded.slice(0, -1) : decoded;
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : undefined;
  } catch {
    return undefined;
  }
}

/** Content-Security-Policy directives for a site: its backend, Clerk, Stripe and Turnstile. */
export function contentSecurityPolicy(config) {
  const convex = config.convexUrl ? [config.convexUrl.origin, config.convexUrl.origin.replace(/^http/, "ws")] : [];
  const convexSite = config.convexSiteUrl ? [config.convexSiteUrl.origin] : [];
  const clerk = clerkFrontendApi(config.clerkPublishableKey);
  const directives = {
    "default-src": ["'self'"],
    // TanStack Start streams inline hydration scripts; nonces are a follow-up.
    "script-src": ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://challenges.cloudflare.com", ...(clerk ? [clerk] : [])],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "blob:", "https:"],
    "connect-src": ["'self'", ...convex, ...convexSite, "https://api.stripe.com", "https://*.stripe.com", ...(clerk ? [clerk] : []), "https://clerk-telemetry.com"],
    "frame-src": ["'self'", "https://js.stripe.com", "https://hooks.stripe.com", "https://challenges.cloudflare.com", ...(clerk ? [clerk] : [])],
    "worker-src": ["'self'", "blob:"],
    "form-action": ["'self'", ...(clerk ? [clerk] : [])],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": config.frameAncestors.length > 0 ? ["'self'", ...config.frameAncestors] : ["'none'"],
  };
  for (const part of config.cspExtra.split(";")) {
    const [directive, ...sources] = part.trim().split(/\s+/);
    if (!directive || sources.length === 0) continue;
    directives[directive] = [...(directives[directive] ?? []), ...sources];
  }
  const render = (names) => names.map((name) => `${name} ${[...new Set(directives[name])].join(" ")}`).join("; ");
  const always = ["frame-ancestors", "base-uri", "object-src"];
  return {
    enforced: render(config.cspEnforce ? Object.keys(directives) : always),
    reportOnly: config.cspEnforce ? undefined : render(Object.keys(directives).filter((name) => !always.includes(name))),
  };
}

export function securityHeaders(config) {
  const csp = contentSecurityPolicy(config);
  const headers = {
    "Content-Security-Policy": csp.enforced,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=(), payment=(self \"https://js.stripe.com\")",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  };
  if (csp.reportOnly) headers["Content-Security-Policy-Report-Only"] = csp.reportOnly;
  if (config.frameAncestors.length === 0) headers["X-Frame-Options"] = "DENY";
  if (config.siteUrl?.protocol === "https:") headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  return headers;
}

/** A file under the client build for this path, or null (no traversal, no directories). */
export function staticFile(clientDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const path = normalize(join(clientDir, decoded));
  if (path !== clientDir && !path.startsWith(clientDir + sep)) return null;
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  return stat.isFile() ? path : null;
}

function withHeaders(response, headers) {
  const merged = new Headers(response.headers);
  for (const [name, value] of Object.entries(headers)) if (!merged.has(name)) merged.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
}

async function main() {
  const config = readConfig();
  if (config.problems.length > 0) {
    console.error(`[website] cannot start:\n  - ${config.problems.join("\n  - ")}`);
    process.exit(1);
  }
  if (!existsSync(SERVER_ENTRY)) {
    console.error(`[website] cannot start: ${SERVER_ENTRY} is missing. Run \`bun run build\` in apps/web first.`);
    process.exit(1);
  }
  const { default: app } = await import(pathToFileURL(SERVER_ENTRY).href);
  const headers = securityHeaders(config);

  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/healthz") {
        return new Response("ok\n", { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store", ...headers } });
      }
      if (request.method === "GET" || request.method === "HEAD") {
        const file = url.pathname === "/" ? null : staticFile(CLIENT_DIR, url.pathname);
        if (file) {
          const immutable = url.pathname.startsWith("/assets/");
          return new Response(Bun.file(file), {
            headers: { "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600", ...headers },
          });
        }
      }
      try {
        return withHeaders(await app.fetch(request), headers);
      } catch (error) {
        console.error("[website] request failed", url.pathname, error);
        return new Response("Something went wrong on our side. Please try again.", { status: 500, headers: { "Content-Type": "text/plain", ...headers } });
      }
    },
  });
  console.log(`[website] ${config.siteUrl.origin} on http://${server.hostname}:${server.port} (instance ${process.env.CONVEXPRESS_INSTANCE_KEY})`);

  const stop = () => {
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

if (import.meta.main) await main();
