import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { authenticatedMutation, authenticatedQuery } from "../rbac/functions";
import { hostingEnvelope, hostingProvider, hostingCredentialKind, hostingCredentialState } from "../schema/hosting";
import { publicHostingAccount, requireHostingAccess, requireHostingAccount } from "./policy";
const scope = {
  organizationId: v.id("overseer_organizations"),
  businessId: v.optional(v.id("overseer_businesses")),
};
export const hostingAccountSummary = v.object({
  accountId: v.id("overseer_hostingAccounts"),
  organizationId: v.id("overseer_organizations"),
  businessId: v.union(v.id("overseer_businesses"), v.null()),
  provider: hostingProvider,
  externalAccountId: v.string(),
  label: v.string(),
  status: v.union(v.literal("active"), v.literal("revoked")),
  credentialKind: hostingCredentialKind,
  credentialState: hostingCredentialState,
  credentialExpiresAt: v.union(v.number(), v.null()),
  credentialGeneration: v.number(),
  verifiedAt: v.number(),
  revision: v.number(),
});
export const list = authenticatedQuery({
  args: scope,
  returns: v.array(hostingAccountSummary),
  handler: async (ctx, args) => {
    await requireHostingAccess(ctx, args);
    const own = await ctx.db
      .query("overseer_hostingAccounts")
      .withIndex("by_scope", (q) =>
        q.eq("organizationId", args.organizationId).eq("businessId", args.businessId),
      )
      .take(101);
    const shared = args.businessId
      ? await ctx.db
          .query("overseer_hostingAccounts")
          .withIndex("by_scope", (q) =>
            q.eq("organizationId", args.organizationId).eq("businessId", undefined),
          )
          .take(101)
      : [];
    if (own.length > 100 || shared.length > 100)
      throw Error("Hosting account scope exceeds the supported list size");
    return [...own, ...shared].map(publicHostingAccount);
  },
});
export const prepareSave = internalQuery({
  args: {
    ...scope,
    provider: hostingProvider,
    externalAccountId: v.string(),
    expectedRevision: v.number(),
  },
  returns: v.object({
    accountId: v.union(v.id("overseer_hostingAccounts"), v.null()),
    revision: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireHostingAccess(ctx, args);
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(args.externalAccountId))
      throw Error("Invalid provider account ID");
    const current = await ctx.db
      .query("overseer_hostingAccounts")
      .withIndex("by_scope_external", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("businessId", args.businessId)
          .eq("provider", args.provider)
          .eq("externalAccountId", args.externalAccountId),
      )
      .unique();
    if ((current?.revision ?? 0) !== args.expectedRevision)
      throw Error("Hosting account changed; refresh before connecting");
    return { accountId: current?._id ?? null, revision: current?.revision ?? 0 };
  },
});
export const commitVerified = internalMutation({
  args: {
    ...scope,
    provider: hostingProvider,
    externalAccountId: v.string(),
    label: v.string(),
    expectedRevision: v.number(),
    credentials: hostingEnvelope,
    credentialKind: v.optional(hostingCredentialKind),
    credentialExpiresAt: v.optional(v.number()),
  },
  returns: hostingAccountSummary,
  handler: async (ctx, args) => {
    const operator = await requireHostingAccess(ctx, args);
    if (
      !/^[A-Za-z0-9_-]{1,160}$/.test(args.externalAccountId) ||
      !args.label.trim() ||
      args.label.length > 160
    )
      throw Error("Invalid verified provider identity");
    const current = await ctx.db
      .query("overseer_hostingAccounts")
      .withIndex("by_scope_external", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("businessId", args.businessId)
          .eq("provider", args.provider)
          .eq("externalAccountId", args.externalAccountId),
      )
      .unique();
    if ((current?.revision ?? 0) !== args.expectedRevision)
      throw Error("Hosting account changed; verification must be retried");
    const now = Date.now();
    const { expectedRevision, ...input } = args;
    const values = {
      ...input,
      status: "active" as const,
      credentialKind: args.credentialKind ?? "legacy", credentialState: "ready" as const,
      credentialExpiresAt: args.credentialExpiresAt, credentialGeneration: (current?.credentialGeneration ?? 0) + 1,
      refreshLease: undefined, refreshLeaseUntil: undefined, pendingCredentials: undefined, pendingExpiresAt: undefined,
      verifiedAt: now,
      verifiedByUserId: operator._id,
      revision: expectedRevision + 1,
      updatedAt: now,
    };
    const id = current
      ? current._id
      : await ctx.db.insert("overseer_hostingAccounts", { ...values, createdAt: now });
    if (current) await ctx.db.patch(id, values);
    return publicHostingAccount((await ctx.db.get(id))!);
  },
});
export const prepareUse = internalQuery({
  args: {
    accountId: v.id("overseer_hostingAccounts"),
    websiteId: v.optional(v.id("overseer_websites")),
  },
  returns: v.object({ ...hostingAccountSummary.fields, credentials: hostingEnvelope }),
  handler: async (ctx, args) => {
    const { account } = await requireHostingAccount(ctx, args.accountId, args.websiteId);
    return { ...publicHostingAccount(account), credentials: account.credentials! };
  },
});
export const revoke = authenticatedMutation({
  args: { accountId: v.id("overseer_hostingAccounts"), expectedRevision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) throw Error("Hosting account not found");
    await requireHostingAccess(ctx, account);
    if (account.revision !== args.expectedRevision)
      throw Error("Hosting account changed; refresh before revoking");
    await ctx.db.patch(account._id, {
      status: "revoked",
      credentials: undefined,
      pendingCredentials: undefined, pendingExpiresAt: undefined, refreshLease: undefined, refreshLeaseUntil: undefined,
      credentialState: "reconnect",
      credentialGeneration: (account.credentialGeneration ?? 0) + 1,
      revision: account.revision + 1,
      updatedAt: Date.now(),
    });
    return null;
  },
});
