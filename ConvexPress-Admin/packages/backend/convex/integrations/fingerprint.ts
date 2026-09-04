/**
 * Configuration fingerprint — detects when a stored verification result no
 * longer describes the current configuration. Not a security primitive:
 * FNV-1a over the raw stored values (ciphertext for secrets, so the plaintext
 * never has to be present to compute it) plus environment presence.
 */

export function fingerprintConfiguration(input: Record<string, unknown>): string {
  const keys = Object.keys(input).sort();
  const canonical = JSON.stringify(
    keys.map((key) => [key, normalize(input[key])]),
  );
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a:${hash.toString(16).padStart(8, "0")}:${canonical.length}`;
}

function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value === null) return null;
  return JSON.stringify(value);
}
