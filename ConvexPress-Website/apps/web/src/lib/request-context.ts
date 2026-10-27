/**
 * The website server's sealed request context, fetched by the browser just
 * before a form submission or a sign-in record (lib/request-context-seal.ts).
 * Best effort: when the server has no secret, or can't be reached in time,
 * the record is kept without it.
 */
const TIMEOUT_MS = 3_000;

export async function fetchRequestContext(fetcher: typeof fetch = fetch): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher("/api/request-context", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    const token: unknown = body && typeof body === "object" ? Reflect.get(body, "token") : undefined;
    return typeof token === "string" && token.startsWith("v1.") ? token : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
