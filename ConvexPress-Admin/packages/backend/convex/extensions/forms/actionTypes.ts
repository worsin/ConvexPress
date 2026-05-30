/**
 * ConvexPress Forms — First-party P1 action types.
 *
 * Registers the framework-validating P1 types into the action registry:
 *   - `webhook`        — real outbound POST with optional HMAC signature.
 *   - `lead_capture`   — provider-dispatch stub (real config validation; POSTs
 *                        to the configured endpoint or fails cleanly when creds
 *                        are absent). Full provider SDKs are out of P1 scope.
 *   - `email_marketing`— provider-dispatch stub (list + merge-field mapping).
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

// ─── webhook ─────────────────────────────────────────────────────────────────

const webhookConfigSchema = z.object({
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), {
      message: "Webhook URL must be https://",
    }),
  headers: z.record(z.string(), z.string()).optional(),
  secret: z.string().min(1).optional(),
  bodyTemplate: z.string().optional(),
});

type WebhookConfig = z.infer<typeof webhookConfigSchema>;

registerActionType<WebhookConfig>({
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
    const body = renderBodyTemplate(config.bodyTemplate, ctx.values);

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "user-agent": "ConvexPress-Forms-Webhook/1",
      ...(config.headers ?? {}),
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
});

// ─── lead_capture (provider-dispatch stub) ───────────────────────────────────

const leadCaptureConfigSchema = z.object({
  /** Optional CRM endpoint; absent ⇒ "provider not configured". */
  endpoint: z.string().url().optional(),
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

registerActionType<LeadCaptureConfig>({
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
});

// ─── email_marketing (provider-dispatch stub) ────────────────────────────────

const emailMarketingConfigSchema = z.object({
  endpoint: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  /** Target list / audience id. */
  listId: z.string().min(1),
  /** fieldKey carrying the subscriber email. */
  emailFieldKey: z.string().min(1),
  /** fieldKey -> provider merge-field name. */
  mergeFields: z.record(z.string(), z.string()).optional(),
});

type EmailMarketingConfig = z.infer<typeof emailMarketingConfigSchema>;

registerActionType<EmailMarketingConfig>({
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
});

// Export the schemas so the admin editor / tests can reuse them if needed.
export {
  webhookConfigSchema,
  leadCaptureConfigSchema,
  emailMarketingConfigSchema,
  renderBodyTemplate,
};
