/**
 * ConvexPress Forms — First-party P1 action types.
 *
 * Registers the framework-validating P1 types into the action registry:
 *   - `webhook`        — real outbound POST with optional HMAC signature.
 *   - `lead_capture`   — provider endpoint adapter (real config validation;
 *                        POSTs to the configured endpoint or fails cleanly when
 *                        creds are absent). Full provider SDKs are out of P1.
 *   - `email_marketing`— provider endpoint adapter (list + merge-field mapping).
 *
 * `account_registration` / `subscription` / `payment` are NOT here — the
 * Commerce & Subscription system registers `subscription` (and later `payment`)
 * via `commerce.ts`.
 *
 * This module MUST be imported once so its `registerActionType(...)` side
 * effects run. `actionRunner.ts` and `actions.ts` both side-effect import it so
 * the runner and the CRUD validator share one populated registry. `commerce.ts`
 * is imported alongside it (see `./actions` + `./actionRunner`).
 *
 * Uses Web `crypto.subtle` (available in the Convex action runtime) for the
 * HMAC so no Node `crypto` import is needed; `fetch` is the global one.
 */

import { z } from "zod";
import {
  registerActionType,
  type ActionTypeDefinition,
  type ActionResult,
  type ActionRunContext,
} from "./actionRegistry";

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Render a `{fieldKey}` template against the committed answer map. Unknown
 * tokens render empty. A `null`/absent template yields a JSON object of all
 * values (the default body). Pure + synchronous.
 */
function renderBodyTemplate(
  template: string | undefined,
  values: Record<string, string>,
): string {
  if (template === undefined || template === null) {
    return JSON.stringify(values);
  }
  return template.replace(/\{([a-zA-Z0-9_.:-]+)\}/g, (_match, key: string) => {
    const v = values[key];
    return v === undefined ? "" : v;
  });
}

/** HMAC-SHA256 the body with `secret`, returned as lowercase hex. */
async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** Map an HTTP status to a transient/permanent classification. */
function statusIsTransient(status: number): boolean {
  return status >= 500 || status === 429;
}

// ─── SSRF guard (outbound URL safety) ────────────────────────────────────────
//
// Action targets (webhook URL, lead_capture / email_marketing endpoint) are
// admin-configured, but an admin with `form.manage_actions` could still point a
// run at an internal host to coerce the Convex action runtime into making
// requests it shouldn't — the cloud-metadata endpoint (169.254.169.254), the
// loopback interface, or any RFC-1918 / link-local / unique-local address.
// This blocks the obvious literal-IP and well-known-hostname cases at BOTH
// config-validation time (a fast, greppable refine) and again right before the
// outbound `fetch` (defense in depth — config could have been written before
// this guard shipped). It is intentionally pure + synchronous and adds NO deps.
//
// Limits (documented, not silently swallowed): this is a literal-host check.
// It cannot stop a public hostname whose DNS *resolves* to a private address
// (classic DNS-rebinding / SSRF-via-resolution). Closing that fully needs a
// pinned-DNS fetch or an egress proxy, which is infrastructure the action
// runtime owns — see the security note in the test file. The require-https
// rule (webhook) already blunts plaintext-only internal services.

/** Lowercase, bracket-stripped hostname → true when it is a forbidden target. */
function hostIsBlocked(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "") return true;

  // Well-known non-routable / loopback hostnames.
  if (
    host === "localhost" ||
    host === "ip6-localhost" ||
    host === "ip6-loopback" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  // IPv6 loopback / unspecified, and IPv4-mapped IPv6 (::ffff:a.b.c.d).
  if (host === "::1" || host === "::" || host === "0:0:0:0:0:0:0:1") return true;
  // IPv4-mapped IPv6, dotted form (::ffff:a.b.c.d) — when supplied literally.
  const v4MappedDotted = host.match(
    /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/,
  );
  if (v4MappedDotted && v4MappedDotted[1]) {
    return ipv4IsBlocked(v4MappedDotted[1]);
  }
  // IPv4-mapped IPv6, hex form (::ffff:HHHH:HHHH) — what the WHATWG URL parser
  // normalizes ::ffff:a.b.c.d into. Decode the trailing 32 bits to a dotted
  // quad and range-check it (catches ::ffff:a9fe:a9fe == 169.254.169.254).
  const v4MappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (v4MappedHex && v4MappedHex[1] && v4MappedHex[2]) {
    const hi = parseInt(v4MappedHex[1], 16);
    const lo = parseInt(v4MappedHex[2], 16);
    const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return ipv4IsBlocked(dotted);
  }
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;

  // Bare IPv4 literal → range check.
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return ipv4IsBlocked(host);
  }

  return false;
}

