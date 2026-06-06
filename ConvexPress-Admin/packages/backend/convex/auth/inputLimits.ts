export const AUTH_JSON_BODY_LIMIT = 4 * 1024;
export const CLERK_WEBHOOK_BODY_LIMIT = 128 * 1024;
export const MAX_COOKIE_HEADER_LENGTH = 8 * 1024;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_USERNAME_LENGTH = 64;
export const MAX_PASSWORD_LENGTH = 256;
export const MAX_IP_LENGTH = 128;
export const MAX_CLERK_USER_ID_LENGTH = 256;
export const MAX_CLERK_NAME_LENGTH = 128;
export const MAX_CLERK_URL_LENGTH = 2048;
export const MAX_SLUG_LENGTH = 64;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REFRESH_TOKEN_RE = /^[a-f0-9]{64}$/i;

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "RequestBodyTooLargeError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function readLimitedRequestText(
  request: Request,
  maxLength: number,
): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed) && parsed > maxLength) {
      throw new RequestBodyTooLargeError();
    }
  }

  const text = await request.text();
  if (text.length > maxLength) {
    throw new RequestBodyTooLargeError();
  }
  return text;
}

export function normalizeLoginCredentials(body: unknown):
  | {
      ok: true;
      email?: string;
      username?: string;
      password: string;
      identifier: string;
    }
  | { ok: false; reason: "missing" | "invalid" } {
  if (!isRecord(body)) return { ok: false, reason: "invalid" };

  const password = typeof body.password === "string" ? body.password : "";
  const email =
    typeof body.email === "string" ? normalizeEmail(body.email) : undefined;
  const username =
    typeof body.username === "string" ? body.username.trim() : undefined;

  if (!password || (!email && !username)) {
    return { ok: false, reason: "missing" };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: "invalid" };
  }
  if (typeof body.email === "string" && !email) {
    return { ok: false, reason: "invalid" };
  }
  if (username && username.length > MAX_USERNAME_LENGTH) {
    return { ok: false, reason: "invalid" };
  }

  const identifier = email ?? username;
  if (!identifier) return { ok: false, reason: "missing" };
  return { ok: true, email, username, password, identifier };
}

export function normalizeRequestIp(value: string | null): string {
  const first = value?.split(",")[0]?.trim();
  if (!first) return "unknown";
  return first.length <= MAX_IP_LENGTH ? first : first.slice(0, MAX_IP_LENGTH);
}

export function parseCookieValue(header: string, name: string): string | null {
  if (header.length > MAX_COOKIE_HEADER_LENGTH) return null;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = header.match(new RegExp(`(?:^|;)\\s*${escapedName}=([^;]*)`));
  if (!match) return null;

  try {
    return decodeURIComponent(match[1] ?? "");
  } catch {
    return null;
  }
}

export function isRefreshTokenShape(token: string): boolean {
  return REFRESH_TOKEN_RE.test(token);
}

export function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > MAX_EMAIL_LENGTH) return undefined;
  return EMAIL_RE.test(normalized) ? normalized : undefined;
}

export function normalizeClerkUserId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_CLERK_USER_ID_LENGTH) {
    return undefined;
  }
  return normalized;
}

export function normalizeOptionalString(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength
    ? normalized.slice(0, maxLength)
    : normalized;
}

export function deriveClerkSlug(args: {
  email: string;
  username?: string;
}): string {
  const base = args.username ?? args.email.split("@")[0] ?? "user";
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
  return slug || "user";
}
