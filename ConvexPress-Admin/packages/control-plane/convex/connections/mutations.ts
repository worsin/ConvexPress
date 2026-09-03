import { v } from "convex/values";

import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireAuth } from "../helpers/auth";
import { assertStoredAccess } from "../rbac/functions";

const envelopeValidator = v.object({
  encrypted: v.string(),
  iv: v.string(),
  authTag: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastRotatedAt: v.number(),
  version: v.number(),
});

const actionTargetResult = v.object({
  connectionId: v.id("overseer_connections"),
  instanceId: v.id("overseer_websiteInstances"),
  websiteKey: v.string(),
  instanceKey: v.string(),
  deploymentOrigin: v.string(),
  managementOrigin: v.string(),
  siteOrigin: v.string(),
  kind: v.union(
    v.literal("live"),
    v.literal("staging"),
    v.literal("beta"),
    v.literal("preview"),
    v.literal("development"),
    v.literal("local"),
    v.literal("custom"),
  ),
  credentials: v.union(envelopeValidator, v.null()),
});

async function requireConnectionTarget(
  ctx: QueryCtx | MutationCtx,
  instanceId: Id<"overseer_websiteInstances">,
) {
  const operator = await requireAuth(ctx);
  const instance = await ctx.db.get(instanceId);
  if (!instance || instance.status !== "active") throw new Error("Environment not found");
  const website = await ctx.db.get(instance.website_id);
  if (
    !website ||
    website.status !== "active" ||
    !website.organization_id ||
    !website.business_id ||
    instance.organization_id !== website.organization_id ||
    instance.business_id !== website.business_id
  ) {
    throw new Error("Environment target identity is inconsistent");
  }
  const target = {
    organizationId: String(website.organization_id),
    businessId: String(website.business_id),
    websiteId: String(website._id),
    instanceId: String(instance._id),
  };
  await assertStoredAccess(ctx, operator, {
    selector: { type: "capability", code: "connection.manage" },
    target,
  });
  if (instance.kind === "live") {
    await assertStoredAccess(ctx, operator, {
      selector: { type: "capability", code: "environment.live.operate" },
      target,
    });
  }
  return { operator, instance, website };
}

export const createPending = internalMutation({
  args: {
    instanceId: v.id("overseer_websiteInstances"),
    name: v.string(),
    accountLabel: v.optional(v.string()),
  },
  returns: actionTargetResult,
  handler: async (ctx, args) => {
    const { operator, instance, website } = await requireConnectionTarget(
      ctx,
      args.instanceId,
    );
    const name = args.name.trim();
    if (!name || name.length > 160) throw new Error("Invalid connection name");
    const existing = await ctx.db
      .query("overseer_connections")
      .withIndex("by_instance", (q) =>
        q.eq("instance_id", instance._id).eq("isActive", true),
      )
      .take(2);
    if (existing.length > 0) {
      throw new Error("This environment already has an active connection");
    }
    const now = Date.now();
    const connectionId = await ctx.db.insert("overseer_connections", {
      organization_id: website.organization_id,
      business_id: website.business_id,
      website_id: website._id,
      instance_id: instance._id,
      owner_id: String(operator._id),
      app_id: "convexpress-control-plane",
      name,
      serviceId: "convex-deployment",
      provider: "convex",
      category: "site-runtime",
      accountLabel: args.accountLabel?.trim() || undefined,
      track: "native",
      status: "pending",
      isActive: true,
      config: {
        deploymentOrigin: instance.deploymentOrigin,
        managementOrigin: instance.managementOrigin,
        siteOrigin: instance.siteOrigin,
        websiteKey: website.websiteKey,
        instanceKey: instance.instanceKey,
      },
      createdAt: now,
      updatedAt: now,
    });
    return {
      connectionId,
      instanceId: instance._id,
      websiteKey: website.websiteKey,
      instanceKey: instance.instanceKey,
      deploymentOrigin: instance.deploymentOrigin,
      managementOrigin: instance.managementOrigin,
      siteOrigin: instance.siteOrigin,
      kind: instance.kind,
      credentials: null,
    };
  },
});

