/**
 * ConvexPress Forms — merge-tag resolvers.
 *
 * TWO resolvers live here, intentionally:
 *
 *   1. LEGACY (Form Notification System) — `resolveMergeTags(template,
 *      MergeContext)`. A tiny payload-keyed resolver consumed TODAY by
 *      `notifications.ts`. Keyed by field NAME, derived from an event payload.
 *      KEPT AS-IS (never-remove rule): `notifications.ts` depends on this exact
 *      signature + `isValidEmail` + `MergeContext`.
 *
 *   2. CANONICAL (Form Merge Tags & Prefill System) —
 *      `resolveMergeTagsForSink(template, MergeTagContext, { sink })`. The
 *      sink-aware, allowlisted, escape-at-the-boundary resolver this system
 *      owns. Keyed by field KEY, takes a projected `MergeTagContext` (no Convex
 *      ctx). See the block comment above its definition below. New consumers
 *      (Notification/Confirmation Phase 4) target THIS one.
 *
 * Unknown / empty tokens render to an empty string (never crash, never leave
 * the literal token in the output) in both.
 */

import type { Doc } from "../../_generated/dataModel";
// The built-in token catalog (§4) as a plain data array. `mergeTags.tokens`
// type-imports from this module only, so there is no runtime import cycle.
import { BUILTIN_TOKENS } from "./mergeTags.tokens";

/**
 * Lightweight email-shape check. Mirrors the regex used by the Email system
 * (`emails/actions.ts` line 7 / `helpers/email.ts isValidEmail`). Kept local so
 * the dispatch action can validate a resolved `to` without importing the email
 * helper module.
 */
export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export interface MergeContext {
  form: Doc<"forms">;
  /** Submitted answers keyed by field NAME (merge tags reference name). */
  valueByName: Record<string, string>;
  /** The parsed event payload (formId/submissionId/resumeToken/error/…). */
  payload: Record<string, unknown>;
  settings: { adminEmail: string; siteUrl: string };
}

function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return value === undefined || value === null ? "" : String(value);
}

function buildResumeUrl(ctx: MergeContext): string {
  const token = payloadString(ctx.payload, "resumeToken");
  if (!token) return "";
  const base = (ctx.settings.siteUrl || "").replace(/\/$/, "");
  const path = `/forms/${ctx.form.slug}?resume=${encodeURIComponent(token)}`;
  return base ? `${base}${path}` : path;
}

function buildAdminEntryUrl(ctx: MergeContext): string {
  const submissionId = payloadString(ctx.payload, "submissionId");
  return `/admin/forms/${ctx.form._id}/entries/${submissionId}`;
}

function buildSubmissionDate(ctx: MergeContext): string {
  const raw = ctx.payload.submittedAt;
  const ms = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

/** A simple <br>-joined "Name: value" list of all submitted answers. */
function buildAllFields(ctx: MergeContext): string {
  const entries = Object.entries(ctx.valueByName);
  if (entries.length === 0) return "";
  return entries
    .map(([name, value]) => `<strong>${escapeHtml(name)}:</strong> ${escapeHtml(value)}`)
    .join("<br>");
}

/** Minimal HTML escaping for interpolated values inside the {all_fields} list. */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Resolve a `namespace:arg` token to its string value (or "" if unknown). */
function resolveToken(namespace: string, arg: string, ctx: MergeContext): string {
  switch (namespace) {
    case "field":
      return ctx.valueByName[arg] ?? "";
    case "form":
      if (arg === "title") return ctx.form.title;
      if (arg === "resume_url") return buildResumeUrl(ctx);
      if (arg === "admin_entry_url") return buildAdminEntryUrl(ctx);
      return "";
    case "settings":
      if (arg === "admin_notification_email") return ctx.settings.adminEmail;
      return "";
    case "submission":
      if (arg === "id") return payloadString(ctx.payload, "submissionId");
      if (arg === "date") return buildSubmissionDate(ctx);
      return "";
    case "action":
      if (arg === "error") return payloadString(ctx.payload, "error");
      return "";
    default:
      return "";
  }
}

/**
 * Resolve all merge tags in a template string. Synchronous string -> string.
 * A single regex pass handles `{namespace:arg}` tokens; the no-arg
 * `{all_fields}` token is handled separately.
 */
export function resolveMergeTags(
  template: string | undefined,
  ctx: MergeContext,
): string {
  if (!template) return "";

  // No-arg token first.
  let output = template.replace(/\{all_fields\}/g, () => buildAllFields(ctx));

  // `{namespace:arg}` tokens. namespace is [a-z_]+, arg is anything but `}`.
  output = output.replace(/\{([a-z_]+):([^}]+)\}/g, (_match, namespace, arg) =>
    resolveToken(namespace, arg, ctx),
  );

  return output;
}

