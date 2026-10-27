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
//   CONVEXPRESS_CONVEX_SERVER_URL      the same backend at a private address (same machine or
//                                      network), for the server's own requests; the browser keeps
//                                      CONVEXPRESS_CONVEX_URL. Optional, with
//   CONVEXPRESS_CONVEX_SERVER_SITE_URL its HTTP actions (default: its port + 1)
//   CONVEXPRESS_FRAME_ANCESTORS   origins allowed to frame the site (admin previews); default none
//   CONVEXPRESS_CSP_EXTRA         extra CSP sources, as "directive source …; directive source …"
//   CONVEXPRESS_CSP_ENFORCE       "true" enforces the full policy; otherwise it is report-only
//                                 (frame-ancestors, base-uri and object-src are always enforced)
//   plus whatever the site declares under "start" in apps/web/site-env.json
//
// Text assets (scripts, styles, SVG, JSON…) go out compressed when the browser
// accepts it (Brotli, else gzip). Each is compressed once and kept in memory:
// files under /assets are content-hashed, and the process restarts on deploy.
// GET /healthz answers 200 without touching the backend.
// POST /__csp-report takes the browser's Content-Security-Policy violation
// reports (the policy's report-uri) and logs each distinct one once an hour,
// with no query strings, so a site can see what enforcing would break.
// ============================================================================

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";

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
  const serverConvexUrl = url("CONVEXPRESS_CONVEX_SERVER_URL", { required: false });
  url("CONVEXPRESS_CONVEX_SERVER_SITE_URL", { required: false });
  if (env.CONVEXPRESS_CONVEX_SERVER_SITE_URL && !env.CONVEXPRESS_CONVEX_SERVER_URL) problems.push("CONVEXPRESS_CONVEX_SERVER_SITE_URL is set without CONVEXPRESS_CONVEX_SERVER_URL");
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
    serverConvexUrl,
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
    "script-src": ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://*.js.stripe.com", "https://challenges.cloudflare.com", ...(clerk ? [clerk] : [])],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "blob:", "https:"],
    "connect-src": ["'self'", ...convex, ...convexSite, "https://api.stripe.com", "https://*.stripe.com", ...(clerk ? [clerk] : []), "https://clerk-telemetry.com"],
    // Stripe.js's documented hosts: its frames come from js.stripe.com and *.js.stripe.com.
    "frame-src": ["'self'", "https://js.stripe.com", "https://*.js.stripe.com", "https://hooks.stripe.com", "https://challenges.cloudflare.com", ...(clerk ? [clerk] : [])],
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
  const report = `; report-uri ${CSP_REPORT_PATH}`;
  return {
    enforced: render(config.cspEnforce ? Object.keys(directives) : always) + report,
    reportOnly: config.cspEnforce ? undefined : render(Object.keys(directives).filter((name) => !always.includes(name))) + report,
  };
}

export const CSP_REPORT_PATH = "/__csp-report";
const MAX_REPORT_BYTES = 16 * 1024;
const REPORT_QUIET_MS = 60 * 60 * 1000;

/** A URL as an origin and path only: reports never log query strings or fragments. */
function withoutQuery(value) {
  if (typeof value !== "string" || value === "") return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return value.slice(0, 40);
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? `${url.origin}${url.pathname}` : url.protocol.replace(/:$/, "");
  } catch {
    return "";
  }
}

/**
 * The violations in a report body: report-uri sends {"csp-report": {...}};
 * the Reporting API sends [{type: "csp-violation", body: {...}}].
 */
export function cspViolations(body) {
  const entries = Array.isArray(body) ? body.filter((entry) => entry?.type === "csp-violation").map((entry) => entry.body) : [body?.["csp-report"]];
  return entries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      disposition: entry.disposition === "enforce" ? "enforce" : "report",
      directive: String(entry["effective-directive"] ?? entry.effectiveDirective ?? entry["violated-directive"] ?? "").slice(0, 60),
      blocked: withoutQuery(entry["blocked-uri"] ?? entry.blockedURL),
      page: (() => {
        const page = withoutQuery(entry["document-uri"] ?? entry.documentURL);
        try {
          return new URL(page).pathname;
        } catch {
          return page;
        }
      })(),
      source: withoutQuery(entry["source-file"] ?? entry.sourceFile),
    }))
    .filter((violation) => violation.directive !== "");
}

/** Logs each distinct violation at most once per quiet period; returns the lines it logged. */
export function cspReportLogger(log = console.warn, now = () => Date.now()) {
  const lastLogged = new Map();
  return (violations) => {
    const lines = [];
    for (const violation of violations) {
      const line = `[csp] ${violation.disposition} ${violation.directive} blocked ${violation.blocked || "(inline)"} on ${violation.page}${violation.source ? ` from ${violation.source}` : ""}`;
      const last = lastLogged.get(line);
      if (last !== undefined && now() - last < REPORT_QUIET_MS) continue;
      if (lastLogged.size > 500) lastLogged.clear();
      lastLogged.set(line, now());
      log(line);
      lines.push(line);
    }
    return lines;
  };
}

