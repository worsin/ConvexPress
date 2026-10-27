/**
 * Request context: the visitor's address and browser, attested by the
 * website server.
 *
 * A Convex mutation has no request, so it can't see who sent it. The website
 * server can: `/api/request-context` reads the address from the proxy header
 * the site trusts (Cloudflare's CF-Connecting-IP, say) and the User-Agent,
 * and seals them into a short-lived token with a secret it shares with this
 * deployment (CONVEXPRESS_REQUEST_CONTEXT_SECRET). The browser passes the
 * token along with a form submission or a sign-in record, and the functions
 * open it here. A token that is missing, forged, expired or sealed without
 * the secret reads as no context: the record is kept without an address,
 * never with one the browser made up.
 *
 * Token: `v1.<base64url JSON {ip?, ua?, iat, exp}>.<hex HMAC-SHA256>`, the
 * HMAC over REQUEST_CONTEXT_DOMAIN + the JSON part. The website's sealer
 * (ConvexPress-Website lib/request-context-seal.ts) shares the test vector in
 * __tests__/requestContext.test.ts.
 */
export const REQUEST_CONTEXT_SECRET_ENV = "CONVEXPRESS_REQUEST_CONTEXT_SECRET";
export const REQUEST_CONTEXT_DOMAIN = "convexpress:request-context:v1:";
/** A token lives this long, and may be dated this far ahead of the deployment's clock. */
export const REQUEST_CONTEXT_MAX_AGE_MS = 15 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;
const MAX_TOKEN_LENGTH = 2048;
const MAX_USER_AGENT_LENGTH = 512;
const MIN_SECRET_LENGTH = 32;

export interface RequestContext {
  /** The visitor's IP address, as the site's trusted proxy reported it. */
  ip?: string;
  userAgent?: string;
}

const encoder = new TextEncoder();

function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/u.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** An IPv4 or IPv6 address, as text; anything else isn't kept. */
export function isIpAddress(value: string): boolean {
  if (value.length > 45) return false;
  const v4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/u;
  if (v4.test(value)) return true;
  // IPv6: hex groups and colons, at most one "::", optionally ending in IPv4.
  return /^[0-9A-Fa-f:.]+$/u.test(value) && value.includes(":") && value.split("::").length <= 2 && value.split(":").length <= 9;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
}

/**
 * Open a token with `secret`. Null unless it is well formed, signed with that
 * secret, and current at `now`.
 */
export async function openRequestContextWith(
  token: string | undefined,
  secret: string | undefined,
  now: number,
): Promise<RequestContext | null> {
  if (!token || !secret || secret.length < MIN_SECRET_LENGTH || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^[a-f0-9]{64}$/u.test(parts[2] ?? "")) return null;
  const body = parts[1] ?? "";
  const signature = new Uint8Array((parts[2] ?? "").match(/../gu)?.map((pair) => parseInt(pair, 16)) ?? []);
  if (!(await crypto.subtle.verify("HMAC", await hmacKey(secret), signature, encoder.encode(REQUEST_CONTEXT_DOMAIN + body)))) return null;
  const json = fromBase64Url(body);
  if (json === null) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(json);
  } catch {
    return null;
  }
  if (!claims || typeof claims !== "object") return null;
  const iat: unknown = Reflect.get(claims, "iat");
  const exp: unknown = Reflect.get(claims, "exp");
  if (typeof iat !== "number" || typeof exp !== "number") return null;
  if (iat > now + CLOCK_SKEW_MS || exp < now || exp - iat > REQUEST_CONTEXT_MAX_AGE_MS) return null;
  const ip: unknown = Reflect.get(claims, "ip");
  const ua: unknown = Reflect.get(claims, "ua");
  return {
    ...(typeof ip === "string" && isIpAddress(ip) ? { ip } : {}),
    ...(typeof ua === "string" && ua.trim() ? { userAgent: ua.trim().slice(0, MAX_USER_AGENT_LENGTH) } : {}),
  };
}

/** Open a token with this deployment's secret. */
export async function openRequestContext(token: string | undefined): Promise<RequestContext | null> {
  return await openRequestContextWith(token, process.env[REQUEST_CONTEXT_SECRET_ENV]?.trim(), Date.now());
}
