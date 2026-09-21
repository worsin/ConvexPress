import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireHostingAccount } from "./policy";
import { hostingEnvelope } from "../schema/hosting";
import { requireAuth } from "../helpers/auth";
import { requireActiveParent } from "../hierarchyPolicy";
import { authenticatedQuery } from "../rbac/functions";
import { assertStoredAccess } from "../rbac/functions";

const instanceId = v.id("overseer_websiteInstances");
const credentialId = v.id("overseer_hostingDeploymentCredentials");
const RECOVERY_WAIT_MS = 15 * 60_000;
export const credentialKeyName = (id: string, generation = 0) =>
  `ConvexPress ${id}${generation ? ` attempt ${generation}` : ""}`;

async function target(ctx: QueryCtx | MutationCtx, id: Id<"overseer_websiteInstances">) {
  const instance = await ctx.db.get(id);
  if (!instance || instance.status !== "active") throw Error("Environment is not active");
  const website = await ctx.db.get(instance.website_id);
  if (!website || website.status !== "active") throw Error("Website is not active");
  const operator = await requireAuth(ctx);
  if (!website.organization_id || !website.business_id)
    throw Error("Website has no active business scope");
  const organization = requireActiveParent(
    await ctx.db.get(website.organization_id),
    "Organization",
  );
  const business = requireActiveParent(await ctx.db.get(website.business_id), "Business");
  if (business.organizationId !== organization._id) throw Error("Website business scope mismatch");
  for (const code of [
    "site.deploy",
    ...(instance.kind === "live" ? ["environment.live.operate"] : []),
  ]) {
    await assertStoredAccess(ctx, operator, {
      selector: { type: "capability", code },
      target: {
        organizationId: String(website.organization_id),
        businessId: String(website.business_id),
        websiteId: String(website._id),
        instanceId: String(instance._id),
      },
    });
  }
  const attachment =
    (await ctx.db
      .query("overseer_hostingAttachments")
      .withIndex("by_production", (q) => q.eq("productionInstanceId", id))
      .unique()) ??
    (await ctx.db
      .query("overseer_hostingAttachments")
      .withIndex("by_staging", (q) => q.eq("stagingInstanceId", id))
      .unique());
  if (!attachment) return null;
  const { account } = await requireHostingAccount(ctx, attachment.accountId, website._id);
  if (account.provider !== "convex" || attachment.websiteId !== website._id)
    throw Error("Cloud account target mismatch");
  const receipt = await ctx.db.get(attachment.receiptId);
  if (
    !receipt ||
    receipt.state !== "succeeded" ||
    receipt.accountId !== account._id ||
    receipt.websiteId !== website._id
  )
    throw Error("Cloud provisioning receipt is not complete");
  const kind = attachment.productionInstanceId === id ? "production" : "staging";
  const step = await ctx.db
    .query("overseer_hostingProvisioningSteps")
    .withIndex("by_receipt_step", (q) => q.eq("receiptId", receipt._id).eq("step", kind))
    .unique();
  const project = await ctx.db
    .query("overseer_hostingProvisioningSteps")
    .withIndex("by_receipt_step", (q) => q.eq("receiptId", receipt._id).eq("step", "project"))
    .unique();
  if (
    step?.state !== "confirmed" ||
    !step.externalId ||
    !/^[a-z0-9-]+$/.test(step.externalId) ||
    project?.state !== "confirmed" ||
    !project.externalId ||
    !/^\d+$/.test(project.externalId) ||
    instance.kind !== (kind === "production" ? "live" : "staging") ||
    instance.deploymentName !== step.externalId ||
    instance.projectRef !== project.externalId ||
    instance.deploymentOrigin !== `https://${step.externalId}.convex.cloud` ||
    instance.managementOrigin !== `https://${step.externalId}.convex.site`
  )
    throw Error("Cloud environment no longer matches its confirmed resource");
  return {
    instance,
    website,
    account,
    receipt,
    deploymentName: step.externalId,
    projectId: Number(project.externalId),
  };
}

