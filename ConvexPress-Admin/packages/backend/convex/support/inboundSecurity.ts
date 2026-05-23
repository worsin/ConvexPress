export type InboundChannelSecurity = {
  signingSecret: string | null;
  allowUnsigned: boolean;
  signatureHeader: string;
  timestampHeader: string | null;
  toleranceSeconds: number;
};

export function parseInboundChannelSecurity(
  config: unknown,
): InboundChannelSecurity {
  const value =
    config && typeof config === "object"
      ? (config as Record<string, unknown>)
      : {};
  const signingSecret =
    typeof value.signingSecret === "string" && value.signingSecret.trim()
      ? value.signingSecret.trim()
      : typeof value.secret === "string" && value.secret.trim()
        ? value.secret.trim()
        : null;
  const signatureHeader =
    typeof value.signatureHeader === "string" && value.signatureHeader.trim()
      ? value.signatureHeader.trim().toLowerCase()
      : "x-convexpress-signature";
  const timestampHeader =
    typeof value.timestampHeader === "string" && value.timestampHeader.trim()
      ? value.timestampHeader.trim().toLowerCase()
      : "x-convexpress-timestamp";
  const toleranceSeconds =
    typeof value.toleranceSeconds === "number" &&
    Number.isFinite(value.toleranceSeconds) &&
    value.toleranceSeconds > 0
      ? Math.min(value.toleranceSeconds, 24 * 60 * 60)
      : 5 * 60;

  return {
    signingSecret,
    allowUnsigned: value.allowUnsigned === true,
    signatureHeader,
    timestampHeader,
    toleranceSeconds,
  };
}

export function normalizeWebhookSignature(value: string): string {
  const first = value.split(",")[0]?.trim() ?? "";
  return first.replace(/^sha256=/i, "").trim().toLowerCase();
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function hmacSha256Hex(
  secret: string,
  payload: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyInboundWebhookSignature(args: {
  secret: string;
  payload: string;
  signatureHeader: string | null;
  timestampHeader?: string | null;
  toleranceSeconds?: number;
  nowMs?: number;
}): Promise<boolean> {
  const provided = args.signatureHeader
    ? normalizeWebhookSignature(args.signatureHeader)
    : "";
  if (!provided) return false;

  if (args.timestampHeader) {
    const timestampMs = Number(args.timestampHeader) * 1000;
    if (!Number.isFinite(timestampMs)) return false;
    const toleranceMs = (args.toleranceSeconds ?? 5 * 60) * 1000;
    if (Math.abs((args.nowMs ?? Date.now()) - timestampMs) > toleranceMs) {
      return false;
    }
  }

  const expected = await hmacSha256Hex(args.secret, args.payload);
  return constantTimeEqual(expected, provided);
}
