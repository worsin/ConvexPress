import { makeFunctionReference, type RegisteredMutation } from "convex/server";
import { v } from "convex/values";
import { mutation, internalMutation, type QueryCtx, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { captureOperatorAuthority, readOperatorAuthority, operatorHandoffFailure, type OperatorPrincipal } from "./operatorAuthority";

const expireRef = makeFunctionReference<"mutation">("auth/operatorHandoffs:expire");
const hashPattern = /^[a-f0-9]{64}$/;
type CreatedHandoff = { url: string; expiresAt: number; instanceKey: string };
type RedeemedHandoff = OperatorPrincipal & { managementSessionId: Id<"convexpress_managementSessions"> | null; instanceKey: string };

async function installedSite(ctx: Pick<QueryCtx, "db">): Promise<{ websiteKey: string; instanceKey: string; origin: string; url: string }> {
  const identity = await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key", q => q.eq("identityKey", "site-identity")).unique();
  const general = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "general")).unique();
  const siteUrl = (general?.values as { siteUrl?: unknown } | undefined)?.siteUrl;
  if (!identity || typeof siteUrl !== "string") throw operatorHandoffFailure();
  let url: URL;
  try { url = new URL(siteUrl); } catch { throw operatorHandoffFailure(); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) throw operatorHandoffFailure();
  return { websiteKey: identity.websiteKey, instanceKey: identity.instanceKey, origin: url.origin, url: url.origin + "/?customize=1" };
}

export const create: RegisteredMutation<"public", { codeHash: string }, CreatedHandoff> = mutation({
  args: { codeHash: v.string() },
  returns: v.object({ url: v.string(), expiresAt: v.number(), instanceKey: v.string() }),
  handler: async (ctx: MutationCtx, { codeHash }: { codeHash: string }): Promise<{ url: string; expiresAt: number; instanceKey: string }> => {
    if (!hashPattern.test(codeHash)) throw operatorHandoffFailure();
    const site = await installedSite(ctx);
    const authority = await captureOperatorAuthority(ctx, site);
    const pending = await ctx.db.query("websiteOperatorHandoffs").withIndex("by_userId_expiresAt", q => q.eq("userId", authority.userId).gt("expiresAt", Date.now())).take(5);
    if (pending.length >= 5 || await ctx.db.query("websiteOperatorHandoffs").withIndex("by_codeHash", q => q.eq("codeHash", codeHash)).unique()) throw operatorHandoffFailure();
    const expiresAt = Math.min(Date.now() + 60_000, authority.expiresAt);
    const id = await ctx.db.insert("websiteOperatorHandoffs", { codeHash, origin: site.origin, websiteKey: site.websiteKey, instanceKey: site.instanceKey, authority, userId: authority.userId, expiresAt });
    await ctx.scheduler.runAfter(Math.max(0, expiresAt - Date.now()), expireRef, { id });
    return { url: site.url, expiresAt, instanceKey: site.instanceKey };
  },
});

export const consume: RegisteredMutation<"internal", { codeHash: string; origin: string }, RedeemedHandoff | null> = internalMutation({
  args: { codeHash: v.string(), origin: v.string() },
  returns: v.union(v.null(), v.object({
    userId: v.id("users"), email: v.string(), name: v.string(), siteRole: v.union(v.string(), v.null()), expiresAt: v.number(),
    managementSessionId: v.union(v.id("convexpress_managementSessions"), v.null()), instanceKey: v.string(),
  })),
  handler: async (ctx: MutationCtx, { codeHash, origin }: { codeHash: string; origin: string }): Promise<(OperatorPrincipal & { managementSessionId: Id<"convexpress_managementSessions"> | null; instanceKey: string }) | null> => {
    if (!hashPattern.test(codeHash)) return null;
    const row = await ctx.db.query("websiteOperatorHandoffs").withIndex("by_codeHash", q => q.eq("codeHash", codeHash)).unique();
    if (!row || row.origin !== origin || row.expiresAt <= Date.now()) return null;
    const site = await installedSite(ctx);
    if (site.origin !== row.origin || site.instanceKey !== row.instanceKey || site.websiteKey !== row.websiteKey) return null;
    const principal = await readOperatorAuthority(ctx, row.authority, site);
    if (!principal) return null;
    await ctx.db.delete("websiteOperatorHandoffs", row._id);
    return { ...principal, managementSessionId: row.authority.managementSessionId, instanceKey: site.instanceKey };
  },
});

export const expire: RegisteredMutation<"internal", { id: Id<"websiteOperatorHandoffs"> }, null> = internalMutation({
  args: { id: v.id("websiteOperatorHandoffs") }, returns: v.null(),
  handler: async (ctx: MutationCtx, { id }: { id: Id<"websiteOperatorHandoffs"> }): Promise<null> => {
    const row = await ctx.db.get("websiteOperatorHandoffs", id);
    if (row && row.expiresAt <= Date.now()) await ctx.db.delete("websiteOperatorHandoffs", id);
    return null;
  },
});
