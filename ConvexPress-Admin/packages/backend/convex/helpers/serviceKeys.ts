/**
 * Service Key Resolution Helpers
 *
 * Provides a consistent pattern for reading service API keys:
 *   1. Check the settings table first (user-configured via admin UI)
 *   2. Fall back to environment variable (legacy / self-hosted setup)
 *
 * Two functions for different Convex contexts:
 *
 *   getServiceKey(ctx, section, settingsKey, envVarName)
 *     For query/mutation handlers that have direct `ctx.db` access.
 *
 *   resolveServiceKey(settingsValues, settingsKey, envVarName)
 *     Pure function for action/httpAction handlers that already fetched
 *     settings via `ctx.runQuery(internal.settings.internals.getInternal, ...)`.
 *
 * Usage in a query/mutation:
 *   const apiKey = await getServiceKey(ctx, "email", "resendApiKey", "RESEND_API_KEY");
 *
 * Usage in an action (after fetching settings):
 *   const settings = await ctx.runQuery(internal.settings.internals.getInternal, { section: "email" });
 *   const apiKey = resolveServiceKey(settings, "resendApiKey", "RESEND_API_KEY");
 */

import type { QueryCtx } from "../_generated/server";
import { decryptSettingSecret } from "./settingsSecret";

// ─── For Query / Mutation Contexts ──────────────────────────────────────────

/**
 * Read a service API key from the settings table, falling back to an env var.
 *
 * Settings take priority: if the user has configured a key via the admin UI,
 * it wins over whatever is in the Convex environment variables.
 *
 * @param ctx      - Query or mutation context (must have ctx.db)
 * @param section  - Settings section name (e.g. "email", "search", "ai")
 * @param settingsKey - Key within the section's values object (e.g. "resendApiKey")
 * @param envVarName  - Environment variable fallback (e.g. "RESEND_API_KEY")
 * @returns The resolved key string, or undefined if neither source has it
 */
export async function getServiceKey(
  ctx: QueryCtx,
  section: string,
  settingsKey: string,
  envVarName: string,
): Promise<string | undefined> {
  // Try settings table
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q) => q.eq("section", section as any))
    .unique();

  if (doc) {
    const values = doc.values as Record<string, unknown> | undefined;
    const value = values?.[settingsKey];
    if (typeof value === "string" && value.trim()) {
      // Decrypt if the value is a stored ciphertext (enc:... or b64:...).
      // Plain strings pass through unchanged for backwards compatibility.
      const raw = value.trim();
      if (raw.startsWith("enc:") || raw.startsWith("b64:")) {
        return (await decryptSettingSecret(raw)) || undefined;
      }
      return raw;
    }
  }

  // Fall back to environment variable
  return process.env[envVarName] || undefined;
}

// ─── For Action / HTTP Action Contexts ──────────────────────────────────────

/**
 * Resolve a service key from pre-fetched settings values, falling back to env var.
 *
 * Use this in action or httpAction handlers where you've already called:
 *   ctx.runQuery(internal.settings.internals.getInternal, { section })
 *
 * @param settingsValues - The merged settings object (or null if no settings exist)
 * @param settingsKey    - Key within the values object (e.g. "resendApiKey")
 * @param envVarName     - Environment variable fallback (e.g. "RESEND_API_KEY")
 * @returns The resolved key string, or undefined if neither source has it
 */
export function resolveServiceKey(
  settingsValues: Record<string, unknown> | null | undefined,
  settingsKey: string,
  envVarName: string,
): string | undefined {
  if (settingsValues) {
    const value = settingsValues[settingsKey];
    if (typeof value === "string" && value.trim()) {
      // Synchronous API — callers that pass ALREADY-DECRYPTED values
      // (from an action that called decryptSettingSecret first) get the
      // plaintext back. Ciphertext tokens returned as-is signal the
      // caller should have used the async variant.
      const raw = value.trim();
      if (raw.startsWith("enc:") || raw.startsWith("b64:")) {
        // Leave decryption to the caller's action; return sentinel prefix.
        return raw;
      }
      return raw;
    }
  }

  return process.env[envVarName] || undefined;
}

/**
 * Async variant for action contexts: fetches settings internally,
 * transparently decrypts stored ciphertext, falls back to env.
 *
 * Usage inside an action:
 *   const key = await getServiceKeyFromAction(ctx, "commerce.payments",
 *     "stripeSecretKey", "STRIPE_SECRET_KEY");
 */
export async function getServiceKeyFromAction(
  ctx: { runQuery: (...args: any[]) => Promise<any> },
  section: string,
  settingsKey: string,
  envVarName: string,
): Promise<string | undefined> {
  const { internal } = await import("../_generated/api");
  const doc: any = await ctx.runQuery(
    (internal as any).settings.httpInternals.getBySectionInternal,
    { section },
  );
  const value = doc?.[settingsKey];
  if (typeof value === "string" && value.trim()) {
    const raw = value.trim();
    if (raw.startsWith("enc:") || raw.startsWith("b64:")) {
      return (await decryptSettingSecret(raw)) || undefined;
    }
    return raw;
  }
  return process.env[envVarName] || undefined;
}
