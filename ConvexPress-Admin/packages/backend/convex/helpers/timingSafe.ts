/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * Standard `===` comparison short-circuits on the first different character,
 * leaking information about how many characters match. This function always
 * compares all characters regardless of where mismatches occur.
 */
export function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against `a` anyway to prevent length-based timing leaks
    let result = 1;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
