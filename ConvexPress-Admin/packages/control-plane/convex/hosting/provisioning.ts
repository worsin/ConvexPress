import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { authenticatedQuery } from "../rbac/functions";
import { requireHostingAccount } from "./policy";
const receiptId = v.id("overseer_hostingProvisioning");
const publicReceipt = v.object({
  receiptId,
  accountId: v.id("overseer_hostingAccounts"),
  websiteId: v.id("overseer_websites"),
  name: v.string(),
  steps: v.array(v.string()),
  state: v.union(
    v.literal("planned"),
    v.literal("running"),
    v.literal("needs_reconciliation"),
    v.literal("succeeded"),
  ),
  revision: v.number(),
});
const view = (r: any) => ({
  receiptId: r._id,
  accountId: r.accountId,
  websiteId: r.websiteId,
  name: r.name,
  steps: r.steps,
  state: r.state,
  revision: r.revision,
});
async function authorized(
  ctx: QueryCtx | MutationCtx,
  id: Id<"overseer_hostingProvisioning">,
  step?: string,
) {
  const receipt = await ctx.db.get(id);
  if (!receipt) throw Error("Hosting receipt not found");
  await requireHostingAccount(ctx, receipt.accountId, receipt.websiteId);
  if (step && !receipt.steps.includes(step))
    throw Error("Step was not declared in the provisioning plan");
  return receipt;
}
export const begin = internalMutation({
  args: {
    accountId: v.id("overseer_hostingAccounts"),
    websiteId: v.id("overseer_websites"),
    idempotencyKey: v.string(),
    name: v.string(),
    steps: v.array(v.string()),
  },
  returns: publicReceipt,
  handler: async (ctx, args) => {
    const { operator } = await requireHostingAccount(ctx, args.accountId, args.websiteId);
    if (
      !/^[A-Za-z0-9_-]{8,120}$/.test(args.idempotencyKey) ||
      !args.name.trim() ||
      args.name.length > 100 ||
      /[\u0000-\u001f]/.test(args.name) ||
      args.steps.length < 1 ||
      args.steps.length > 16 ||
      new Set(args.steps).size !== args.steps.length ||
      args.steps.some((s) => !/^[a-z][a-z0-9.-]{0,63}$/.test(s))
    )
      throw Error("Invalid hosting provisioning plan");
    const byKey = await ctx.db
      .query("overseer_hostingProvisioning")
      .withIndex("by_idempotency", (q) =>
        q.eq("accountId", args.accountId).eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    const byTarget = await ctx.db
      .query("overseer_hostingProvisioning")
      .withIndex("by_target", (q) =>
        q.eq("accountId", args.accountId).eq("websiteId", args.websiteId),
      )
      .unique();
    const prior = byKey ?? byTarget;
    if (prior) {
      if (
        prior.websiteId !== args.websiteId ||
        prior.name !== args.name ||
        JSON.stringify(prior.steps) !== JSON.stringify(args.steps)
      )
        throw Error("A different provisioning plan already owns this request or website");
      return view(prior);
    }
    const now = Date.now();
    const id = await ctx.db.insert("overseer_hostingProvisioning", {
      ...args,
      requestedByUserId: operator._id,
      state: "planned",
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
    return view((await ctx.db.get(id))!);
  },
});
export const get = internalQuery({
  args: { receiptId },
  returns: publicReceipt,
  handler: async (ctx, args) => view(await authorized(ctx, args.receiptId)),
});
export const claimStep = internalMutation({
  args: { receiptId, step: v.string() },
  returns: v.object({
    mode: v.union(v.literal("create"), v.literal("reconcile"), v.literal("confirmed")),
    externalId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const receipt = await authorized(ctx, args.receiptId, args.step);
    const prior = await ctx.db
      .query("overseer_hostingProvisioningSteps")
      .withIndex("by_receipt_step", (q) => q.eq("receiptId", args.receiptId).eq("step", args.step))
      .unique();
    if (prior?.state === "rejected") {
      await ctx.db.patch(prior._id, {
        state: "intent",
        attempts: prior.attempts + 1,
        updatedAt: Date.now(),
      });
      await ctx.db.patch(receipt._id, {
        state: "running",
        revision: receipt.revision + 1,
        updatedAt: Date.now(),
      });
      return { mode: "create" as const };
    }
    if (prior)
      return prior.state === "confirmed"
        ? { mode: "confirmed" as const, externalId: prior.externalId! }
        : { mode: "reconcile" as const };
    const now = Date.now();
    const account = (await ctx.db.get(receipt.accountId))!;
    await ctx.db.insert("overseer_hostingProvisioningSteps", {
      ...args,
      provider: account.provider,
      providerAccountId: account.externalAccountId,
      resourceKind:
        args.step === "production" || args.step === "staging" ? "deployment" : args.step,
      websiteId: receipt.websiteId,
      state: "intent",
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(receipt._id, {
      state: "running",
      revision: receipt.revision + 1,
      updatedAt: now,
    });
    return { mode: "create" as const };
  },
});
export const confirmStep = internalMutation({
  args: { receiptId, step: v.string(), externalId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const receipt = await authorized(ctx, args.receiptId, args.step);
    if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(args.externalId))
      throw Error("Invalid public provider resource ID");
    const prior = await ctx.db
      .query("overseer_hostingProvisioningSteps")
      .withIndex("by_receipt_step", (q) => q.eq("receiptId", args.receiptId).eq("step", args.step))
      .unique();
    if (!prior) throw Error("A durable step intent is required before confirmation");
    if (prior.state === "confirmed") {
      if (prior.externalId !== args.externalId)
        throw Error("Confirmed provider resource cannot be replaced");
      return null;
    }
    const owners = await ctx.db
      .query("overseer_hostingProvisioningSteps")
      .withIndex("by_resource", (q) =>
        q
          .eq("provider", prior.provider)
          .eq("providerAccountId", prior.providerAccountId)
          .eq("resourceKind", prior.resourceKind)
          .eq("externalId", args.externalId),
      )
      .take(2);
    if (owners.some((owner) => owner._id !== prior._id))
      throw Error("Provider resource is already bound to another website or environment");
    await ctx.db.patch(prior._id, {
      state: "confirmed",
      externalId: args.externalId,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(receipt._id, { revision: receipt.revision + 1, updatedAt: Date.now() });
    return null;
  },
});
export const markUncertain = internalMutation({
  args: { receiptId, step: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const receipt = await authorized(ctx, args.receiptId, args.step);
    const prior = await ctx.db
      .query("overseer_hostingProvisioningSteps")
      .withIndex("by_receipt_step", (q) => q.eq("receiptId", args.receiptId).eq("step", args.step))
      .unique();
    if (!prior) throw Error("Provisioning intent not found");
    if (prior.state === "confirmed") return null;
    await ctx.db.patch(prior._id, { state: "uncertain", updatedAt: Date.now() });
    await ctx.db.patch(receipt._id, {
      state: "needs_reconciliation",
      revision: receipt.revision + 1,
      updatedAt: Date.now(),
    });
    return null;
  },
});
export const finish = internalMutation({
  args: { receiptId },
  returns: publicReceipt,
  handler: async (ctx, args) => {
    const receipt = await authorized(ctx, args.receiptId);
    for (const step of receipt.steps) {
      const row = await ctx.db
        .query("overseer_hostingProvisioningSteps")
        .withIndex("by_receipt_step", (q) => q.eq("receiptId", args.receiptId).eq("step", step))
        .unique();
      if (row?.state !== "confirmed")
        throw Error("Every planned resource must be confirmed before completion");
    }
    await ctx.db.patch(receipt._id, {
      state: "succeeded",
      revision: receipt.revision + 1,
      updatedAt: Date.now(),
    });
    return view((await ctx.db.get(receipt._id))!);
  },
});
export const forWebsite = authenticatedQuery({
  args: { accountId: v.id("overseer_hostingAccounts"), websiteId: v.id("overseer_websites") },
  returns: v.union(
    v.object({
      ...publicReceipt.fields,
      resources: v.array(
        v.object({ step: v.string(), state: v.string(), externalId: v.optional(v.string()) }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireHostingAccount(ctx, args.accountId, args.websiteId);
    const receipt = await ctx.db
      .query("overseer_hostingProvisioning")
      .withIndex("by_target", (q) =>
        q.eq("accountId", args.accountId).eq("websiteId", args.websiteId),
      )
      .unique();
    if (!receipt) return null;
    const resources = await ctx.db
      .query("overseer_hostingProvisioningSteps")
      .withIndex("by_receipt_step", (q) => q.eq("receiptId", receipt._id))
      .take(17);
    if (resources.length > 16) throw Error("Provisioning plan exceeds supported size");
    return {
      ...view(receipt),
      resources: resources.map(({ step, state, externalId }) => ({
        step,
        state,
        ...(externalId ? { externalId } : {}),
      })),
    };
  },
});

// Only the provider action may mark an explicit non-uncertain rejection. Network,
// parse, conflict, and server failures must remain uncertain and reconcile first.
export const markRejected = internalMutation({
  args: { receiptId, step: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const receipt = await authorized(ctx, args.receiptId, args.step);
    const prior = await ctx.db
      .query("overseer_hostingProvisioningSteps")
      .withIndex("by_receipt_step", (q) => q.eq("receiptId", args.receiptId).eq("step", args.step))
      .unique();
    if (!prior) throw Error("Provisioning intent not found");
    if (prior.state === "confirmed") return null;
    await ctx.db.patch(prior._id, { state: "rejected", updatedAt: Date.now() });
    await ctx.db.patch(receipt._id, {
      state: "needs_reconciliation",
      revision: receipt.revision + 1,
      updatedAt: Date.now(),
    });
    return null;
  },
});
