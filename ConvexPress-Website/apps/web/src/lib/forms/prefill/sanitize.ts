/**
 * Form Prefill — input sanitizers (EZ Entity Setup parity).
 *
 * The FIRST gate on any URL-sourced value. Pure + SSR-safe. Anything that can
 * carry an XSS/markup/length payload is stripped or dropped here BEFORE it ever
 * reaches a field value. This is defense-in-depth: the server's `submit`
 * re-validation is the authoritative gate, but the parser must never seed junk.
 */

/** Default maximum accepted length for a single prefill value. */
const DEFAULT_MAX_LENGTH = 200;

/**
 * Sanitize a raw URL-param string. Returns the cleaned string, or `undefined`
 * when the input is unusable (bad URL-encoding, empty after stripping).
 *
 * Pipeline:
 *   1. URL-decode in a try/catch — malformed encoding → drop (undefined).
 *   2. Strip HTML tags (`<…>`), `javascript:` URIs, inline `on\w+=` handlers,
 *      encoded-angle-bracket / entity sequences, and control chars (incl. NUL).
 *   3. Length-cap (default 200).
 *   4. Trim; empty → undefined.
 */
export function sanitizeInput(
  raw: string,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string | undefined {
  if (typeof raw !== "string") return undefined;

  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding — drop the param entirely.
    return undefined;
  }

  value = value
    // Strip any tag-like sequence.
    .replace(/<[^>]*>/g, "")
    // Strip dangling angle brackets.
    .replace(/[<>]/g, "")
    // Neutralize javascript: protocol (any casing / interleaved spaces).
    .replace(/j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, "")
    // Strip inline event handlers like `onclick=`.
    .replace(/\bon\w+\s*=/gi, "")
    // Strip encoded angle brackets + numeric-entity starts.
    .replace(/&lt;|&gt;|&#/gi, "")
    // Strip C0 control chars (incl. NUL).
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, "");

  value = value.slice(0, maxLength).trim();
  return value.length > 0 ? value : undefined;
}

/**
 * Match a cleaned value against an allowed set of choice `value`s
 * (case-insensitive). Returns the CANONICAL allowed value, or `undefined` when
 * there is no match. Used by enum/choice normalization.
 */
export function sanitizeEnum(
  value: string,
  allowed: string[],
): string | undefined {
  const needle = value.trim().toLowerCase();
  if (!needle) return undefined;
  for (const candidate of allowed) {
    if (candidate.toLowerCase() === needle) return candidate;
  }
  return undefined;
}
