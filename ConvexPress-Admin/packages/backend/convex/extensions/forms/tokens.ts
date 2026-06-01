/**
 * ConvexPress Forms — bearer-token helpers.
 *
 * Resume tokens unlock anonymous draft data by possession, so they must be
 * server-generated with cryptographic entropy. This pure module is tiny on
 * purpose: no Convex imports, no Math.random fallback.
 */

export const RESUME_TOKEN_BYTES = 32;
export const RESUME_TOKEN_PREFIX = "resume_";

export function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateResumeToken(): string {
  return `${RESUME_TOKEN_PREFIX}${randomHex(RESUME_TOKEN_BYTES)}`;
}

export function isGeneratedResumeToken(token: string): boolean {
  return new RegExp(`^${RESUME_TOKEN_PREFIX}[0-9a-f]{${RESUME_TOKEN_BYTES * 2}}$`).test(
    token,
  );
}
