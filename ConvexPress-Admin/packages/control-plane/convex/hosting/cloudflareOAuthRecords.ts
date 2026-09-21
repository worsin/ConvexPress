import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { hostingEnvelope } from "../schema/hosting";
import { requireHostingAccess, requireHostingAccount, publicHostingAccount } from "./policy";
import { hostingAccountSummary } from "./accounts";
const scope = { organizationId: v.id("overseer_organizations"), businessId: v.optional(v.id("overseer_businesses")) };
const attemptView = v.object({ ...scope, externalAccountId: v.string(), expectedRevision: v.number(), clientId: v.string(), redirectUri: v.string(), verifier: v.optional(hostingEnvelope), tokens: v.optional(hostingEnvelope), tokenExpiresAt: v.optional(v.number()), accountId: v.optional(v.id("overseer_hostingAccounts")), state: v.string() });
export const createAttempt = internalMutation({
 args: { ...scope, externalAccountId: v.string(), expectedRevision: v.number(), stateHash: v.string(), verifier: hostingEnvelope, clientId: v.string(), redirectUri: v.string() }, returns: v.null(),
 handler: async (ctx, args) => {
  const operator = await requireHostingAccess(ctx, args);
  if (!/^[a-f0-9]{32}$/.test(args.externalAccountId) || !/^[a-f0-9]{64}$/.test(args.stateHash)) throw Error("Invalid Cloudflare account or authorization state");
  const recent = await ctx.db.query("overseer_hostingOAuthAttempts").withIndex("by_operator", q => q.eq("requestedBy", operator._id).gte("createdAt", Date.now() - 600000)).take(11);
  if (recent.length >= 10) throw Error("Too many recent Cloudflare sign-in attempts; wait before trying again");
  const current = await ctx.db.query("overseer_hostingAccounts").withIndex("by_scope_external", q => q.eq("organizationId", args.organizationId).eq("businessId", args.businessId).eq("provider", "cloudflare").eq("externalAccountId", args.externalAccountId)).unique();
  if ((current?.revision ?? 0) !== args.expectedRevision) throw Error("Hosting account changed; restart Cloudflare sign-in");
  await ctx.db.insert("overseer_hostingOAuthAttempts", { ...args, requestedBy: operator._id, state: "pending", expiresAt: Date.now() + 600000, createdAt: Date.now(), updatedAt: Date.now() });
  return null;
 },
});
export const claimAttempt = internalMutation({
 args: { stateHash: v.string() }, returns: attemptView,
 handler: async (ctx, args) => {
  const a = await ctx.db.query("overseer_hostingOAuthAttempts").withIndex("by_state", q => q.eq("stateHash", args.stateHash)).unique();
  if (!a) throw Error("Cloudflare sign-in state was not found");
  const operator = await requireHostingAccess(ctx, a);
  if (a.requestedBy !== operator._id) throw Error("Cloudflare sign-in belongs to another operator");
  if (a.expiresAt <= Date.now()) throw Error("Cloudflare sign-in expired; start again");
  if (a.state === "exchanging" || a.state === "failed") throw Error("Cloudflare sign-in response is uncertain; start a new authorization");
  if (a.state !== "completed") {
   const current = await ctx.db.query("overseer_hostingAccounts").withIndex("by_scope_external", q => q.eq("organizationId", a.organizationId).eq("businessId", a.businessId).eq("provider", "cloudflare").eq("externalAccountId", a.externalAccountId)).unique();
   if ((current?.revision ?? 0) !== a.expectedRevision) throw Error("Hosting account changed; restart Cloudflare sign-in");
  }
  if (a.state === "pending") await ctx.db.patch(a._id, { state: "exchanging", updatedAt: Date.now() });
  return { organizationId: a.organizationId, ...(a.businessId ? { businessId: a.businessId } : {}), externalAccountId: a.externalAccountId, expectedRevision: a.expectedRevision, clientId: a.clientId, redirectUri: a.redirectUri, ...(a.verifier ? { verifier: a.verifier } : {}), ...(a.tokens ? { tokens: a.tokens } : {}), ...(a.tokenExpiresAt !== undefined ? { tokenExpiresAt: a.tokenExpiresAt } : {}), ...(a.accountId ? { accountId: a.accountId } : {}), state: a.state };
 },
});
export const receiveAttempt = internalMutation({
 args: { stateHash: v.string(), tokens: hostingEnvelope, expiresAt: v.number() }, returns: v.null(),
 handler: async (ctx, args) => {
  const a = await ctx.db.query("overseer_hostingOAuthAttempts").withIndex("by_state", q => q.eq("stateHash", args.stateHash)).unique();
  if (!a || a.state !== "exchanging" || a.expiresAt <= Date.now()) throw Error("Cloudflare authorization changed");
  const operator = await requireHostingAccess(ctx, a);
  if (operator._id !== a.requestedBy) throw Error("Cloudflare sign-in belongs to another operator");
  await ctx.db.patch(a._id, { tokens: args.tokens, tokenExpiresAt: args.expiresAt, state: "received", updatedAt: Date.now() });
  return null;
 },
});
export const finishAttempt = internalMutation({
 args: { stateHash: v.string(), label: v.string() }, returns: hostingAccountSummary,
 handler: async (ctx, args) => {
  const a = await ctx.db.query("overseer_hostingOAuthAttempts").withIndex("by_state", q => q.eq("stateHash", args.stateHash)).unique();
  if (!a || !["received", "completed"].includes(a.state)) throw Error("Cloudflare authorization is not verified");
  const operator = await requireHostingAccess(ctx, a);
  if (operator._id !== a.requestedBy || a.expiresAt <= Date.now()) throw Error("Cloudflare authorization expired or changed");
  if (a.state === "completed" && a.accountId) return publicHostingAccount((await requireHostingAccount(ctx, a.accountId)).account);
  if (!a.tokens || !a.tokenExpiresAt || a.tokenExpiresAt <= Date.now() || !args.label.trim() || args.label.length > 160) throw Error("Cloudflare authorization is incomplete");
  const current = await ctx.db.query("overseer_hostingAccounts").withIndex("by_scope_external", q => q.eq("organizationId", a.organizationId).eq("businessId", a.businessId).eq("provider", "cloudflare").eq("externalAccountId", a.externalAccountId)).unique();
  if ((current?.revision ?? 0) !== a.expectedRevision) throw Error("Hosting account changed; start Cloudflare sign-in again");
  const values = { organizationId: a.organizationId, businessId: a.businessId, provider: "cloudflare" as const, externalAccountId: a.externalAccountId, label: args.label, status: "active" as const, credentials: a.tokens, credentialKind: "oauth" as const, credentialState: "ready" as const, credentialExpiresAt: a.tokenExpiresAt, credentialGeneration: (current?.credentialGeneration ?? 0) + 1, refreshLease: undefined, refreshLeaseUntil: undefined, pendingCredentials: undefined, pendingExpiresAt: undefined, verifiedAt: Date.now(), verifiedByUserId: operator._id, revision: a.expectedRevision + 1, updatedAt: Date.now() };
  const accountId = current?._id ?? await ctx.db.insert("overseer_hostingAccounts", { ...values, createdAt: Date.now() });
  if (current) await ctx.db.patch(accountId, values);
  await ctx.db.patch(a._id, { state: "completed", accountId, tokens: undefined, verifier: undefined, updatedAt: Date.now() });
  return publicHostingAccount((await ctx.db.get(accountId))!);
 },
});
const refreshView = v.object({ ...hostingAccountSummary.fields, credentials: hostingEnvelope, disposition: v.union(v.literal("use"), v.literal("refresh"), v.literal("resume")), lease: v.optional(v.string()) });
export const claimRefresh = internalMutation({
 args: { accountId: v.id("overseer_hostingAccounts"), lease: v.string() }, returns: refreshView,
 handler: async (ctx, args) => {
  const { account: a } = await requireHostingAccount(ctx, args.accountId);
  if (a.provider !== "cloudflare") throw Error("Select a Cloudflare account");
  if (a.credentialState === "reconnect") throw Error("Reconnect this Cloudflare account");
  if (a.pendingCredentials) {
   if ((a.refreshLeaseUntil ?? 0) > Date.now()) throw Error("Cloudflare credential renewal is already running");
   await ctx.db.patch(a._id, { refreshLease: args.lease, refreshLeaseUntil: Date.now() + 60000 });
   return { ...publicHostingAccount(a), credentials: a.pendingCredentials, disposition: "resume" as const, lease: args.lease };
  }
  if (a.credentialState === "refreshing") throw Error((a.refreshLeaseUntil ?? 0) > Date.now() ? "Cloudflare credential renewal is already running" : "Cloudflare renewal response was lost; reconnect this account");
  if (a.credentialKind !== "oauth") {
   if (a.credentialExpiresAt !== undefined && a.credentialExpiresAt <= Date.now() + 30000) throw Error("Cloudflare API token has expired or is about to expire; replace it in Hosting accounts");
   return { ...publicHostingAccount(a), credentials: a.credentials!, disposition: "use" as const };
  }
  if ((a.credentialExpiresAt ?? 0) > Date.now() + 120000) return { ...publicHostingAccount(a), credentials: a.credentials!, disposition: "use" as const };
  await ctx.db.patch(a._id, { credentialState: "refreshing", refreshLease: args.lease, refreshLeaseUntil: Date.now() + 60000 });
  return { ...publicHostingAccount(a), credentials: a.credentials!, disposition: "refresh" as const, lease: args.lease };
 },
});
export const receiveRefresh = internalMutation({
 args: { accountId: v.id("overseer_hostingAccounts"), lease: v.string(), generation: v.number(), credentials: hostingEnvelope, expiresAt: v.number() }, returns: v.null(),
 handler: async (ctx, args) => {
  const { account: a } = await requireHostingAccount(ctx, args.accountId);
  if (a.refreshLease !== args.lease || a.credentialState !== "refreshing" || (a.credentialGeneration ?? 0) !== args.generation) throw Error("Cloudflare credential changed during renewal");
  await ctx.db.patch(a._id, { pendingCredentials: args.credentials, pendingExpiresAt: args.expiresAt });
  return null;
 },
});
export const finishRefresh = internalMutation({
 args: { accountId: v.id("overseer_hostingAccounts"), lease: v.string(), generation: v.number() }, returns: v.null(),
 handler: async (ctx, args) => {
  const { account: a } = await requireHostingAccount(ctx, args.accountId);
  if (a.refreshLease !== args.lease || a.credentialState !== "refreshing" || (a.credentialGeneration ?? 0) !== args.generation || !a.pendingCredentials || (a.pendingExpiresAt ?? 0) <= Date.now()) throw Error("Cloudflare credential changed during renewal");
  await ctx.db.patch(a._id, { credentials: a.pendingCredentials, credentialExpiresAt: a.pendingExpiresAt, credentialGeneration: args.generation + 1, credentialState: "ready", pendingCredentials: undefined, pendingExpiresAt: undefined, refreshLease: undefined, refreshLeaseUntil: undefined, verifiedAt: Date.now(), updatedAt: Date.now() });
  return null;
 },
});
export const failRefresh = internalMutation({
 args: { accountId: v.id("overseer_hostingAccounts"), lease: v.string(), generation: v.number() }, returns: v.null(),
 handler: async (ctx, args) => {
  const { account: a } = await requireHostingAccount(ctx, args.accountId);
  if (a.refreshLease !== args.lease || (a.credentialGeneration ?? 0) !== args.generation) return null;
  await ctx.db.patch(a._id, a.pendingCredentials ? { refreshLeaseUntil: 0 } : { credentialState: "reconnect", refreshLease: undefined, refreshLeaseUntil: undefined });
  return null;
 },
});
