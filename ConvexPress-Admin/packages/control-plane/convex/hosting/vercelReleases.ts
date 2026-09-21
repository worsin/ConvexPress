import { validateEditorOrigin } from "@convexpress/runtime-clients/preview-origin";
import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { authenticatedMutation, authenticatedQuery, assertStoredAccess } from "../rbac/functions";
import { requireAuth } from "../helpers/auth";
import { requireHostingAccount, requireHostingAccess } from "./policy";
import { hostingEnvelope } from "../schema/hosting";
import { vercelReleaseState } from "../schema/vercelHosting";
import { assertRuntimeVerification, runtimeVerification } from "./websiteRuntimeVerification";

const instanceId = v.id("overseer_websiteInstances"), accountId = v.id("overseer_hostingAccounts");
const releaseId = v.id("overseer_vercelHostingReleases");
export const vercelLease = { releaseId, leaseToken: v.string() };
const step = v.union(v.literal("project"), v.literal("deployment"));
const LEASE_MS = 120_000;
export const vercelSummary = v.object({ releaseId, state: vercelReleaseState, phase: v.string(), artifactHash: v.string(), clerkPublishableKey: v.string(),
  updatedAt: v.number(), leaseUntil: v.number(), deploymentId: v.optional(v.string()), runtimeVerification: v.optional(runtimeVerification) });