export const prepare = internalQuery({
  args: { connectionId: v.id("overseer_connections") },
  returns: actionTargetResult,
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection?.instance_id || !connection.website_id || !connection.isActive) {
      throw new Error("Connection not found");
    }
    const { instance, website } = await requireConnectionTarget(
      ctx,
      connection.instance_id,
    );
    if (
      connection.website_id !== website._id ||
      connection.organization_id !== website.organization_id ||
      connection.business_id !== website.business_id
    ) {
      throw new Error("Connection target identity is inconsistent");
    }
    return {
      connectionId: connection._id,
      instanceId: instance._id,
      websiteKey: website.websiteKey,
      instanceKey: instance.instanceKey,
      deploymentOrigin: instance.deploymentOrigin,
      managementOrigin: instance.managementOrigin,
      siteOrigin: instance.siteOrigin,
      kind: instance.kind,
      credentials: connection.credentials
        ? {
            encrypted: connection.credentials.encrypted,
            iv: connection.credentials.iv,
            authTag: connection.credentials.authTag,
            createdAt: connection.credentials.createdAt ?? connection.createdAt,
            updatedAt: connection.credentials.updatedAt ?? connection.updatedAt,
            lastRotatedAt:
              connection.credentials.lastRotatedAt ?? connection.updatedAt,
            version: connection.credentials.version ?? 1,
          }
        : null,
    };
  },
});

export const saveEnvelope = internalMutation({
  args: {
    connectionId: v.id("overseer_connections"),
    envelope: envelopeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection?.instance_id || !connection.isActive) {
      throw new Error("Connection not found");
    }
    const { instance } = await requireConnectionTarget(ctx, connection.instance_id);
    await ctx.db.patch(connection._id, {
      credentials: args.envelope,
      status: "connected",
      lastError: undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(instance._id, {
      connection_id: connection._id,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markError = internalMutation({
  args: {
    connectionId: v.id("overseer_connections"),
    errorCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    await ctx.db.patch(connection._id, {
      status: "error",
      isActive: false,
      lastError: args.errorCode.slice(0, 120),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordHealth = internalMutation({
  args: {
    connectionId: v.id("overseer_connections"),
    status: v.union(
      v.literal("healthy"),
      v.literal("degraded"),
      v.literal("unreachable"),
      v.literal("revoked"),
    ),
    latencyMs: v.optional(v.number()),
    errorCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) throw new Error("Connection not found");
    await ctx.db.insert("overseer_connectionHealthHistory", {
      connectionId: connection._id,
      instanceId: connection.instance_id,
      status: args.status,
      latencyMs: args.latencyMs,
      errorCode: args.errorCode?.slice(0, 120),
      checkedAt: Date.now(),
    });
    await ctx.db.patch(connection._id, {
      status:
        args.status === "healthy"
          ? "connected"
          : args.status === "revoked"
            ? "revoked"
            : "error",
      lastError: args.errorCode?.slice(0, 120),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const revoke = internalMutation({
  args: { connectionId: v.id("overseer_connections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection?.instance_id) throw new Error("Connection not found");
    const { instance } = await requireConnectionTarget(ctx, connection.instance_id);
    await ctx.db.patch(connection._id, {
      credentials: undefined,
      status: "revoked",
      isActive: false,
      updatedAt: Date.now(),
    });
    if (instance.connection_id === connection._id) {
      await ctx.db.patch(instance._id, {
        connection_id: undefined,
        updatedAt: Date.now(),
      });
    }
    await ctx.db.insert("overseer_connectionHealthHistory", {
      connectionId: connection._id,
      instanceId: instance._id,
      status: "revoked",
      checkedAt: Date.now(),
    });
    return null;
  },
});
