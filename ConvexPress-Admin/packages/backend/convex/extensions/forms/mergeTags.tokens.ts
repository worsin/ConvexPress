/**
 * Form Merge Tags — built-in token catalog (§4).
 *
 * Registers the canonical token set into `TOKEN_REGISTRY` (allowlist) on module
 * load. `mergeTags.ts` side-effect-imports this file at the bottom, so any
 * consumer of `resolveMergeTagsForSink` gets the full catalog.
 *
 * BLOCKLIST BY OMISSION (§4.1): there is deliberately NO `{request:ip}`, no
 * secret/credential token, no `{eval:…}`/`{php:…}`. `password`-type field values
 * are never rendered (the field-shorthand + `{all_fields}` resolvers skip them).
 *
 * Each `resolve` returns the RAW value; `resolveMergeTagsForSink` applies
 * `escapeForSink` centrally afterward — resolvers never pre-escape (except the
 * sink-shaped `{all_fields}`, which builds HTML vs text per sink and is
 * therefore responsible for escaping its OWN interpolated cell values).
 */

// TYPE-ONLY imports from ./mergeTags (erased at runtime ⇒ NO circular runtime
// cycle). The catalog is a plain `BUILTIN_TOKENS` data array consumed by
// mergeTags.ts. We import NO runtime values from mergeTags here (and inline the
// one HTML escape `{all_fields}` needs) so there is zero import cycle — this
// runs in Convex's ESM isolate as well as bun.
import type {
  TokenDefinition,
  MergeTagContext,
  MergeOutputSink,
} from "./mergeTags";

const HTML_ESCAPE_LOCAL: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
/** Local HTML escape (mirror of mergeTags.escapeForSink's email-html branch)
 *  so this catalog has no runtime import from mergeTags. */
function escapeHtmlLocal(value: string): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPE_LOCAL[ch] ?? ch);
}

// ─── Date formatting ────────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Format an epoch-ms timestamp by a format key. A bad/absent format falls back
 * to the default SHORT form (`mdy`), NOT empty (PRD §4). A non-finite ms → "".
 */
