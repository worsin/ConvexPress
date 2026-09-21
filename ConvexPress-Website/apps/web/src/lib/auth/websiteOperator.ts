import type { SiteRuntimeConfig } from "../site-runtime";

export type WebsiteOperatorSession = { token: string; expiresAt: number; instanceKey: string; userId?: string };
export type WebsiteEditingBridge = { endpoint: string; key: string; expiresAt: number };
export const operatorLinkFailure = "This website editing link expired or is no longer authorized. Open a new link from ConvexPress.";
export const operatorNetworkFailure = "Could not reach this website's authentication service. Check the connection, then open a new editing link from ConvexPress.";
export class OperatorNetworkError extends Error { constructor() { super(operatorNetworkFailure); } }

/** Scrub the fragment before any network request, including on invalid links. */
export function takeOperatorCode(location: Pick<Location, "href">, history: Pick<History, "replaceState" | "state">): string | null {
  return takeOperatorLaunch(location, history)?.code ?? null;
}

export function takeOperatorLaunch(location: Pick<Location, "href">, history: Pick<History, "replaceState" | "state">): { code: string; desktop: WebsiteEditingBridge | null } | null {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (!fragment.has("cp-customize") && !fragment.has("cp-desktop")) return null;
  const codes = fragment.getAll("cp-customize");
  const bridges = fragment.getAll("cp-desktop");
  fragment.delete("cp-customize"); fragment.delete("cp-desktop");
  url.hash = fragment.toString();
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  if (codes.length !== 1 || !/^[a-f0-9]{64}$/.test(codes[0])) throw new Error(operatorLinkFailure);
  let desktop: WebsiteEditingBridge | null = null;
  if (bridges.length) {
    if (bridges.length !== 1 || bridges[0].length > 2048) throw new Error(operatorLinkFailure);
    const value = JSON.parse(bridges[0]) as Partial<WebsiteEditingBridge> | null;
    if (!value || typeof value.endpoint !== "string" || typeof value.key !== "string" || !/^[a-f0-9]{64}$/.test(value.key) || typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now() || value.expiresAt > Date.now() + 8 * 60 * 60_000 + 1000) throw new Error(operatorLinkFailure);
    const endpoint = new URL(value.endpoint);
    if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || !endpoint.port || endpoint.pathname !== "/convexpress/website-editing" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error(operatorLinkFailure);
    desktop = value as WebsiteEditingBridge;
  }
  return { code: codes[0], desktop };
}

export async function renewWebsiteOperator(desktop: WebsiteEditingBridge, runtime: SiteRuntimeConfig, fetcher: typeof fetch = fetch): Promise<WebsiteOperatorSession> {
  if (desktop.expiresAt <= Date.now()) throw new Error(operatorLinkFailure);
  const response = await fetcher(desktop.endpoint, { method: "POST", credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(22_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: desktop.key, action: "renew" }) }).catch(() => { throw new OperatorNetworkError(); });
  if (!response.ok) throw new Error(operatorLinkFailure);
  const result = await response.json() as { code?: unknown } | null;
  if (!result || typeof result.code !== "string" || !/^[a-f0-9]{64}$/.test(result.code)) throw new Error(operatorLinkFailure);
  return exchangeOperatorCode(result.code, runtime, fetcher);
}

export async function endWebsiteOperator(desktop: WebsiteEditingBridge): Promise<void> {
  await fetch(desktop.endpoint, { method: "POST", credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: desktop.key, action: "end" }) }).catch(() => {});
}

export async function exchangeOperatorCode(code: string, runtime: SiteRuntimeConfig, fetcher: typeof fetch = fetch): Promise<WebsiteOperatorSession> {
  if (!runtime.convexSiteUrl) throw new Error(operatorLinkFailure);
  const response = await fetcher(new URL("/auth/operator-handoff", runtime.convexSiteUrl), {
    method: "POST", credentials: "omit", cache: "no-store", redirect: "error",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
  }).catch(() => { throw new OperatorNetworkError(); });
  if (!response.ok) throw new Error(operatorLinkFailure);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object") throw new Error(operatorLinkFailure);
  const session = value as Partial<WebsiteOperatorSession>;
  const now = Date.now();
  if (typeof session.token !== "string" || !session.token || session.token.length > 16384 ||
    typeof session.expiresAt !== "number" || !Number.isFinite(session.expiresAt) || session.expiresAt <= now || session.expiresAt > now + 5 * 60_000 ||
    typeof session.instanceKey !== "string" || !session.instanceKey || (runtime.instanceKey && session.instanceKey !== runtime.instanceKey) ||
    (session.userId !== undefined && (typeof session.userId !== "string" || !session.userId || session.userId.length > 200))) throw new Error(operatorLinkFailure);
  return session as WebsiteOperatorSession;
}