// ════════════════════════════════════════════════════════════════════════════
// CANONICAL — Form Merge Tags & Prefill System (sink-aware, allowlisted).
//
// A PURE template interpolator that runs inside the Submission System's
// post-submit pipeline. It does NOT take a Convex `ctx`: the caller assembles a
// projected `MergeTagContext` (it owns the `submission`; projects
// `form`/`user`/`request`/`site`) and passes it in.
//
// SECURITY MODEL (the injection + PII boundary is enforced HERE, not by callers):
//   - Allowlist only: every token is matched against `TOKEN_REGISTRY` (or the
//     field-key shorthand, gated on a real `ctx.form.fields[].key`). An unknown
//     token resolves to "" — never reflected, never throws.
//   - Per-sink escaping: every substituted value passes through `escapeForSink`
//     (HTML-escape for email-html, encodeURIComponent for url, raw for
//     plain/email-text). A submitted `<script>` or `"` cannot inject HTML or
//     break a URL.
//   - Sensitive guard: a token marked `sensitive` resolves to "" on any PUBLIC
//     sink (email-html / email-text / url) — only `plain` (server-internal) may
//     see it. PII like a user id never leaks into an email/redirect.
//   - Blocklist by omission: there is no `{request:ip}`, no secret/credential
//     token, no `{eval:…}`/`{php:…}`. `password`-type field values are never
//     rendered.
//
// Extensibility: `registerToken(def)` appends to the allowlist without forking.
// ════════════════════════════════════════════════════════════════════════════

/** A form field projected into the merge context (no authoring metadata). */
export interface MergeTagField {
  key: string;
  name: string;
  label: string;
  type: string;
}

/** Output destination — drives the escaping applied to every substitution. */
export type MergeOutputSink = "plain" | "email-html" | "email-text" | "url";

/**
 * The projected context the canonical resolver reads. The Submission System
 * assembles it (it owns `submission`; projects the rest). No Convex `ctx`.
 */
export interface MergeTagContext {
  /** Answer map keyed by field `key` → the stored STRING value. */
  values: Record<string, string>;
  /** Projected field defs (key/name/label/type) — the field-shorthand allowlist. */
  form: {
    id?: string;
    title?: string;
    slug?: string;
    fields: MergeTagField[];
  };
  /** The submission row projection (id/date). */
  entry?: {
    id?: string;
    submittedAt?: number;
  };
  /** Acting user projection (empty for anonymous guests). */
  user?: {
    id?: string;
    email?: string;
    displayName?: string;
    role?: string;
  };
  /** Request projection — embed url + referer ONLY (never ip). */
  request?: {
    embedUrl?: string;
    referer?: string;
  };
  /** Site projection. */
  site?: {
    name?: string;
    url?: string;
  };
}

/** A registered token. `resolve` returns the RAW value; escaping is applied
 *  centrally after this returns (unless `preEscaped`). */
export interface TokenDefinition {
  /** A literal token name (e.g. "form:title") OR a RegExp matched against the
   *  inner expression (without braces). First matching def in order wins. */
  pattern: string | RegExp;
  description: string;
  /** When true, the token resolves to "" on any PUBLIC sink (PII guard). */
  sensitive?: boolean;
  /**
   * When true, the token's `resolve` already produced sink-appropriate output
   * (it built its OWN markup per sink and escaped its own interpolated cells),
   * so the central resolver SKIPS `escapeForSink` for it — preventing
   * double-escaping. Only sink-shaped tokens like `{all_fields}` set this.
   */
  preEscaped?: boolean;
  /** Produce the raw (unescaped) replacement. `arg` is the part after the
   *  first `:`. `sink` is provided for sink-shaped tokens (e.g. {all_fields}). */
  resolve: (
    ctx: MergeTagContext,
    arg: string | undefined,
    sink: MergeOutputSink,
  ) => string;
}