export const prepare = internalQuery({
  args: { instanceId },
  handler: async (ctx, args) => {
    const t = await target(ctx, args.instanceId);
    if (!t) return null;
    const stored = await ctx.db
      .query("overseer_hostingDeploymentCredentials")
      .withIndex("by_instance", (q) => q.eq("instanceId", args.instanceId))
      .unique();
    if (
      stored &&
      (stored.accountId !== t.account._id ||
        stored.receiptId !== t.receipt._id ||
        stored.deploymentName !== t.deploymentName)
    )
      throw Error("Stored cloud credential target mismatch");
    return {
      accountId: t.account._id,
      accountRevision: t.account.revision,
      receiptId: t.receipt._id,
      projectId: t.projectId,
      deploymentName: t.deploymentName,
      websiteKey: t.website.websiteKey,
      instanceKey: t.instance.instanceKey,
      environmentKind: t.instance.kind,
      deploymentOrigin: t.instance.deploymentOrigin,
      managementOrigin: t.instance.managementOrigin,
      siteOrigin: t.instance.siteOrigin,
      stored: stored
        ? {
            credentialId: stored._id,
            state: stored.state,
            generation: stored.generation ?? 0,
            envelope: stored.envelope ?? null,
          }
        : null,
    };
  },
});

export const claim = internalMutation({
  args: { instanceId, accountRevision: v.number() },
  handler: async (ctx, args) => {
    const t = await target(ctx, args.instanceId);
    if (!t || t.account.revision !== args.accountRevision)
      throw Error("Cloud account changed during setup");
    const prior = await ctx.db
      .query("overseer_hostingDeploymentCredentials")
      .withIndex("by_instance", (q) => q.eq("instanceId", args.instanceId))
      .unique();
    if (prior) {
      if (
        prior.accountId !== t.account._id ||
        prior.receiptId !== t.receipt._id ||
        prior.deploymentName !== t.deploymentName
      )
        throw Error("Stored cloud credential target mismatch");
      if (prior.state !== "rejected")
        return { credentialId: prior._id, generation: prior.generation ?? 0, create: false };
      await ctx.db.patch(prior._id, {
        state: "intent",
        accountRevision: args.accountRevision,
        updatedAt: Date.now(),
      });
      return { credentialId: prior._id, generation: prior.generation ?? 0, create: true };
    }
    const now = Date.now();
    const id = await ctx.db.insert("overseer_hostingDeploymentCredentials", {
      instanceId: args.instanceId,
      receiptId: t.receipt._id,
      accountId: t.account._id,
      accountRevision: args.accountRevision,
      deploymentName: t.deploymentName,
      state: "intent",
      createdAt: now,
      updatedAt: now,
    });
    return { credentialId: id, generation: 0, create: true };
  },
});

export const commit = internalMutation({
  args: { credentialId, generation: v.number(), envelope: hostingEnvelope },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.credentialId);
    if (!row || row.state !== "intent" || (row.generation ?? 0) !== args.generation)
      throw Error("Credential request is not pending");
    const t = await target(ctx, row.instanceId);
    if (
      !t ||
      t.account._id !== row.accountId ||
      t.account.revision !== row.accountRevision ||
      t.receipt._id !== row.receiptId ||
      t.deploymentName !== row.deploymentName
    )
      throw Error("Cloud account changed before credential storage");
    await ctx.db.patch(row._id, { state: "ready", envelope: args.envelope, updatedAt: Date.now() });
    return null;
  },
});

export const rejected = internalMutation({
  args: { credentialId, generation: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.credentialId);
    if (!row) throw Error("Credential request not found");
    await target(ctx, row.instanceId);
    if (row.state === "intent" && (row.generation ?? 0) === args.generation)
      await ctx.db.patch(row._id, { state: "rejected", updatedAt: Date.now() });
    return null;
  },
});

