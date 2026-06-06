const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed === "null") return "null";

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function configuredAllowedOrigins(): Set<string> {
  const values = [
    process.env.AUTH_ALLOWED_ORIGINS,
    process.env.AUTH_ADMIN_ORIGIN,
  ]
    .filter(Boolean)
    .flatMap((value) => value!.split(","))
    .map(normalizeOrigin)
    .filter((value): value is string => !!value);

  return new Set(values);
}

export function getAllowedAuthOrigin(originHeader: string | null): string | null {
  const origin = normalizeOrigin(originHeader ?? undefined);
  if (!origin) return "";

  const configured = configuredAllowedOrigins();
  if (configured.has(origin)) return origin;

  const issuerOrigin = normalizeOrigin(process.env.AUTH_ISSUER_URL);
  if (issuerOrigin && origin === issuerOrigin) return origin;

  if (origin === "null") {
    return process.env.AUTH_ALLOW_NULL_ORIGIN === "false" ? null : "null";
  }

  try {
    const url = new URL(origin);
    if (LOCAL_DEV_HOSTS.has(url.hostname)) return origin;
  } catch {
    return null;
  }

  return null;
}

export function createAuthHeaders(allowedOrigin: string): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });

  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }

  return headers;
}

export function authJsonResponse(
  data: object,
  status: number,
  allowedOrigin: string,
  extraHeaders?: Record<string, string>,
) {
  const headers = createAuthHeaders(allowedOrigin);
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.set(key, value);
    }
  }

  return new Response(JSON.stringify(data), { status, headers });
}

export function authPreflightResponse(request: Request) {
  const allowedOrigin = getAllowedAuthOrigin(request.headers.get("origin"));
  if (allowedOrigin === null) {
    return new Response(null, {
      status: 403,
      headers: { "Vary": "Origin" },
    });
  }

  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  });

  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }

  return new Response(null, {
    status: 204,
    headers,
  });
}
