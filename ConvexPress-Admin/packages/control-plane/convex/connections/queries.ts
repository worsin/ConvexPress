import { v } from "convex/values";

import { assertStoredAccess, authenticatedQuery } from "../rbac/functions";
import { safeConnectionSummary } from "./safe";

const connectionSummary = v.object({
  connectionId: v.id("overseer_connections"),
  name: v.string(),
  serviceId: v.string(),
  provider: v.string(),
  category: v.union(v.string(), v.null()),
  accountEmail: v.union(v.string(), v.null()),
  accountLabel: v.union(v.string(), v.null()),
  status: v.string(),
  isActive: v.boolean(),
  hasCredentials: v.boolean(),
  credentialVersion: v.union(v.number(), v.null()),
  updatedAt: v.number(),
});

export const listForInstance = authenticatedQuery({
  args: { instanceId: v.id("overseer_websiteInstances") },
  returns: v.array(connectionSummary),
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.instanceId);
    if (!instance) throw new Error("Environment not found");
    const website = await ctx.db.get(instance.website_id);
    if (!website?.organization_id || !website.business_id) {
      throw new Error("Website not found");
    }
    await assertStoredAccess(ctx, ctx.operator, {
      selector: { type: "capability", code: "environment.read" },
      target: {
        organizationId: String(website.organization_id),
        businessId: String(website.business_id),
        websiteId: String(website._id),
        instanceId: String(instance._id),
      },
    });
    const connections = await ctx.db
      .query("overseer_connections")
      .withIndex("by_instance", (q) =>
        q.eq("instance_id", instance._id).eq("isActive", true),
      )
      .take(20);
    return connections.map(safeConnectionSummary);
  },
});

export const healthHistory = authenticatedQuery({
  args: {
    connectionId: v.id("overseer_connections"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      status: v.union(
        v.literal("healthy"),
        v.literal("degraded"),
        v.literal("unreachable"),
        v.literal("revoked"),
      ),
      latencyMs: v.union(v.number(), v.null()),
      errorCode: v.union(v.string(), v.null()),
      checkedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection?.instance_id) throw new Error("Connection not found");
    const instance = await ctx.db.get(connection.instance_id);
    const website = instance ? await ctx.db.get(instance.website_id) : null;
    if (!instance || !website?.organization_id || !website.business_id) {
      throw new Error("Connection target not found");
    }
    await assertStoredAccess(ctx, ctx.operator, {
      selector: { type: "capability", code: "environment.read" },
      target: {
        organizationId: String(website.organization_id),
        businessId: String(website.business_id),
        websiteId: String(website._id),
        instanceId: String(instance._id),
      },
    });
    const limit = args.limit ?? 25;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Health history limit must be between 1 and 100");
    }
    const rows = await ctx.db
      .query("overseer_connectionHealthHistory")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .order("desc")
      .take(limit);
    return rows.map((row) => ({
      status: row.status,
      latencyMs: row.latencyMs ?? null,
      errorCode: row.errorCode ?? null,
      checkedAt: row.checkedAt,
    }));
  },
});
