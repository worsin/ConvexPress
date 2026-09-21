import { validateEditorOrigin } from "@convexpress/runtime-clients/preview-origin";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { authenticatedMutation, authenticatedQuery, assertStoredAccess } from "../rbac/functions";
import { requireAuth } from "../helpers/auth";
import { requireHostingAccount, requireHostingAccess } from "./policy";
import { websiteReleaseState } from "../schema/websiteHosting";
import { hostingEnvelope } from "../schema/hosting";
import { runtimeVerification, assertRuntimeVerification, type RuntimeVerification } from "./websiteRuntimeVerification";

const instanceId = v.id("overseer_websiteInstances"), accountId = v.id("overseer_hostingAccounts");
const releaseId = v.id("overseer_websiteHostingReleases");
export const releaseLease = { releaseId, leaseToken: v.string() };
const runtime = { deploymentOrigin: v.string(), siteOrigin: v.string(), instanceKey: v.string(), clerkPublishableKey: v.string(), editorOrigin: v.string() };
export const summary = v.object({ releaseId, state: websiteReleaseState, phase: v.string(), artifactHash: v.string(), clerkPublishableKey: v.string(), updatedAt: v.number(), leaseUntil: v.number(), runtimeVerification: v.optional(runtimeVerification), runtimeFailure: v.optional(runtimeVerification) });
const publicRelease = (r: { _id: Id<"overseer_websiteHostingReleases">; state: "intent" | "uploading" | "uncertain" | "cancelled" | "succeeded"; phase: string; artifactHash: string; clerkPublishableKey: string; updatedAt: number; leaseUntil: number; runtimeVerification?: RuntimeVerification; runtimeFailure?: RuntimeVerification }) => ({ releaseId: r._id, state: r.state, phase: r.phase, artifactHash: r.artifactHash, clerkPublishableKey: r.clerkPublishableKey, updatedAt: r.updatedAt, leaseUntil: r.leaseUntil, ...(r.runtimeVerification ? { runtimeVerification: r.runtimeVerification } : {}), ...(r.runtimeFailure ? { runtimeFailure: r.runtimeFailure } : {}) });
const LEASE_MS = 120_000;
async function scope(ctx: QueryCtx | MutationCtx, id: Id<"overseer_websiteInstances">) {
  const instance = await ctx.db.get(id);
  if (!instance || instance.status !== "active") throw Error("Website environment is not active");
  const website = await ctx.db.get(instance.website_id);
  if (!website || website.status !== "active" || !website.organization_id || !website.business_id) throw Error("Website has no active business");
  const operator = await requireHostingAccess(ctx, { organizationId: website.organization_id, businessId: website.business_id });
  if (instance.organization_id !== website.organization_id || instance.business_id !== website.business_id) throw Error("Environment business scope mismatch");
  for (const code of ["site.deploy", ...(instance.kind === "live" ? ["environment.live.operate"] : [])])
    await assertStoredAccess(ctx, operator, { selector: { type: "capability", code }, target: { organizationId: String(website.organization_id), businessId: String(website.business_id), websiteId: String(website._id), instanceId: String(instance._id) } });
  for (const value of [instance.deploymentOrigin, instance.siteOrigin]) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.origin !== value) throw Error("Website publishing requires confirmed HTTPS origins");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(instance.instanceKey)) throw Error("Invalid environment identity");
  return { instance, website, operator };
}
async function target(ctx: QueryCtx | MutationCtx, id: Id<"overseer_websiteInstances">, aid: Id<"overseer_hostingAccounts">) {
  const s = await scope(ctx, id);
  const { account } = await requireHostingAccount(ctx, aid, s.website._id);
  if (account.provider !== "cloudflare") throw Error("Select a Cloudflare account");
  return { ...s, account };
}
async function leased(ctx: QueryCtx | MutationCtx, args: { releaseId: Id<"overseer_websiteHostingReleases">; leaseToken: string }) {
  const r = await ctx.db.get(args.releaseId);
  if (!r || r.leaseToken !== args.leaseToken || r.leaseUntil <= Date.now()) throw Error("Website release lease expired; reconcile before retrying");
  const binding = await ctx.db.get(r.targetId);
  if (!binding || binding.instanceId !== r.instanceId) throw Error("Website release target mismatch");
  const t = await target(ctx, r.instanceId, binding.accountId);
  if (r.requestedBy !== t.operator._id || r.accountRevision !== t.account.revision || binding.externalAccountId !== t.account.externalAccountId
    || r.deploymentOrigin !== t.instance.deploymentOrigin || r.siteOrigin !== t.instance.siteOrigin || r.instanceKey !== t.instance.instanceKey)
    throw Error("Website or provider account changed during publication");
  return { r, binding, ...t };
}
export const status = authenticatedQuery({
  args: { instanceId }, returns: v.object({ binding: v.union(v.null(), v.object({ accountId, workerName: v.string() })), latest: v.union(summary, v.null()) }),
  handler: async (ctx, args) => {
    await scope(ctx, args.instanceId);
    const b = await ctx.db.query("overseer_websiteHostingTargets").withIndex("by_instance", q => q.eq("instanceId", args.instanceId)).unique();
    const r = await ctx.db.query("overseer_websiteHostingReleases").withIndex("by_instance", q => q.eq("instanceId", args.instanceId)).order("desc").first();
    return { binding: b ? { accountId: b.accountId, workerName: b.workerName } : null, latest: r ? publicRelease(r) : null };
  },
});
export const begin = authenticatedMutation({
  args: { instanceId, accountId, workerName: v.string(), artifactHash: v.string(), clerkPublishableKey: v.optional(v.string()), editorOrigin: v.optional(v.string()), confirmLive: v.optional(v.boolean()) },
  returns: v.object({ ...summary.fields, leaseToken: v.string() }),
  handler: async (ctx, args) => {
    const t = await target(ctx, args.instanceId, args.accountId);
    if (t.instance.kind === "live" && args.confirmLive !== true) throw Error("Confirm publishing this live website");
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(args.workerName) || !/^[a-f0-9]{64}$/.test(args.artifactHash)) throw Error("Invalid Worker name or artifact hash");
    if (!t.instance.siteOrigin.startsWith(`https://${args.workerName}.`) || !t.instance.siteOrigin.endsWith(".workers.dev")) throw Error("Worker name must match the registered website address");
    const clerk = args.clerkPublishableKey ?? "";
    const editorOrigin = args.editorOrigin === undefined ? "" : validateEditorOrigin(args.editorOrigin);
    if (clerk && !/^pk_(?:test|live)_[A-Za-z0-9+/=_-]{10,500}$/.test(clerk)) throw Error("Enter a Clerk publishable key, never a secret key");
    let b = await ctx.db.query("overseer_websiteHostingTargets").withIndex("by_instance", q => q.eq("instanceId", args.instanceId)).unique();
    if (b && (b.accountId !== args.accountId || b.workerName !== args.workerName || b.externalAccountId !== t.account.externalAccountId)) throw Error("This environment is already bound to another Worker or account");
    const occupied = await ctx.db.query("overseer_websiteHostingTargets").withIndex("by_worker", q => q.eq("externalAccountId", t.account.externalAccountId).eq("workerName", args.workerName)).unique();
    if (occupied && occupied.instanceId !== args.instanceId) throw Error("This Worker is bound to another website environment");
    const prior = await ctx.db.query("overseer_websiteHostingReleases").withIndex("by_instance", q => q.eq("instanceId", args.instanceId)).order("desc").first();
    // A confirmed runtime failure may be replaced by a corrected artifact. The
    // prior receipt remains intact; ambiguous uploads still require reconciliation.
    const replacingFailedArtifact = prior?.runtimeVerification?.result === "failed" && prior.artifactHash !== args.artifactHash && prior.leaseUntil <= Date.now();
    if (prior && ["intent", "uploading", "uncertain"].includes(prior.state) && !replacingFailedArtifact) {
      if (prior.leaseUntil > Date.now()) throw Error("Another release is still active");
      if (prior.artifactHash !== args.artifactHash || prior.clerkPublishableKey !== clerk || (prior.editorOrigin ?? "") !== editorOrigin || prior.deploymentOrigin !== t.instance.deploymentOrigin || prior.siteOrigin !== t.instance.siteOrigin) throw Error("Reconcile the unfinished release with its original artifact and settings");
      const leaseToken = crypto.randomUUID();
      await ctx.db.patch(prior._id, { leaseToken, leaseUntil: Date.now() + LEASE_MS, requestedBy: t.operator._id, accountRevision: t.account.revision, updatedAt: Date.now() });
      return { ...publicRelease(prior), leaseToken, leaseUntil: Date.now() + LEASE_MS };
    }
    if (!b) {
      const id = await ctx.db.insert("overseer_websiteHostingTargets", { instanceId: args.instanceId, accountId: args.accountId, externalAccountId: t.account.externalAccountId, workerName: args.workerName, createdAt: Date.now() });
      b = (await ctx.db.get(id))!;
    }
    const now = Date.now(), leaseToken = crypto.randomUUID();
    const id = await ctx.db.insert("overseer_websiteHostingReleases", { targetId: b._id, instanceId: args.instanceId, accountRevision: t.account.revision, artifactHash: args.artifactHash, deploymentOrigin: t.instance.deploymentOrigin, siteOrigin: t.instance.siteOrigin, instanceKey: t.instance.instanceKey, clerkPublishableKey: clerk, editorOrigin, requestedBy: t.operator._id, state: "intent", phase: "Prepared", leaseToken, leaseUntil: now + LEASE_MS, createdAt: now, updatedAt: now });
    return { ...publicRelease((await ctx.db.get(id))!), leaseToken };
  },
});
export const prepare = internalQuery({
  args: releaseLease,
  returns: v.object({ ...runtime, accountId, externalAccountId: v.string(), workerName: v.string(), artifactHash: v.string(), credentialGeneration: v.number(), credentials: hostingEnvelope, organizationId: v.id("overseer_organizations"), businessId: v.optional(v.id("overseer_businesses")), state: websiteReleaseState }),
  handler: async (ctx, args) => {
    const t = await leased(ctx, args);
    return { deploymentOrigin: t.r.deploymentOrigin, siteOrigin: t.r.siteOrigin, instanceKey: t.r.instanceKey, clerkPublishableKey: t.r.clerkPublishableKey, editorOrigin: t.r.editorOrigin ?? "", accountId: t.account._id, externalAccountId: t.account.externalAccountId, workerName: t.binding.workerName, artifactHash: t.r.artifactHash, credentials: t.account.credentials!, credentialGeneration: t.account.credentialGeneration ?? 0, organizationId: t.account.organizationId, ...(t.account.businessId ? { businessId: t.account.businessId } : {}), state: t.r.state };
  },
});
export const checkpoint = authenticatedMutation({
  args: { ...releaseLease, phase: v.union(v.literal("assets"), v.literal("worker"), v.literal("subdomain")) }, returns: v.null(),
  handler: async (ctx, args) => {
    const t = await leased(ctx, args);
    if (!["intent", "uploading", "uncertain"].includes(t.r.state)) throw Error("Release is not active");
    await ctx.db.patch(t.r._id, { state: args.phase === "worker" || t.r.state === "uploading" || t.r.state === "uncertain" ? "uploading" : "intent", phase: args.phase, leaseUntil: Date.now() + LEASE_MS, updatedAt: Date.now() });
    return null;
  },
});
export const interrupted = authenticatedMutation({
  args: { ...releaseLease }, returns: v.null(),
  handler: async (ctx, args) => {
    // Even after provider credentials are revoked, the initiating operator can
    // record an interruption. This action cannot authorize more provider writes.
    const operator = await requireAuth(ctx), r = await ctx.db.get(args.releaseId);
    if (!r || r.requestedBy !== operator._id || r.leaseToken !== args.leaseToken) throw Error("Release does not belong to this operator");
    if (r.state !== "succeeded" && !(r.runtimeVerification?.result === "failed" && r.leaseUntil === 0)) await ctx.db.patch(r._id, { state: r.state === "intent" ? "cancelled" : "uncertain", phase: "Interrupted; verify before retrying", leaseUntil: 0, updatedAt: Date.now() });
    return null;
  },
});
export const complete = internalMutation({
  args: { ...releaseLease, verification: runtimeVerification }, returns: v.null(), handler: async (ctx, args) => {
    const t = await leased(ctx, args);
    assertRuntimeVerification(args.verification, { releaseId: String(t.r._id), instanceKey: t.r.instanceKey, artifactHash: t.r.artifactHash, siteOrigin: t.r.siteOrigin });
    const verified = args.verification.result === "verified";
    await ctx.db.patch(t.r._id, { state: verified ? "succeeded" : "uncertain", phase: verified ? "Published; public pages verified" : "Uploaded, but public pages failed verification; retry or publish a corrected artifact", runtimeVerification: args.verification, ...(!verified ? { runtimeFailure: args.verification } : {}), leaseUntil: 0, updatedAt: Date.now() });
    return null;
  },
});
