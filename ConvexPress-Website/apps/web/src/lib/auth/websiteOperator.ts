import type { SiteRuntimeConfig } from "../site-runtime";

export type WebsiteOperatorSession = { token: string; expiresAt: number; instanceKey: string };
export const operatorLinkFailure = "This website editing link expired or is no longer authorized. Open a new link from ConvexPress.";
export const operatorNetworkFailure = "Could not reach this website's authentication service. Check the connection, then open a new editing link from ConvexPress.";
export class OperatorNetworkError extends Error { constructor() { super(operatorNetworkFailure); } }

/** Scrub the fragment before any network request, including on invalid links. */
export function takeOperatorCode(location: Pick<Location, "href">, history: Pick<History, "replaceState" | "state">): string | null {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (!fragment.has("cp-customize")) return null;
  const codes = fragment.getAll("cp-customize");
  fragment.delete("cp-customize");
  url.hash = fragment.toString();
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  if (codes.length !== 1 || !/^[a-f0-9]{64}$/.test(codes[0])) throw new Error(operatorLinkFailure);
  return codes[0];
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
    typeof session.instanceKey !== "string" || !session.instanceKey || (runtime.instanceKey && session.instanceKey !== runtime.instanceKey)) throw new Error(operatorLinkFailure);
  return session as WebsiteOperatorSession;
}
