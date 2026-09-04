/**
 * Legacy secret upgrade.
 *
 * Before an at-rest encryption key exists on a deployment, secrets are stored
 * as reversible `b64:` values. Once `SHIPPING_PROVIDER_ENCRYPTION_KEY` is set,
 * every legacy value can be re-sealed as `enc:` in place. The walker is pure
 * so it can be unit-tested; the mutation in settings/internals drives it.
 */

import { isSecretFieldName } from "./settingsSecret";

export const LEGACY_SECRET_PREFIX = "b64:";

export type LegacySecretPath = { path: string[]; value: string };

/** Every `b64:` string under a secret-named field, with its path. */
export function collectLegacySecrets(
  values: unknown,
  path: string[] = [],
  out: LegacySecretPath[] = [],
): LegacySecretPath[] {
  if (!values || typeof values !== "object" || Array.isArray(values)) return out;
  for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
    const next = [...path, key];
    if (typeof value === "string") {
      if (isSecretFieldName(key) && value.startsWith(LEGACY_SECRET_PREFIX)) {
        out.push({ path: next, value });
      }
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      collectLegacySecrets(value, next, out);
    }
  }
  return out;
}

/** Returns a copy of `values` with each path replaced by its new value. */
export function withReplacedValues(
  values: Record<string, unknown>,
  replacements: Array<{ path: string[]; value: string }>,
): Record<string, unknown> {
  const clone = structuredClone(values);
  for (const { path, value } of replacements) {
    let cursor: Record<string, unknown> = clone;
    for (const segment of path.slice(0, -1)) {
      const child = cursor[segment];
      if (!child || typeof child !== "object") throw new Error(`Missing path ${path.join(".")}`);
      cursor = child as Record<string, unknown>;
    }
    cursor[path[path.length - 1]!] = value;
  }
  return clone;
}
