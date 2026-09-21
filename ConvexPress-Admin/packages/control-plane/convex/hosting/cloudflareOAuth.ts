"use node";
import { randomBytes } from "node:crypto";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { operatorAction } from "../rbac/functions";
import { encryptCredentialPayload, decryptCredentialPayload, parseEnvelopeKeys, parseEnvelopeKey } from "../connections/crypto";
import { hostingCredentialAad } from "./policy";
import { CloudflareApi } from "./providerApi";
import { authorization, exchangeToken, oauthConfig, stateHash, type OAuthTokens } from "./cloudflareOAuthClient";
function seal(payload: Record<string, unknown>, aad: string) {
 const keys = parseEnvelopeKeys({ serializedKeys: process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS, activeVersion: process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION });
 return encryptCredentialPayload({ payload, key: keys.key, keyVersion: keys.activeVersion, aad });
}
function unseal(envelope: Parameters<typeof decryptCredentialPayload>[0]["envelope"], aad: string) {
 return decryptCredentialPayload({ envelope, aad, key: parseEnvelopeKey(process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS, envelope.version) });
}
const result = v.object({ accountId: v.id("overseer_hostingAccounts"), provider: v.literal("cloudflare"), externalAccountId: v.string(), label: v.string(), revision: v.number() });
export const begin = operatorAction({
 args: { organizationId: v.id("overseer_organizations"), businessId: v.optional(v.id("overseer_businesses")), externalAccountId: v.string(), expectedRevision: v.number() },
 returns: v.object({ authorizationUrl: v.string(), redirectUri: v.string(), state: v.string() }),
 handler: async (ctx, args): Promise<{ authorizationUrl: string; redirectUri: string; state: string }> => {
  const config = oauthConfig();
  const flow = authorization(config); const hash = stateHash(flow.state);
  await ctx.runMutation(internal.hosting.cloudflareOAuthRecords.createAttempt, { ...args, stateHash: hash, verifier: seal({ verifier: flow.verifier }, `convexpress-cloudflare-pkce:${hash}`), clientId: config.clientId, redirectUri: config.redirectUri });
  return { authorizationUrl: flow.authorizationUrl, redirectUri: config.redirectUri, state: flow.state };
 },
});
export const complete = operatorAction({
 args: { state: v.string(), code: v.string() }, returns: result,
 handler: async (ctx, args): Promise<{ accountId: Id<"overseer_hostingAccounts">; provider: "cloudflare"; externalAccountId: string; label: string; revision: number }> => {
  if (!args.code || args.code.length > 8192 || /[\u0000-\u0020\u007f]/.test(args.code)) throw Error("Invalid Cloudflare authorization code");
  const hash = stateHash(args.state), config = oauthConfig();
  const attempt = await ctx.runMutation(internal.hosting.cloudflareOAuthRecords.claimAttempt, { stateHash: hash });
  if (attempt.clientId !== config.clientId || attempt.redirectUri !== config.redirectUri) throw Error("Cloudflare sign-in configuration changed; start again");
  const aad = hostingCredentialAad({ ...attempt, provider: "cloudflare" });
  let tokens: Record<string, unknown>;
  if (attempt.state === "completed" && attempt.accountId) {
   const account = await ctx.runQuery(internal.hosting.accounts.prepareUse, { accountId: attempt.accountId });
   return { accountId: account.accountId, provider: "cloudflare", externalAccountId: account.externalAccountId, label: account.label, revision: account.revision };
  }
  if (attempt.tokens) tokens = unseal(attempt.tokens, aad);
  else {
   if (!attempt.verifier) throw Error("Cloudflare sign-in verifier is unavailable");
   const pkce = unseal(attempt.verifier, `convexpress-cloudflare-pkce:${hash}`);
   if (typeof pkce.verifier !== "string") throw Error("Cloudflare sign-in verifier is unavailable");
   tokens = await exchangeToken({ clientId: attempt.clientId, redirectUri: attempt.redirectUri, code: args.code, verifier: pkce.verifier });
   // Persist rotated secrets before follow-up provider reads; resume uses these, never replays the code.
   await ctx.runMutation(internal.hosting.cloudflareOAuthRecords.receiveAttempt, { stateHash: hash, tokens: seal(tokens, aad), expiresAt: tokens.expiresAt as number });
  }
  if (typeof tokens.token !== "string" || typeof tokens.expiresAt !== "number" || tokens.expiresAt <= Date.now()) throw Error("Cloudflare authorization expired; reconnect");
  const identity = await new CloudflareApi(tokens.token, attempt.externalAccountId).verifyIdentity();
  const account = await ctx.runMutation(internal.hosting.cloudflareOAuthRecords.finishAttempt, { stateHash: hash, label: identity.label });
  return { accountId: account.accountId, provider: "cloudflare", externalAccountId: account.externalAccountId, label: account.label, revision: account.revision };
 },
});
/** Called only inside authorized control-plane actions; never export provider refresh material. */
export async function getCloudflareToken(ctx: ActionCtx, accountId: Id<"overseer_hostingAccounts">): Promise<{ token: string; generation: number; revision: number }> {
 const account = await ctx.runMutation(internal.hosting.cloudflareOAuthRecords.claimRefresh, { accountId, lease: randomBytes(24).toString("hex") });
 const aad = hostingCredentialAad({ ...account, businessId: account.businessId ?? undefined });
 let payload = unseal(account.credentials, aad);
 try {
  if (account.disposition === "refresh") {
   const config = oauthConfig();
   if (payload.clientId !== config.clientId || typeof payload.refreshToken !== "string") throw Error("Cloudflare authorization cannot be renewed; reconnect this account");
   const tokens: OAuthTokens = await exchangeToken({ clientId: config.clientId, refreshToken: payload.refreshToken });
   await ctx.runMutation(internal.hosting.cloudflareOAuthRecords.receiveRefresh, { accountId, lease: account.lease!, generation: account.credentialGeneration, credentials: seal(tokens, aad), expiresAt: tokens.expiresAt });
   payload = tokens;
  }
  if (typeof payload.token !== "string") throw Error("Reconnect this Cloudflare account");
  await new CloudflareApi(payload.token, account.externalAccountId).verifyIdentity();
  if (account.disposition !== "use") await ctx.runMutation(internal.hosting.cloudflareOAuthRecords.finishRefresh, { accountId, lease: account.lease!, generation: account.credentialGeneration });
  const current = await ctx.runQuery(internal.hosting.accounts.prepareUse, { accountId });
  const expectedGeneration = account.credentialGeneration + (account.disposition === "use" ? 0 : 1);
  if (current.revision !== account.revision || current.credentialGeneration !== expectedGeneration || current.credentialState !== "ready") throw Error("Cloudflare account changed during credential verification");
  return { token: payload.token, generation: current.credentialGeneration, revision: current.revision };
 } catch (cause) {
  if (account.disposition !== "use") { try { await ctx.runMutation(internal.hosting.cloudflareOAuthRecords.failRefresh, { accountId, lease: account.lease, generation: account.credentialGeneration }); } catch { /* Concurrent revoke/replacement already prevents use. */ } }
  throw cause;
 }
}
export const refresh = operatorAction({
 args: { accountId: v.id("overseer_hostingAccounts") }, returns: v.object({ accountId: v.id("overseer_hostingAccounts"), expiresAt: v.union(v.number(), v.null()), credentialStatus: v.string() }),
 handler: async (ctx, args): Promise<{ accountId: Id<"overseer_hostingAccounts">; expiresAt: number | null; credentialStatus: string }> => {
  await getCloudflareToken(ctx, args.accountId);
  const account = await ctx.runQuery(internal.hosting.accounts.prepareUse, args);
  return { accountId: args.accountId, expiresAt: account.credentialExpiresAt, credentialStatus: account.credentialState };
 },
});
