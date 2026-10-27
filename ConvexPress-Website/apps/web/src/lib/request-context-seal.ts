/**
 * Seal the visitor's address and browser for the backend (server only).
 *
 * The backend can't see a request's address: a Convex mutation has none. This
 * server can, so `/api/request-context` seals what it saw into a token the
 * browser hands to the backend with a form submission or a sign-in record.
 * The backend opens it with the same secret (ConvexPress-Admin
 * helpers/requestContext.ts, which documents the format and shares the test
 * vector).
 *
 * The address comes only from the header named by
 * CONVEXPRESS_CLIENT_IP_HEADER: set it to the header the site's proxy writes
 * (cf-connecting-ip behind Cloudflare) when the site can only be reached
 * through that proxy. Unset, no address is sealed: a header the visitor could
 * write themselves proves nothing.
 */
export const REQUEST_CONTEXT_SECRET_ENV = "CONVEXPRESS_REQUEST_CONTEXT_SECRET";
export const CLIENT_IP_HEADER_ENV = "CONVEXPRESS_CLIENT_IP_HEADER";
export const REQUEST_CONTEXT_DOMAIN = "convexpress:request-context:v1:";
export const REQUEST_CONTEXT_LIFETIME_MS = 10 * 60 * 1000;
const MAX_USER_AGENT_LENGTH = 512;
const MIN_SECRET_LENGTH = 32;

const encoder = new TextEncoder();

function base64Url(text: string): string {
  let binary = "";
  for (const byte of encoder.encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface RequestContextClaims {
  ip?: string;
  ua?: string;
  iat: number;
  exp: number;
}

/** Seal claims with `secret`: `v1.<base64url JSON>.<hex HMAC-SHA256>`. */
export async function sealRequestContext(claims: RequestContextClaims, secret: string): Promise<string> {
  const body = base64Url(JSON.stringify(claims));
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `v1.${body}.${hex(await crypto.subtle.sign("HMAC", key, encoder.encode(REQUEST_CONTEXT_DOMAIN + body)))}`;
}

/** The first address in a proxy header's value ("203.0.113.9" or "203.0.113.9, 10.0.0.1"). */
export function headerAddress(value: string | null): string | undefined {
  const first = value?.split(",")[0]?.trim();
  if (!first || first.length > 45 || !/^[0-9A-Fa-f:.]+$/u.test(first)) return undefined;
  return first;
}

/**
 * The token for one request, or null when the site has no secret (or a
 * secret too short to trust).
 */
export async function requestContextFor(
  headers: Headers,
  env: Record<string, string | undefined>,
  now: number,
): Promise<string | null> {
  const secret = env[REQUEST_CONTEXT_SECRET_ENV]?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  const ipHeader = env[CLIENT_IP_HEADER_ENV]?.trim().toLowerCase();
  const ip = ipHeader ? headerAddress(headers.get(ipHeader)) : undefined;
  const ua = headers.get("user-agent")?.trim().slice(0, MAX_USER_AGENT_LENGTH) || undefined;
  return await sealRequestContext(
    { ...(ip ? { ip } : {}), ...(ua ? { ua } : {}), iat: now, exp: now + REQUEST_CONTEXT_LIFETIME_MS },
    secret,
  );
}