/** True when a dotted-quad IPv4 string is loopback/private/link-local/etc. */
function ipv4IsBlocked(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    // Not a well-formed dotted quad — treat as suspicious (block).
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 ("this network")
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC-1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC-1918
  if (a === 192 && b === 168) return true; // RFC-1918
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC-6598)
  if (a >= 224) return true; // multicast (224/4) + reserved/broadcast (240/4, 255…)
  return false;
}

/**
 * True when `urlString` is a safe outbound target (parseable http(s) URL whose
 * host is not loopback/metadata/private/link-local). Used by the config refine
 * and re-checked before each fetch. Pure + synchronous; no DNS.
 */
export function isSafeOutboundUrl(urlString: string): boolean {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  return !hostIsBlocked(u.hostname);
}

/** SSRF-guard message reused by config refines + runtime checks. */
const SSRF_MESSAGE =
  "URL host is not allowed (loopback, metadata, or private network).";

// ─── webhook ─────────────────────────────────────────────────────────────────

const webhookConfigSchema = z.object({
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), {
      message: "Webhook URL must be https://",
    })
    .refine((u) => isSafeOutboundUrl(u), { message: SSRF_MESSAGE }),
  headers: z.record(z.string(), z.string()).optional(),
  secret: z.string().min(1).optional(),
  bodyTemplate: z.string().optional(),
});

type WebhookConfig = z.infer<typeof webhookConfigSchema>;