export interface ResolveOptions {
  sink?: MergeOutputSink;
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape a raw value for the target sink. THIS is the injection boundary —
 * enforced inside the resolver for every substitution, never delegated.
 */
export function escapeForSink(value: string, sink: MergeOutputSink): string {
  const s = String(value ?? "");
  switch (sink) {
    case "email-html":
      return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
    case "url":
      return encodeURIComponent(s);
    case "plain":
    case "email-text":
    default:
      return s;
  }
}

/** A PUBLIC sink leaves the server (email / redirect). `plain` is
 *  server-internal and may see sensitive values. */
export function isPublicSink(sink: MergeOutputSink): boolean {
  return sink !== "plain";
}

/** Ordered allowlist. `registerToken` appends; first match wins. */
export const TOKEN_REGISTRY: TokenDefinition[] = [];

/** Append a token definition to the allowlist (additive, no fork). */
export function registerToken(def: TokenDefinition): void {
  TOKEN_REGISTRY.push(def);
}

/**
 * Split an inner expression `name:arg` into `{ name, arg }`. Only the FIRST
 * colon separates name from arg.
 */
function splitExpr(expr: string): { name: string; arg?: string } {
  const idx = expr.indexOf(":");
  if (idx === -1) return { name: expr.trim() };
  return { name: expr.slice(0, idx).trim(), arg: expr.slice(idx + 1) };
}

/**
 * Look up a token definition for an inner expression. Registry patterns first
 * (literal name OR RegExp against the whole expr); then field-key shorthand
 * `{<key>}` / `{field:<key>}` resolves ONLY if `<key>` is a real
 * `ctx.form.fields[].key` (and not a `password` field) — else null.
 */
export function lookupToken(
  expr: string,
  ctx: MergeTagContext,
): { def: TokenDefinition; arg?: string } | null {
  ensureBuiltins();
  const trimmed = expr.trim();
  const { name, arg } = splitExpr(trimmed);

  for (const def of TOKEN_REGISTRY) {
    if (typeof def.pattern === "string") {
      if (def.pattern === name) return { def, arg };
    } else if (def.pattern.test(trimmed)) {
      return { def, arg };
    }
  }

  const fieldKeys = new Set(ctx.form.fields.map((f) => f.key));
  const isPassword = (key: string) =>
    ctx.form.fields.find((f) => f.key === key)?.type === "password";

  if (name === "field" && arg && fieldKeys.has(arg) && !isPassword(arg)) {
    return {
      def: {
        pattern: "field",
        description: "A submitted field value by key.",
        resolve: (c) => c.values[arg] ?? "",
      },
      arg,
    };
  }
  if (!arg && fieldKeys.has(name) && !isPassword(name)) {
    return {
      def: {
        pattern: name,
        description: "A submitted field value by key (shorthand).",
        resolve: (c) => c.values[name] ?? "",
      },
    };
  }

  return null;
}

/**
 * Seed the built-in token catalog (§4) into `TOKEN_REGISTRY` ONCE. The catalog
 * lives in `mergeTags.tokens` as a plain `BUILTIN_TOKENS` data array with only
 * TYPE imports from this module — so the runtime import cycle is broken and we
 * seed eagerly + idempotently. Called on first resolve/lookup.
 */
let builtinsRegistered = false;
function ensureBuiltins(): void {
  if (builtinsRegistered) return;
  builtinsRegistered = true;
  // Prepend so built-ins keep their authored precedence, while any tokens added
  // via registerToken() BEFORE first resolve still come after the built-ins.
  for (const def of BUILTIN_TOKENS) {
    if (!TOKEN_REGISTRY.includes(def)) TOKEN_REGISTRY.push(def);
  }
}

/**
 * CANONICAL resolver. Resolve every `{token}` in a template against a projected
 * context, escaping each substitution for the target sink. Single pass; unknown
 * token → "" (never reflect, never throw); sensitive token on a public sink → "".
 * Default sink `"plain"`.
 */
export function resolveMergeTagsForSink(
  template: string,
  ctx: MergeTagContext,
  opts: ResolveOptions = {},
): string {
  ensureBuiltins();
  if (!template) return "";
  const sink = opts.sink ?? "plain";

  return template.replace(/\{([^{}]+)\}/g, (_match, inner: string) => {
    let hit: { def: TokenDefinition; arg?: string } | null = null;
    try {
      hit = lookupToken(inner, ctx);
    } catch {
      hit = null;
    }
    if (!hit) return ""; // unknown token — drop, never reflect

    if (hit.def.sensitive && isPublicSink(sink)) return "";

    let raw: string;
    try {
      raw = hit.def.resolve(ctx, hit.arg, sink) ?? "";
    } catch {
      raw = "";
    }
    // A `preEscaped` token built its own sink-appropriate output (and escaped
    // its own cells) — do NOT double-escape it. Everything else passes through
    // the injection boundary.
    return hit.def.preEscaped ? raw : escapeForSink(raw, sink);
  });
}

/**
 * Pure projector the Submission System MAY call to assemble a `MergeTagContext`
 * from its own loaded docs. Never touches the DB — it only shapes already-loaded
 * pieces. Co-located so the projection shape lives with the resolver.
 */
export function buildMergeTagContext(input: {
  values: Record<string, string>;
  form: { id?: string; title?: string; slug?: string; fields: MergeTagField[] };
  entry?: { id?: string; submittedAt?: number };
  user?: { id?: string; email?: string; displayName?: string; role?: string };
  request?: { embedUrl?: string; referer?: string };
  site?: { name?: string; url?: string };
}): MergeTagContext {
  return {
    values: input.values,
    form: input.form,
    entry: input.entry,
    user: input.user,
    request: input.request,
    site: input.site,
  };
}

/**
 * Public hook to force the built-in catalog to register (e.g. before calling
 * `lookupToken` directly). `resolveMergeTagsForSink` already calls this; most
 * consumers never need it.
 */
export function ensureBuiltinTokens(): void {
  ensureBuiltins();
}
