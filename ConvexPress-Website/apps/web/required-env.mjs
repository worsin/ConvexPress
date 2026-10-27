// ============================================================================
// Site-declared environment
// ============================================================================
// A site can name the environment it can't run without in
// apps/web/site-env.json. A production build (vite build) checks the "build"
// variables, which are compiled into the client; the server start
// (scripts/serve.mjs) checks the "start" ones. Each failure names the
// variable and says what it is for, so a deploy stops instead of shipping a
// site that silently falls back to somewhere wrong. Without the file nothing
// is checked beyond ConvexPress's own runtime configuration.
//
//   {
//     "build": {
//       "VITE_PORTAL_URL": { "format": "url", "description": "Where customers' app lives" },
//       "VITE_AFTER_SIGN_IN_PATH": { "format": "path", "oneOf": ["/portal-redirect"] }
//     },
//     "start": { "CONVEXPRESS_CLERK_PUBLISHABLE_KEY": { "format": "text", "pattern": "^pk_(test|live)_" } }
//   }
//
// Formats: "url" (http or https), "path" (a path on this site), "hosts"
// (comma-separated host names), "text" (anything not blank).
// ============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SITE_ENV_FILE = "site-env.json";

const FORMATS = new Set(["url", "path", "hosts", "text"]);
const NAME = /^[A-Z][A-Z0-9_]*$/;

/** Read and check apps/web/site-env.json; null when the site declares nothing. */
export function readSiteEnvSpec(appDir) {
  const file = join(appDir, SITE_ENV_FILE);
  if (!existsSync(file)) return null;
  const spec = JSON.parse(readFileSync(file, "utf8"));
  const problems = specProblems(spec);
  if (problems.length > 0) throw new Error(`${SITE_ENV_FILE} is invalid:\n  - ${problems.join("\n  - ")}`);
  return spec;
}

function specProblems(spec) {
  const problems = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return ["it must be an object with \"build\" and/or \"start\""];
  for (const [phase, entries] of Object.entries(spec)) {
    if (phase !== "build" && phase !== "start") {
      problems.push(`"${phase}" isn't a phase (use "build" or "start")`);
      continue;
    }
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
      problems.push(`"${phase}" must map variable names to rules`);
      continue;
    }
    for (const [name, rule] of Object.entries(entries)) {
      if (!NAME.test(name)) problems.push(`${phase}.${name}: a variable name is upper case`);
      if (!rule || typeof rule !== "object" || !FORMATS.has(rule.format)) problems.push(`${phase}.${name}: "format" must be url, path, hosts or text`);
      if (rule?.oneOf !== undefined && !(Array.isArray(rule.oneOf) && rule.oneOf.length > 0 && rule.oneOf.every((v) => typeof v === "string"))) {
        problems.push(`${phase}.${name}: "oneOf" must list strings`);
      }
      if (rule?.pattern !== undefined) {
        try {
          new RegExp(rule.pattern);
        } catch {
          problems.push(`${phase}.${name}: "pattern" isn't a regular expression`);
        }
      }
    }
  }
  return problems;
}

function formatProblem(format, value) {
  if (format === "url") {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? null : "must be an http(s) URL";
    } catch {
      return "must be an http(s) URL";
    }
  }
  if (format === "path") return /^\/(?![/\\])[^\s\\]*$/.test(value) ? null : "must be a path on this site, starting with /";
  if (format === "hosts") {
    const hosts = value.split(",").map((host) => host.trim()).filter(Boolean);
    return hosts.length > 0 && hosts.every((host) => /^[a-z0-9.-]+(:\d+)?$/i.test(host)) ? null : "must list host names, comma-separated";
  }
  return null;
}

/** What is missing or malformed for one phase, one line per variable. */
export function siteEnvProblems(spec, phase, env) {
  const entries = spec?.[phase] ?? {};
  const problems = [];
  for (const [name, rule] of Object.entries(entries)) {
    const value = (env[name] ?? "").trim();
    const purpose = rule.description ? ` (${rule.description})` : "";
    if (!value) {
      problems.push(`${name} is required${purpose}`);
      continue;
    }
    const problem =
      formatProblem(rule.format, value) ??
      (rule.oneOf && !rule.oneOf.includes(value) ? `must be ${rule.oneOf.join(" or ")}` : null) ??
      (rule.pattern && !new RegExp(rule.pattern).test(value) ? `doesn't match ${rule.pattern}` : null);
    if (problem) problems.push(`${name} ${problem}${purpose}`);
  }
  return problems;
}

/**
 * Vite plugin: a production build stops when the site's "build" environment
 * is missing or malformed. Values come from the process and Vite's .env files.
 */
export function requiredSiteEnv({ appDir, loadEnv }) {
  return {
    name: "convexpress:required-site-env",
    config(_config, { command, mode }) {
      if (command !== "build" || mode !== "production") return;
      const spec = readSiteEnvSpec(appDir);
      if (!spec) return;
      const env = { ...loadEnv(mode, appDir, ""), ...process.env };
      const problems = siteEnvProblems(spec, "build", env);
      if (problems.length > 0) {
        throw new Error(`This site can't be built without its environment (apps/web/${SITE_ENV_FILE}):\n  - ${problems.join("\n  - ")}`);
      }
    },
  };
}