function summary(r: Doc<"overseer_vercelHostingReleases">) {
  return { releaseId: r._id, state: r.state, phase: r.phase, artifactHash: r.artifactHash, clerkPublishableKey: r.clerkPublishableKey, updatedAt: r.updatedAt, leaseUntil: r.leaseUntil,
    ...(r.deploymentId ? { deploymentId: r.deploymentId } : {}), ...(r.runtimeVerification ? { runtimeVerification: r.runtimeVerification } : {}) };
}
async function scope(ctx: QueryCtx | MutationCtx, id: Id<"overseer_websiteInstances">) {
  const instance = await ctx.db.get(id);
  if (!instance || instance.status !== "active") throw Error("Website environment is not active");
  const website = await ctx.db.get(instance.website_id);
  if (!website || website.status !== "active" || !website.organization_id || !website.business_id) throw Error("Website has no active business");
  const operator = await requireHostingAccess(ctx, { organizationId: website.organization_id, businessId: website.business_id });
  if (instance.organization_id !== website.organization_id || instance.business_id !== website.business_id) throw Error("Environment business scope mismatch");
  for (const code of ["site.deploy", ...(instance.kind === "live" ? ["environment.live.operate"] : [])])
    await assertStoredAccess(ctx, operator, { selector: { type: "capability", code }, target: { organizationId: String(website.organization_id), businessId: String(website.business_id), websiteId: String(website._id), instanceId: String(instance._id) } });
  const database = new URL(instance.deploymentOrigin), site = new URL(instance.siteOrigin);
  if (database.protocol !== "https:" || database.origin !== instance.deploymentOrigin || database.port || !database.hostname.endsWith(".convex.cloud") ||
    instance.managementOrigin !== database.origin.replace(/\.convex\.cloud$/, ".convex.site") ||
    site.protocol !== "https:" || site.port || site.origin !== instance.siteOrigin || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(site.hostname))
    throw Error("Vercel publishing requires confirmed cloud database and HTTPS website origins");
  if (!/^[A-Za-z0-9][A-Za-z0-9_:-]{7,127}$/.test(instance.instanceKey)) throw Error("Invalid environment identity");
  return { instance, website, operator };
}
async function target(ctx: QueryCtx | MutationCtx, id: Id<"overseer_websiteInstances">, aid: Id<"overseer_hostingAccounts">) {
  const s = await scope(ctx, id);
  const { account } = await requireHostingAccount(ctx, aid, s.website._id);
  if (account.provider !== "vercel") throw Error("Select a Vercel account");
  return { ...s, account };
}
async function leased(ctx: QueryCtx | MutationCtx, args: { releaseId: Id<"overseer_vercelHostingReleases">; leaseToken: string }) {
  const r = await ctx.db.get(args.releaseId);
  if (!r || r.leaseToken !== args.leaseToken || r.leaseUntil <= Date.now() || !["active", "pending"].includes(r.state)) throw Error("Vercel release lease expired; resume this release");
  const binding = await ctx.db.get(r.targetId);
  if (!binding || !binding.active || binding.instanceId !== r.instanceId) throw Error("Vercel target mismatch");
  const t = await target(ctx, r.instanceId, binding.accountId);
  if (r.requestedBy !== t.operator._id || r.accountRevision !== t.account.revision || binding.externalAccountId !== t.account.externalAccountId ||
    r.deploymentOrigin !== t.instance.deploymentOrigin || r.siteOrigin !== t.instance.siteOrigin || r.instanceKey !== t.instance.instanceKey)
    throw Error("Website or provider account changed during publication");
  return { r, binding, ...t };
}
export const status = authenticatedQuery({
  args: { instanceId }, returns: v.object({ binding: v.union(v.null(), v.object({ accountId, projectName: v.string(), projectId: v.optional(v.string()) })), latest: v.union(vercelSummary, v.null()) }),
  handler: async (ctx, args) => {
    await scope(ctx, args.instanceId);
    const b = await ctx.db.query("overseer_vercelHostingTargets").withIndex("by_instance", q => q.eq("instanceId", args.instanceId).eq("active", true)).unique();
    const r = await ctx.db.query("overseer_vercelHostingReleases").withIndex("by_instance", q => q.eq("instanceId", args.instanceId)).order("desc").first();
    return { binding: b ? { accountId: b.accountId, projectName: b.projectName, ...(b.projectId ? { projectId: b.projectId } : {}) } : null, latest: r ? summary(r) : null };
  },
});
export const begin = authenticatedMutation({
  args: { instanceId, accountId, projectName: v.string(), artifactHash: v.string(), clerkPublishableKey: v.optional(v.string()), editorOrigin: v.optional(v.string()), confirmLive: v.optional(v.boolean()), resumeReleaseId: v.optional(releaseId) },
  returns: v.object({ ...vercelSummary.fields, leaseToken: v.string(), alreadySucceeded: v.optional(v.boolean()), siteOrigin: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const t = await target(ctx, args.instanceId, args.accountId);
    if (t.instance.kind === "live" && !args.confirmLive) throw Error("Confirm publishing this live website");
    if (!/^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$/.test(args.projectName) || !/^[a-f0-9]{64}$/.test(args.artifactHash)) throw Error("Invalid Vercel project or artifact");
    const clerk = args.clerkPublishableKey ?? "";
    const editorOrigin = args.editorOrigin === undefined ? "" : validateEditorOrigin(args.editorOrigin);
    if (clerk && !/^pk_(?:test|live)_[A-Za-z0-9+/=_-]{10,500}$/.test(clerk)) throw Error("Only a Clerk publishable key is accepted");
    let b = await ctx.db.query("overseer_vercelHostingTargets").withIndex("by_instance", q => q.eq("instanceId", args.instanceId).eq("active", true)).unique();
    let prior = await ctx.db.query("overseer_vercelHostingReleases").withIndex("by_instance", q => q.eq("instanceId", args.instanceId)).order("desc").first();
    const now = Date.now(), leaseToken = crypto.randomUUID();
    if (args.resumeReleaseId) {
      if (!prior || prior._id !== args.resumeReleaseId) throw Error("This release was superseded; refresh the current publication status");
      if (prior.state === "succeeded") {
        if (!b || b.accountId !== args.accountId || b.externalAccountId !== t.account.externalAccountId || b.projectName !== args.projectName ||
          prior.artifactHash !== args.artifactHash || prior.clerkPublishableKey !== clerk || (prior.editorOrigin ?? "") !== editorOrigin || prior.deploymentOrigin !== t.instance.deploymentOrigin || prior.siteOrigin !== t.instance.siteOrigin || prior.instanceKey !== t.instance.instanceKey)
          throw Error("Completed release does not match the requested retry");
        return { ...summary(prior), leaseToken: "", alreadySucceeded: true, siteOrigin: prior.siteOrigin };
      }
      if (prior.state === "failed") throw Error("This release failed; publish a new corrected release");
    }
    if (prior && ["active", "pending"].includes(prior.state) && prior.leaseUntil > now) throw Error("Another Vercel release is active");
    if (b && (b.accountId !== args.accountId || b.externalAccountId !== t.account.externalAccountId || b.projectName !== args.projectName)) {
      if (b.projectDispatched || b.projectId || prior?.deploymentDispatched || prior?.deploymentId) throw Error("Environment is already bound to another Vercel project");
      // Nothing was sent to this target. Preserve its history while allowing the
      // operator to correct a occupied project name or rejected account choice.
      await ctx.db.patch(b._id, { active: false }); b = null;
      if (prior) await ctx.db.patch(prior._id, { state: "failed", phase: "Reconfigured before provider creation", leaseUntil: 0, updatedAt: now });
      prior = null;
    }
    const occupied = await ctx.db.query("overseer_vercelHostingTargets").withIndex("by_project_name", q => q.eq("externalAccountId", t.account.externalAccountId).eq("projectName", args.projectName).eq("active", true)).unique();
    if (occupied && occupied.instanceId !== args.instanceId) throw Error("Vercel project is bound to another environment");
    if (prior && ["active", "pending"].includes(prior.state)) {
      if (prior.leaseUntil > now) throw Error("Another Vercel release is active");
      if (prior.artifactHash === args.artifactHash && prior.clerkPublishableKey === clerk && (prior.editorOrigin ?? "") === editorOrigin && prior.deploymentOrigin === t.instance.deploymentOrigin && prior.siteOrigin === t.instance.siteOrigin && prior.instanceKey === t.instance.instanceKey) {
        await ctx.db.patch(prior._id, { leaseToken, leaseUntil: now + LEASE_MS, requestedBy: t.operator._id, accountRevision: t.account.revision, updatedAt: now });
        return { ...summary(prior), leaseToken, leaseUntil: now + LEASE_MS, updatedAt: now };
      }
      if (prior.deploymentDispatched || prior.deploymentId) throw Error("Resume the unfinished Vercel release with its original artifact and settings");
      await ctx.db.patch(prior._id, { state: "failed", phase: "Reconfigured before deployment submission", leaseUntil: 0, updatedAt: now });
    }
    if (!b) {
      const id = await ctx.db.insert("overseer_vercelHostingTargets", { instanceId: args.instanceId, accountId: args.accountId, externalAccountId: t.account.externalAccountId,
        projectName: args.projectName, hostingTarget: crypto.randomUUID(), active: true, projectDispatched: false, createdAt: now });
      b = (await ctx.db.get(id))!;
    }
    const id = await ctx.db.insert("overseer_vercelHostingReleases", { targetId: b._id, instanceId: args.instanceId, accountRevision: t.account.revision,
      artifactHash: args.artifactHash, deploymentOrigin: t.instance.deploymentOrigin, siteOrigin: t.instance.siteOrigin, instanceKey: t.instance.instanceKey,
      clerkPublishableKey: clerk, editorOrigin, requestedBy: t.operator._id, state: "active", phase: "Prepared", leaseToken, leaseUntil: now + LEASE_MS,
      deploymentDispatched: false, createdAt: now, updatedAt: now });
    return { ...summary((await ctx.db.get(id))!), leaseToken };
  },
});
export const prepare = internalQuery({
  args: vercelLease, returns: v.object({ accountId, externalAccountId: v.string(), projectName: v.string(), hostingTarget: v.string(), projectDispatched: v.boolean(), projectId: v.optional(v.string()),
    deploymentDispatched: v.boolean(), deploymentId: v.optional(v.string()), artifactHash: v.string(), deploymentOrigin: v.string(), siteOrigin: v.string(), instanceKey: v.string(), clerkPublishableKey: v.string(), editorOrigin: v.string(),
    credentialGeneration: v.number(), credentials: hostingEnvelope, organizationId: v.id("overseer_organizations"), businessId: v.optional(v.id("overseer_businesses")) }),
  handler: async (ctx, args) => {
    const t = await leased(ctx, args);
    return { accountId: t.account._id, externalAccountId: t.account.externalAccountId, projectName: t.binding.projectName, hostingTarget: t.binding.hostingTarget,
      projectDispatched: t.binding.projectDispatched, ...(t.binding.projectId ? { projectId: t.binding.projectId } : {}),
      deploymentDispatched: t.r.deploymentDispatched, ...(t.r.deploymentId ? { deploymentId: t.r.deploymentId } : {}), artifactHash: t.r.artifactHash,
      deploymentOrigin: t.r.deploymentOrigin, siteOrigin: t.r.siteOrigin, instanceKey: t.r.instanceKey, clerkPublishableKey: t.r.clerkPublishableKey, editorOrigin: t.r.editorOrigin ?? "",
      credentialGeneration: t.account.credentialGeneration ?? 0, credentials: t.account.credentials!, organizationId: t.account.organizationId, ...(t.account.businessId ? { businessId: t.account.businessId } : {}) };
  },
});
/** Only the server-side provider action can claim a non-idempotent write. A
 * dispatched flag survives lease takeover, cancellation and missing readback. */
export const dispatch = internalMutation({
  args: { ...vercelLease, step }, returns: v.boolean(), handler: async (ctx, args) => {
    const t = await leased(ctx, args);
    if (args.step === "project") {
      if (t.binding.projectDispatched || t.binding.projectId) return false;
      await ctx.db.patch(t.binding._id, { projectDispatched: true });
    } else {
      if (!t.binding.projectId) throw Error("Confirm the Vercel project before deploying");
      if (t.r.deploymentDispatched || t.r.deploymentId) return false;
      await ctx.db.patch(t.r._id, { deploymentDispatched: true });
    }
    await ctx.db.patch(t.r._id, { phase: args.step === "project" ? "Creating Vercel project" : "Creating Vercel deployment", updatedAt: Date.now(), leaseUntil: Date.now() + LEASE_MS });
    return true;
  },
});
export const recordProject = internalMutation({
  args: { ...vercelLease, projectId: v.string(), hostingTarget: v.string() }, returns: v.null(), handler: async (ctx, args) => {
    const t = await leased(ctx, args);
    if (!/^prj_[A-Za-z0-9_-]{1,120}$/.test(args.projectId) || args.hostingTarget !== t.binding.hostingTarget || !t.binding.projectDispatched || (t.binding.projectId && t.binding.projectId !== args.projectId)) throw Error("Vercel project receipt mismatch");
    const occupied = await ctx.db.query("overseer_vercelHostingTargets").withIndex("by_project_id", q => q.eq("externalAccountId", t.account.externalAccountId).eq("projectId", args.projectId)).unique();
    if (occupied && occupied._id !== t.binding._id) throw Error("Vercel project belongs to another environment");
    await ctx.db.patch(t.binding._id, { projectId: args.projectId });
    await ctx.db.patch(t.r._id, { phase: "Project verified; uploading files", updatedAt: Date.now(), leaseUntil: Date.now() + LEASE_MS });
    return null;
  },
});
export const recordDeployment = internalMutation({
  args: { ...vercelLease, deploymentId: v.string() }, returns: v.null(), handler: async (ctx, args) => {
    const t = await leased(ctx, args);
    if (!/^dpl_[A-Za-z0-9_-]{1,120}$/.test(args.deploymentId) || !t.binding.projectId || !t.r.deploymentDispatched || (t.r.deploymentId && t.r.deploymentId !== args.deploymentId)) throw Error("Vercel deployment receipt mismatch");
    await ctx.db.patch(t.r._id, { deploymentId: args.deploymentId, phase: "Deployment created; waiting for public website", updatedAt: Date.now(), leaseUntil: Date.now() + LEASE_MS });
    return null;
  },
});
export const heartbeat = authenticatedMutation({
  args: vercelLease, returns: v.null(), handler: async (ctx, args) => {
    const t = await leased(ctx, args);
    await ctx.db.patch(t.r._id, { updatedAt: Date.now(), leaseUntil: Date.now() + LEASE_MS }); return null;
  },
});
export const result = authenticatedQuery({
  args: { releaseId }, returns: v.object({ state: vercelReleaseState, siteOrigin: v.string(), artifactHash: v.string() }), handler: async (ctx, args) => {
    const r = await ctx.db.get(args.releaseId); if (!r) throw Error("Vercel release not found");
    const t = await scope(ctx, r.instanceId);
    if (t.instance.siteOrigin !== r.siteOrigin || t.instance.deploymentOrigin !== r.deploymentOrigin || t.instance.instanceKey !== r.instanceKey) throw Error("Website environment changed after this release");
    return { state: r.state, siteOrigin: r.siteOrigin, artifactHash: r.artifactHash };
  },
});
export const providerRejected = internalMutation({
  args: { ...vercelLease, step }, returns: v.null(), handler: async (ctx, args) => {
    const t = await leased(ctx, args);
    if (args.step === "project") {
      if (t.binding.projectId || !t.binding.projectDispatched) throw Error("Project rejection does not match the dispatched operation");
      await ctx.db.patch(t.binding._id, { projectDispatched: false });
    } else if (t.r.deploymentId || !t.r.deploymentDispatched) throw Error("Deployment rejection does not match the dispatched operation");
    await ctx.db.patch(t.r._id, { state: "failed", phase: "Vercel rejected the request; correct the account or configuration and publish again", leaseUntil: 0, updatedAt: Date.now() }); return null;
  },
});
export const deploymentFailed = internalMutation({
  args: { ...vercelLease, deploymentId: v.string() }, returns: v.null(), handler: async (ctx, args) => {
    const t = await leased(ctx, args);
    if (t.r.deploymentId !== args.deploymentId) throw Error("Failed deployment does not match this release");
    await ctx.db.patch(t.r._id, { state: "failed", phase: "Vercel deployment failed; inspect the provider build and publish a corrected release", leaseUntil: 0, updatedAt: Date.now() }); return null;
  },
});
export const interrupted = authenticatedMutation({
  args: vercelLease, returns: v.null(), handler: async (ctx, args) => {
    const operator = await requireAuth(ctx), r = await ctx.db.get(args.releaseId);
    if (!r || r.requestedBy !== operator._id || r.leaseToken !== args.leaseToken) throw Error("Vercel release does not belong to this operator");
    if (["active", "pending"].includes(r.state)) await ctx.db.patch(r._id, { state: "pending", phase: "Interrupted; resume to reconcile the existing release", leaseUntil: 0, updatedAt: Date.now() });
    return null;
  },
});
export const complete = internalMutation({
  args: { ...vercelLease, verification: runtimeVerification }, returns: v.null(), handler: async (ctx, args) => {
    const t = await leased(ctx, args);
    if (!t.r.deploymentId) throw Error("Vercel deployment is not confirmed");
    assertRuntimeVerification(args.verification, { releaseId: String(t.r._id), instanceKey: t.r.instanceKey, artifactHash: t.r.artifactHash, siteOrigin: t.r.siteOrigin });
    await ctx.db.patch(t.r._id, { state: args.verification.result === "verified" ? "succeeded" : "failed", runtimeVerification: args.verification,
      phase: args.verification.result === "verified" ? "Published; public pages verified" : "Deployment ready, but public pages failed verification", leaseUntil: 0, updatedAt: Date.now() }); return null;
  },
});
