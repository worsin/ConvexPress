"use node";
import { createHash, randomBytes } from "node:crypto";
export const CLOUDFLARE_CALLBACK = "http://localhost:47123/hosting/cloudflare/callback";
export function oauthConfig() {
  const clientId = process.env.CONVEXPRESS_CLOUDFLARE_OAUTH_CLIENT_ID ?? "";
  const redirectUri = process.env.CONVEXPRESS_CLOUDFLARE_OAUTH_REDIRECT_URI ?? "";
  const scopes = (process.env.CONVEXPRESS_CLOUDFLARE_OAUTH_SCOPES ?? "").split(/\s+/).filter(Boolean);
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(clientId) || redirectUri !== CLOUDFLARE_CALLBACK || !scopes.includes("offline_access") || scopes.length < 2 || scopes.length > 64 || scopes.some(s => !/^[A-Za-z0-9._:-]{1,160}$/.test(s))) throw Error("Cloudflare sign-in is not configured. Use an API token or ask your agency administrator to configure the ConvexPress OAuth client.");
  return { clientId, redirectUri, scopes };
}
export function stateHash(state: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw Error("Invalid Cloudflare authorization state");
  return createHash("sha256").update(state).digest("hex");
}
export function authorization(config: ReturnType<typeof oauthConfig>) {
  const state = randomBytes(32).toString("base64url"), verifier = randomBytes(32).toString("base64url");
  const url = new URL("https://dash.cloudflare.com/oauth2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: config.scopes.join(" "), state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", response_mode: "query" }).toString();
  return { state, verifier, authorizationUrl: url.toString() };
}
export type OAuthTokens = { token: string; refreshToken: string; expiresAt: number; clientId: string };
export async function exchangeToken(input: { clientId: string; redirectUri?: string; code?: string; verifier?: string; refreshToken?: string }, fetchImpl: typeof fetch = fetch): Promise<OAuthTokens> {
  const refreshing = !!input.refreshToken;
  const body = new URLSearchParams({ client_id: input.clientId, grant_type: refreshing ? "refresh_token" : "authorization_code", ...(refreshing ? { refresh_token: input.refreshToken! } : { code: input.code!, code_verifier: input.verifier!, redirect_uri: input.redirectUri! }) });
  let response: Response;
  try {
    response = await fetchImpl("https://dash.cloudflare.com/oauth2/token", { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
    if (!response.ok || !response.body) { await response.body?.cancel(); throw Error("rejected"); }
    const reader = response.body.getReader(); let text = "", size = 0; const decoder = new TextDecoder("utf-8", { fatal: true });
    try { for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > 65536) throw Error("oversized"); text += decoder.decode(item.value, { stream: true }); } text += decoder.decode(); }
    finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    const value = JSON.parse(text);
    const token = value.access_token, refreshToken = value.refresh_token ?? input.refreshToken;
    if (typeof token !== "string" || token.length < 16 || token.length > 16384 || /\s/.test(token) || typeof refreshToken !== "string" || refreshToken.length < 16 || refreshToken.length > 16384 || /\s/.test(refreshToken) || String(value.token_type).toLowerCase() !== "bearer" || !Number.isSafeInteger(value.expires_in) || value.expires_in < 1 || value.expires_in > 31536000) throw Error("invalid response");
    return { token, refreshToken, expiresAt: Date.now() + value.expires_in * 1000, clientId: input.clientId };
  } catch { throw Error("Cloudflare authorization could not be completed. Reconnect with Cloudflare; the token request will not be repeated automatically."); }
}