export const webhookActionType: ActionTypeDefinition<WebhookConfig> = {
  type: "webhook",
  label: "Webhook",
  validateConfig(config) {
    const parsed = webhookConfigSchema.safeParse(config);
    if (parsed.success) return { valid: true };
    return {
      valid: false,
      error: parsed.error.issues[0]?.message ?? "Invalid webhook config.",
    };
  },
  async run(ctx: ActionRunContext, rawConfig): Promise<ActionResult> {
    const parsed = webhookConfigSchema.safeParse(rawConfig);
    if (!parsed.success) {
      return {
        ok: false,
        retryable: false,
        error: parsed.error.issues[0]?.message ?? "Invalid webhook config.",
      };
    }
    const config = parsed.data;
    // Defense in depth: re-assert the target is not internal right before the
    // outbound request (a row could predate the SSRF refine). Permanent fail.
    if (!isSafeOutboundUrl(config.url)) {
      return { ok: false, retryable: false, error: SSRF_MESSAGE };
    }
    const body = renderBodyTemplate(config.bodyTemplate, ctx.values);

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "user-agent": "ConvexPress-Forms-Webhook/1",
      ...config.headers,
    };
    if (config.secret) {
      headers["x-convexpress-signature"] = await hmacHex(config.secret, body);
    }

    try {
      const res = await fetch(config.url, {
        method: "POST",
        headers,
        body,
      });
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, data: { status: res.status } };
      }
      return {
        ok: false,
        retryable: statusIsTransient(res.status),
        error: `Webhook responded ${res.status}.`,
      };
    } catch (err) {
      // Network / DNS / abort — transient.
      return {
        ok: false,
        retryable: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

// ─── lead_capture (provider endpoint adapter) ────────────────────────────────

const leadCaptureConfigSchema = z.object({
  /** Optional CRM endpoint; absent ⇒ "provider not configured". */
  endpoint: z
    .string()
    .url()
    .refine((u) => isSafeOutboundUrl(u), { message: SSRF_MESSAGE })
    .optional(),
  /** Optional bearer token / API key forwarded as Authorization. */
  apiKey: z.string().min(1).optional(),
  /** fieldKey -> CRM property name. At least one mapping required. */
  fieldMap: z.record(z.string(), z.string()).refine(
    (m) => Object.keys(m).length > 0,
    { message: "Add at least one field → property mapping." },
  ),
});

type LeadCaptureConfig = z.infer<typeof leadCaptureConfigSchema>;

/** Project the committed answers into the configured property map. */
function projectFields(
  fieldMap: Record<string, string>,
  values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [fieldKey, prop] of Object.entries(fieldMap)) {
    out[prop] = values[fieldKey] ?? "";
  }
  return out;
}

export const leadCaptureActionType: ActionTypeDefinition<LeadCaptureConfig> = {
  type: "lead_capture",
  label: "Lead Capture (CRM)",
  validateConfig(config) {
    const parsed = leadCaptureConfigSchema.safeParse(config);
    if (parsed.success) return { valid: true };
    return {
      valid: false,
      error: parsed.error.issues[0]?.message ?? "Invalid lead-capture config.",
    };
  },
  async run(ctx: ActionRunContext, rawConfig): Promise<ActionResult> {
    const parsed = leadCaptureConfigSchema.safeParse(rawConfig);
    if (!parsed.success) {
      return {
        ok: false,
        retryable: false,
        error: parsed.error.issues[0]?.message ?? "Invalid lead-capture config.",
      };
    }
    const config = parsed.data;
    if (!config.endpoint) {
      // Framework is validated; the provider integration is out of P1 scope.
      return {
        ok: false,
        retryable: false,
        error: "Lead-capture provider not configured (no endpoint).",
      };
    }
    if (!isSafeOutboundUrl(config.endpoint)) {
      return { ok: false, retryable: false, error: SSRF_MESSAGE };
    }
    const payload = projectFields(config.fieldMap, ctx.values);
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (config.apiKey) headers["authorization"] = `Bearer ${config.apiKey}`;
    try {
      const res = await fetch(config.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ properties: payload }),
      });
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, data: { status: res.status } };
      }
      return {
        ok: false,
        retryable: statusIsTransient(res.status),
        error: `Lead-capture provider responded ${res.status}.`,
      };
    } catch (err) {
      return {
        ok: false,
        retryable: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

// ─── email_marketing (provider endpoint adapter) ─────────────────────────────

const emailMarketingConfigSchema = z.object({
  endpoint: z
    .string()
    .url()
    .refine((u) => isSafeOutboundUrl(u), { message: SSRF_MESSAGE })
    .optional(),
  apiKey: z.string().min(1).optional(),
  /** Target list / audience id. */
  listId: z.string().min(1),
  /** fieldKey carrying the subscriber email. */
  emailFieldKey: z.string().min(1),
  /** fieldKey -> provider merge-field name. */
  mergeFields: z.record(z.string(), z.string()).optional(),
});

type EmailMarketingConfig = z.infer<typeof emailMarketingConfigSchema>;

export const emailMarketingActionType: ActionTypeDefinition<EmailMarketingConfig> = {
  type: "email_marketing",
  label: "Email Marketing",
  validateConfig(config) {
    const parsed = emailMarketingConfigSchema.safeParse(config);
    if (parsed.success) return { valid: true };
    return {
      valid: false,
      error:
        parsed.error.issues[0]?.message ?? "Invalid email-marketing config.",
    };
  },
  async run(ctx: ActionRunContext, rawConfig): Promise<ActionResult> {
    const parsed = emailMarketingConfigSchema.safeParse(rawConfig);
    if (!parsed.success) {
      return {
        ok: false,
        retryable: false,
        error:
          parsed.error.issues[0]?.message ?? "Invalid email-marketing config.",
      };
    }
    const config = parsed.data;
    const email = (ctx.values[config.emailFieldKey] ?? "").trim();
    if (!email) {
      // Permanent: the mapped email field had no value on this submission.
      return {
        ok: false,
        retryable: false,
        error: "No subscriber email present in the submission.",
      };
    }
    if (!config.endpoint) {
      return {
        ok: false,
        retryable: false,
        error: "Email-marketing provider not configured (no endpoint).",
      };
    }
    if (!isSafeOutboundUrl(config.endpoint)) {
      return { ok: false, retryable: false, error: SSRF_MESSAGE };
    }
    const merge = config.mergeFields
      ? projectFields(config.mergeFields, ctx.values)
      : {};
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (config.apiKey) headers["authorization"] = `Bearer ${config.apiKey}`;
    try {
      const res = await fetch(config.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          listId: config.listId,
          email,
          mergeFields: merge,
        }),
      });
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, data: { status: res.status } };
      }
      return {
        ok: false,
        retryable: statusIsTransient(res.status),
        error: `Email-marketing provider responded ${res.status}.`,
      };
    } catch (err) {
      return {
        ok: false,
        retryable: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

export function registerFirstPartyActionTypes(): void {
  registerActionType(webhookActionType);
  registerActionType(leadCaptureActionType);
  registerActionType(emailMarketingActionType);
}

registerFirstPartyActionTypes();

// Export the schemas so the admin editor / tests can reuse them if needed.
// `isSafeOutboundUrl` is exported above (declaration export); re-listing it here
// would be a duplicate, so it is intentionally omitted from this block.
export {
  webhookConfigSchema,
  leadCaptureConfigSchema,
  emailMarketingConfigSchema,
  renderBodyTemplate,
};