export const recoveryStatus = authenticatedQuery({
  args: { instanceId },
  returns: v.union(
    v.null(),
    v.object({
      credentialId,
      deploymentName: v.string(),
      state: v.string(),
      eligibleAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    // A status widget is visible only to operators who can actually recover this
    // environment. It must not turn a restricted live environment into a page error.
    const t = await target(ctx, args.instanceId).catch(() => null);
    if (!t) return null;
    const row = await ctx.db
      .query("overseer_hostingDeploymentCredentials")
      .withIndex("by_instance", (q) => q.eq("instanceId", args.instanceId))
      .unique();
    if (!row || row.state === "ready" || row.state === "rejected") return null;
    if (
      row.accountId !== t.account._id ||
      row.receiptId !== t.receipt._id ||
      row.deploymentName !== t.deploymentName
    )
      throw Error("Stored cloud credential target mismatch");
    return {
      credentialId: row._id,
      deploymentName: t.deploymentName,
      state: row.state,
      eligibleAt: row.updatedAt + RECOVERY_WAIT_MS,
    };
  },
});
export const claimRecovery = internalMutation({
  args: {
    instanceId,
    credentialId,
    accountRevision: v.number(),
    confirmationDeploymentName: v.string(),
    lease: v.string(),
  },
  returns: v.object({ generation: v.number(), keyName: v.string() }),
  handler: async (ctx, args) => {
    const t = await target(ctx, args.instanceId);
    const row = await ctx.db.get(args.credentialId);
    if (
      !t ||
      !row ||
      row.instanceId !== args.instanceId ||
      row.accountId !== t.account._id ||
      row.receiptId !== t.receipt._id ||
      row.deploymentName !== t.deploymentName ||
      t.account.revision !== args.accountRevision
    )
      throw Error("Credential recovery target changed");
    if (args.confirmationDeploymentName !== t.deploymentName)
      throw Error("Deployment name confirmation does not match");
    if (row.state === "ready" || row.state === "rejected")
      throw Error("Credential is already ready or ready to retry");
    if (Date.now() < row.updatedAt + RECOVERY_WAIT_MS)
      throw Error("Wait 15 minutes after the last pending request before recovery");
    const generation = row.generation ?? 0;
    if (!Number.isSafeInteger(generation) || generation < 0 || generation >= 100)
      throw Error("Credential recovery attempt limit reached");
    if (!/^[a-f0-9-]{36}$/.test(args.lease)) throw Error("Invalid recovery lease");
    await ctx.db.patch(row._id, {
      state: "recovering",
      recoveryLease: args.lease,
      accountRevision: args.accountRevision,
      updatedAt: Date.now(),
    });
    return { generation, keyName: credentialKeyName(row._id, generation) };
  },
});
export const assertRecovery = internalQuery({
  args: { credentialId, generation: v.number(), lease: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await pendingRecovery(ctx, args);
    return null;
  },
});
async function pendingRecovery(
  ctx: QueryCtx | MutationCtx,
  args: {
    credentialId: Id<"overseer_hostingDeploymentCredentials">;
    generation: number;
    lease: string;
  },
) {
  const row = await ctx.db.get(args.credentialId);
  if (
    !row ||
    row.state !== "recovering" ||
    (row.generation ?? 0) !== args.generation ||
    row.recoveryLease !== args.lease
  )
    throw Error("Credential recovery lease changed");
  const t = await target(ctx, row.instanceId);
  if (
    !t ||
    t.account._id !== row.accountId ||
    t.account.revision !== row.accountRevision ||
    t.receipt._id !== row.receiptId ||
    t.deploymentName !== row.deploymentName
  )
    throw Error("Credential recovery target changed");
  return row;
}
export const finishRecovery = internalMutation({
  args: { credentialId, generation: v.number(), lease: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await pendingRecovery(ctx, args);
    await ctx.db.patch(row._id, {
      state: "rejected",
      generation: args.generation + 1,
      recoveryLease: undefined,
      envelope: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});
