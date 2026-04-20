/**
 * Settings Secret Encryption
 *
 * All merchant-entered API keys / client secrets live inside the `settings`
 * table as part of a section's `values` JSON. Storing them plaintext would
 * make any admin-UI read (even via the dashboard) leak them. This helper
 * pairs with `getServiceKey` / `resolveServiceKey`:
 *
 *   - Mutations encrypt on write via `encryptSettingSecret`.
 *   - Public queries that return settings to the admin UI replace any
 *     `*Secret*|*Key*|*Token*|Password|*Credentials*` field with the
 *     sentinel `"__set__"` so the frontend can render a masked state
 *     without ever seeing plaintext.
 *   - Internal actions that actually need plaintext (e.g. signing a
 *     Stripe webhook call) decrypt via `decryptSettingSecret`.
 *
 * The root encryption key reuses `SHIPPING_PROVIDER_ENCRYPTION_KEY`
 * (operator-owned, env-only). If absent, we fall back to base64 so dev
 * installs still work; callers log a warning in that case.
 */

import { decryptSecret, encryptSecret } from "../api/crypto_helpers";

const SECRET_KEY = process.env.SHIPPING_PROVIDER_ENCRYPTION_KEY;

const SENTINEL = "__set__";

/**
 * Fields inside any settings `values` object whose key matches this pattern
 * are treated as secrets — encrypted on write, masked on public read.
 */
const SECRET_KEY_PATTERN = /(secret|key|token|password|credentials?)/i;

export function isSecretFieldName(name: string): boolean {
  return SECRET_KEY_PATTERN.test(name);
}

function toBase64(utf8: string): string {
  // Works in both V8 and Node runtimes.
  if (typeof Buffer !== "undefined") {
    return Buffer.from(utf8, "utf8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(utf8)));
}

function fromBase64(b64: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(b64, "base64").toString("utf8");
  }
  return decodeURIComponent(escape(atob(b64)));
}

export async function encryptSettingSecret(plaintext: string): Promise<string> {
  if (!plaintext) return "";
  if (!SECRET_KEY) {
    // Dev fallback — not secure, just reversible. Operator must set the env
    // key for real installs.
    return `b64:${toBase64(plaintext)}`;
  }
  return `enc:${await encryptSecret(plaintext, SECRET_KEY)}`;
}

export async function decryptSettingSecret(
  ciphertext: string | undefined | null,
): Promise<string> {
  if (!ciphertext) return "";
  if (ciphertext.startsWith("b64:")) {
    return fromBase64(ciphertext.slice(4));
  }
  if (ciphertext.startsWith("enc:") && SECRET_KEY) {
    return decryptSecret(ciphertext.slice(4), SECRET_KEY);
  }
  // Legacy plaintext (pre-migration) — return as-is so existing env-seeded
  // installs keep working.
  return ciphertext;
}

export function maskSecret(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return SENTINEL;
}

/**
 * Redact every secret field in a settings values object. Called by public
 * settings queries before returning to the admin UI.
 */
export function redactSettingSecrets<T extends Record<string, any>>(
  values: T | null | undefined,
): T | null {
  if (!values) return null;
  const out: any = { ...values };
  for (const [k, v] of Object.entries(out)) {
    if (isSecretFieldName(k) && typeof v === "string" && v.length > 0) {
      out[k] = SENTINEL;
    }
  }
  return out;
}

export const SECRET_SENTINEL = SENTINEL;