function formatDate(ms: number | undefined, fmt: string | undefined): string {
  const millis = typeof ms === "number" ? ms : Number(ms);
  if (!Number.isFinite(millis) || millis <= 0) return "";
  const d = new Date(millis);
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  switch ((fmt ?? "").toLowerCase()) {
    case "iso":
      return d.toISOString();
    case "dmy":
      return `${dd}/${mm}/${yyyy}`;
    case "long":
      return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${yyyy}`;
    case "now":
      // `{date:now}` is the ONE place the resolver reads the clock.
      return formatDate(Date.now(), "mdy");
    case "mdy":
    default:
      return `${mm}/${dd}/${yyyy}`;
  }
}

// ─── {all_fields} — sink-aware summary ──────────────────────────────────────

/**
 * Build a summary of all answered, value-bearing fields. Sink-shaped:
 *   - email-html → an HTML table (escaped cells);
 *   - everything else → `Label: value` lines.
 * Skips layout types, empty values, and `password` fields. Because this token
 * emits its OWN markup, it escapes its interpolated cells itself.
 */
const LAYOUT_OR_SKIP = new Set([
  "message",
  "accordion",
  "tab",
  "page_break",
  "captcha",
  "honeypot",
  "password",
]);

function buildAllFields(ctx: MergeTagContext, sink: MergeOutputSink): string {
  const rows: Array<{ label: string; value: string }> = [];
  for (const field of ctx.form.fields) {
    if (LAYOUT_OR_SKIP.has(field.type)) continue;
    const raw = ctx.values[field.key];
    if (raw === undefined || raw === "" || raw === "[]" || raw === "{}") continue;
    rows.push({ label: field.label || field.name || field.key, value: raw });
  }
  if (rows.length === 0) return "";

  if (sink === "email-html") {
    const body = rows
      .map(
        (r) =>
          `<tr><td><strong>${escapeHtmlLocal(r.label)}</strong></td>` +
          `<td>${escapeHtmlLocal(r.value)}</td></tr>`,
      )
      .join("");
    return `<table>${body}</table>`;
  }
  // plain / email-text / url all get the readable line form.
  return rows.map((r) => `${r.label}: ${r.value}`).join("\n");
}

// ─── The catalog (exported data array) ───────────────────────────────────────

// `{field:<key>}` + `{<key>}` shorthand are handled in `lookupToken` (gated on a
// real field key + non-password). The array below covers the SYSTEM tokens.
// Exported as plain data (no side-effects, no value import from mergeTags) so
// `mergeTags.ts` seeds its `TOKEN_REGISTRY` from it on init with zero import
// cycle. Order matters: the sensitive `{user:id}` override precedes generic
// `{user}` so it wins (first match in registry order).
export const BUILTIN_TOKENS: TokenDefinition[] = [
  {
    pattern: "all_fields",
    description:
      "Summary of all answered fields (HTML table for email-html, lines otherwise).",
    // Sink-shaped: builds its OWN markup + escapes its own cells. The central
    // resolver must not re-escape it (would double-escape the table tags).
    preEscaped: true,
    resolve: (ctx: MergeTagContext, _arg: string | undefined, sink: MergeOutputSink) =>
      buildAllFields(ctx, sink),
  },
  {
    pattern: "form",
    description: "Form metadata: title | id | slug.",
    resolve: (ctx: MergeTagContext, arg: string | undefined) => {
      switch (arg) {
        case "title":
          return ctx.form.title ?? "";
        case "id":
          return ctx.form.id ?? "";
        case "slug":
          return ctx.form.slug ?? "";
        default:
          return "";
      }
    },
  },
  {
    pattern: "entry",
    description: "Submission metadata: id | date.",
    resolve: (ctx: MergeTagContext, arg: string | undefined) => {
      if (arg === "id") return ctx.entry?.id ?? "";
      if (arg === "date") return formatDate(ctx.entry?.submittedAt, "mdy");
      return "";
    },
  },
  {
    pattern: /^date(:.*)?$/,
    description:
      "Date token: {date} or {date:mdy|dmy|iso|long|now}. Bad format → mdy.",
    resolve: (ctx: MergeTagContext, arg: string | undefined) => {
      if (arg === "now") return formatDate(Date.now(), "mdy");
      return formatDate(ctx.entry?.submittedAt ?? Date.now(), arg);
    },
  },
  // {user:id} — SENSITIVE. Precedes the generic `user` token so it wins; flagged
  // sensitive ⇒ blanked on any public sink (email/url), only `plain` sees it.
  {
    pattern: /^user:id$/,
    description: "Acting user id (SENSITIVE — blanked on public sinks).",
    sensitive: true,
    resolve: (ctx: MergeTagContext) => ctx.user?.id ?? "",
  },
  {
    pattern: "user",
    description: "Acting user: email | display_name | role.",
    resolve: (ctx: MergeTagContext, arg: string | undefined) => {
      switch (arg) {
        case "email":
          return ctx.user?.email ?? "";
        case "display_name":
          return ctx.user?.displayName ?? "";
        case "id":
          // Reached only on a `plain` sink (public sinks matched the sensitive
          // override above and were blanked). Server-internal use only.
          return ctx.user?.id ?? "";
        case "role":
          return ctx.user?.role ?? "";
        default:
          return "";
      }
    },
  },
  {
    pattern: "embed_url",
    description: "The URL the form was embedded on (request projection).",
    resolve: (ctx: MergeTagContext) => ctx.request?.embedUrl ?? "",
  },
  {
    pattern: "referer",
    description: "The HTTP referer of the submission (request projection).",
    resolve: (ctx: MergeTagContext) => ctx.request?.referer ?? "",
  },
  {
    pattern: "site",
    description: "Site metadata: name | url.",
    resolve: (ctx: MergeTagContext, arg: string | undefined) => {
      if (arg === "name") return ctx.site?.name ?? "";
      if (arg === "url") return ctx.site?.url ?? "";
      return "";
    },
  },
];