/** Read a CSP report request: JSON under the size limit, or nothing. */
export async function readCspReport(request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_REPORT_BYTES) return [];
  const text = await request.text();
  if (text.length > MAX_REPORT_BYTES) return [];
  try {
    return cspViolations(JSON.parse(text));
  } catch {
    return [];
  }
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

const COMPRESSIBLE = /\.(?:js|mjs|css|svg|json|map|txt|xml|webmanifest|html|wasm)$/i;
const MIN_COMPRESS_BYTES = 1024;
const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/** The encoding to send for an Accept-Encoding header: "br", "gzip" or null. */
export function preferredEncoding(acceptEncoding) {
  const offered = new Map();
  for (const part of String(acceptEncoding ?? "").split(",")) {
    const [name, ...params] = part.trim().toLowerCase().split(";").map((piece) => piece.trim());
    if (!name) continue;
    const quality = params.find((param) => param.startsWith("q="));
    offered.set(name, quality === undefined ? 1 : Number(quality.slice(2)));
  }
  for (const encoding of ["br", "gzip"]) if ((offered.get(encoding) ?? 0) > 0) return encoding;
  return null;
}

/**
 * The byte span a Range header asks for, for one file of `size` bytes:
 * { start, end } (inclusive), "unsatisfiable", or null when the header isn't a
 * single bytes range (the whole file is sent). Safari won't play a <video>
 * whose server answers its range requests with the whole file.
 */
export function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec((header ?? "").trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start;
  let end;
  if (match[1] === "") {
    // A suffix: the last N bytes.
    const length = Number(match[2]);
    if (length === 0) return "unsatisfiable";
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

/** Whether a static file is worth sending compressed (text formats, 1 KiB and up). */
export function compressible(path, size) {
  return COMPRESSIBLE.test(path) && size >= MIN_COMPRESS_BYTES;
}

/** Compressed copies of static files, made once per file and encoding. */
export function compressedFiles() {
  const cache = new Map();
  return (path, encoding, stat) => {
    const key = `${encoding}:${path}:${stat.size}:${stat.mtimeMs}`;
    let entry = cache.get(key);
    if (!entry) {
      entry = Bun.file(path).arrayBuffer().then((data) => {
        const input = Buffer.from(data);
        return encoding === "br"
          ? brotliAsync(input, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9, [zlibConstants.BROTLI_PARAM_SIZE_HINT]: input.byteLength } })
          : gzipAsync(input, { level: 9 });
      });
      cache.set(key, entry);
      entry.catch(() => cache.delete(key));
    }
    return entry;
  };
}

/** Compress every hashed asset in the background after start, so the first visitor after a deploy isn't the one who waits. */
async function warmCompressedAssets(compressed) {
  const dir = join(CLIENT_DIR, "assets");
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (!stat.isFile() || !compressible(path, stat.size)) continue;
    for (const encoding of ["br", "gzip"]) await compressed(path, encoding, stat).catch(() => undefined);
  }
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
  const logCspReport = cspReportLogger();
  const compressed = compressedFiles();

  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/healthz") {
        return new Response("ok\n", { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store", ...headers } });
      }
      if (url.pathname === CSP_REPORT_PATH) {
        if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST", ...headers } });
        logCspReport(await readCspReport(request));
        return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", ...headers } });
      }
      if (request.method === "GET" || request.method === "HEAD") {
        const file = url.pathname === "/" ? null : staticFile(CLIENT_DIR, url.pathname);
        if (file) {
          const immutable = url.pathname.startsWith("/assets/");
          const caching = { "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600" };
          const stat = statSync(file);
          // A range request (a video seeking, Safari above all) gets just those bytes.
          const range = request.headers.has("range") ? byteRange(request.headers.get("range"), stat.size) : null;
          if (range === "unsatisfiable") {
            return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}`, ...caching, ...headers } });
          }
          if (range) {
            return new Response(request.method === "HEAD" ? null : Bun.file(file).slice(range.start, range.end + 1), {
              status: 206,
              headers: {
                "Content-Type": Bun.file(file).type,
                "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
                "Content-Length": String(range.end - range.start + 1),
                "Accept-Ranges": "bytes",
                ...caching,
                ...headers,
              },
            });
          }
          if (!compressible(file, stat.size)) return new Response(Bun.file(file), { headers: { "Accept-Ranges": "bytes", ...caching, ...headers } });
          // A range request gets the file as stored; everything else the best encoding the browser takes.
          const encoding = request.headers.has("range") ? null : preferredEncoding(request.headers.get("accept-encoding"));
          const varied = { ...caching, Vary: "Accept-Encoding", ...headers };
          if (!encoding) return new Response(Bun.file(file), { headers: varied });
          const body = await compressed(file, encoding, stat);
          return new Response(request.method === "HEAD" ? null : body, {
            headers: { "Content-Type": Bun.file(file).type, "Content-Encoding": encoding, "Content-Length": String(body.byteLength), ...varied },
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
  const backend = config.serverConvexUrl ? `, backend at ${config.serverConvexUrl.origin}` : "";
  console.log(`[website] ${config.siteUrl.origin} on http://${server.hostname}:${server.port} (instance ${process.env.CONVEXPRESS_INSTANCE_KEY}${backend})`);
  setTimeout(() => void warmCompressedAssets(compressed), 0);

  const stop = () => {
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

if (import.meta.main) await main();
