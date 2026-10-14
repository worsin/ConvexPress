/**
 * Stripe webhook signature verification for the default (V8) Convex runtime.
 *
 * HTTP actions run in V8, where the Stripe Node SDK cannot be loaded (dynamic
 * `import()` is unsupported there). This implements Stripe's documented scheme
 * with Web Crypto: the `Stripe-Signature` header carries `t=<unix seconds>`
 * and one or more `v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`; a delivery
 * is authentic when any v1 signature matches (constant-time) and `t` is within
 * the tolerance. Only after that is the body parsed.
 */
import type Stripe from "stripe";

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export class StripeSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeSignatureError";
  }
}

function parseHeader(header: string): { timestamp: number; signatures: string[] } {
  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t" && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    else if (key === "v1" && /^[0-9a-f]{64}$/i.test(value)) signatures.push(value.toLowerCase());
  }
  if (timestamp === undefined || signatures.length === 0) {
    throw new StripeSignatureError("Malformed Stripe-Signature header");
  }
  return { timestamp, signatures };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  let diff = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The envelope every Stripe event carries. The payload is authenticated by the
 * signature before this runs; like the Stripe SDK, the event body itself is
 * then trusted as Stripe's own JSON.
 */
function isStripeEvent(value: unknown): value is Stripe.Event {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    isRecord(value.data) &&
    isRecord(value.data.object)
  );
}

/** Verify a Stripe webhook delivery and return its event. Throws StripeSignatureError. */
export async function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  options: { toleranceSeconds?: number; nowMs?: number } = {},
): Promise<Stripe.Event> {
  const { timestamp, signatures } = parseHeader(signatureHeader);
  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  if (!signatures.some((signature) => constantTimeEqual(signature, expected))) {
    throw new StripeSignatureError("No signature matches the payload");
  }
  const tolerance = options.toleranceSeconds ?? STRIPE_SIGNATURE_TOLERANCE_SECONDS;
  const now = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    throw new StripeSignatureError("Signature timestamp is outside the tolerance");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new StripeSignatureError("Payload is not JSON");
  }
  if (!isStripeEvent(parsed)) throw new StripeSignatureError("Payload is not a Stripe event");
  return parsed;
}
