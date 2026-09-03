import { v } from "convex/values";

import { internalQuery } from "../_generated/server";
import { requireAuth } from "../helpers/auth";
import { assertStoredAccess } from "../rbac/functions";
import {
  authorizeSessionRequestShape,
  outerCapabilityForSiteCapability,
  outerCapabilityForSiteRole,
} from "./policy";

const credentialEnvelope = v.object({
  encrypted: v.string(),
  iv: v.string(),
  authTag: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastRotatedAt: v.number(),
  version: v.number(),
});

const liveReadOnlyCapabilities = new Set([
  "health.read",
  "compatibility.read",
  "site.select",
  "session.exchange",
]);

export const prepareSession = internalQuery({
  args: {
    connectionId: v.id("overseer_connections"),
    requestedCapabilities: v.array(v.string()),
    requestedSiteRole: v.string(),
  },
  returns: v.object({
    connectionId: v.id("overseer_connections"),
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
    requestedCapabilities: v.array(v.string()),
    requestedSiteRole: v.string(),
    credentials: credentialEnvelope,
  }),
  handler: async (ctx, args) => {
    const operator = await requireAuth(ctx);
    const connection = await ctx.db.get(args.connectionId);
    if (
      !connection?.isActive ||
      connection.status !== "connected" ||
      !connection.instance_id ||
      !connection.website_id ||
      !connection.credentials
    ) {
      throw new Error("Connected site environment not found");
    }
    const instance = await ctx.db.get(connection.instance_id);
    const website = instance ? await ctx.db.get(instance.website_id) : null;
    if (
      !instance ||
      instance.status !== "active" ||
      !website ||
      website.status !== "active" ||
      !website.organization_id ||
      !website.business_id ||
      connection.website_id !== website._id ||
      connection.organization_id !== website.organization_id ||
      connection.business_id !== website.business_id ||
      instance.organization_id !== website.organization_id ||
      instance.business_id !== website.business_id
    ) {
      throw new Error("Connection target identity is inconsistent");
    }
    const requested = authorizeSessionRequestShape(args.requestedCapabilities);
    const requestedSiteRole = args.requestedSiteRole;
    const target = {
      organizationId: String(website.organization_id),
      businessId: String(website.business_id),
      websiteId: String(website._id),
      instanceId: String(instance._id),
    };
    for (const capability of requested) {
      await assertStoredAccess(ctx, operator, {
        selector: {
          type: "capability",
          code: outerCapabilityForSiteCapability(capability),
        },
        target,
      });
    }
    await assertStoredAccess(ctx, operator, {
      selector: {
        type: "capability",
        code: outerCapabilityForSiteRole(requestedSiteRole),
      },
      target,
    });
    if (
      instance.kind === "live" &&
      (requestedSiteRole !== "subscriber" ||
        requested.some((capability) => !liveReadOnlyCapabilities.has(capability)))
    ) {
      await assertStoredAccess(ctx, operator, {
        selector: { type: "capability", code: "environment.live.operate" },
        target,
      });
    }
    return {
      connectionId: connection._id,
      websiteKey: website.websiteKey,
      instanceKey: instance.instanceKey,
      deploymentOrigin: instance.deploymentOrigin,
      managementOrigin: instance.managementOrigin,
      siteOrigin: instance.siteOrigin,
      kind: instance.kind,
      requestedCapabilities: requested,
      requestedSiteRole,
      credentials: {
        encrypted: connection.credentials.encrypted,
        iv: connection.credentials.iv,
        authTag: connection.credentials.authTag,
        createdAt: connection.credentials.createdAt ?? connection.createdAt,
        updatedAt: connection.credentials.updatedAt ?? connection.updatedAt,
        lastRotatedAt:
          connection.credentials.lastRotatedAt ?? connection.updatedAt,
        version: connection.credentials.version ?? 1,
      },
    };
  },
});
